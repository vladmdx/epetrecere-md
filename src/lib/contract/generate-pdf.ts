// Generates an immutable A4 booking contract using embedded Noto Sans fonts.
// The explicit font paths are intentional: Next/Vercel's output tracer must
// include every subset used by the server-side PDF route.

import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
  rgb,
} from "pdf-lib";
import {
  bookingContractCopy,
  bookingContractLocale,
  type BookingContractLocale,
} from "@/lib/contract/copy";

export interface ContractData {
  bookingId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientSignature: string | null;
  clientSignedAt: Date | null;
  /** Stable render timestamp. Signed documents use the signing instant;
   * unsigned previews use the immutable booking creation timestamp. */
  generationDate: Date;
  locale?: BookingContractLocale;
  vendorName: string;
  vendorKind: "artist" | "sala";
  /** Frozen venue/hall names. Never sourced from a live profile after confirmation. */
  venueName?: string | null;
  hallName?: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  eventDate: string;
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
}

export function contractVendorPartyRows(
  data: Pick<
    ContractData,
    | "vendorKind"
    | "vendorName"
    | "venueName"
    | "hallName"
    | "vendorPhone"
    | "vendorEmail"
  >,
  locale: BookingContractLocale = "ro",
): Array<[string, string]> {
  const copy = bookingContractCopy(locale);
  const identityRows: Array<[string, string]> = data.vendorKind === "sala"
    ? [
        [copy.venue, data.venueName || "Local"],
        [copy.hall, data.hallName || "Sală"],
      ]
    : [[copy.artist, data.vendorName]];
  return [
    ...identityRows,
    [copy.phone, data.vendorPhone || "-"],
    [copy.email, data.vendorEmail || "-"],
  ];
}

type FontFamily = {
  latin: PDFFont;
  latinExt: PDFFont;
  cyrillic: PDFFont;
};

type Fonts = {
  regular: FontFamily;
  bold: FontFamily;
};

const A4: [number, number] = [595.28, 841.89];
const PAGE_MARGIN = 50;
const CONTENT_BOTTOM = 64;
const GOLD = rgb(0.788, 0.659, 0.298);
const INK = rgb(0.105, 0.113, 0.145);
const MUTED = rgb(0.39, 0.41, 0.47);
const PALE = rgb(0.86, 0.87, 0.9);
const WHITE = rgb(1, 1, 1);

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

function normalizePdfText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFC")
    .replace(/[\t\r]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function fontForCharacter(fonts: FontFamily, character: string): PDFFont {
  if (/\p{Script=Cyrillic}/u.test(character)) return fonts.cyrillic;
  if (/\p{Script=Latin}/u.test(character) && character.codePointAt(0)! >= 0x100) {
    return fonts.latinExt;
  }
  return fonts.latin;
}

function textRuns(text: string, fonts: FontFamily): Array<{ text: string; font: PDFFont }> {
  const result: Array<{ text: string; font: PDFFont }> = [];
  for (const character of [...normalizePdfText(text)]) {
    const previous = result[result.length - 1];
    const font = /\p{Mark}/u.test(character) && previous
      ? previous.font
      : fontForCharacter(fonts, character);
    if (previous?.font === font) previous.text += character;
    else result.push({ text: character, font });
  }
  return result;
}

function widthOf(text: string, fonts: FontFamily, size: number): number {
  return textRuns(text, fonts).reduce(
    (total, run) => total + run.font.widthOfTextAtSize(run.text, size),
    0,
  );
}

function drawUnicodeText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  fonts: FontFamily,
  color: RGB,
): number {
  let cursor = x;
  for (const run of textRuns(text, fonts)) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
  return cursor;
}

