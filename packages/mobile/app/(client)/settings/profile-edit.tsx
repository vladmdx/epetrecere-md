// Edit profile — name fields backed by Clerk's user object.
// (Reached from the Cont tab → "Editează profilul"; route previously
// missing → "Unmatched Route".)

import { useState } from "react";
import { View, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { User } from "lucide-react-native";
import { SafeScreen, Input, Button } from "../../../components/ui";
import { colors } from "../../../constants/theme";

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      router.back();
    } catch {
      Alert.alert("Eroare", "Nu s-a putut salva profilul. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeScreen padded scroll>
      <View className="gap-1 pt-2">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-gold/15">
          <User size={24} color={colors.gold} />
        </View>
        <Text className="mt-2 font-heading text-[24px] font-bold text-foreground">
          Editează profilul
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          {user?.primaryEmailAddress?.emailAddress ?? ""}
        </Text>
      </View>

      <View className="mt-6">
        <Input
          label="Prenume"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />
        <Input
          label="Nume"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />
        <Button
          onPress={handleSave}
          loading={saving}
          fullWidth
          size="lg"
          style={{ marginTop: 8 }}
        >
          Salvează
        </Button>
      </View>
    </SafeScreen>
  );
}
