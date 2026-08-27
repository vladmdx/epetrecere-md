/**
 * The administrators' copy of a Legal Pack signature.
 *
 * Sent the moment the signature is recorded, not later and not only if the
 * partner goes on to finish registration — an abandoned registration still
 * produced a legally binding acceptance, and the evidence for it has to leave
 * the database. Unlike the signer's copy, this one carries the whole
 * technical fixation required by the Venue Agreement, Anexa 2: IP,
 * user-agent, the SHA-256 of the exact text shown per document, versions and
 * timestamp. The drawn signature travels as an attachment.
 */

import { escapeHtml } from "../escape";

export interface SignedContractAdminEmailData {
  signerName: string;
  representativeRole?: string | null;
  subjectType: "artist" | "venue";
  /** Vendor profile name, when the profile already exists. */
  subjectName?: string | null;
  email: string | null;
  phone: string | null;
  documents: { title: string; slug: string; version: string; contentHash: string | null }[];
  packVersion: string;
  locale: string;
  acceptedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  baseUrl: string;
  hasSignatureImage: boolean;
}

function row(label: string, value: string, mono = false): string {
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#A0A0B0;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:#FAF8F2;font-size:13px;word-break:break-all;${mono ? "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;" : ""}">${escapeHtml(value)}</td>
    </tr>`;
}

export function signedContractAdminEmail(d: SignedContractAdminEmailData): {
  subject: string;
  html: string;
} {
  const kind = d.subjectType === "venue" ? "Sală" : "Artist";
  const when = d.acceptedAt.toLocaleString("ro-RO", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Europe/Chisinau",
  });

  const docs = d.documents
    .map(
      (doc) => `
      <li style="margin:0 0 10px;">
        <a href="${escapeHtml(d.baseUrl)}/legal/${escapeHtml(doc.slug)}" style="color:#C9A84C;text-decoration:none;font-size:13px;">
          ${escapeHtml(doc.title)}
        </a>
        <span style="color:#A0A0B0;font-size:12px;"> — v${escapeHtml(doc.version)}</span>
        <div style="color:#6B6B7B;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;margin-top:2px;">
          sha256: ${escapeHtml(doc.contentHash ?? "—")}
        </div>
      </li>`,
    )
    .join("");

  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#1A1A2E;border-radius:12px;color:#FAF8F2;">
    <h2 style="color:#C9A84C;margin:0 0 4px;">Contract semnat — ${escapeHtml(kind)}</h2>
    <p style="margin:0 0 20px;color:#D4D4E0;font-size:14px;">
      <strong>${escapeHtml(d.signerName)}</strong> a acceptat electronic pachetul legal
      v${escapeHtml(d.packVersion)}${d.subjectName ? ` pentru <strong>${escapeHtml(d.subjectName)}</strong>` : ""}.
      Mai jos este fixarea tehnică integrală (Anexa 2). Păstreaz-o — este proba acceptării.
    </p>

    <h3 style="color:#FAF8F2;font-size:14px;margin:0 0 8px;">Documente acceptate</h3>
    <ul style="margin:0 0 20px;padding-left:18px;">${docs}</ul>

    <h3 style="color:#FAF8F2;font-size:14px;margin:0 0 8px;">Fixare tehnică</h3>
    <div style="background:#0D0D0D;border-radius:8px;padding:14px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Semnatar", d.signerName)}
        ${d.representativeRole ? row("Calitate", d.representativeRole) : ""}
        ${row("E-mail", d.email ?? "—")}
        ${row("Telefon", d.phone ?? "—")}
        ${row("Data și ora", when)}
        ${row("Adresa IP", d.ipAddress ?? "—", true)}
        ${row("User-agent", d.userAgent ?? "—", true)}
        ${row("Limba semnării", d.locale.toUpperCase())}
        ${row("Pachet legal", `v${d.packVersion}`)}
        ${row("Semnătură olografă", d.hasSignatureImage ? "atașată acestui e-mail (PNG)" : "lipsește")}
      </table>
    </div>

    <div style="text-align:center;margin-top:22px;">
      <a href="${escapeHtml(d.baseUrl)}/admin/contracte" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:11px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        Deschide în panoul admin →
      </a>
    </div>
  </div>`;

  return {
    subject: `📄 Contract semnat — ${kind}: ${d.signerName}`,
    html,
  };
}
