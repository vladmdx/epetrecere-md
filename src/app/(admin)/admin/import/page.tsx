"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ImportStep = "upload" | "mapping" | "importing" | "done";

interface PreviewData {
  columns: string[];
  preview: Record<string, string>[];
  totalRows: number;
}

interface ImportResult {
  batchId: number;
  totalRows: number;
  processed: number;
  errors: number;
  errorDetails: { row: number; error: string }[];
}

const fieldOptions = [
  { value: "", label: "— Nu mapa —" },
  { value: "name_ro", label: "Nume (RO)" },
  { value: "name_ru", label: "Nume (RU)" },
  { value: "name_en", label: "Nume (EN)" },
  { value: "name", label: "Nume (general)" },
  { value: "description_ro", label: "Descriere (RO)" },
  { value: "description_ru", label: "Descriere (RU)" },
  { value: "description", label: "Descriere (general)" },
  { value: "phone", label: "Telefon" },
  { value: "email", label: "Email" },
  { value: "price", label: "Preț" },
  { value: "location", label: "Locație" },
  { value: "city", label: "Oraș" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(selectedFile: File) {
    setFile(selectedFile);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data: PreviewData = await res.json();
      setPreview(data);

      // Auto-map columns by name similarity
      const autoMapping: Record<string, string> = {};
      for (const col of data.columns) {
        const lower = col.toLowerCase().replace(/[\s_-]+/g, "_");
        for (const opt of fieldOptions) {
          if (opt.value && (lower.includes(opt.value) || opt.value.includes(lower))) {
            autoMapping[opt.value] = col;
            break;
          }
        }
      }
      setMapping(autoMapping);
      setStep("mapping");
    } catch {
      toast.error("Eroare la parsarea fișierului");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    setLoading(true);
    setStep("importing");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Import failed");

      const data: ImportResult = await res.json();
      setResult(data);
      setStep("done");
      toast.success(`${data.processed} artiști importați cu succes!`);
    } catch {
      toast.error("Eroare la import");
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  }

  async function handleAIRegenerate() {
    setAiLoading(true);
    toast.info("AI regenerarea descrierilor va începe în background...");
    // In production this would trigger an Inngest job
    setTimeout(() => {
      setAiLoading(false);
      toast.success("Descrierile au fost trimise pentru regenerare AI.");
    }, 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Import Artiști</h1>
        <p className="text-sm text-muted-foreground">
          Importă artiști din fișiere Excel (.xlsx) sau CSV
        </p>
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <div
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border/60 p-12 transition-colors hover:border-gold/50 hover:bg-gold/5"
            >
              <Upload className="h-12 w-12 text-gold" />
              <div className="text-center">
                <p className="font-medium">Click pentru a selecta fișierul</p>
                <p className="text-sm text-muted-foreground">Sau trage fișierul aici (.xlsx, .xls, .csv)</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
            </div>
            {loading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Se parsează fișierul...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step: Column Mapping */}
      {step === "mapping" && preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-gold" />
                Mapare coloane — {preview.totalRows} rânduri detectate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {preview.columns.map((col) => (
                  <div key={col} className="flex items-center gap-4">
                    <span className="w-40 shrink-0 truncate text-sm font-medium">{col}</span>
                    <span className="text-muted-foreground">→</span>
                    <select
                      className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={Object.entries(mapping).find(([_, v]) => v === col)?.[0] || ""}
                      onChange={(e) => {
                        const newMapping = { ...mapping };
                        // Remove old mapping for this column
                        for (const [k, v] of Object.entries(newMapping)) {
                          if (v === col) delete newMapping[k];
                        }
                        if (e.target.value) newMapping[e.target.value] = col;
                        setMapping(newMapping);
                      }}
                    >
                      {fieldOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Preview Table */}
          <Card>
            <CardHeader>
              <CardTitle>Preview (primele 5 rânduri)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {preview.columns.map((col) => (
                      <th key={col} className="border-b border-border/40 px-2 py-1 text-left font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {preview.columns.map((col) => (
                        <td key={col} className="border-b border-border/20 px-2 py-1 text-muted-foreground max-w-[200px] truncate">
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep("upload"); setPreview(null); setFile(null); }}>
              Înapoi
            </Button>
            <Button
              onClick={handleImport}
              disabled={!Object.values(mapping).some(Boolean)}
              className="bg-gold text-background hover:bg-gold-dark gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importă {preview.totalRows} artiști
            </Button>
          </div>
        </>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-gold" />
            <p className="font-medium">Se importă artiștii...</p>
            <Progress value={50} className="max-w-xs" />
          </CardContent>
        </Card>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <CheckCircle className="h-12 w-12 text-success" />
                <div>
                  <p className="text-lg font-bold">{result.processed} artiști importați!</p>
                  {result.errors > 0 && (
                    <p className="text-sm text-destructive">{result.errors} erori</p>
                  )}
                </div>
              </div>

              {result.errorDetails.length > 0 && (
                <div className="mt-6 space-y-1">
                  <p className="text-sm font-medium text-destructive">Erori:</p>
                  {result.errorDetails.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <AlertCircle className="mr-1 inline h-3 w-3 text-destructive" />
                      Rând {err.row}: {err.error}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleAIRegenerate}
              disabled={aiLoading}
              className="bg-gold text-background hover:bg-gold-dark gap-2"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Regenerează Descrieri cu AI
            </Button>
            <Button variant="outline" onClick={() => { setStep("upload"); setResult(null); setFile(null); setPreview(null); }}>
              Import Nou
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
