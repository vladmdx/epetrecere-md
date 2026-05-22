// Theme provider + hook.
//
// Strategy:
//   - Two complete color palettes (dark, light) — we don't lerp.
//     Designers want pixel-perfect control on each mode.
//   - System default ("auto") follows useColorScheme so we respect
//     OS-level light/dark setting.
//   - User override stored in SecureStore so the choice survives
//     between cold starts and isn't lost in a Clerk sign-out (which
//     would clear AsyncStorage's session bucket).
//   - The setColorScheme call on NativeWind syncs the entire
//     Tailwind cascade (bg-background → light vs dark hex) without
//     us threading the theme through every component.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme } from "nativewind";
import * as SecureStore from "expo-secure-store";

export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedScheme = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  scheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "epetrecere.theme.v1";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [hydrated, setHydrated] = useState(false);

  // Load persisted override on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (
          !cancelled &&
          (stored === "light" || stored === "dark" || stored === "auto")
        ) {
          setModeState(stored);
        }
      } catch {
        // Fail open — stick with dark default
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the effective scheme: auto follows OS; manual is fixed.
  const scheme: ResolvedScheme = useMemo(() => {
    if (mode === "auto") return systemScheme === "light" ? "light" : "dark";
    return mode;
  }, [mode, systemScheme]);

  // Push the resolved scheme into NativeWind so `dark:` classes work.
  // We default mobile to dark — keep that as initial value while we
  // hydrate the override.
  useEffect(() => {
    nativewindColorScheme.set(scheme);
  }, [scheme]);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, next);
    } catch {
      // No-op
    }
  }, []);

  const value = useMemo(
    () => ({ mode, scheme, setMode }),
    [mode, scheme, setMode],
  );

  // Render children eagerly. The single-frame mismatch between
  // initial dark and the eventual resolved scheme is acceptable —
  // most users will be on dark which is also the default.
  void hydrated;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
