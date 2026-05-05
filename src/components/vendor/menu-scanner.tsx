"use client";

// Upload a photo or PDF of a venue menu → Claude vision extracts categories,
// items and packages → owner reviews + edits inline → import bulk-inserts.
//
// Three stages:
//   "idle"       — dropzone only
//   "scanning"   — file uploaded, waiting for AI
//   "review"     — parsed JSON rendered as editable rows
//
// We intentionally never persist the AI output directly. The owner MUST
// click "Importă" to commit, giving them a chance to fix mis-OCR'd prices
// or re-name translated categories.

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileImage,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  Link as LinkIcon,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Matches /api/venue-menu/scan output
interface ScannedItem {
  nameRo: string;
  descriptionRo?: string | null;
  priceMdl?: number | null;
  priceEur?: number | null;
}
interface ScannedCategory {
  nameRo: string;
  icon?: string | null;
  items: ScannedItem[];
}
interface ScannedPackage {
  nameRo: string;
  pricePerPerson: number;
  includes?: string | null;
  excludes?: string | null;
  minGuests?: number | null;
}
interface ScanResult {
  categories: ScannedCategory[];
  packages: ScannedPackage[];
}

const ICON_OPTIONS = [
  { value: "salad", label: "🥗 Aperitiv / Salată" },
  { value: "beef", label: "🍖 Fel principal" },
  { value: "cake", label: "🍰 Desert" },
  { value: "wine", label: "🍷 Alcool" },
  { value: "coffee", label: "🥤 Non-alcoolice" },
  { value: "utensils", label: "🍽 Altele" },
];

interface Props {
  venueId: number;
  /** Called after a successful import so the parent can refresh its list. */
  onImported: () => void;
}

