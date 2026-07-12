// Skeleton — animated placeholder for loading states.
//
// Single primitive that does both block + line variants. Pulse
// animation runs on the UI thread via Reanimated so list scrolling
// stays at 60fps even with 20+ skeletons on screen.
//
// css-interop 0.1.x drops the h-/w-/rounded/bg utilities, so the
// className is parsed to an inline style here (a small Tailwind subset).
// `style` still wins over the parsed className.

import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../constants/theme";

interface Props {
  /** Tailwind classes — `h-4 w-32 rounded-full`, etc. */
  className?: string;
  style?: ViewStyle;
  /** Disable the pulse — useful inside another animated container
   *  where double animations look glitchy. */
  static?: boolean;
}

const SP = (n: number) => n * 4;

/** Minimal Tailwind→style resolver for the classes skeletons use. */
function parseSkeleton(className?: string): ViewStyle {
  const s: ViewStyle = { backgroundColor: colors.muted, borderRadius: 6 };
  if (!className) return s;
  for (const cls of className.split(/\s+/)) {
    if (cls === "rounded-full") s.borderRadius = 9999;
    else if (cls === "rounded-2xl") s.borderRadius = 20;
    else if (cls === "rounded-xl") s.borderRadius = 16;
    else if (cls === "rounded-lg") s.borderRadius = 14;
    else if (cls === "rounded-md") s.borderRadius = 6;
    else if (cls === "rounded") s.borderRadius = 8;
    else if (cls === "w-full") s.width = "100%";
    else if (cls === "h-px") s.height = 1;
    else {
      const h = cls.match(/^h-(\d+)$/);
      const w = cls.match(/^w-(\d+)$/);
      if (h) s.height = SP(+h[1]);
      else if (w) s.width = SP(+w[1]);
    }
  }
  return s;
}

export function Skeleton({ className, style, static: isStatic }: Props) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (isStatic) return;
    opacity.value = withRepeat(
      withTiming(1, {
        duration: 800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [isStatic, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: isStatic ? 0.5 : opacity.value,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[parseSkeleton(className), animatedStyle, style]}
    />
  );
}

const CARD_WRAP: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.card,
  padding: 16,
};

/** Composed skeleton matching the StatTile shape. Use directly in
 *  partner dashboard / cabinet while data loads. */
export function StatTileSkeleton() {
  return (
    <View style={{ flex: 1, gap: 12, ...CARD_WRAP }}>
      <Skeleton className="h-10 w-10 rounded-xl" />
      <View style={{ gap: 6 }}>
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-6 w-12 rounded" />
        <Skeleton className="h-3 w-24 rounded-full" />
      </View>
    </View>
  );
}

/** Skeleton matching a list row (avatar + 2 lines). Useful for
 *  bookings / conversations / cereri recente lists. */
export function ListRowSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
      }}
    >
      <Skeleton className="h-10 w-10 rounded-xl" />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton className="h-3 w-40 rounded-full" />
        <Skeleton className="h-3 w-28 rounded-full" />
      </View>
      <Skeleton className="h-5 w-16 rounded-full" />
    </View>
  );
}

/** Card skeleton with title + paragraph. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ gap: 8, ...CARD_WRAP }}>
      <Skeleton className="h-5 w-32 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3 rounded-full"
          style={{ width: `${75 + ((i * 7) % 20)}%` }}
        />
      ))}
    </View>
  );
}
