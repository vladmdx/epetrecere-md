import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { FileText } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { LEGAL_DOCUMENTS, LEGAL_PACK_VERSION } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Documente legale",
  description:
    "Acordurile, politicile și tarifele care guvernează platforma ePetrecere.md.",
  path: "/legal",
});
}

export default function LegalIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">
          Acasă
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Documente legale</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        Documente legale
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        EPETRECERE Legal Pack v{LEGAL_PACK_VERSION} — disponibil în română și rusă.
      </p>

      <ul className="mt-8 space-y-2">
        {LEGAL_DOCUMENTS.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="flex items-center gap-3 rounded-xl border border-border/60 p-4 transition-colors hover:border-gold/40 hover:bg-gold/5"
            >
              <FileText className="h-5 w-5 shrink-0 text-gold" />
              <span className="flex-1 font-medium">{doc.title.ro}</span>
              <span className="text-xs text-muted-foreground">v{doc.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
