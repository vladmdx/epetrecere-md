import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @pdf-lib/fontkit is a CommonJS package exposed to Next's server bundle as a
// default export. A namespace import works in tsx/node, but becomes
// `{ default: fontkit }` in the production chunk; pdf-lib then tries to call
// `.create()` on that wrapper and PDF rendering fails only after deployment.
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
  rgb,
} from "pdf-lib";
import {
  legalPackManifestForEvidence,
} from "@/lib/legal/pack-manifest";

export interface SignedContractEvidence {
  id: number;
  userId?: string | null;
  artistId?: number | null;
  venueId?: number | null;
  organizationId?: number | null;
  acceptanceSessionId?: string | null;
  subjectType: string;
  documentSlug: string;
  documentVersion: string;
  packVersion: string;
  locale: string;
  signatureName: string;
  signatureImage: string | null;
  representativeRole: string | null;
  partnerType: string | null;
  legalName: string | null;
  idNumber: string | null;
  legalAddress: string | null;
  representativeName: string | null;
  documentTitle: string | null;
  documentBlocks: { type: string; text: string }[] | null;
  deviceSummary: string | null;
  acceptedAt: Date | string;
  ipAddress: string | null;
  userAgent: string | null;
  email: string | null;
  phone: string | null;
  contentHash: string | null;
}

export class SignedContractPdfError extends Error {
  constructor(public readonly code: "incomplete_session" | "invalid_snapshot" | "invalid_signature") {
    super(code);
    this.name = "SignedContractPdfError";
  }
}

type Locale = "ro" | "ru" | "en";
type FontFamily = { latin: PDFFont; latinExt: PDFFont; cyrillic: PDFFont };
type Fonts = { regular: FontFamily; bold: FontFamily };

const A4: [number, number] = [595.28, 841.89];
const PAGE_MARGIN = 48;
const CONTENT_BOTTOM = 62;
const GOLD = rgb(0.788, 0.659, 0.298);
const INK = rgb(0.105, 0.113, 0.145);
const MUTED = rgb(0.39, 0.41, 0.47);
const PALE = rgb(0.94, 0.94, 0.96);
const WHITE = rgb(1, 1, 1);

// Keep every path literal so Next/Vercel's output tracer includes the six
// tiny font subsets used by the server-side PDF route.
const FONT_PATHS = {
  regular: {
    latin: join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"),
    latinExt: join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff"),
    cyrillic: join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff"),
  },
  bold: {
    latin: join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff"),
    latinExt: join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff"),
    cyrillic: join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff"),
  },
} as const;

