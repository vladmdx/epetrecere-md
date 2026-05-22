// Badge — small status pill (Nou / În așteptare / Confirmat). Mirrors
// the web's status-pill colours so users see the same visual language
// on both sides.

import { View, Text } from "react-native";
import { cn } from "../../lib/cn";

export type BadgeTone =
  | "default"
  | "indigo"
  | "gold"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface Props {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** Small (default) or large (used in card headers). */
  size?: "sm" | "md";
}

const TONE: Record<BadgeTone, string> = {
  default: "bg-muted text-muted-foreground border-border",
  indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  gold: "bg-gold/15 text-gold border-gold/30",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  danger: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

const SIZE = {
  sm: { container: "px-2 py-0.5 rounded-full", text: "text-[11px] font-semibold" },
  md: { container: "px-3 py-1 rounded-full", text: "text-[12px] font-semibold" },
};

export function Badge({ tone = "default", size = "sm", children }: Props) {
  const t = TONE[tone];
  const s = SIZE[size];
  // Tone classes are split into bg, text, and border — find each:
  return (
    <View className={cn("border self-start", s.container, t)}>
      <Text className={cn(s.text, t)}>{children}</Text>
    </View>
  );
}
