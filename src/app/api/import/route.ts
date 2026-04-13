import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { artists, importBatches } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { slugify } from "@/lib/utils/slugify";

// SEC — bulk artist import is admin-only. Anonymous access would let
// anyone inject fake artist rows into the DB.

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mappingRaw = formData.get("mapping") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Parse file
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, string>[] = [];

  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const text = buffer.toString("utf-8");
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    rows = parsed.data;
  } else if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  } else {
    return NextResponse.json({ error: "Unsupported file format. Use .csv, .xlsx, or .xls" }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // If no mapping provided, return preview for column mapping
  if (!mappingRaw) {
    return NextResponse.json({
      columns: Object.keys(rows[0]),
      preview: rows.slice(0, 10),
      totalRows: rows.length,
    });
  }

  // Parse mapping
  const mapping = JSON.parse(mappingRaw) as Record<string, string>;

  // Create import batch
  const [batch] = await db
    .insert(importBatches)
    .values({
      filename: file.name,
      type: "artists",
      status: "processing",
      totalRows: rows.length,
      processedRows: 0,
    })
    .returning();

  // Import artists
  let processed = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nameRo = row[mapping.name_ro] || row[mapping.name] || "";
      if (!nameRo) {
        errors.push({ row: i + 1, error: "Missing name" });
        continue;
      }

      const slug = slugify(nameRo) + `-${Date.now()}-${i}`;

      await db.insert(artists).values({
        nameRo,
        nameRu: row[mapping.name_ru] || null,
        nameEn: row[mapping.name_en] || null,
        slug,
        descriptionRo: row[mapping.description_ro] || row[mapping.description] || null,
        descriptionRu: row[mapping.description_ru] || null,
        phone: row[mapping.phone] || null,
        email: row[mapping.email] || null,
        location: row[mapping.location] || row[mapping.city] || null,
        priceFrom: row[mapping.price] ? parseInt(row[mapping.price]) || null : null,
        instagram: row[mapping.instagram] || null,
        facebook: row[mapping.facebook] || null,
        isActive: false, // Draft status, needs review
        seoTitleRo: `${nameRo} — Artist pentru Evenimente | ePetrecere.md`,
        seoDescRo: (row[mapping.description_ro] || row[mapping.description] || "")
          .substring(0, 155),
      });

      processed++;
    } catch (err) {
      errors.push({ row: i + 1, error: String(err) });
    }
  }

  // Update batch
  const { eq } = await import("drizzle-orm");
  await db
    .update(importBatches)
    .set({
      status: "completed",
      processedRows: processed,
      errorLog: errors.length ? errors : null,
    })
    .where(eq(importBatches.id, batch.id));

  return NextResponse.json({
    batchId: batch.id,
    totalRows: rows.length,
    processed,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  });
}
