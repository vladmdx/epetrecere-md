// Client cabinet stub. M3 builds it out to mirror the web cabinet
// (hero card, next-step, stat tiles, services strip, recent messages).

import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ClientCabinet() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-heading text-2xl font-bold text-foreground">
          Panoul clientului
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          Construit în M2–M3
        </Text>
      </View>
    </SafeAreaView>
  );
}
