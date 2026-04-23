// Generates a clean A4 contract PDF for a booking using pdf-lib.
// No external fonts — we use the built-in Helvetica which handles Latin
// characters including Romanian diacritics sufficiently for a legal
// document in Romania/Moldova. If you want custom branding/logo, embed
// them here with `doc.embedPng()`.
//
// Returns a Uint8Array ready to upload to Vercel Blob / filesystem.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ContractData {
  bookingId: number;
  // Client
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientSignature: string | null;
  clientSignedAt: Date | null;
  // Vendor
  vendorName: string;
  vendorKind: "artist" | "sala";
  vendorEmail: string | null;
  vendorPhone: string | null;
  // Event
  eventDate: string; // YYYY-MM-DD
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
}

// Sanitize text for pdf-lib's Helvetica (WinAnsi). Romanian diacritics
// are in the WinAnsi range but a few edge chars (em-dash, smart quotes)
// need replacing. We keep the text readable without embedding a TTF.
function sanitize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\u0020-\u024F]/g, ""); // strip anything outside basic Latin+diacritics
}

export async function generateContractPdf(
  data: ContractData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const MARGIN = 50;
  let y = height - MARGIN;

  const gold = rgb(0.788, 0.659, 0.298); // #C9A84C
  const dark = rgb(0.17, 0.17, 0.23); // #2C2C3A
  const muted = rgb(0.42, 0.42, 0.48);

  // Header band
  page.drawRectangle({
    x: 0,
    y: height - 70,
    width,
    height: 70,
    color: rgb(0.051, 0.051, 0.051),
  });
  page.drawText("ePetrecere.md", {
    x: MARGIN,
    y: height - 40,
    size: 18,
    font: bold,
    color: gold,
  });
  page.drawText("Contract de prestari servicii pentru evenimente", {
    x: MARGIN,
    y: height - 58,
    size: 9,
    font,
    color: rgb(0.85, 0.85, 0.85),
  });

  y = height - 100;

  // Title
  page.drawText(`CONTRACT #${data.bookingId}`, {
    x: MARGIN,
    y,
    size: 16,
    font: bold,
    color: dark,
  });
  y -= 20;
  page.drawText(`Data generarii: ${new Date().toLocaleDateString("ro-RO")}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: muted,
  });
  y -= 30;

  // Helper — section with label + value rows
  function section(title: string, rows: Array<[string, string]>) {
    page.drawText(title, { x: MARGIN, y, size: 11, font: bold, color: gold });
    y -= 14;
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: width - MARGIN, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.9),
    });
    for (const [label, val] of rows) {
      if (y < 120) {
        // Spillover — for MVP, trust single page fits. Skip if close to bottom.
        break;
      }
      page.drawText(label, {
        x: MARGIN,
        y,
        size: 9,
        font,
        color: muted,
      });
      page.drawText(sanitize(val) || "—", {
        x: MARGIN + 120,
        y,
        size: 10,
        font: bold,
        color: dark,
        maxWidth: width - MARGIN - 120 - MARGIN,
      });
      y -= 15;
    }
    y -= 10;
  }

  const vendorLabel = data.vendorKind === "sala" ? "Sala" : "Artist";
  const price = data.agreedPrice ? `${data.agreedPrice} EUR` : "de negociat";
  const time =
    data.startTime && data.endTime
      ? `${data.startTime} - ${data.endTime}`
      : data.startTime || "-";

  section("PARTILE CONTRACTANTE", [
    [`${vendorLabel} (Prestator):`, data.vendorName],
    ["  Telefon:", data.vendorPhone || "-"],
    ["  Email:", data.vendorEmail || "-"],
    ["Client (Beneficiar):", data.clientName],
    ["  Telefon:", data.clientPhone],
    ["  Email:", data.clientEmail || "-"],
  ]);

  section("DETALII EVENIMENT", [
    ["Tip eveniment:", data.eventType || "-"],
    ["Data:", data.eventDate],
    ["Interval orar:", time],
    [
      "Numar invitati:",
      data.guestCount ? String(data.guestCount) : "-",
    ],
    ["Pret agreat:", price],
  ]);

  // Terms
  page.drawText("TERMENI SI CONDITII", {
    x: MARGIN,
    y,
    size: 11,
    font: bold,
    color: gold,
  });
  y -= 14;
  page.drawLine({
    start: { x: MARGIN, y: y + 4 },
    end: { x: width - MARGIN, y: y + 4 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.9),
  });

  const terms = [
    "1. Prestatorul se obliga sa furnizeze serviciile conform detaliilor de mai sus.",
    "2. Beneficiarul achita contravaloarea integrala pana cel tarziu in ziua evenimentului.",
    "3. Anularea cu mai putin de 7 zile inainte de eveniment nu da dreptul la rambursare.",
    "4. Eventualele neintelegeri se rezolva prin discutie directa sau mediere prin ePetrecere.md.",
    "5. Prezentul contract este semnat electronic prin platforma ePetrecere.md si are valoare juridica.",
  ];
  for (const line of terms) {
    if (y < 140) break;
    page.drawText(sanitize(line), {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: dark,
      maxWidth: width - 2 * MARGIN,
    });
    y -= 13;
  }
  y -= 10;

  // Signature box
  y -= 10;
  page.drawText("SEMNATURA CLIENT", {
    x: MARGIN,
    y,
    size: 11,
    font: bold,
    color: gold,
  });
  y -= 16;
  page.drawRectangle({
    x: MARGIN,
    y: y - 40,
    width: 240,
    height: 45,
    borderColor: rgb(0.75, 0.75, 0.8),
    borderWidth: 0.5,
  });
  if (data.clientSignature) {
    page.drawText(sanitize(data.clientSignature), {
      x: MARGIN + 8,
      y: y - 15,
      size: 14,
      font: bold,
      color: dark,
    });
    if (data.clientSignedAt) {
      page.drawText(
        `Semnat electronic la ${data.clientSignedAt.toLocaleString("ro-RO")}`,
        {
          x: MARGIN + 8,
          y: y - 35,
          size: 7,
          font,
          color: muted,
        },
      );
    }
  } else {
    page.drawText("(nesemnat)", {
      x: MARGIN + 8,
      y: y - 20,
      size: 9,
      font,
      color: muted,
    });
  }

  // Footer
  page.drawText(
    "Generat automat de ePetrecere.md - Marketplace pentru Evenimente",
    {
      x: MARGIN,
      y: 30,
      size: 8,
      font,
      color: muted,
    },
  );
  page.drawText(`Contract #${data.bookingId}`, {
    x: width - MARGIN - 80,
    y: 30,
    size: 8,
    font,
    color: muted,
  });

  return await doc.save();
}
