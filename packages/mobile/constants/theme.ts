// Design tokens — single source of truth for the mobile look.
//
// We mirror the web's CSS variables in TS constants so JS-driven
// animations (Reanimated, gestures) can read the same values as
// NativeWind classes. When the web palette changes, edit BOTH here
// AND in tailwind.config.js (NativeWind reads its own config —
// keeping these two in sync is part of the design-system contract).

export const colors = {
  // Brand
  gold: "#C9A84C",
  goldLight: "#E5C770",
  goldDark: "#9F8A3B",

  // Surfaces (dark theme is the default — web's `--background`,
  // `--card`, `--muted`, etc., translated to flat hex so RN can use them)
  background: "#0D0D0D",
  foreground: "#F7F5EE",
  card: "#161616",
  muted: "#222222",
  mutedForeground: "#8E8B82",
  border: "#2A2A2A",

  // Status colors
  success: "#22C55E",
  successBg: "rgba(34, 197, 94, 0.15)",
  warning: "#F59E0B",
  warningBg: "rgba(245, 158, 11, 0.15)",
  info: "#38BDF8",
  infoBg: "rgba(56, 189, 248, 0.15)",
  danger: "#EF4444",
  dangerBg: "rgba(239, 68, 68, 0.15)",
  indigo: "#A5B4FC",
  indigoBg: "rgba(99, 102, 241, 0.15)",

  // Pure utility
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
} as const;

export type ColorToken = keyof typeof colors;

/** Typography scale — matches the web's font sizes so headings feel
 *  proportionally identical. Each entry pairs a size with the
 *  recommended line-height (1.1 for tight display, 1.4 for body). */
export const typography = {
  // Display — for hero sections, modal titles
  display: { fontSize: 32, lineHeight: 36, fontWeight: "700" as const, fontFamily: "Cormorant" },
  // Heading
  h1: { fontSize: 28, lineHeight: 32, fontWeight: "700" as const, fontFamily: "Cormorant" },
  h2: { fontSize: 24, lineHeight: 28, fontWeight: "700" as const, fontFamily: "Cormorant" },
  h3: { fontSize: 18, lineHeight: 22, fontWeight: "700" as const, fontFamily: "Cormorant" },
  // Body
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const, fontFamily: "Inter" },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const, fontFamily: "Inter" },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, fontFamily: "Inter" },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "500" as const, fontFamily: "Inter" },
  // Labels
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, fontFamily: "Inter" },
  labelUpper: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700" as const,
    fontFamily: "Inter",
    letterSpacing: 2,
    textTransform: "uppercase" as const,
  },
} as const;

/** Spacing scale (multiples of 4). Use these directly or via
 *  NativeWind: `gap-3` = `gap: spacing[3]` = 12. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

/** Corner radii — keep these few to maintain visual consistency. */
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 16,
  "2xl": 20,
  full: 9999,
} as const;

/** Motion tokens — durations and easings for Reanimated. Always use
 *  these so the app feels coherent (instead of every screen picking
 *  its own duration). */
export const motion = {
  // Durations (ms)
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,

  // Easings — Reanimated supports CSS-style cubic-bezier curves.
  // The "standard" curve here is iOS's emphasized decelerate, which
  // is the most "premium-feeling" default across platforms.
  ease: { type: "timing" as const, duration: 300 },
  easeOut: [0.16, 1, 0.3, 1] as const, // emphasized decelerate
  easeIn: [0.7, 0, 0.84, 0] as const, // emphasized accelerate
  spring: { damping: 18, stiffness: 240, mass: 1 } as const,
  springGentle: { damping: 22, stiffness: 180, mass: 1 } as const,
} as const;

/** Shadow tokens. iOS uses the native shadow*  props, Android needs
 *  elevation. We expose both so screens can apply them consistently. */
export const shadows = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 12,
  },
  goldGlow: {
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

/** Tap target minimum — iOS HIG says 44pt, Material says 48dp.
 *  We use 44 to keep the visual lighter; Android's larger ripple
 *  area still hits the larger touch zone. */
export const a11y = {
  minTapTarget: 44,
} as const;
