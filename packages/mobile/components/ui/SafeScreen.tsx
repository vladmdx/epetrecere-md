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
  const padding = padded ? "px-5" : "";

  const Body = scroll ? (
    <ScrollView
      className={cn("flex-1", padding, className)}
      contentContainerStyle={{ paddingBottom: 32, gap: 24 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn("flex-1", padding, className)}>{children}</View>
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
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      {Wrapped}
    </SafeAreaView>
  );
}
