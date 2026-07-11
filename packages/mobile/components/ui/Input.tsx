// Input — text field with a static top label, gold focus ring, error state.
//
// Layout + colors are applied INLINE (not via className): css-interop 0.1.x
// (pinned by NativeWind 4.1.x) drops color AND layout utilities on RN Views,
// so a className-driven input renders with no padding / rounding / label. See
// lib/textColorPatch for the parallel text-color workaround.

import { forwardRef, useState } from "react";
import {
  TextInput,
  View,
  Text,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, radii } from "../../constants/theme";

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

  const borderColor = error
    ? colors.danger
    : focused
      ? colors.gold
      : colors.border;
  const labelColor = error
    ? colors.danger
    : focused
      ? colors.gold
      : colors.mutedForeground;

  return (
    <View style={containerStyle}>
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor,
          borderRadius: radii.xl,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: labelColor,
            marginBottom: 3,
          }}
        >
          {label}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            ref={ref}
            value={value}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            style={{
              flex: 1,
              fontSize: 15,
              color: colors.foreground,
              minHeight: 22,
              padding: 0,
            }}
            {...rest}
          />
          {rightSlot ? <View>{rightSlot}</View> : null}
        </View>
      </View>

      {/* Always reserve an error slot so the form doesn't jump. */}
      <View style={{ marginTop: 4, minHeight: 16 }}>
        {error ? (
          <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>
        ) : hint ? (
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{hint}</Text>
        ) : null}
      </View>
    </View>
  );
});
