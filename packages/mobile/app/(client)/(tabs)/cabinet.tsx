// Cabinet tab — user's events + bookings + checklist + photo moments.
//
// M3 builds this out completely (mirrors the web cabinet redesign).
// For M2 we ship a placeholder with the same visual language so the
// tab is navigable end-to-end without a 404-feel.

import { View, Text } from "react-native";
import { CalendarDays, Sparkles } from "lucide-react-native";
import { Link } from "expo-router";
import { SafeScreen, Button } from "../../../components/ui";
import { colors } from "../../../constants/theme";

export default function CabinetTab() {
  return (
    <SafeScreen padded>
      <View className="pt-2">
        <Text className="font-heading text-[28px] font-bold text-foreground">
          Cabinet
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Evenimentele și rezervările tale.
        </Text>
      </View>

      <View className="flex-1 items-center justify-center gap-4 py-12">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-gold/15">
          <CalendarDays size={40} color={colors.gold} />
        </View>
        <Text className="font-heading text-[20px] font-bold text-foreground">
          În curând
        </Text>
        <Text className="max-w-[280px] text-center text-[13px] leading-5 text-muted-foreground">
          Aici vei vedea evenimentele tale active, cererile trimise, checklistul și Photo Moments. Construit în M3.
        </Text>
        <Link href="https://epetrecere.md/cabinet" asChild>
          <Button variant="outline" size="md" onPress={() => {}}>
            Deschide pe web
          </Button>
        </Link>
      </View>

      <View className="rounded-2xl border border-gold/20 bg-gold/5 p-4">
        <View className="flex-row items-center gap-3">
          <Sparkles size={20} color={colors.gold} />
          <Text className="flex-1 text-[13px] leading-5 text-foreground/85">
            Spune-mi când e gata M3 și mut totul aici nativ: hero card,
            checklist, RSVP, Photo Moments cu QR direct din cameră.
          </Text>
        </View>
      </View>
    </SafeScreen>
  );
}
