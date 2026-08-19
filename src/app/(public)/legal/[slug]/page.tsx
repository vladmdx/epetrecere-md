import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateMeta } from "@/lib/seo/generate-meta";
import { LEGAL_DOCUMENTS, getLegalDocument } from "@/lib/legal";
import { LegalDocumentView } from "./view";

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDocument(slug);
  if (!doc) return generateMeta({ title: "Document legal", path: "/legal" });
  return generateMeta({
    title: doc.title.ro,
    description: `${doc.title.ro} — EPETRECERE Legal Pack v${doc.version}.`,
    path: `/legal/${doc.slug}`,
  });
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getLegalDocument(slug);
  if (!doc) notFound();
  return <LegalDocumentView doc={doc} />;
}
