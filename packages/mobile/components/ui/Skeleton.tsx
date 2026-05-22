// Skeleton — animated placeholder for loading states.
//
// Single primitive that does both block + line variants. Pulse
// animation runs on the UI thread via Reanimated so list scrolling
// stays at 60fps even with 20+ skeletons on screen.
//
// Composition pattern: build screen-level skeletons by composing
// these (e.g., <View><Skeleton h-6 w-32/><Skeleton h-4 w-48/></View>)
// — keeps the design language consistent without forcing a heavy
// per-screen abstraction.

import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { cn } from "../../lib/cn";

interface Props {
  /** Tailwind classes — `h-4 w-32 rounded-full`, etc. */
  className?: string;
  style?: ViewStyle;
  /** Disable the pulse — useful inside another animated container
   *  where double animations look glitchy. */
  static?: boolean;
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
      style={[animatedStyle, style]}
      className={cn("bg-muted rounded-md", className)}
    />
  );
}

/** Composed skeleton matching the StatTile shape. Use directly in
 *  partner dashboard / cabinet while data loads. */
export function StatTileSkeleton() {
  return (
    <View className="flex-1 gap-3 rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <View className="gap-1.5">
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
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <View className="flex-1 gap-1.5">
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
    <View className="gap-2 rounded-2xl border border-border bg-card p-4">
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
