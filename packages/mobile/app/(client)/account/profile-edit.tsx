// Edit profile — the client's name is stored in Clerk, so we update it there
// directly (no app-DB round-trip). Email/phone are Clerk-verified identifiers
// and are shown read-only here; changing them needs Clerk's verification flow.

import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { SafeScreen, Button, Input } from "../../../components/ui";
import { colors } from "../../../constants/theme";

export default function ProfileEdit() {
  const router = useRouter();
  const { user } = useUser();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!user) return;
    if (firstName.trim().length < 2) {
      setError("Prenumele e prea scurt.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      Alert.alert("Salvat", "Profilul tău a fost actualizat.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        "Nu am putut salva. Încearcă din nou.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeScreen padded>
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
          Editează profilul
        </Text>
      </View>

      <View style={{ gap: 14, paddingTop: 16 }}>
        <Input
          label="Prenume"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          textContentType="givenName"
        />
        <Input
          label="Nume"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          textContentType="familyName"
        />
        <Input
          label="Email"
          value={user?.primaryEmailAddress?.emailAddress ?? ""}
          editable={false}
          hint="Emailul e gestionat de contul tău și nu poate fi schimbat aici."
        />

        {error && (
          <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text>
        )}

        <Button onPress={handleSave} loading={saving} fullWidth size="lg">
          Salvează
        </Button>
      </View>
    </SafeScreen>
  );
}
