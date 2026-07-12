// Avatar — circular image or initials fallback.
//
// We use expo-image instead of the RN built-in <Image/> for: (1) much
// faster startup on first render, (2) memory-stable caching, (3)
// transparent BlurHash support if we ever ship LQIP placeholders.
//
// Size + shape applied INLINE — css-interop 0.1.x drops the h-/w-/
// rounded/bg utilities (see lib/textColorPatch for context). `sizeClass`
// is kept for back-compat and parsed to a pixel diameter.

import { Image } from "expo-image";
import { View, Text } from "react-native";
import { initials as toInitials } from "@epetrecere/shared/utils";
import { colors } from "../../constants/theme";

interface Props {
  uri?: string | null;
  name: string;
  /** Diameter in px. Takes precedence over `sizeClass`. Default 48. */
  size?: number;
  /** Back-compat Tailwind size class (e.g. 'h-10 w-10'); parsed to px. */
  sizeClass?: string;
  /** Optional ring around the avatar (e.g. gold for premium artists). */
  ring?: "none" | "gold" | "verified";
}

const RING_COLOR: Record<NonNullable<Props["ring"]>, string | undefined> = {
  none: undefined,
  gold: "rgba(201,168,76,0.40)",
  verified: "rgba(14,165,233,0.40)",
};

function resolveDiameter(sizeClass?: string, size?: number): number {
  if (size) return size;
  const m = sizeClass?.match(/h-(\d+)/);
  return m ? parseInt(m[1], 10) * 4 : 48;
}

export function Avatar({
  uri,
  name,
  size,
  sizeClass = "h-12 w-12",
  ring = "none",
}: Props) {
  // "h-full w-full" means fill the (already-sized) parent wrapper.
  const fill = size == null && /(^|\s)(h-full|w-full)(\s|$)/.test(sizeClass);
  const dim = resolveDiameter(sizeClass, size);
  const ringColor = RING_COLOR[ring];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Avatar ${name}`}
      style={{
        width: fill ? "100%" : dim,
        height: fill ? "100%" : dim,
        borderRadius: fill ? 9999 : dim / 2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: colors.muted,
        ...(ringColor ? { borderWidth: 2, borderColor: ringColor } : null),
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={150}
          recyclingKey={uri}
        />
      ) : (
        <Text
          style={{
            fontSize: Math.max(11, Math.round(dim * 0.3)),
            fontWeight: "700",
            color: colors.gold,
          }}
        >
          {toInitials(name) || "??"}
        </Text>
      )}
    </View>
  );
}