function breakLongWord(
  word: string,
  fonts: FontFamily,
  size: number,
  maxWidth: number,
): string[] {
  const parts: string[] = [];
  let current = "";
  for (const character of [...word]) {
    const candidate = current + character;
    if (current && widthOf(candidate, fonts, size) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(
  text: string,
  fonts: FontFamily,
  size: number,
  maxWidth: number,
): string[] {
  const output: string[] = [];
  for (const paragraph of normalizePdfText(text).split("\n")) {
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

async function embedFonts(document: PDFDocument): Promise<Fonts> {
  document.registerFontkit(fontkit);
  const embed = async (path: string) =>
    document.embedFont(readFileSync(path), { subset: true });
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

function dateLabel(
  date: Date,
  includeTime: boolean,
  locale: BookingContractLocale,
): string {
  const localeTag = locale === "ru" ? "ru-MD" : locale === "en" ? "en-GB" : "ro-MD";
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: "long",
    ...(includeTime ? { timeStyle: "medium" as const } : {}),
    timeZone: "Europe/Chisinau",
  }).format(date);
}

export async function generateContractPdf(data: ContractData): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const fonts = await embedFonts(document);
  const locale = bookingContractLocale(data.locale);
  const copy = bookingContractCopy(locale);
  document.setTitle(`ePetrecere contract #${data.bookingId}`);
  document.setCreator("ePetrecere.md");
  document.setProducer("ePetrecere.md");
  document.setCreationDate(data.generationDate);
  document.setModificationDate(data.generationDate);

  let page!: PDFPage;
  let y = 0;

  const addPage = (continuation: boolean): void => {
    page = document.addPage(A4);
    page.drawRectangle({
      x: 0,
      y: A4[1] - 70,
      width: A4[0],
      height: 70,
      color: rgb(0.051, 0.051, 0.051),
    });
    drawUnicodeText(page, "ePetrecere.md", PAGE_MARGIN, A4[1] - 40, 18, fonts.bold, GOLD);
    drawUnicodeText(
      page,
      continuation
        ? `Contract #${data.bookingId} - ${copy.continuation}`
        : copy.header,
      PAGE_MARGIN,
      A4[1] - 58,
      8.5,
      fonts.regular,
      rgb(0.85, 0.85, 0.85),
    );
    y = A4[1] - 100;
  };

  const ensureSpace = (height: number): void => {
    if (y - height < CONTENT_BOTTOM) addPage(true);
  };

  const drawWrapped = (
    text: string,
    options: {
      x?: number;
      size?: number;
      lineHeight?: number;
      maxWidth?: number;
      family?: FontFamily;
      color?: RGB;
      keepLines?: number;
    } = {},
  ): void => {
    const x = options.x ?? PAGE_MARGIN;
    const size = options.size ?? 9;
    const lineHeight = options.lineHeight ?? 13;
    const maxWidth = options.maxWidth ?? A4[0] - PAGE_MARGIN * 2;
    const family = options.family ?? fonts.regular;
    const color = options.color ?? INK;
    const lines = wrapText(text, family, size, maxWidth);
    ensureSpace(lineHeight * Math.min(lines.length, options.keepLines ?? 1));
    for (const line of lines) {
      if (y - lineHeight < CONTENT_BOTTOM) addPage(true);
      if (line) drawUnicodeText(page, line, x, y, size, family, color);
      y -= lineHeight;
    }
  };

  const drawSectionTitle = (title: string, minimumFollowingHeight = 15): void => {
    ensureSpace(17 + minimumFollowingHeight);
    drawUnicodeText(page, title, PAGE_MARGIN, y, 11, fonts.bold, GOLD);
    y -= 14;
    page.drawLine({
      start: { x: PAGE_MARGIN, y: y + 4 },
      end: { x: A4[0] - PAGE_MARGIN, y: y + 4 },
      thickness: 0.6,
      color: PALE,
    });
    y -= 3;
  };

  const drawRows = (rows: Array<[string, string]>): void => {
    const labelWidth = 120;
    const valueX = PAGE_MARGIN + labelWidth;
    const valueWidth = A4[0] - PAGE_MARGIN - valueX;
    for (const [label, value] of rows) {
      const lines = wrapText(value || "-", fonts.bold, 9.5, valueWidth);
      const rowHeight = Math.max(15, lines.length * 13);
      ensureSpace(Math.min(rowHeight, 39));
      drawUnicodeText(page, label, PAGE_MARGIN, y, 8.7, fonts.regular, MUTED);
      for (let index = 0; index < lines.length; index += 1) {
        if (y - 13 < CONTENT_BOTTOM) {
          addPage(true);
          drawUnicodeText(page, `${label} (continuare)`, PAGE_MARGIN, y, 8.7, fonts.regular, MUTED);
        }
        const line = lines[index];
        if (line) drawUnicodeText(page, line, valueX, y, 9.5, fonts.bold, INK);
        y -= 13;
      }
      if (!lines.length) y -= 13;
      y -= 2;
    }
    y -= 7;
  };

  addPage(false);
  drawUnicodeText(page, `CONTRACT #${data.bookingId}`, PAGE_MARGIN, y, 16, fonts.bold, INK);
  y -= 21;
  drawUnicodeText(
    page,
    `${copy.generatedAt}: ${dateLabel(data.generationDate, false, locale)}`,
    PAGE_MARGIN,
    y,
    9,
    fonts.regular,
    MUTED,
  );
  y -= 29;

  const price = data.agreedPrice != null ? `${data.agreedPrice} EUR` : copy.negotiable;
  const time = data.startTime && data.endTime
    ? `${data.startTime} - ${data.endTime}`
    : data.startTime || "-";

  drawSectionTitle(copy.parties);
  drawRows([
    ...contractVendorPartyRows(data, locale),
    [copy.client, data.clientName],
    [copy.phone, data.clientPhone],
    [copy.email, data.clientEmail || "-"],
  ]);

  drawSectionTitle(copy.eventDetails);
  drawRows([
    [copy.eventType, data.eventType || "-"],
    [copy.date, data.eventDate],
    [copy.time, time],
    [copy.guests, data.guestCount != null ? String(data.guestCount) : "-"],
    [copy.price, price],
  ]);

  if (data.message?.trim()) {
    drawSectionTitle(copy.notes, 26);
    drawWrapped(data.message.trim(), {
      size: 9,
      lineHeight: 13,
      keepLines: 2,
    });
    y -= 10;
  }

  drawSectionTitle(copy.termsTitle, 25);
  for (let index = 0; index < copy.terms.length; index += 1) {
    drawWrapped(`${index + 1}. ${copy.terms[index]}`, {
      size: 8.8,
      lineHeight: 12.5,
      keepLines: 2,
    });
    y -= 5;
  }

  const signatureValue = data.clientSignature || copy.unsigned;
  let signatureSize = 13;
  let signatureLines = wrapText(signatureValue, fonts.bold, signatureSize, 244);
  while (signatureLines.length > 3 && signatureSize > 6) {
    signatureSize -= 0.5;
    signatureLines = wrapText(signatureValue, fonts.bold, signatureSize, 244);
  }
  const signatureLineHeight = signatureSize + 2;
  const signatureBoxHeight = Math.max(62, signatureLines.length * signatureLineHeight + 29);
  ensureSpace(31 + signatureBoxHeight);
  drawUnicodeText(page, copy.signature, PAGE_MARGIN, y, 11, fonts.bold, GOLD);
  y -= 15;
  const boxTop = y;
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: boxTop - signatureBoxHeight + 4,
    width: 260,
    height: signatureBoxHeight,
    color: WHITE,
    borderColor: PALE,
    borderWidth: 0.7,
  });
  if (data.clientSignature) {
    let signatureY = boxTop - 18;
    for (const line of signatureLines) {
      drawUnicodeText(page, line, PAGE_MARGIN + 8, signatureY, signatureSize, fonts.bold, INK);
      signatureY -= signatureLineHeight;
    }
    if (data.clientSignedAt) {
      drawUnicodeText(
        page,
        `${copy.signedAt} ${dateLabel(data.clientSignedAt, true, locale)}`,
        PAGE_MARGIN + 8,
        boxTop - signatureBoxHeight + 13,
        6.8,
        fonts.regular,
        MUTED,
      );
    }
  } else {
    drawUnicodeText(page, copy.unsigned, PAGE_MARGIN + 8, boxTop - 25, 9, fonts.regular, MUTED);
  }

  const pages = document.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const footerPage = pages[index];
    footerPage.drawLine({
      start: { x: PAGE_MARGIN, y: 45 },
      end: { x: A4[0] - PAGE_MARGIN, y: 45 },
      thickness: 0.5,
      color: PALE,
    });
    drawUnicodeText(
      footerPage,
      `ePetrecere.md - Contract #${data.bookingId}`,
      PAGE_MARGIN,
      28,
      7,
      fonts.regular,
      MUTED,
    );
    const pageNumber = `${copy.page} ${index + 1} / ${pages.length}`;
    drawUnicodeText(
      footerPage,
      pageNumber,
      A4[0] - PAGE_MARGIN - widthOf(pageNumber, fonts.regular, 7),
      28,
      7,
      fonts.regular,
      MUTED,
    );
  }

  return document.save();
}
