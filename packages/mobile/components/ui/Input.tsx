// Input — text field with floating label, gold focus ring, error state.
//
// Design choices:
//   - Borderless when blurred, gold border when focused — matches the
//     web's input style. Avoids a constant heavy border on the screen.
//   - Floating label that slides up + shrinks on focus / when filled.
//     This is the iOS-y / Material-y pattern users expect; placeholders
//     alone are a accessibility anti-pattern (disappear on input).
//   - Error text drops in below with a small slide. Always reserves
//     the vertical space so the form doesn't jitter when errors arrive.

import { forwardRef, useState } from "react";
import {
  TextInput,
  View,
  Text,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { colors, motion } from "../../constants/theme";
import { cn } from "../../lib/cn";

interface Props extends Omit<TextInputProps, "style" | "placeholder"> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Render an icon (e.g. mail, lock) at the right end. */
  rightSlot?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, rightSlot, value, onFocus, onBlur, containerStyle, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const hasValue = value != null && value !== "";
  const floating = focused || hasValue;

  const labelAnim = useSharedValue(floating ? 1 : 0);
  // We don't set transformOrigin here — RN computes scale from the
  // view centre by default and translate-y is enough to give a
  // floating-label effect. Setting origin to top-left requires a
  // negative left offset on the parent which complicates the layout.
  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -10 * labelAnim.value },
      { scale: 1 - 0.18 * labelAnim.value },
    ],
  }));

  return (
    <View style={containerStyle}>
      <View
        // bg/border applied inline — css-interop 0.1.x drops color utilities.
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: error
            ? colors.danger
            : focused
              ? colors.gold
              : colors.border,
        }}
        className="relative rounded-xl px-4 py-3"
      >
        <View pointerEvents="none" className="absolute left-4 top-3">
          <Animated.Text
            style={[
              labelStyle,
              {
                color: error
                  ? colors.danger
                  : focused
                    ? colors.gold
                    : colors.mutedForeground,
              },
            ]}
            className="text-[14px]"
          >
            {label}
          </Animated.Text>
        </View>

        <View className="flex-row items-end gap-2">
          <TextInput
            ref={ref}
            value={value}
            onFocus={(e) => {
              setFocused(true);
              labelAnim.value = withTiming(1, { duration: motion.fast });
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              if (!hasValue) {
                labelAnim.value = withTiming(0, { duration: motion.fast });
              }
              onBlur?.(e);
            }}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            className="flex-1 pt-3 text-[15px]"
            style={{ minHeight: 24, color: colors.foreground }}
            {...rest}
          />
          {rightSlot && <View className="self-center">{rightSlot}</View>}
        </View>
      </View>

      {/* Always reserve a 16px error slot so the form doesn't jump. */}
      <View className="mt-1 min-h-[16px]">
        {error ? (
          <Text className="text-[12px] text-[#EF4444]">{error}</Text>
        ) : hint ? (
          <Text className="text-[12px] text-muted-foreground">{hint}</Text>
        ) : null}
      </View>
    </View>
  );
});
