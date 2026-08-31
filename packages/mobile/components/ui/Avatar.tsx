// Avatar — circular image or initials fallback.
//
// We use expo-image instead of the RN built-in <Image/> for: (1) much
// faster startup on first render, (2) memory-stable caching, (3)
// transparent BlurHash support if we ever ship LQIP placeholders.

import { Image } from "expo-image";
import { mediaUrl } from "../../lib/links";
import { View, Text } from "react-native";
import { initials as toInitials } from "@epetrecere/shared/utils";
import { cn } from "../../lib/cn";

interface Props {
  uri?: string | null;
  name: string;
  /** Tailwind size class (e.g. 'h-10 w-10'). Default h-12 w-12. */
  sizeClass?: string;
  /** Optional ring around the avatar (e.g. gold for premium artists). */
  ring?: "none" | "gold" | "verified";
}

const RING: Record<NonNullable<Props["ring"]>, string> = {
  none: "",
  gold: "ring-2 ring-gold/40 border-2 border-gold/40",
  verified: "ring-2 ring-sky-500/40 border-2 border-sky-500/40",
};

export function Avatar({
  uri,
  name,
  sizeClass = "h-12 w-12",
  ring = "none",
}: Props) {
  // The API hands back site-relative paths, which have no meaning to a phone.
  const resolved = mediaUrl(uri);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Avatar ${name}`}
      className={cn(
        "items-center justify-center overflow-hidden rounded-full bg-muted",
        sizeClass,
        RING[ring],
      )}
    >
      {resolved ? (
        <Image
          source={{ uri: resolved }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={150}
          recyclingKey={resolved}
        />
      ) : (
        <Text className="font-heading text-[14px] font-bold text-gold">
          {toInitials(name) || "??"}
        </Text>
      )}
    </View>
  );
}
