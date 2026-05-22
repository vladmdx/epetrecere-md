// ProgressBar — gold-gradient progress with smooth fill animation.
//
// Used on the profile-completion bar and the partner-dashboard hero.
// Animation uses Reanimated so it doesn't drop frames during long
// transitions like 0% → 100% on first load.

import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
// LinearGradient from expo-linear-gradient has a strict typing issue
// with React 19 (LegacyRef on its class instance). We cast it to a
// permissive function component type to bypass the JSX-component
// check. Identical runtime, identical props.
import { LinearGradient as RawLinearGradient } from "expo-linear-gradient";
type LinearGradientProps = {
  colors: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: object;
  children?: React.ReactNode;
};
const LinearGradient = RawLinearGradient as unknown as (
  props: LinearGradientProps,
) => React.ReactElement;
import { colors } from "../../constants/theme";

interface Props {
  /** 0–100. Clamped. */
  value: number;
  /** Track height in px. Default 6. */
  height?: number;
  /** Animation duration ms. Default 600. */
  duration?: number;
  className?: string;
}

export function ProgressBar({
  value,
  height = 6,
  duration = 600,
  className,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const width = useSharedValue(clamped);

  useEffect(() => {
    width.value = withTiming(clamped, { duration });
  }, [clamped, duration, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clamped),
        text: `${Math.round(clamped)}%`,
      }}
      className={className}
      style={{
        height,
        backgroundColor: colors.muted,
        borderRadius: height / 2,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[fillStyle, { height: "100%", borderRadius: height / 2 }]}
      >
        <LinearGradient
          colors={[colors.goldDark, colors.gold]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, borderRadius: height / 2 }}
        />
      </Animated.View>
    </View>
  );
}
