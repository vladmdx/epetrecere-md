// Button — primary tap element.
//
// Variants:
//   primary  gold fill, dark text — main CTA
//   outline  transparent fill, gold border + text — secondary action
//   ghost    transparent everything, gold text — tertiary action
//   danger   red fill — destructive confirm
//
// Animations:
//   - press: 95% scale + 88% opacity via Reanimated, springs back on
//     release. Faster than JS state because it runs on the UI thread.
//   - haptic: medium impact on press for the primary variant.
//
// Accessibility:
//   - hitSlop 8px to cover the visual 44pt minimum the HIG asks for
//   - `accessibilityRole="button"` + label inherited from `children`
//     when it's a string; pass `accessibilityLabel` for icon-only buttons.

import { forwardRef } from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, motion, a11y } from "../../constants/theme";
import { cn } from "../../lib/cn";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends Omit<PressableProps, "style"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  children: React.ReactNode;
}

const CONTAINER_BY_VARIANT: Record<Variant, string> = {
  primary: "bg-gold active:bg-gold-dark",
  outline:
    "bg-transparent border border-gold/40 active:bg-gold/10 active:border-gold",
  ghost: "bg-transparent active:bg-gold/5",
  danger: "bg-[#EF4444] active:bg-[#DC2626]",
};

const TEXT_BY_VARIANT: Record<Variant, string> = {
  primary: "text-[#0D0D0D]",
  outline: "text-gold",
  ghost: "text-gold",
  danger: "text-white",
};

const SIZES: Record<Size, { container: string; text: string; minHeight: number }> = {
  sm: { container: "px-3 py-2 gap-1.5 rounded-lg", text: "text-[13px] font-semibold", minHeight: 36 },
  md: { container: "px-4 py-3 gap-2 rounded-xl", text: "text-[14px] font-semibold", minHeight: 44 },
  lg: { container: "px-5 py-4 gap-2 rounded-2xl", text: "text-[16px] font-semibold", minHeight: 52 },
};

export const Button = forwardRef<React.ElementRef<typeof Pressable>, Props>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      style,
      disabled,
      onPressIn,
      onPressOut,
      onPress,
      children,
      ...rest
    },
    ref,
  ) {
    const pressed = useSharedValue(0);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 1 - pressed.value * 0.05 }],
      opacity: 1 - pressed.value * 0.12,
    }));

    const sizeCfg = SIZES[size];
    const isDisabled = disabled || loading;

    return (
      <AnimatedPressable
        ref={ref}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        hitSlop={8}
        disabled={isDisabled}
        onPressIn={(e) => {
          pressed.value = withTiming(1, { duration: motion.instant });
          if (variant === "primary") {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = withSpring(0, motion.spring);
          onPressOut?.(e);
        }}
        onPress={onPress}
        style={[
          animatedStyle,
          { minHeight: Math.max(sizeCfg.minHeight, a11y.minTapTarget) },
          style,
        ]}
        className={cn(
          "flex-row items-center justify-center",
          sizeCfg.container,
          CONTAINER_BY_VARIANT[variant],
          fullWidth && "w-full",
          isDisabled && "opacity-50",
        )}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? colors.background : colors.gold}
          />
        ) : (
          <>
            {leftIcon}
            <Text className={cn(sizeCfg.text, TEXT_BY_VARIANT[variant])}>
              {children}
            </Text>
            {rightIcon}
          </>
        )}
      </AnimatedPressable>
    );
  },
);
