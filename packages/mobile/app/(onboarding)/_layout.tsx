// Onboarding stack — accessed once after sign-up. We disable the
// back-swipe so users can't ricochet through the steps; the explicit
// "Înapoi" button still works for intentional navigation.

import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0D0D0D" },
      }}
    />
  );
}
