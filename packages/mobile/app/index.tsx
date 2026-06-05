// Root route — splits between signed-in and signed-out flows.
//
// Behaviour:
//   - Clerk loading → spinner (parent splash is still up).
//   - Signed-out   → redirect to /(auth)/sign-in
//   - Signed-in    → redirect to either /(partner)/(tabs) (artist role)
//                    or /(client)/(tabs) (everyone else).
//
// Role resolution: the role the user picked in onboarding is cached in
// SecureStore ("partner"/"client") and is AUTHORITATIVE. The server
// artist-row check can only UPGRADE a client to partner — it must never
// downgrade a picked "partner" back to "client" (that bug landed every
// fresh artist on the client tabs).

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
      // 1. Hot path — last known role from SecureStore (the choice the
      //    user made in onboarding).
      const cached = await SecureStore.getItemAsync(ROLE_CACHE_KEY);
      if (cached === "client" || cached === "partner") {
        setRole(cached);
      }
      // 2. Cold path — confirm with the API. The picked "partner" role
      //    wins; the artist-row check only upgrades client → partner.
      try {
        const token = await getToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
        const r = await fetch(`${apiUrl}/me/artist`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = r.ok ? await r.json() : null;
        const resolved: Role =
          cached === "partner" || data?.artist ? "partner" : "client";
        setRole(resolved);
        await SecureStore.setItemAsync(ROLE_CACHE_KEY, resolved);
      } catch {
        // Network failed — keep the cached role, or default to client.
        if (!cached) setRole("client");
      } finally {
        setResolving(false);
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || resolving) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#C9A84C" />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (role === "partner") return <Redirect href="/(partner)/(tabs)" />;
  return <Redirect href="/(client)/(tabs)" />;
}
