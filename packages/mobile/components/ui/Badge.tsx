// Badge — small status pill (Nou / În așteptare / Confirmat). Mirrors
// the web's status-pill colours so users see the same visual language
// on both sides.
//
// Colors + layout applied INLINE — css-interop 0.1.x drops the tinted
// bg/text/border utilities (see lib/textColorPatch for context).

import { View, Text } from "react-native";
import { colors } from "../../constants/theme";

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

const TONE: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  default: { bg: colors.muted, fg: colors.mutedForeground, border: colors.border },
  indigo: { bg: "rgba(99,102,241,0.15)", fg: "#A5B4FC", border: "rgba(99,102,241,0.30)" },
  gold: { bg: "rgba(201,168,76,0.15)", fg: colors.gold, border: "rgba(201,168,76,0.30)" },
  success: { bg: "rgba(16,185,129,0.15)", fg: "#34D399", border: "rgba(16,185,129,0.30)" },
  warning: { bg: "rgba(245,158,11,0.15)", fg: "#FCD34D", border: "rgba(245,158,11,0.30)" },
  danger: { bg: "rgba(244,63,94,0.15)", fg: "#FCA5A5", border: "rgba(244,63,94,0.30)" },
  info: { bg: "rgba(14,165,233,0.15)", fg: "#7DD3FC", border: "rgba(14,165,233,0.30)" },
};

const SIZE = {
  sm: { paddingHorizontal: 8, paddingVertical: 2, fontSize: 11 },
  md: { paddingHorizontal: 12, paddingVertical: 4, fontSize: 12 },
};

export function Badge({ tone = "default", size = "sm", children }: Props) {
  const t = TONE[tone];
  const s = SIZE[size];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: t.bg,
        borderColor: t.border,
        borderWidth: 1,
        borderRadius: 9999,
        paddingHorizontal: s.paddingHorizontal,
        paddingVertical: s.paddingVertical,
      }}
    >
      <Text style={{ color: t.fg, fontSize: s.fontSize, fontWeight: "600" }}>
        {children}
      </Text>
    </View>
  );
}
