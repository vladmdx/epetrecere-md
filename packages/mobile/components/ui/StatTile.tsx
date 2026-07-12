// StatTile — the small metric tile used on partner + client
// dashboards. Hero number + label + delta sub-label, with an icon
// chip in a tinted square at the top-left.
//
// Layout + tint colors applied INLINE — css-interop 0.1.x drops the
// layout/color utilities (see lib/textColorPatch for context).

import { View, Text } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { Card } from "./Card";
import { colors } from "../../constants/theme";

export type StatTint = "indigo" | "success" | "info" | "gold" | "danger";

interface Props {
  Icon: LucideIcon;
  tint: StatTint;
  big: string | number;
  label: string;
  deltaLabel?: string;
  deltaPositive?: boolean;
  onPress?: () => void;
}

const TINT_BG: Record<StatTint, string> = {
  indigo: "rgba(99,102,241,0.15)",
  success: "rgba(16,185,129,0.15)",
  info: "rgba(14,165,233,0.15)",
  gold: "rgba(201,168,76,0.15)",
  danger: "rgba(244,63,94,0.15)",
};

const TINT_FG: Record<StatTint, string> = {
  indigo: "#A5B4FC",
  success: "#34D399",
  info: "#7DD3FC",
  gold: "#C9A84C",
  danger: "#FCA5A5",
};

export function StatTile({
  Icon,
  tint,
  big,
  label,
  deltaLabel,
  deltaPositive,
  onPress,
}: Props) {
  return (
    <Card
      onPress={onPress as () => void}
      style={{ flex: 1, gap: 12 }}
      pressIntensity="subtle"
    >
      <View
        style={{
          height: 40,
          width: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          backgroundColor: TINT_BG[tint],
        }}
      >
        <Icon size={20} color={TINT_FG[tint]} />
      </View>
      <View>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{label}</Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: 26,
            fontWeight: "700",
            color: colors.foreground,
          }}
        >
          {big}
        </Text>
        {deltaLabel && (
          <Text
            style={{
              marginTop: 4,
              fontSize: 11,
              color: deltaPositive === false ? "#FB7185" : "#34D399",
            }}
          >
            {deltaLabel}
          </Text>
        )}
      </View>
    </Card>
  );
}
