/**
 * Confirmation the vendor receives after signing the Legal Pack.
 *
 * Doubles as their copy of the record: it lists exactly which documents and
 * versions were accepted, when, and the technical fixation the Venue
 * Agreement (Anexa 2) requires — so the signer holds the same evidence we do.
 * The drawn signature travels as an attachment.
 */

import { escapeHtml } from "../escape";

export interface SignedContractEmailData {
  signerName: string;
  subjectLabel: string;
  documents: { title: string; version: string; url: string }[];
  acceptedAt: Date;
  ipAddress?: string | null;
  packVersion: string;
  baseUrl: string;
  hasSignatureImage: boolean;
}

export function signedContractEmail(d: SignedContractEmailData): {
  subject: string;
  html: string;
} {
  const when = d.acceptedAt.toLocaleString("ro-RO", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const rows = d.documents
    .map(
      (doc) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2A2A42;">
          <a href="${escapeHtml(d.baseUrl)}${escapeHtml(doc.url)}" style="color:#C9A84C;text-decoration:none;">
            ${escapeHtml(doc.title)}
          </a>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #2A2A42;text-align:right;color:#A0A0B0;font-size:12px;">
          v${escapeHtml(doc.version)}
        </td>
      </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#1A1A2E;border-radius:12px;color:#FAF8F2;">
    <h2 style="color:#C9A84C;margin:0 0 8px;">Contract semnat</h2>
    <p style="margin:0 0 20px;color:#D4D4E0;">
      Mulțumim, <strong>${escapeHtml(d.signerName)}</strong>. Ai acceptat documentele
      necesare pentru ${escapeHtml(d.subjectLabel)} pe ePetrecere.md. Păstrează acest
      email — este copia ta a acceptării.
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${rows}
    </table>

    <div style="background:#0D0D0D;border-radius:8px;padding:14px;font-size:13px;color:#A0A0B0;">
      <p style="margin:0 0 6px;"><strong style="color:#FAF8F2;">Data și ora:</strong> ${escapeHtml(when)}</p>
      <p style="margin:0 0 6px;"><strong style="color:#FAF8F2;">Semnat de:</strong> ${escapeHtml(d.signerName)}</p>
      ${d.ipAddress ? `<p style="margin:0 0 6px;"><strong style="color:#FAF8F2;">Adresa IP:</strong> ${escapeHtml(d.ipAddress)}</p>` : ""}
      <p style="margin:0;"><strong style="color:#FAF8F2;">Pachet legal:</strong> v${escapeHtml(d.packVersion)}</p>
    </div>

    ${
      d.hasSignatureImage
        ? `<p style="margin:16px 0 0;font-size:13px;color:#A0A0B0;">
             Semnătura ta olografă este atașată acestui email.
           </p>`
        : ""
    }

    <p style="margin:20px 0 0;font-size:12px;color:#6B6B7B;">
      Versiunile în vigoare ale documentelor sunt oricând disponibile la
      <a href="${escapeHtml(d.baseUrl)}/legal" style="color:#C9A84C;">${escapeHtml(d.baseUrl)}/legal</a>.
    </p>
  </div>`;

  return { subject: "Contractul tău semnat — ePetrecere.md", html };
}
