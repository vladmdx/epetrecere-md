// Card — the dominant container on every screen. Subtle gold-tinted
// border, rounded corners, optional press feedback.
//
// If `onPress` is provided, the card animates on press (95% scale)
// and mounts as a Pressable. Otherwise it's a plain View so screen
// readers don't announce it as tappable.

import { forwardRef } from "react";
import {
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, motion } from "../../constants/theme";
import { cn } from "../../lib/cn";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// css-interop 0.1.x drops bg/border color utilities — apply the card surface
// inline so cards are actually visible (see lib/textColorPatch for context).
const CARD_SURFACE: ViewStyle = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.border,
};

interface PressProps
  extends Omit<PressableProps, "style"> {
  onPress: () => void;
  className?: string;
  style?: ViewStyle;
  /** Subtle vs strong tilt on press. Default subtle. */
  pressIntensity?: "subtle" | "strong";
}

interface StaticProps extends Omit<ViewProps, "style"> {
  onPress?: undefined;
  className?: string;
  style?: ViewStyle;
}

type Props = PressProps | StaticProps;

export const Card = forwardRef<
  React.ElementRef<typeof View>,
  Props
>(function Card(props, ref) {
  const baseClasses = cn(
    "rounded-2xl border border-border bg-card p-4",
    props.className,
  );

  if (!props.onPress) {
    const { onPress: _omit, ...viewProps } = props;
    return (
      <View
        ref={ref}
        className={baseClasses}
        style={[CARD_SURFACE, props.style]}
        {...viewProps}
      />
    );
  }

  return <PressableCard {...(props as PressProps)} ref={ref} />;
});

const PressableCard = forwardRef<
  React.ElementRef<typeof Pressable>,
  PressProps
>(function PressableCard(
  { onPress, onPressIn, onPressOut, pressIntensity = "subtle", className, style, ...rest },
  ref,
) {
  const pressed = useSharedValue(0);
  const intensity = pressIntensity === "strong" ? 0.04 : 0.02;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * intensity }],
  }));

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole="button"
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: motion.instant });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, motion.spring);
        onPressOut?.(e);
      }}
      onPress={onPress}
      style={[CARD_SURFACE, animatedStyle, style]}
      className={cn(
        "rounded-2xl border border-border bg-card p-4 active:border-gold/30",
        className,
      )}
      {...rest}
    />
  );
});