const LABELS = {
  ro: {
    title: "CONTRACT ELECTRONIC SEMNAT",
    artist: "Pachet legal pentru partener",
    venue: "Pachet legal pentru sală / locație",
    reference: "Referință contract",
    signedAt: "Data și ora semnării",
    timezone: "Ora Republicii Moldova (Europe/Chisinau)",
    platform: "PLATFORMA",
    partner: "PARTENERUL",
    status: "SEMNAT ELECTRONIC",
    partnerType: "Calitate",
    legalName: "Nume / denumire",
    idNumber: "IDNP / IDNO",
    address: "Domiciliu / sediu",
    representative: "Reprezentant",
    representativeRole: "Funcție",
    contact: "Contact",
    documents: "DOCUMENTELE CARE FORMEAZĂ CONTRACTUL",
    version: "versiunea",
    hash: "SHA-256",
    signature: "SEMNĂTURA PARTENERULUI",
    signedBy: "Semnat de",
    exactCopy: "Acest PDF reproduce copiile exacte, păstrate la momentul semnării. Fiecare document începe pe o pagină nouă.",
    documentCopy: "COPIE SEMNATĂ ȘI PĂSTRATĂ",
    continuation: "continuare",
    certificate: "CERTIFICATUL SEMNĂRII",
    certificateNote: "Certificatul leagă identitatea, data, semnătura desenată și amprentele documentelor de aceeași acceptare electronică.",
    technical: "FIXARE TEHNICĂ",
    ip: "Adresa IP",
    device: "Dispozitiv",
    userAgent: "User-agent",
    language: "Limba semnării",
    pack: "Pachet legal",
    page: "Pagina",
    unavailable: "—",
    individual: "Persoană fizică",
    sole_trader: "Întreprinzător individual",
    company: "Persoană juridică",
  },
  ru: {
    title: "ПОДПИСАННЫЙ ЭЛЕКТРОННЫЙ ДОГОВОР",
    artist: "Правовой пакет для партнёра",
    venue: "Правовой пакет для зала / локации",
    reference: "Номер договора",
    signedAt: "Дата и время подписания",
    timezone: "Время Республики Молдова (Europe/Chisinau)",
    platform: "ПЛАТФОРМА",
    partner: "ПАРТНЁР",
    status: "ПОДПИСАНО ЭЛЕКТРОННО",
    partnerType: "Статус",
    legalName: "Имя / наименование",
    idNumber: "IDNP / IDNO",
    address: "Адрес / юридический адрес",
    representative: "Представитель",
    representativeRole: "Должность",
    contact: "Контакт",
    documents: "ДОКУМЕНТЫ, СОСТАВЛЯЮЩИЕ ДОГОВОР",
    version: "версия",
    hash: "SHA-256",
    signature: "ПОДПИСЬ ПАРТНЁРА",
    signedBy: "Подписал(а)",
    exactCopy: "Этот PDF воспроизводит точные копии, сохранённые в момент подписания. Каждый документ начинается с новой страницы.",
    documentCopy: "ПОДПИСАННАЯ СОХРАНЁННАЯ КОПИЯ",
    continuation: "продолжение",
    certificate: "СЕРТИФИКАТ ПОДПИСАНИЯ",
    certificateNote: "Сертификат связывает личность, дату, нарисованную подпись и отпечатки документов с одним электронным акцептом.",
    technical: "ТЕХНИЧЕСКАЯ ФИКСАЦИЯ",
    ip: "IP-адрес",
    device: "Устройство",
    userAgent: "User-agent",
    language: "Язык подписания",
    pack: "Правовой пакет",
    page: "Страница",
    unavailable: "—",
    individual: "Физическое лицо",
    sole_trader: "Индивидуальный предприниматель",
    company: "Юридическое лицо",
  },
  en: {
    title: "SIGNED ELECTRONIC CONTRACT",
    artist: "Legal pack for a partner",
    venue: "Legal pack for a venue",
    reference: "Contract reference",
    signedAt: "Signing date and time",
    timezone: "Republic of Moldova time (Europe/Chisinau)",
    platform: "PLATFORM",
    partner: "PARTNER",
    status: "SIGNED ELECTRONICALLY",
    partnerType: "Status",
    legalName: "Name / legal name",
    idNumber: "IDNP / IDNO",
    address: "Domicile / registered office",
    representative: "Representative",
    representativeRole: "Role",
    contact: "Contact",
    documents: "DOCUMENTS FORMING THE CONTRACT",
    version: "version",
    hash: "SHA-256",
    signature: "PARTNER SIGNATURE",
    signedBy: "Signed by",
    exactCopy: "This PDF reproduces the exact copies preserved at the time of signing. Each document starts on a new page.",
    documentCopy: "SIGNED PRESERVED COPY",
    continuation: "continued",
    certificate: "SIGNING CERTIFICATE",
    certificateNote: "This certificate binds the identity, date, drawn signature and document fingerprints to the same electronic acceptance.",
    technical: "TECHNICAL RECORD",
    ip: "IP address",
    device: "Device",
    userAgent: "User agent",
    language: "Signing language",
    pack: "Legal pack",
    page: "Page",
    unavailable: "—",
    individual: "Individual",
    sole_trader: "Sole trader",
    company: "Legal entity",
  },
} as const;

function localeOf(value: string): Locale {
  return value === "ru" || value === "en" ? value : "ro";
}

