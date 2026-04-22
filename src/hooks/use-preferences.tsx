"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

// 50 popular Google Fonts, curated list.
export const GOOGLE_FONTS = [
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Inter",
  "Oswald",
  "Raleway",
  "Nunito",
  "Ubuntu",
  "Playfair Display",
  "Merriweather",
  "Roboto Condensed",
  "Roboto Slab",
  "PT Sans",
  "PT Serif",
  "Noto Sans",
  "Noto Serif",
  "Source Sans 3",
  "Source Serif 4",
  "Quicksand",
  "Mukta",
  "Work Sans",
  "Rubik",
  "Fira Sans",
  "Dosis",
  "Josefin Sans",
  "Cabin",
  "Exo 2",
  "Karla",
  "Bitter",
  "Libre Baskerville",
  "Libre Franklin",
  "DM Sans",
  "DM Serif Display",
  "Manrope",
  "Comfortaa",
  "Archivo",
  "Arimo",
  "Barlow",
  "Chivo",
  "Hind",
  "Bebas Neue",
  "Anton",
  "Abril Fatface",
  "Dancing Script",
  "Pacifico",
  "Caveat",
  "Shadows Into Light",
  "Permanent Marker",
] as const;

export type GoogleFont = (typeof GOOGLE_FONTS)[number];

// Text size scale: -20% to +30% in 5% steps
export const TEXT_SIZES = [
  -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30,
] as const;

export type TextSizeScale = (typeof TEXT_SIZES)[number];

export const DEFAULT_FONT: GoogleFont | "default" = "default";
export const DEFAULT_TEXT_SIZE: TextSizeScale = 0;

interface Preferences {
  font: GoogleFont | "default";
  textSize: TextSizeScale;
}

interface PreferencesContextValue extends Preferences {
  setFont: (font: GoogleFont | "default") => void;
  setTextSize: (size: TextSizeScale) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const STORAGE_KEY = "epetrecere-preferences";

function googleFontUrl(font: GoogleFont): string {
  const fontParam = font.replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${fontParam}:wght@400;500;600;700&display=swap`;
}

function loadGoogleFont(font: GoogleFont) {
  if (typeof document === "undefined") return;
  const id = `google-font-${font.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontUrl(font);
  document.head.appendChild(link);
}

function applyPreferences(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (prefs.font === "default") {
    root.style.removeProperty("--user-font");
  } else {
    loadGoogleFont(prefs.font);
    root.style.setProperty("--user-font", `"${prefs.font}"`);
  }

  const scale = 1 + prefs.textSize / 100;
  root.style.setProperty("--user-text-scale", String(scale));
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [font, setFontState] = useState<GoogleFont | "default">(DEFAULT_FONT);
  const [textSize, setTextSizeState] = useState<TextSizeScale>(DEFAULT_TEXT_SIZE);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Preferences>;
        if (parsed.font) setFontState(parsed.font);
        if (typeof parsed.textSize === "number") {
          setTextSizeState(parsed.textSize as TextSizeScale);
        }
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  // Apply preferences whenever they change
  useEffect(() => {
    if (!loaded) return;
    applyPreferences({ font, textSize });
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ font, textSize }),
      );
    } catch {
      // ignore quota / private mode
    }
  }, [font, textSize, loaded]);

  const setFont = (newFont: GoogleFont | "default") => setFontState(newFont);
  const setTextSize = (size: TextSizeScale) => setTextSizeState(size);
  const reset = () => {
    setFontState(DEFAULT_FONT);
    setTextSizeState(DEFAULT_TEXT_SIZE);
  };

  return (
    <PreferencesContext.Provider
      value={{ font, textSize, setFont, setTextSize, reset }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return ctx;
}
