/** Production-safe smoke test for Event Moments privacy controls.
 * Creates one synthetic account and gallery, verifies PIN access, active
 * consent, moderation, EXIF stripping, reporting and uploader deletion, then
 * removes every synthetic database/blob record in a finally block. */
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL?.trim();
const secret = (process.env.MOMENTS_ACCESS_SECRET || process.env.GUEST_DATA_ENCRYPTION_KEY)?.trim();
const appUrl = (process.env.SMOKE_APP_URL || "https://epetrecere.md").replace(/\/$/, "");
if (!databaseUrl || !secret) throw new Error("DATABASE_URL and a Moments secret are required");

const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
const marker = randomUUID();
const userId = randomUUID();
const slug = `moments-privacy-smoke-${marker}`;
const deviceId = `smoke-device-${marker}`;
let photoId = null;
let photoUrl = null;

function digest(value) {
  return createHmac("sha256", secret).update(value).digest();
}

function accessPin(planId) {
  const n = digest(`pin:${planId}:${slug}`).readUInt32BE(0);
  return String(100000 + (n % 900000));
}

function cookieValue(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("Access route did not set a cookie");
  return raw.split(";", 1)[0];
}

async function deleteBlobIfNeeded(url) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN || !url.includes("blob.vercel-storage.com")) return;
  const { del } = await import("@vercel/blob");
  await del(url).catch(() => undefined);
}

try {
  await sql`
    INSERT INTO users (id, clerk_id, email, name, role, onboarding_complete)
    VALUES (${userId}, ${`moments_smoke_${marker}`}, ${`moments-smoke-${marker}@invalid.test`},
            'Moments privacy smoke', 'user', true)
  `;
  const [plan] = await sql`
    INSERT INTO event_plans
      (user_id, title, event_type, event_date, moments_enabled, moments_slug,
       moments_reveal_at, moments_require_approval, moments_shot_limit)
    VALUES
      (${userId}, 'Moments privacy smoke', 'birthday', CURRENT_DATE + 1, TRUE,
       ${slug}, NOW() - INTERVAL '1 minute', TRUE, 5)
    RETURNING id
  `;

  const locked = await fetch(`${appUrl}/moments/${slug}`, { redirect: "manual" });
  const lockedHtml = await locked.text();
  if (!locked.ok || !lockedHtml.includes("Galerie privată") || !lockedHtml.includes("noindex")) {
    throw new Error("PIN gate or noindex page check failed");
  }

  const denied = await fetch(`${appUrl}/api/moments/${slug}`);
  if (denied.status !== 401) throw new Error("Gallery API was accessible without the PIN cookie");

  const access = await fetch(`${appUrl}/api/moments/${slug}/access`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 150 + 1)}` },
    body: JSON.stringify({ pin: accessPin(plan.id) }),
  });
  if (!access.ok) throw new Error(`PIN access returned HTTP ${access.status}`);
  const cookie = cookieValue(access);

  const input = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 190, g: 130, b: 70 } },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const missingConsent = new FormData();
  missingConsent.append("file", new Blob([input], { type: "image/jpeg" }), "privacy-smoke.jpg");
  missingConsent.append("guestName", "Privacy smoke");
  missingConsent.append("deviceId", deviceId);
  const refused = await fetch(`${appUrl}/api/moments/${slug}/upload`, {
    method: "POST",
    headers: { cookie },
    body: missingConsent,
  });
  if (refused.status !== 400) throw new Error("Upload was accepted without rights confirmation");

  const form = new FormData();
  form.append("file", new Blob([input], { type: "image/jpeg" }), "privacy-smoke.jpg");
  form.append("guestName", "Privacy smoke");
  form.append("deviceId", deviceId);
  form.append("rightsConfirmed", "true");
  form.append("subjectCapacity", "guardian");
  const upload = await fetch(`${appUrl}/api/moments/${slug}/upload`, {
    method: "POST",
    headers: { cookie, "x-forwarded-for": "198.51.100.203" },
    body: form,
  });
  const uploaded = await upload.json();
  if (upload.status !== 201 || !uploaded.pendingModeration || !uploaded.canDelete) {
    throw new Error(`Protected upload returned HTTP ${upload.status}`);
  }
  photoId = uploaded.id;
  photoUrl = uploaded.url;

  const [stored] = await sql`
    SELECT is_approved, is_public, upload_consent_at, upload_consent_version,
           uploader_ip_hash, reported_at
    FROM event_photos WHERE id = ${photoId}
  `;
  if (
    !stored || stored.is_approved || stored.is_public || !stored.upload_consent_at ||
    !stored.upload_consent_version?.endsWith(":guardian") || !stored.uploader_ip_hash
  ) {
    throw new Error("Consent evidence or moderation defaults were not stored");
  }

  const storedImage = Buffer.from(await (await fetch(photoUrl)).arrayBuffer());
  const metadata = await sharp(storedImage).metadata();
  if (metadata.format !== "webp" || metadata.exif || metadata.gps) {
    throw new Error("Uploaded photo retained EXIF/GPS or was not normalized to WebP");
  }

  const hidden = await fetch(`${appUrl}/api/moments/${slug}?device_id=${encodeURIComponent(deviceId)}`, { headers: { cookie } });
  const hiddenPayload = await hidden.json();
  if (!hidden.ok || hiddenPayload.photos?.length !== 0) throw new Error("Unapproved photo was exposed");

  await sql`UPDATE event_photos SET is_approved = TRUE WHERE id = ${photoId}`;
  const visible = await fetch(`${appUrl}/api/moments/${slug}?device_id=${encodeURIComponent(deviceId)}`, { headers: { cookie } });
  const visiblePayload = await visible.json();
  const visiblePhoto = visiblePayload.photos?.find((photo) => photo.id === photoId);
  if (!visible.ok || !visiblePhoto?.canDelete || visiblePhoto.deviceId) {
    throw new Error("Approved photo visibility or device-id minimization failed");
  }

  const report = await fetch(`${appUrl}/api/moments/${slug}/photos/${photoId}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "x-forwarded-for": "198.51.100.204" },
    body: JSON.stringify({ reason: "Synthetic privacy report" }),
  });
  const [reported] = await sql`SELECT is_approved, reported_at FROM event_photos WHERE id = ${photoId}`;
  if (!report.ok || reported.is_approved || !reported.reported_at) throw new Error("Report did not hide the photo");

  const wrongDelete = await fetch(`${appUrl}/api/moments/${slug}/photos/${photoId}`, {
    method: "DELETE",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "another-device" }),
  });
  if (wrongDelete.status !== 404) throw new Error("Another device could delete the photo");

  const ownDelete = await fetch(`${appUrl}/api/moments/${slug}/photos/${photoId}`, {
    method: "DELETE",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!ownDelete.ok) throw new Error(`Uploader deletion returned HTTP ${ownDelete.status}`);
  const [remaining] = await sql`SELECT count(*)::int AS count FROM event_photos WHERE id = ${photoId}`;
  if (remaining.count !== 0) throw new Error("Uploader deletion left the database record behind");
  photoId = null;
  photoUrl = null;

  console.log("moments privacy live smoke: ok");
} finally {
  if (photoId) await sql`DELETE FROM event_photos WHERE id = ${photoId}`;
  await deleteBlobIfNeeded(photoUrl);
  await sql`DELETE FROM users WHERE id = ${userId}`;
  await sql.end();
}
