/** @type {import('tailwindcss').Config} */
// NativeWind v4 — Tailwind v3 syntax (NativeWind doesn't support v4 yet
// on mobile). We mirror the web palette so the design system stays in
// sync visually.

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
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
