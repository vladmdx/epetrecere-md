// Placeholder for screens whose feature isn't built yet. Keeps every
// navigation target resolvable so the app never shows "Unmatched Route".
//
// Usage:
//   export default () => <ComingSoon title="Calculator de buget" />;

import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Hammer } from "lucide-react-native";
import { SafeScreen } from "./SafeScreen";
import { Button } from "./Button";
import { colors } from "../../constants/theme";

export function ComingSoon({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  const router = useRouter();
  return (
    <SafeScreen padded>
      <View className="flex-1 items-center justify-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-3xl bg-gold/15">
          <Hammer size={30} color={colors.gold} />
        </View>
        <Text className="text-center font-heading text-[22px] font-bold text-foreground">
          {title}
        </Text>
        <Text className="max-w-[280px] text-center text-[14px] leading-5 text-muted-foreground">
          {message ?? "Lucrăm la asta — funcția vine în curând într-o actualizare."}
        </Text>
        <Button variant="outline" onPress={() => router.back()}>
          Înapoi
        </Button>
      </View>
    </SafeScreen>
  );
}