function acceptedIso(row: SignedContractEvidence): string {
  const date = new Date(row.acceptedAt);
  if (Number.isNaN(date.getTime())) throw new SignedContractPdfError("incomplete_session");
  return date.toISOString();
}

function signedContractEvidenceKey(row: SignedContractEvidence): string {
  const signatureHash = createHash("sha256").update(row.signatureImage ?? "").digest("hex");
  return JSON.stringify([
    row.userId ?? null,
    row.artistId ?? null,
    row.venueId ?? null,
    row.organizationId ?? null,
    row.subjectType,
    row.packVersion,
    row.locale,
    acceptedIso(row),
    row.signatureName,
    signatureHash,
    row.partnerType,
    row.legalName,
    row.idNumber,
    row.legalAddress,
    row.representativeName,
    row.representativeRole,
    row.email,
    row.phone,
    row.ipAddress,
    row.userAgent,
    row.deviceSummary,
  ]);
}

export function signedContractSessionKey(row: SignedContractEvidence): string {
  return row.acceptanceSessionId
    ? `session:${row.acceptanceSessionId}`
    : `legacy:${signedContractEvidenceKey(row)}`;
}

export function signedContractPdfFilename(row: Pick<SignedContractEvidence, "id" | "subjectType">): string {
  const subject = row.subjectType === "venue" ? "sala" : "partener";
  return `epetrecere-contract-${subject}-${row.id}.pdf`;
}

export function validateSignedContractSession(
  rows: SignedContractEvidence[],
): SignedContractEvidence[] {
  if (!rows.length) throw new SignedContractPdfError("incomplete_session");
  const key = signedContractSessionKey(rows[0]);
  if (!rows.every((row) => signedContractSessionKey(row) === key)) {
    throw new SignedContractPdfError("incomplete_session");
  }
  const evidenceKey = signedContractEvidenceKey(rows[0]);
  if (!rows.every((row) => signedContractEvidenceKey(row) === evidenceKey)) {
    throw new SignedContractPdfError("incomplete_session");
  }
  const manifest = legalPackManifestForEvidence(
    rows[0].packVersion,
    rows[0].subjectType,
    rows,
  );
  if (!manifest) {
    throw new SignedContractPdfError("incomplete_session");
  }
  if (!rows[0].signatureImage?.startsWith("data:image/png;base64,")) {
    throw new SignedContractPdfError("invalid_signature");
  }
  for (const row of rows) {
    if (!row.documentTitle || !row.documentBlocks?.length || !row.contentHash) {
      throw new SignedContractPdfError("invalid_snapshot");
    }
    const actual = createHash("sha256")
      .update(row.documentBlocks.map((block) => block.text).join("\n"))
      .digest("hex");
    if (actual !== row.contentHash) throw new SignedContractPdfError("invalid_snapshot");
  }
  const order = new Map(manifest.map((document, index) => [document.slug, index]));
  return [...rows].sort(
    (a, b) =>
      (order.get(a.documentSlug) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.documentSlug) ?? Number.MAX_SAFE_INTEGER) ||
      a.id - b.id,
  );
}

function fontForCharacter(fonts: FontFamily, character: string): PDFFont {
  if (/\p{Script=Cyrillic}/u.test(character)) return fonts.cyrillic;
  if (/\p{Script=Latin}/u.test(character) && character.codePointAt(0)! >= 0x100) return fonts.latinExt;
  return fonts.latin;
}

function runs(text: string, fonts: FontFamily): Array<{ text: string; font: PDFFont }> {
  const result: Array<{ text: string; font: PDFFont }> = [];
  for (const character of [...text.replace(/[\t\r]/g, " ").replace(/\u00a0/g, " ")]) {
    const font = fontForCharacter(fonts, character);
    const last = result[result.length - 1];
    if (last?.font === font) last.text += character;
    else result.push({ text: character, font });
  }
  return result;
}

function widthOf(text: string, fonts: FontFamily, size: number): number {
  return runs(text, fonts).reduce((total, run) => total + run.font.widthOfTextAtSize(run.text, size), 0);
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  fonts: FontFamily,
  color: RGB,
): number {
  let cursor = x;
  for (const run of runs(text, fonts)) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
  return cursor;
}

