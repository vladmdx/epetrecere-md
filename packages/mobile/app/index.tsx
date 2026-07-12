// Root route — splits between signed-in and signed-out flows.
//
// Behaviour:
//   - Clerk loading → SplashGate (returns nothing while parent splash
//     is up).
//   - Signed-out   → redirect to /(auth)/sign-in
//   - Signed-in    → redirect to either the partner tab bar (if the
//                    user has an artist row) or the client tab bar
//                    (everyone else). Both targets are the (tabs) group
//                    root, which resolves to each area's index tab.
//
// Role resolution calls /api/v1/me which the web side already exposes.
// We cache the result in SecureStore so subsequent cold-starts skip the
// network round-trip and land on the right tab instantly.

import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

type Role = "client" | "partner";
const ROLE_CACHE_KEY = "epetrecere.role.v1";

export default function Index() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setResolving(false);
      return;
    }
    (async () => {
      // 1. Hot path — last known role from SecureStore.
      const cached = await SecureStore.getItemAsync(ROLE_CACHE_KEY);
      if (cached === "client" || cached === "partner") {
        setRole(cached);
      }
      // 2. Cold path — confirm with the API (and update cache).
      try {
        const token = await getToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
        const r = await fetch(`${apiUrl}/me/artist`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = r.ok ? await r.json() : null;
        const resolved: Role = data?.artist ? "partner" : "client";
        setRole(resolved);
        await SecureStore.setItemAsync(ROLE_CACHE_KEY, resolved);
      } catch {
        // Network failed — fall back to client view.
        if (!cached) setRole("client");
      } finally {
        setResolving(false);
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || resolving) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0D0D0D",
        }}
        className="flex-1 items-center justify-center bg-background"
      >
        <ActivityIndicator color="#C9A84C" />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (role === "partner") return <Redirect href="/(partner)/(tabs)" />;
  return <Redirect href="/(client)/(tabs)" />;
}