export function MenuScanner({ venueId, onImported }: Props) {
  const [stage, setStage] = useState<"idle" | "uploading" | "scanning" | "review">(
    "idle",
  );
  const [inputMode, setInputMode] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setPreviewUrl(null);
    setPreviewMime(null);
    setFromCache(false);
    setResult(null);
    setExpanded(new Set());
    setReplaceExisting(false);
    setUrlInput("");
  }

  /** Parse + validate a URL. Returns null with a toast on failure. */
  function normalizedUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      // Prepend https:// if the user pasted "example.com/menu"
      const withScheme = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      const u = new URL(withScheme);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  async function handleUrl() {
    const url = normalizedUrl(urlInput);
    if (!url) {
      toast.error("URL invalid");
      return;
    }
    // Determine the expected mime from the URL path extension. This is a
    // hint for the server; it re-detects via response headers anyway.
    const lower = url.toLowerCase();
    let declaredMime: string | undefined;
    if (/\.(jpe?g)(\?|$)/.test(lower)) declaredMime = "image/jpeg";
    else if (/\.png(\?|$)/.test(lower)) declaredMime = "image/png";
    else if (/\.webp(\?|$)/.test(lower)) declaredMime = "image/webp";
    else if (/\.gif(\?|$)/.test(lower)) declaredMime = "image/gif";
    else if (/\.pdf(\?|$)/.test(lower)) declaredMime = "application/pdf";
    // else: leave undefined → server treats as text/html

    setPreviewUrl(url);
    setPreviewMime(declaredMime ?? "text/html");
    setStage("scanning");

    try {
      const res = await fetch("/api/venue-menu/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          fileUrl: url,
          mimeType: declaredMime, // may be undefined → server auto-detects
          source: "url",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut citi URL-ul");
        setStage("idle");
        return;
      }
      const data = (await res.json()) as ScanResult & { cached?: boolean };
      applyScanResult(data);
    } catch {
      toast.error("Eroare la scanare din URL");
      setStage("idle");
    }
  }

  /** Common handler for any successful scan response (file or URL). */
  function applyScanResult(data: ScanResult & { cached?: boolean }) {
    if (
      (!data.categories || data.categories.length === 0) &&
      (!data.packages || data.packages.length === 0)
    ) {
      toast.error(
        "AI nu a găsit niciun produs. Încearcă o pagină mai specifică (ex: /meniu) sau încarcă o poză/PDF al meniului.",
        { duration: 8000 },
      );
      setStage("idle");
      return;
    }
    setResult(data);
    setFromCache(!!data.cached);
    setExpanded(new Set([0]));
    setStage("review");
    const total =
      data.categories.reduce((n, c) => n + c.items.length, 0) +
      data.packages.length;
    if (data.cached) {
      toast.success(
        `Încărcat din cache: ${data.categories.length} categorii · ${total} înregistrări`,
      );
    } else {
      toast.success(
        `Am extras ${data.categories.length} categorii · ${total} înregistrări`,
      );
    }
  }

  async function handleFile(file: File) {
    // Client-side validation before burning the upload + Claude quota.
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowed.includes(file.type)) {
      toast.error("Doar JPG/PNG/WebP/GIF sau PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fișierul depășește 10MB");
      return;
    }

    setStage("uploading");
    setPreviewMime(file.type);
    setPreviewUrl(null);

    // 1) Upload to /api/upload (Vercel Blob in prod, local disk in dev).
    let fileUrl: string;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "venues");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) {
        const err = await up.json().catch(() => ({}));
        throw new Error(err.error || "Upload eșuat");
      }
      const upData = (await up.json()) as { url: string };
      fileUrl = upData.url;
      setPreviewUrl(fileUrl);
    } catch (err) {
      toast.error((err as Error).message || "Upload eșuat");
      setStage("idle");
      return;
    }

    // 2) Ask Claude to parse it.
    setStage("scanning");
    try {
      const res = await fetch("/api/venue-menu/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          fileUrl,
          mimeType: file.type,
          source: "upload",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "AI-ul nu a putut extrage meniul");
        setStage("idle");
        return;
      }
      const data = (await res.json()) as ScanResult & { cached?: boolean };
      applyScanResult(data);
    } catch {
      toast.error("Eroare la scanare");
      setStage("idle");
    }
  }

  function updateCategory(idx: number, patch: Partial<ScannedCategory>) {
    if (!result) return;
    setResult({
      ...result,
      categories: result.categories.map((c, i) =>
        i === idx ? { ...c, ...patch } : c,
      ),
    });
  }

  function removeCategory(idx: number) {
    if (!result) return;
    setResult({
      ...result,
      categories: result.categories.filter((_, i) => i !== idx),
    });
  }

  function updateItem(
    catIdx: number,
    itemIdx: number,
    patch: Partial<ScannedItem>,
  ) {
    if (!result) return;
    const cat = result.categories[catIdx];
    updateCategory(catIdx, {
      items: cat.items.map((it, i) => (i === itemIdx ? { ...it, ...patch } : it)),
    });
  }

  function removeItem(catIdx: number, itemIdx: number) {
    if (!result) return;
    const cat = result.categories[catIdx];
    updateCategory(catIdx, {
      items: cat.items.filter((_, i) => i !== itemIdx),
    });
  }

  function addItem(catIdx: number) {
    if (!result) return;
    const cat = result.categories[catIdx];
    updateCategory(catIdx, {
      items: [
        ...cat.items,
        { nameRo: "", descriptionRo: null, priceMdl: null, priceEur: null },
      ],
    });
  }

  function updatePackage(idx: number, patch: Partial<ScannedPackage>) {
    if (!result) return;
    setResult({
      ...result,
      packages: result.packages.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  function removePackage(idx: number) {
    if (!result) return;
    setResult({
      ...result,
      packages: result.packages.filter((_, i) => i !== idx),
    });
  }

  function toggleExpanded(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function doImport() {
    if (!result) return;
    // Last-mile validation — strip empty-name rows so the server doesn't reject.
    const clean: ScanResult = {
      categories: result.categories
        .filter((c) => c.nameRo.trim())
        .map((c) => ({
          ...c,
          nameRo: c.nameRo.trim(),
          items: c.items
            .filter((it) => it.nameRo.trim())
            .map((it) => ({
              ...it,
              nameRo: it.nameRo.trim(),
              descriptionRo: it.descriptionRo?.trim() || null,
            })),
        })),
      packages: result.packages
        .filter((p) => p.nameRo.trim() && p.pricePerPerson >= 0)
        .map((p) => ({
          ...p,
          nameRo: p.nameRo.trim(),
          includes: p.includes?.trim() || null,
          excludes: p.excludes?.trim() || null,
        })),
    };

    const totalRows =
      clean.categories.reduce((n, c) => n + c.items.length, 0) +
      clean.categories.length +
      clean.packages.length;
    if (totalRows === 0) {
      toast.error("Nimic de importat — completează măcar un rând.");
      return;
    }

    if (replaceExisting) {
      if (
        !confirm(
          "Înlocuirea meniului existent șterge DEFINITIV toate categoriile, itemele și pachetele curente. Continui?",
        )
      ) {
        return;
      }
    }

    setImporting(true);
    try {
      const res = await fetch("/api/venue-menu/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          replaceExisting,
          categories: clean.categories,
          packages: clean.packages,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Import eșuat");
        return;
      }
      const data = (await res.json()) as {
        categories: Array<{ itemCount: number }>;
        packages: Array<unknown>;
      };
      const totalItems = data.categories.reduce((n, c) => n + c.itemCount, 0);
      toast.success(
        `Importat: ${data.categories.length} categorii · ${totalItems} produse · ${data.packages.length} pachete`,
      );
      reset();
      onImported();
    } finally {
      setImporting(false);
    }
  }

  // ───────────────────────── Render ─────────────────────────

  if (stage === "idle") {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-gold">
            <Sparkles className="h-5 w-5" />
            <span className="font-heading text-sm font-bold">
              Scanează meniul tău existent cu AI
            </span>
          </div>

          {/* Source mode tabs */}
          <div
            className="inline-flex rounded-lg border border-border/50 p-0.5"
            role="tablist"
            aria-label="Sursă meniu"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === "file"}
              onClick={() => setInputMode("file")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                inputMode === "file"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileImage className="h-3.5 w-3.5" /> Poză / PDF
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === "url"}
              onClick={() => setInputMode("url")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                inputMode === "url"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LinkIcon className="h-3.5 w-3.5" /> Link site / imagine
            </button>
          </div>

          {inputMode === "file" && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-gold");
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("border-gold")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-gold");
                if (e.dataTransfer.files[0]) void handleFile(e.dataTransfer.files[0]);
              }}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-8 text-center transition-colors hover:border-gold/50 hover:bg-gold/5"
            >
              <Upload className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Trage aici o poză sau PDF</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG / PNG / WebP / PDF · max 10MB
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  AI-ul recunoaște categorii, produse și pachete. Revezi totul
                  înainte de import.
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}

          {inputMode === "url" && (
            <div className="space-y-3 rounded-xl border-2 border-dashed border-border/60 p-6">
              <div className="flex items-start gap-3">
                <Globe className="mt-1 h-8 w-8 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-medium">
                      Lipește un link către meniu
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      URL-ul unei pagini web cu meniul, sau link direct la o
                      imagine/PDF (Google Drive, site propriu, Facebook etc.).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleUrl();
                        }
                      }}
                      placeholder="https://restaurant-x.md/meniu"
                      className="h-9 flex-1"
                    />
                    <Button
                      onClick={handleUrl}
                      disabled={!urlInput.trim()}
                      className="h-9 gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Scanează
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    ℹ️ Sitemap-uri SPA care randează JS nu pot fi citite. În
                    acele cazuri fă un screenshot și trimite-l ca poză.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (stage === "uploading" || stage === "scanning") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-gold" />
          <p className="font-heading text-sm font-bold">
            {stage === "uploading"
              ? "Se încarcă fișierul..."
              : "Claude scanează meniul..."}
          </p>
          <p className="text-xs text-muted-foreground">
            {stage === "uploading"
              ? "Upload în curs pe Vercel Blob"
              : "Durează 15-30 secunde pentru o poză, 30-60s pentru PDF multi-pagină"}
          </p>
          {previewUrl && previewMime?.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Preview"
              className="mt-2 max-h-40 rounded-lg border border-border/40 object-contain"
            />
          )}
        </CardContent>
      </Card>
    );
  }

  // stage === "review"
  if (!result) return null;

  return (
    <div className="space-y-4">
      <Card className="border-gold/40 bg-gold/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-gold" />
            <span>
              <strong>{result.categories.length}</strong> categorii ·{" "}
              <strong>
                {result.categories.reduce((n, c) => n + c.items.length, 0)}
              </strong>{" "}
              produse · <strong>{result.packages.length}</strong> pachete —
              revezi și editează mai jos înainte de import.
            </span>
            {fromCache && (
              <span className="ml-2 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                ⚡ din cache
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> Scanează alt fișier
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Source preview */}
      {previewUrl && (
        <details className="rounded-lg border border-border/40 bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
            {previewMime === "application/pdf" ? (
              <FileText className="mr-1 inline h-3 w-3" />
            ) : (
              <FileImage className="mr-1 inline h-3 w-3" />
            )}
            Vezi fișierul original
          </summary>
          <div className="p-3">
            {previewMime?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Menu source"
                className="max-h-80 rounded-lg border border-border/40 object-contain"
              />
            ) : (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener"
                className="text-xs text-gold hover:underline"
              >
                Deschide PDF-ul →
              </a>
            )}
          </div>
        </details>
      )}

      {/* Categories */}
      {result.categories.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-heading text-sm font-bold">
              Categorii ({result.categories.length})
            </h3>
            <div className="space-y-2">
              {result.categories.map((cat, ci) => {
                const isOpen = expanded.has(ci);
                return (
                  <div
                    key={ci}
                    className="rounded-lg border border-border/40 bg-background"
                  >
                    <div className="flex items-center gap-2 p-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(ci)}
                        aria-label="Toggle"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <Input
                        value={cat.nameRo}
                        onChange={(e) =>
                          updateCategory(ci, { nameRo: e.target.value })
                        }
                        placeholder="Nume categorie"
                        className="h-8 flex-1 text-sm font-medium"
                      />
                      <Select
                        value={cat.icon ?? "utensils"}
                        onValueChange={(v) => updateCategory(ci, { icon: v })}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ICON_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">
                        {cat.items.length} produse
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeCategory(ci)}
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="space-y-2 border-t border-border/30 p-3">
                        {cat.items.map((it, ii) => (
                          <div key={ii} className="flex flex-wrap items-start gap-2">
                            <Input
                              value={it.nameRo}
                              onChange={(e) =>
                                updateItem(ci, ii, { nameRo: e.target.value })
                              }
                              placeholder="Nume produs"
                              className="h-8 min-w-[200px] flex-1 text-xs"
                            />
                            <Input
                              type="number"
                              value={it.priceMdl ?? ""}
                              onChange={(e) =>
                                updateItem(ci, ii, {
                                  priceMdl: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              placeholder="MDL"
                              className="h-8 w-20 text-xs"
                            />
                            <Input
                              type="number"
                              value={it.priceEur ?? ""}
                              onChange={(e) =>
                                updateItem(ci, ii, {
                                  priceEur: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              placeholder="EUR"
                              className="h-8 w-20 text-xs"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeItem(ci, ii)}
                              className="h-8 w-8 text-muted-foreground hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addItem(ci)}
                          className="h-7 gap-1 text-xs"
                        >
                          <Plus className="h-3 w-3" /> Adaugă produs
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Packages */}
      {result.packages.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-heading text-sm font-bold">
              Pachete ({result.packages.length})
            </h3>
            <div className="space-y-3">
              {result.packages.map((pkg, pi) => (
                <div
                  key={pi}
                  className="space-y-2 rounded-lg border border-border/40 bg-background p-3"
                >
                  <div className="flex items-start gap-2">
                    <Input
                      value={pkg.nameRo}
                      onChange={(e) =>
                        updatePackage(pi, { nameRo: e.target.value })
                      }
                      placeholder="Nume pachet (ex: Standard)"
                      className="h-8 flex-1 text-sm font-medium"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={pkg.pricePerPerson}
                        onChange={(e) =>
                          updatePackage(pi, {
                            pricePerPerson: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="600"
                        className="h-8 w-24 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">€/pers</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={pkg.minGuests ?? ""}
                        onChange={(e) =>
                          updatePackage(pi, {
                            minGuests: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="min"
                        className="h-8 w-20 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">
                        pers min
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removePackage(pi)}
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Include
                      </Label>
                      <Textarea
                        value={pkg.includes ?? ""}
                        onChange={(e) =>
                          updatePackage(pi, { includes: e.target.value })
                        }
                        rows={2}
                        className="mt-0.5 text-xs"
                        placeholder="3 aperitive, 2 preparate calde, ..."
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        NU include
                      </Label>
                      <Textarea
                        value={pkg.excludes ?? ""}
                        onChange={(e) =>
                          updatePackage(pi, { excludes: e.target.value })
                        }
                        rows={2}
                        className="mt-0.5 text-xs"
                        placeholder="Băuturi tari, tort, ..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commit controls */}
      <Card className="sticky bottom-4 border-gold/40 bg-card/95 backdrop-blur-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="h-4 w-4 accent-gold"
            />
            <span>
              Înlocuiește meniul existent{" "}
              <span className="text-muted-foreground">(șterge ce e acum)</span>
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} disabled={importing}>
              Renunță
            </Button>
            <Button
              onClick={doImport}
              disabled={importing}
              className={cn(
                "gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark",
                importing && "opacity-60",
              )}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Importă în meniu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
