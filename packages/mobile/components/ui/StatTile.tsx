// StatTile — the small metric tile used on partner + client
// dashboards. Hero number + label + delta sub-label, with an icon
// chip in a tinted square at the top-left.
//
// Mirrors the web's StatTile but native-feeling: icon scales on press,
// number transitions to gold, card lifts subtly.

import { View, Text } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { Card } from "./Card";
import { cn } from "../../lib/cn";

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
  indigo: "bg-indigo-500/15",
  success: "bg-emerald-500/15",
  info: "bg-sky-500/15",
  gold: "bg-gold/15",
  danger: "bg-rose-500/15",
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
      className="flex-1 gap-3"
      pressIntensity="subtle"
    >
      <View
        className={cn(
          "h-10 w-10 items-center justify-center rounded-xl",
          TINT_BG[tint],
        )}
      >
        <Icon size={20} color={TINT_FG[tint]} />
      </View>
      <View>
        <Text className="text-[11px] text-muted-foreground">{label}</Text>
        <Text className="mt-0.5 font-heading text-[26px] font-bold leading-tight text-foreground">
          {big}
        </Text>
        {deltaLabel && (
          <Text
            className={cn(
              "mt-1 text-[11px]",
              deltaPositive === false
                ? "text-rose-400"
                : "text-emerald-400",
            )}
          >
            {deltaLabel}
          </Text>
        )}
      </View>
    </Card>
  );
}
