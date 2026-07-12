// SafeScreen — every screen wraps its content in this so we get
// consistent safe-area handling + scrollable body + dark background.
//
// Behaviour:
//   - Uses react-native-safe-area-context (not the deprecated RN one)
//     so it works on notched iPhones, Dynamic Island, and Android
//     foldables.
//   - Status bar height handled automatically.
//   - `scroll` defaults to true — most screens are vertical-flow.
//     Set false for full-screen layouts (camera, splash, etc.).

import { ReactNode } from "react";
import { ScrollView, View, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { cn } from "../../lib/cn";
import { colors } from "../../constants/theme";

interface Props {
  children: ReactNode;
  scroll?: boolean;
  /** Pad horizontal screen padding. Default `px-5`. Disable when the
   *  screen wants edge-to-edge content (carousels, etc.). */
  padded?: boolean;
  /** Safe area edges. Default all. */
  edges?: Edge[];
  /** Avoid keyboard (for forms). Default true. */
  keyboardAvoiding?: boolean;
  className?: string;
}

export function SafeScreen({
  children,
  scroll = true,
  padded = true,
  edges = ["top", "left", "right", "bottom"],
  keyboardAvoiding = true,
  className,
}: Props) {
  // px-5 is dropped by css-interop 0.1.x, so horizontal padding is applied
  // inline (on the ScrollView content container / the View).
  const padStyle = padded ? { paddingHorizontal: 20 } : null;

  const Body = scroll ? (
    <ScrollView
      className={cn("flex-1", className)}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32, gap: 24, ...(padStyle ?? {}) }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padStyle]} className={cn("flex-1", className)}>
      {children}
    </View>
  );

  const Wrapped = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {Body}
    </KeyboardAvoidingView>
  ) : (
    Body
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      className="bg-background"
      edges={edges}
    >
      {Wrapped}
    </SafeAreaView>
  );
}
