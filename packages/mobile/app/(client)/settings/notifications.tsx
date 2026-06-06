// Notification preferences — per-category email + push toggles.
//
// Backed by /me/notification-preferences. Missing keys default to ON, so
// a fresh user sees everything enabled. Each toggle PUTs a single
// {category, channel, enabled} patch and updates optimistically.

import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell } from "lucide-react-native";
import { SafeScreen, Card } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

type Channel = "email" | "push";
type Prefs = Record<string, { email?: boolean; push?: boolean }>;

const CATEGORIES: { key: string; label: string; desc: string }[] = [
  { key: "booking_requests", label: "Cereri de rezervare", desc: "Cereri noi și conflicte de program" },
  { key: "booking_updates", label: "Actualizări rezervări", desc: "Acceptare, refuz, anulare, finalizare" },
  { key: "messages", label: "Mesaje", desc: "Mesaje noi în conversații" },
  { key: "reviews", label: "Recenzii", desc: "Recenzii noi și cereri de recenzie" },
  { key: "reminders", label: "Memento-uri", desc: "Reminder evenimente, RSVP și altele" },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const api = useApi();
  const [prefs, setPrefs] = useState<Prefs>({});

  const prefsQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const res = await api.get<{ prefs: Prefs }>(
        API_PATHS.notificationPreferences,
      );
      return res.data ?? { prefs: {} };
    },
  });

  useEffect(() => {
    if (prefsQuery.data?.prefs) setPrefs(prefsQuery.data.prefs);
  }, [prefsQuery.data]);

  // Missing pref → ON by default (matches the server's resolvePrefs).
  const isOn = (cat: string, ch: Channel) => prefs[cat]?.[ch] !== false;

  async function toggle(cat: string, ch: Channel) {
    const next = !isOn(cat, ch);
    // Optimistic update.
    setPrefs((p) => ({ ...p, [cat]: { ...p[cat], [ch]: next } }));
    const res = await api.put(API_PATHS.notificationPreferences, {
      category: cat,
      channel: ch,
      enabled: next,
    });
    if (!res.ok) {
      // Revert on failure.
      setPrefs((p) => ({ ...p, [cat]: { ...p[cat], [ch]: !next } }));
      Alert.alert("Eroare", "Nu am putut salva preferința. Încearcă din nou.");
    }
  }

  return (
    <SafeScreen padded scroll>
      {/* Header */}
      <View className="flex-row items-center gap-2 pt-1">
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text className="font-heading text-[20px] font-bold text-foreground">
          Notificări
        </Text>
      </View>

      <View className="mt-2 flex-row items-start gap-2 rounded-2xl border border-gold/20 bg-gold/5 p-4">
        <Bell size={16} color={colors.gold} />
        <Text className="flex-1 text-[12px] leading-5 text-foreground/85">
          Alege ce notificări vrei să primești, pe email și pe telefon (push).
        </Text>
      </View>

      {prefsQuery.isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <View className="mt-4 gap-3">
          {CATEGORIES.map((c) => (
            <Card key={c.key} className="gap-3 p-4">
              <View>
                <Text className="text-[15px] font-semibold text-foreground">
                  {c.label}
                </Text>
                <Text className="text-[12px] text-muted-foreground">
                  {c.desc}
                </Text>
              </View>
              <View className="gap-2 border-t border-border pt-3">
                <ToggleRow
                  label="Email"
                  value={isOn(c.key, "email")}
                  onToggle={() => toggle(c.key, "email")}
                />
                <ToggleRow
                  label="Push (telefon)"
                  value={isOn(c.key, "push")}
                  onToggle={() => toggle(c.key, "push")}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <Text className="mb-4 mt-4 text-center text-[11px] text-muted-foreground">
        Notificările esențiale despre contul tău se trimit întotdeauna.
      </Text>
    </SafeScreen>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[14px] text-foreground">{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#3A3A3A", true: colors.gold }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#3A3A3A"
      />
    </View>
  );
}
