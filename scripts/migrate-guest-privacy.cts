/**
 * Encrypt existing guest-list personal fields in place. Schema migration
 * 0020 must already be applied and the application must already be deployed
 * with dual plaintext/ciphertext reads before running with --apply.
 *
 * No guest data is printed. Every ciphertext is authenticated and verified
 * inside the same transaction before it replaces the source value.
 */
const postgres = require("postgres");
const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");

const PREFIX = "enc:v1:";
const url = process.env.DATABASE_URL?.trim();
const rawKey = process.env.GUEST_DATA_ENCRYPTION_KEY?.trim();
if (!url) throw new Error("DATABASE_URL is required");
if (!rawKey) throw new Error("GUEST_DATA_ENCRYPTION_KEY is required");
const key = Buffer.from(rawKey, "base64url");
if (key.length !== 32) throw new Error("Encryption key must decode to 32 bytes");

function decrypt(value) {
  if (!value || !value.startsWith(PREFIX)) return value;
  const packed = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (packed.length < 29) throw new Error("Invalid encrypted guest value");
  const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([
    decipher.update(packed.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

function encrypt(value) {
  if (!value) return value;
  if (value.startsWith(PREFIX)) {
    decrypt(value);
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encrypted = `${PREFIX}${Buffer.concat([iv, tag, body]).toString("base64url")}`;
  if (decrypt(encrypted) !== value) throw new Error("Encryption round-trip failed");
  return encrypted;
}

const apply = process.argv.includes("--apply");
const sql = postgres(url, {
  ssl: "require",
  prepare: false,
  max: 1,
  connect_timeout: 20,
  idle_timeout: 20,
});

(async () => {
  try {
    const result = await sql.begin(async (tx) => {
      const plannerRows = await tx`
        SELECT id, full_name, phone, email, "group", contact_value, dietary, notes
        FROM guest_list FOR UPDATE
      `;
      const invitationRows = await tx`
        SELECT id, name, email, phone, whatsapp, "group", plus_one_name,
               dietary_notes, message
        FROM invitation_guests FOR UPDATE
      `;

      if (apply) {
        for (const row of plannerRows) {
          await tx`
            UPDATE guest_list SET
              full_name = ${encrypt(row.full_name)},
              phone = ${encrypt(row.phone)},
              email = ${encrypt(row.email)},
              "group" = ${encrypt(row.group)},
              contact_value = ${encrypt(row.contact_value)},
              dietary = ${encrypt(row.dietary)},
              notes = ${encrypt(row.notes)}
            WHERE id = ${row.id}
          `;
        }
        for (const row of invitationRows) {
          await tx`
            UPDATE invitation_guests SET
              name = ${encrypt(row.name)},
              email = ${encrypt(row.email)},
              phone = ${encrypt(row.phone)},
              whatsapp = ${encrypt(row.whatsapp)},
              "group" = ${encrypt(row.group)},
              plus_one_name = ${encrypt(row.plus_one_name)},
              dietary_notes = ${encrypt(row.dietary_notes)},
              message = ${encrypt(row.message)}
            WHERE id = ${row.id}
          `;
        }

        const [remaining] = await tx`
          SELECT
            (SELECT count(*)::int FROM guest_list
             WHERE (full_name <> '' AND full_name NOT LIKE 'enc:v1:%')
                OR (phone IS NOT NULL AND phone <> '' AND phone NOT LIKE 'enc:v1:%')
                OR (email IS NOT NULL AND email <> '' AND email NOT LIKE 'enc:v1:%')
                OR ("group" IS NOT NULL AND "group" <> '' AND "group" NOT LIKE 'enc:v1:%')
                OR (contact_value IS NOT NULL AND contact_value <> '' AND contact_value NOT LIKE 'enc:v1:%')
                OR (dietary IS NOT NULL AND dietary <> '' AND dietary NOT LIKE 'enc:v1:%')
                OR (notes IS NOT NULL AND notes <> '' AND notes NOT LIKE 'enc:v1:%')) AS planner,
            (SELECT count(*)::int FROM invitation_guests
             WHERE (name <> '' AND name NOT LIKE 'enc:v1:%')
                OR (email IS NOT NULL AND email <> '' AND email NOT LIKE 'enc:v1:%')
                OR (phone IS NOT NULL AND phone <> '' AND phone NOT LIKE 'enc:v1:%')
                OR (whatsapp IS NOT NULL AND whatsapp <> '' AND whatsapp NOT LIKE 'enc:v1:%')
                OR ("group" IS NOT NULL AND "group" <> '' AND "group" NOT LIKE 'enc:v1:%')
                OR (plus_one_name IS NOT NULL AND plus_one_name <> '' AND plus_one_name NOT LIKE 'enc:v1:%')
                OR (dietary_notes IS NOT NULL AND dietary_notes <> '' AND dietary_notes NOT LIKE 'enc:v1:%')
                OR (message IS NOT NULL AND message <> '' AND message NOT LIKE 'enc:v1:%')) AS invitations
        `;
        if (remaining.planner !== 0 || remaining.invitations !== 0) {
          throw new Error("Plaintext verification failed; transaction rolled back");
        }
      }

      return {
        applied: apply,
        plannerRows: plannerRows.length,
        invitationRows: invitationRows.length,
      };
    });
    console.log(JSON.stringify(result));
  } finally {
    await sql.end();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
