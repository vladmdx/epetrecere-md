// Partner area stack — wraps the tabs so detail/action screens can
// push above them. We keep tabs visible at the root of every detail
// flow so partners can flip back to their inbox without losing context.

import { Stack } from "expo-router";

export default function PartnerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0D0D0D" },
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/* The file is booking/[id]/index.tsx, so the route is
          "booking/[id]/index". Naming it "booking/[id]" matched nothing and
          expo-router warned on every render while these options went
          unapplied. */}
      <Stack.Screen name="booking/[id]/index" />
      <Stack.Screen
        name="booking/[id]/accept"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="booking/[id]/reject"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="booking/[id]/propose-price"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="inregistrare" />
      <Stack.Screen name="documente" />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen
        name="tarife/[id]"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="financiar" />
      <Stack.Screen name="recenzii" />
      <Stack.Screen name="ai-assistant" />
    </Stack>
  );
}
