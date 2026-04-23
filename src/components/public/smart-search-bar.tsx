"use client";

// Smart (AI-powered) search bar for the homepage.
// User types a natural-language query → Claude parses it into structured
// filters → we redirect them to /artisti?... or /sali?... with those
// filters pre-applied. Shows a tiny "explanation" under the input after
// submit so the user understands what we extracted.
//
// Differences from the classic `<SearchBarSection>`:
//   - One free-text input instead of 3 selects
//   - AI round-trip on submit (loading ~1s)
//   - Shows what it understood + a "Refă căutarea" fallback link

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Suggestion chips shown below the input to hint what works. */
  placeholderExamples?: string[];
  className?: string;
}

const DEFAULT_EXAMPLES = [
  "DJ pentru nuntă în Chișinău",
  "sală 150 invitați",
  "moderator cumătrie sub 400€",
  "fotograf 20 iulie",
];

export function SmartSearchBar({
  placeholderExamples = DEFAULT_EXAMPLES,
  className,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    explanation: string;
  } | null>(null);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 3) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        url: string;
        explanation: string;
      };
      setResult(data);
      // Auto-navigate after a brief pause so the user can see the
      // explanation (trust-building). Shortcut with Enter if impatient.
      setTimeout(() => router.push(data.url), 800);
    } catch {
      setResult({
        url: "/artisti",
        explanation:
          "Nu am putut interpreta — foloseste filtrele standard în listare.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center gap-2 rounded-2xl border border-gold/30 bg-[#141428]/80 p-2 shadow-[0_0_20px_rgba(201,168,76,0.08)] backdrop-blur-sm focus-within:border-gold/60"
      >
        <Sparkles className="ml-2 h-4 w-4 shrink-0 text-gold" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Caută cu cuvinte tale — ex: DJ nuntă Chișinău sub 500€"
          className="flex-1 bg-transparent px-1 py-2 text-sm text-white placeholder:text-white/40 outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || q.trim().length < 3}
          aria-label="Caută"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gold px-4 text-sm font-semibold text-[#0D0D0D] transition-colors hover:bg-gold-dark disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">Caută cu AI</span>
              <span className="sm:hidden">Caută</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Example chips — clickable */}
      {!result && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground/70">De exemplu:</span>
          {placeholderExamples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                // auto-submit feels nicer
                setTimeout(() => handleSubmit(), 50);
              }}
              className="rounded-full border border-gold/20 bg-gold/5 px-2.5 py-0.5 text-[11px] text-gold/90 transition-colors hover:bg-gold/10"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Explanation of what we understood */}
      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold/20 bg-gold/5 p-2.5 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          <div className="flex-1">
            <p className="text-gold/90">{result.explanation}</p>
            <p className="mt-0.5 text-muted-foreground">
              Te redirectez automat… sau apasă{" "}
              <button
                type="button"
                onClick={() => router.push(result.url)}
                className="font-medium text-gold hover:underline"
              >
                acum
              </button>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
