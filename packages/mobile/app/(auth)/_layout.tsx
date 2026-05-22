// Auth route group layout.
//
// Anyone hitting /(auth) is necessarily signed-out — we redirect away
// at the root index.tsx if Clerk has a session. The stack option here
// kills the swipe-back gesture between sign-in / sign-up / forgot so
// users don't accidentally end up on the wrong screen mid-typing.

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0D0D0D" },
      }}
    />
  );
}
