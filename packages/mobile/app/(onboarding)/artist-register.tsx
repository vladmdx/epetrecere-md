// Onboarding — artist registration.
//
// The role-picker sets users.role=artist, but that alone does NOT create the
// `artists` row, so the partner dashboard 404s and a cold start reverts the
// user to the client tabs. This screen collects the minimal profile and calls
// the web's POST /api/auth/register-artist, which inserts the artists row
// (isActive:false, pending admin approval) — making the partner role durable.
//
// NOTE: register-artist lives at /api/auth/... (NOT /api/v1), so we call it
// with a raw fetch against the auth base rather than the v1 api client.

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { ArrowLeft } from "lucide-react-native";
import { SafeScreen, Button, Input } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface Category {
  id: number;
  nameRo: string;
  slug: string;
}

const AUTH_BASE = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://epetrecere.md/api/v1"
).replace(/\/v1\/?$/, "");

export default function ArtistRegister() {
  const router = useRouter();
  const api = useApi();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [name, setName] = useState(
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [location, setLocation] = useState("Chișinău");
  const [phone, setPhone] = useState(
    user?.phoneNumbers?.[0]?.phoneNumber ?? "",
  );
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<Category[]>(API_PATHS.categories);
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  async function handleSubmit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Numele artistic e prea scurt.");
      return;
    }
    if (!categoryId) {
      setError("Alege o categorie.");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${AUTH_BASE}/auth/register-artist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          categoryId,
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (res.ok || res.status === 409) {
        // 409 = already an artist; either way the partner role is now real.
        await SecureStore.setItemAsync("epetrecere.role.v1", "partner");
        Alert.alert(
          "Profil creat",
          "Profilul tău de artist a fost creat și așteaptă aprobarea. Completează-l din panou.",
          [{ text: "OK", onPress: () => router.replace("/(partner)/(tabs)") }],
        );
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Nu am putut crea profilul. Încearcă din nou.");
      }
    } catch {
      setError("Eroare de rețea. Verifică conexiunea.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeScreen padded scroll={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 8,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>
          Devino artist
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingTop: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
          Creează-ți profilul de artist. După aprobare, clienții te vor putea
          găsi și rezerva.
        </Text>

        <Input label="Nume artistic" value={name} onChangeText={setName} />

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground }}>
            Categorie
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(categoriesQuery.data ?? []).map((c) => {
              const selected = categoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: selected ? colors.gold : colors.border,
                    backgroundColor: selected
                      ? "rgba(201,168,76,0.15)"
                      : colors.card,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: selected ? colors.gold : colors.foreground,
                    }}
                  >
                    {c.nameRo}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          label="Oraș"
          value={location}
          onChangeText={setLocation}
          autoCapitalize="words"
        />
        <Input
          label="Telefon (opțional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Input
          label="Descriere (opțional)"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {error && (
          <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text>
        )}

        <Button onPress={handleSubmit} loading={submitting} fullWidth size="lg">
          Creează profilul
        </Button>
      </ScrollView>
    </SafeScreen>
  );
}