function breakLongWord(word: string, fonts: FontFamily, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let part = "";
  for (const character of [...word]) {
    const candidate = part + character;
    if (part && widthOf(candidate, fonts, size) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }
  if (part) parts.push(part);
  return parts;
}

function wrapText(text: string, fonts: FontFamily, size: number, maxWidth: number): string[] {
  const output: string[] = [];
  const paragraphs = text.replace(/\r/g, "").split("\n");
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const pieces = widthOf(word, fonts, size) > maxWidth
        ? breakLongWord(word, fonts, size, maxWidth)
        : [word];
      for (const piece of pieces) {
        const candidate = line ? `${line} ${piece}` : piece;
        if (line && widthOf(candidate, fonts, size) > maxWidth) {
          output.push(line);
          line = piece;
        } else {
          line = candidate;
        }
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  lineHeight: number,
  maxWidth: number,
  fonts: FontFamily,
  color: RGB,
): number {
  for (const line of wrapText(text, fonts, size, maxWidth)) {
    if (line) drawText(page, line, x, y, size, fonts, color);
    y -= lineHeight;
  }
  return y;
}

async function embedFonts(document: PDFDocument): Promise<Fonts> {
  document.registerFontkit(fontkit);
  const embed = async (path: string) => document.embedFont(readFileSync(path), { subset: true });
  return {
    regular: {
      latin: await embed(FONT_PATHS.regular.latin),
      latinExt: await embed(FONT_PATHS.regular.latinExt),
      cyrillic: await embed(FONT_PATHS.regular.cyrillic),
    },
    bold: {
      latin: await embed(FONT_PATHS.bold.latin),
      latinExt: await embed(FONT_PATHS.bold.latinExt),
      cyrillic: await embed(FONT_PATHS.bold.cyrillic),
    },
  };
}

function contractReference(row: SignedContractEvidence): string {
  return `EP-${new Date(row.acceptedAt).getUTCFullYear()}-${String(row.id).padStart(6, "0")}`;
}

function dateLabel(date: Date, locale: Locale): string {
  const tag = locale === "ru" ? "ru-MD" : locale === "en" ? "en-GB" : "ro-MD";
  return new Intl.DateTimeFormat(tag, {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Europe/Chisinau",
  }).format(date);
}

function partnerTypeLabel(value: string | null, locale: Locale): string {
  const labels = LABELS[locale];
  if (value === "individual" || value === "sole_trader" || value === "company") return labels[value];
  return labels.unavailable;
}

function drawSectionLabel(page: PDFPage, label: string, y: number, fonts: Fonts): number {
  drawText(page, label, PAGE_MARGIN, y, 9, fonts.bold, GOLD);
  page.drawLine({
    start: { x: PAGE_MARGIN, y: y - 6 },
    end: { x: A4[0] - PAGE_MARGIN, y: y - 6 },
    thickness: 0.7,
    color: GOLD,
  });
  return y - 22;
}

function drawDetail(
  page: PDFPage,
  label: string,
  value: string | null,
  x: number,
  y: number,
  width: number,
  fonts: Fonts,
): number {
  drawText(page, label.toUpperCase(), x, y, 6.7, fonts.bold, MUTED);
  return drawWrapped(page, value?.trim() || "—", x, y - 12, 8.7, 11.5, width, fonts.regular, INK) - 5;
}

async function drawSignature(
  document: PDFDocument,
  page: PDFPage,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Promise<void> {
  try {
    const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    const image = await document.embedPng(bytes);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawRectangle({ x, y, width: maxWidth, height: maxHeight, color: WHITE, borderColor: PALE, borderWidth: 0.8 });
    page.drawImage(image, {
      x: x + (maxWidth - width) / 2,
      y: y + (maxHeight - height) / 2,
      width,
      height,
    });
  } catch {
    throw new SignedContractPdfError("invalid_signature");
  }
}

async function drawCover(
  document: PDFDocument,
  rows: SignedContractEvidence[],
  fonts: Fonts,
  locale: Locale,
): Promise<void> {
  const row = rows[0];
  const labels = LABELS[locale];
  const page = document.addPage(A4);
  const width = page.getWidth();
  const acceptedAt = new Date(row.acceptedAt);
  const reference = contractReference(row);

  page.drawRectangle({ x: 0, y: A4[1] - 72, width, height: 72, color: INK });
  drawText(page, "ePetrecere.md", PAGE_MARGIN, A4[1] - 40, 18, fonts.bold, GOLD);
  drawText(page, labels.status, width - PAGE_MARGIN - widthOf(labels.status, fonts.bold, 8), A4[1] - 38, 8, fonts.bold, WHITE);

  let y = A4[1] - 108;
  drawText(page, labels.title, PAGE_MARGIN, y, 20, fonts.bold, INK);
  y -= 24;
  drawText(page, row.subjectType === "venue" ? labels.venue : labels.artist, PAGE_MARGIN, y, 11, fonts.regular, MUTED);
  y -= 25;

  const half = (width - PAGE_MARGIN * 2 - 22) / 2;
  let leftY = drawDetail(page, labels.reference, reference, PAGE_MARGIN, y, half, fonts);
  let rightY = drawDetail(page, labels.signedAt, dateLabel(acceptedAt, locale), PAGE_MARGIN + half + 22, y, half, fonts);
  rightY = drawDetail(page, labels.timezone, "Europe/Chisinau", PAGE_MARGIN + half + 22, rightY, half, fonts);
  y = Math.min(leftY, rightY) - 3;

  y = drawSectionLabel(page, `${labels.platform} / ${labels.partner}`, y, fonts);
  const platform = [
    "EPETRECERE S.R.L.",
    "IDNO 1026023123354",
    "MD-3701, or. Strășeni, str. Mihai Eminescu 64, of. 6",
    "Republica Moldova",
  ].join("\n");
  const partner = [
    `${labels.partnerType}: ${partnerTypeLabel(row.partnerType, locale)}`,
    `${labels.legalName}: ${row.legalName || labels.unavailable}`,
    `${labels.idNumber}: ${row.idNumber || labels.unavailable}`,
    `${labels.address}: ${row.legalAddress || labels.unavailable}`,
    row.representativeName ? `${labels.representative}: ${row.representativeName}` : null,
    row.representativeRole ? `${labels.representativeRole}: ${row.representativeRole}` : null,
    `${labels.contact}: ${[row.email, row.phone].filter(Boolean).join(" · ") || labels.unavailable}`,
  ].filter(Boolean).join("\n");
  leftY = drawWrapped(page, platform, PAGE_MARGIN, y, 8.4, 11.5, half, fonts.regular, INK);
  rightY = drawWrapped(page, partner, PAGE_MARGIN + half + 22, y, 8.4, 11.5, half, fonts.regular, INK);
  y = Math.min(leftY, rightY) - 10;

  y = drawSectionLabel(page, labels.documents, y, fonts);
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index];
    const title = `${index + 1}. ${item.documentTitle} — ${labels.version} ${item.documentVersion}`;
    y = drawWrapped(page, title, PAGE_MARGIN, y, 8.2, 10.5, width - PAGE_MARGIN * 2, fonts.regular, INK);
    y -= 3;
  }
  y -= 3;
  y = drawWrapped(page, labels.exactCopy, PAGE_MARGIN, y, 7.5, 10, width - PAGE_MARGIN * 2, fonts.regular, MUTED);

  const signatureTop = Math.min(y - 9, 178);
  drawText(page, labels.signature, PAGE_MARGIN, signatureTop, 8.5, fonts.bold, GOLD);
  await drawSignature(document, page, row.signatureImage!, PAGE_MARGIN, signatureTop - 78, 205, 62);
  drawText(page, `${labels.signedBy}: ${row.signatureName}`, PAGE_MARGIN + 225, signatureTop - 27, 8.8, fonts.bold, INK);
  drawWrapped(page, dateLabel(acceptedAt, locale), PAGE_MARGIN + 225, signatureTop - 43, 8, 10.5, width - PAGE_MARGIN * 2 - 225, fonts.regular, MUTED);
}

function addDocumentPage(
  document: PDFDocument,
  fonts: Fonts,
  title: string,
  version: string,
  hash: string,
  labels: typeof LABELS[Locale],
  continuation: boolean,
): { page: PDFPage; y: number } {
  const page = document.addPage(A4);
  page.drawRectangle({ x: 0, y: A4[1] - 66, width: A4[0], height: 66, color: INK });
  drawText(page, "ePetrecere.md", PAGE_MARGIN, A4[1] - 31, 11, fonts.bold, GOLD);
  drawText(page, continuation ? `${labels.documentCopy} · ${labels.continuation}` : labels.documentCopy, PAGE_MARGIN, A4[1] - 48, 7, fonts.bold, WHITE);
  const titleLines = wrapText(title, fonts.bold, 10.5, A4[0] - PAGE_MARGIN * 2);
  let y = A4[1] - 91;
  for (const line of titleLines) {
    drawText(page, line, PAGE_MARGIN, y, 10.5, fonts.bold, INK);
    y -= 14;
  }
  drawText(page, `${labels.version} ${version} · ${labels.hash}: ${hash}`, PAGE_MARGIN, y - 1, 6.4, fonts.regular, MUTED);
  page.drawLine({ start: { x: PAGE_MARGIN, y: y - 10 }, end: { x: A4[0] - PAGE_MARGIN, y: y - 10 }, thickness: 0.6, color: PALE });
  return { page, y: y - 28 };
}

function drawDocuments(
  document: PDFDocument,
  rows: SignedContractEvidence[],
  fonts: Fonts,
  locale: Locale,
): void {
  const labels = LABELS[locale];
  const maxWidth = A4[0] - PAGE_MARGIN * 2;
  for (const row of rows) {
    let state = addDocumentPage(document, fonts, row.documentTitle!, row.documentVersion, row.contentHash!, labels, false);
    for (const block of row.documentBlocks!) {
      const heading = block.type === "h2";
      const family = heading ? fonts.bold : fonts.regular;
      const size = heading ? 10.7 : 8.9;
      const lineHeight = heading ? 14.5 : 13.2;
      const lines = wrapText(block.text, family, size, maxWidth);
      const minimum = heading ? lineHeight * Math.min(lines.length + 1, 3) : lineHeight;
      if (state.y - minimum < CONTENT_BOTTOM) {
        state = addDocumentPage(document, fonts, row.documentTitle!, row.documentVersion, row.contentHash!, labels, true);
      }
      if (heading) state.y -= 6;
      for (const line of lines) {
        if (state.y - lineHeight < CONTENT_BOTTOM) {
          state = addDocumentPage(document, fonts, row.documentTitle!, row.documentVersion, row.contentHash!, labels, true);
        }
        if (line) drawText(state.page, line, PAGE_MARGIN, state.y, size, family, heading ? INK : rgb(0.16, 0.17, 0.2));
        state.y -= lineHeight;
      }
      state.y -= heading ? 5 : 7;
    }
  }
}

async function drawCertificate(
  document: PDFDocument,
  rows: SignedContractEvidence[],
  fonts: Fonts,
  locale: Locale,
): Promise<void> {
  const row = rows[0];
  const labels = LABELS[locale];
  const page = document.addPage(A4);
  const width = page.getWidth();
  page.drawRectangle({ x: 0, y: A4[1] - 72, width, height: 72, color: INK });
  drawText(page, "ePetrecere.md", PAGE_MARGIN, A4[1] - 40, 18, fonts.bold, GOLD);
  let y = A4[1] - 112;
  drawText(page, labels.certificate, PAGE_MARGIN, y, 18, fonts.bold, INK);
  y = drawWrapped(page, labels.certificateNote, PAGE_MARGIN, y - 23, 8.5, 12, width - PAGE_MARGIN * 2, fonts.regular, MUTED) - 12;

  y = drawSectionLabel(page, labels.partner, y, fonts);
  y = drawDetail(page, labels.signedBy, row.signatureName, PAGE_MARGIN, y, width - PAGE_MARGIN * 2, fonts);
  y = drawDetail(page, labels.legalName, row.legalName, PAGE_MARGIN, y, width - PAGE_MARGIN * 2, fonts);
  y = drawDetail(page, labels.idNumber, row.idNumber, PAGE_MARGIN, y, width - PAGE_MARGIN * 2, fonts);
  y = drawDetail(page, labels.signedAt, dateLabel(new Date(row.acceptedAt), locale), PAGE_MARGIN, y, width - PAGE_MARGIN * 2, fonts);

  y = drawSectionLabel(page, labels.signature, y - 2, fonts);
  await drawSignature(document, page, row.signatureImage!, PAGE_MARGIN, y - 83, 220, 70);
  y -= 102;

  y = drawSectionLabel(page, labels.technical, y, fonts);
  const technicalRows = [
    [labels.reference, contractReference(row)],
    [labels.pack, `v${row.packVersion}`],
    [labels.language, row.locale.toUpperCase()],
    [labels.ip, row.ipAddress || labels.unavailable],
    [labels.device, row.deviceSummary || labels.unavailable],
    [labels.userAgent, row.userAgent || labels.unavailable],
  ];
  for (const [label, value] of technicalRows) {
    y = drawDetail(page, label, value, PAGE_MARGIN, y, width - PAGE_MARGIN * 2, fonts);
  }

  y = Math.max(y - 3, 150);
  for (const item of rows) {
    const line = `${item.documentTitle} · v${item.documentVersion} · ${labels.hash}: ${item.contentHash}`;
    y = drawWrapped(page, line, PAGE_MARGIN, y, 6.5, 8.7, width - PAGE_MARGIN * 2, fonts.regular, MUTED) - 2;
  }
}

function drawFooters(document: PDFDocument, fonts: Fonts, reference: string, locale: Locale): void {
  const labels = LABELS[locale];
  const pages = document.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    page.drawLine({ start: { x: PAGE_MARGIN, y: 45 }, end: { x: A4[0] - PAGE_MARGIN, y: 45 }, thickness: 0.5, color: PALE });
    drawText(page, `ePetrecere.md · ${reference}`, PAGE_MARGIN, 29, 6.8, fonts.regular, MUTED);
    const number = `${labels.page} ${index + 1} / ${pages.length}`;
    drawText(page, number, A4[0] - PAGE_MARGIN - widthOf(number, fonts.regular, 6.8), 29, 6.8, fonts.regular, MUTED);
  }
}

/**
 * Produce one immutable, multi-page PDF for a complete onboarding signature.
 * The PDF is rebuilt from the exact snapshots kept in legal_acceptances; the
 * current published legal templates are never substituted for signed text.
 */
export async function generateSignedContractPdf(input: SignedContractEvidence[]): Promise<Uint8Array> {
  const rows = validateSignedContractSession(input);
  const first = rows[0];
  const locale = localeOf(first.locale);
  const acceptedAt = new Date(first.acceptedAt);
  const document = await PDFDocument.create();
  const fonts = await embedFonts(document);
  const reference = contractReference(first);

  document.setTitle(`${LABELS[locale].title} · ${reference}`);
  document.setAuthor("EPETRECERE S.R.L.");
  document.setSubject(`${LABELS[locale].pack} v${first.packVersion}`);
  document.setProducer("ePetrecere.md");
  document.setCreator("ePetrecere.md");
  document.setCreationDate(acceptedAt);
  document.setModificationDate(acceptedAt);

  await drawCover(document, rows, fonts, locale);
  drawDocuments(document, rows, fonts, locale);
  await drawCertificate(document, rows, fonts, locale);
  drawFooters(document, fonts, reference, locale);
  return document.save();
}
