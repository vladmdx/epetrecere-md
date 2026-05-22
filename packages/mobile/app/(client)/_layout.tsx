// Client area stack — wraps the bottom-tabs in a Stack so detail
// screens (artist detail, venue detail, etc.) can push above the
// tab bar with the tabs still visible underneath when needed.

import { Stack } from "expo-router";

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0D0D0D" },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="artist/[slug]"
        options={{ presentation: "card", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="venue/[slug]"
        options={{ presentation: "card", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="map"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="plan/[id]" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="chat-list" />
      <Stack.Screen name="bookings/index" />
      <Stack.Screen name="bookings/[id]" />
      <Stack.Screen name="moments/[id]" />
      <Stack.Screen
        name="booking-new"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
    </Stack>
  );
}
