/** @type {import('tailwindcss').Config} */
// NativeWind v4 — Tailwind v3 syntax (NativeWind doesn't support v4 yet
// on mobile). We mirror the web palette so the design system stays in
// sync visually.

const path = require("path");

module.exports = {
  // Absolute globs so the content scan works no matter what cwd NativeWind's
  // Tailwind invocation runs in — in the monorepo it runs from the workspace
  // root, where relative "./app" would resolve to the (empty) repo root and
  // no utilities would be generated (→ every className silently no-ops).
  content: [
    path.join(__dirname, "app/**/*.{ts,tsx}"),
    path.join(__dirname, "components/**/*.{ts,tsx}"),
  ],
  presets: [require("nativewind/preset")],
  // The app drives the color scheme manually via `colorScheme.set()` (see
  // lib/theme.tsx). NativeWind needs darkMode:"class" for that to work; with
  // the default "media" the manual scheme and the color resolution disagree.
  darkMode: "class",
  // css-interop 0.1.x doesn't resolve the `var(--tw-*-opacity)` fallback that
  // Tailwind bakes into color utilities, so `text-foreground` etc. computed to
  // no/near-zero opacity (dark, invisible text). Disabling the opacity core
  // plugins makes colors emit a plain `color: #F7F5EE` with no runtime var.
  corePlugins: {
    textOpacity: false,
    backgroundOpacity: false,
    borderOpacity: false,
    ringOpacity: false,
    placeholderOpacity: false,
    divideOpacity: false,
  },
  theme: {
    extend: {
      colors: {
        // Brand
        gold: {
          DEFAULT: "#C9A84C",
          light: "#E5C770",
          dark: "#9F8A3B",
        },
        // Surfaces (matches web's CSS variables)
        background: "#0D0D0D",
        foreground: "#F7F5EE",
        card: "#161616",
        muted: "#222222",
        "muted-foreground": "#8E8B82",
        border: "#2A2A2A",
        // Status
        success: "#22C55E",
        warning: "#F59E0B",
        info: "#38BDF8",
        danger: "#EF4444",
      },
      fontFamily: {
        // Wired up via expo-font in app/_layout.tsx — Cormorant for
        // headings, Inter for body, matches the web stack.
        heading: ["Cormorant"],
        body: ["Inter"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};
