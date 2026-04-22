"use client";

import { Type, Text, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  usePreferences,
  GOOGLE_FONTS,
  TEXT_SIZES,
} from "@/hooks/use-preferences";

export function AppearanceSettings() {
  const { font, textSize, setFont, setTextSize, reset } = usePreferences();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Type className="h-5 w-5 text-gold" />
          Aspect
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="gap-1.5 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Resetează
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Font Picker */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Type className="h-3.5 w-3.5" /> Font
          </Label>
          <p className="text-xs text-muted-foreground">
            Alege fontul folosit pe întreg site-ul (Google Fonts)
          </p>
          <select
            value={font}
            onChange={(e) => setFont(e.target.value as typeof font)}
            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
          >
            <option value="default">Implicit (DM Sans)</option>
            {GOOGLE_FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                {f}
              </option>
            ))}
          </select>
          <div
            className="mt-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-sm"
            style={{
              fontFamily:
                font === "default" ? undefined : `"${font}", sans-serif`,
            }}
          >
            <p className="font-bold">Exemplu de text cu fontul ales</p>
            <p className="text-muted-foreground">
              Servicii pentru evenimente din Republica Moldova.
            </p>
          </div>
        </div>

        {/* Text Size Scale */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Text className="h-3.5 w-3.5" /> Mărime text
          </Label>
          <p className="text-xs text-muted-foreground">
            Ajustează mărimea textului de la -20% la +30%
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setTextSize(size)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  textSize === size
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border/40 text-muted-foreground hover:border-gold/30 hover:text-foreground"
                }`}
              >
                {size > 0 ? `+${size}%` : `${size}%`}
              </button>
            ))}
          </div>
          <div
            className="mt-2 rounded-lg border border-border/40 bg-muted/30 p-3"
            style={{ fontSize: `${1 + textSize / 100}rem` }}
          >
            <p>
              Acesta este un exemplu de text. Preferința se aplică pe întreg
              site-ul și este salvată local.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
