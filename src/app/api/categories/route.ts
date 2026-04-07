import { NextResponse } from "next/server";
import { getAllCategories } from "@/lib/db/queries/categories";

export async function GET() {
  const items = await getAllCategories();
  return NextResponse.json(items);
}
