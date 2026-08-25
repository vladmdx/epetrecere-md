"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLocale();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={
        theme === "dark"
          ? t("themeToggle.toLight")
          : t("themeToggle.toDark")
      }
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-gold" />
      ) : (
        <Moon className="h-5 w-5 text-gold" />
      )}
    </Button>
  );
}
