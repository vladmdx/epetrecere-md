// Sign-in stub. Fleshed out in M1 with email/password + Google OAuth +
// "magic link" via Clerk. For now we just verify the layout shell and
// the Clerk provider work end-to-end during M0.

import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignIn() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-heading text-3xl font-bold text-foreground">
          ePetrecere
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          Auth flow se construiește în M1 — stub placeholder
        </Text>
      </View>
    </SafeAreaView>
  );
}
