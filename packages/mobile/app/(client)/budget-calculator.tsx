// Budget calculator — standalone event-budget planner.
//
// Set a target budget, fill estimated costs per category, and see live
// totals + remaining vs the target with a progress bar. Persisted
// locally (AsyncStorage) so the budget survives app restarts. No backend
// — this is a personal estimating tool.

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, Wallet, RotateCcw } from "lucide-react-native";
import { SafeScreen, Card, ProgressBar } from "../../components/ui";
import { colors } from "../../constants/theme";

const STORAGE_KEY = "ep:budget-calculator:v1";

const CATEGORIES = [
  { key: "venue", label: "Sală / Local" },
  { key: "music", label: "Muzică / Artiști" },
  { key: "photo", label: "Foto / Video" },
  { key: "catering", label: "Catering / Meniu" },
  { key: "decor", label: "Decor / Flori" },
  { key: "cake", label: "Tort / Candy bar" },
  { key: "attire", label: "Ținute" },
  { key: "transport", label: "Transport" },
  { key: "other", label: "Altele" },
] as const;

export default function BudgetCalculatorScreen() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [target, setTarget] = useState("");
  const [items, setItems] = useState<Record<string, string>>({});

  // Hydrate from disk once.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw) as {
            target?: string;
            items?: Record<string, string>;
          };
          setTarget(p.target ?? "");
          setItems(p.items ?? {});
        }
      } catch {
        // Corrupt cache — start fresh.
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Persist on every change (after hydration so we don't clobber with empty).
  useEffect(() => {
    if (hydrated) {
      void AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ target, items }),
      );
    }
  }, [target, items, hydrated]);

  const totalSpent = useMemo(
    () => Object.values(items).reduce((s, v) => s + (Number(v) || 0), 0),
    [items],
  );
  const targetNum = Number(target) || 0;
  const remaining = targetNum - totalSpent;
  const pct =
    targetNum > 0 ? Math.min(100, Math.round((totalSpent / targetNum) * 100)) : 0;
  const over = targetNum > 0 && totalSpent > targetNum;

  const setItem = (key: string, val: string) =>
    setItems((m) => ({ ...m, [key]: val.replace(/[^0-9]/g, "") }));

  if (!hydrated) {
    return (
      <SafeScreen padded>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeScreen>
    );
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
          Calculator de buget
        </Text>
      </View>

      {/* Target budget */}
      <Card className="mt-3 gap-2 p-4">
        <Text className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
          Buget total planificat
        </Text>
        <View className="flex-row items-center gap-2">
          <Wallet size={20} color={colors.gold} />
          <TextInput
            value={target}
            onChangeText={(t) => setTarget(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="ex. 5000"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            className="flex-1 text-[22px] font-bold text-foreground"
          />
          <Text className="text-[18px] font-bold text-muted-foreground">€</Text>
        </View>
      </Card>

      {/* Live summary */}
      <Card className="mt-3 gap-3 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-[14px] text-muted-foreground">
            Cheltuit estimat
          </Text>
          <Text className="text-[16px] font-bold text-foreground">
            {totalSpent} €
          </Text>
        </View>
        <ProgressBar value={pct} />
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] text-muted-foreground">
            {targetNum > 0 ? `${pct}% din buget` : "Setează un buget țintă"}
          </Text>
          {targetNum > 0 && (
            <Text
              style={{ color: over ? colors.danger : colors.success }}
              className="text-[14px] font-semibold"
            >
              {over
                ? `Depășit cu ${Math.abs(remaining)} €`
                : `Rămas ${remaining} €`}
            </Text>
          )}
        </View>
      </Card>

      {/* Category breakdown */}
      <Text className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
        Cheltuieli pe categorii
      </Text>
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {CATEGORIES.map((c, i) => (
          <View
            key={c.key}
            className={`flex-row items-center gap-3 px-4 py-3 ${
              i < CATEGORIES.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <Text className="flex-1 text-[14px] text-foreground">{c.label}</Text>
            <TextInput
              value={items[c.key] ?? ""}
              onChangeText={(t) => setItem(c.key, t)}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.gold}
              className="min-w-[64px] text-right text-[15px] font-semibold text-foreground"
            />
            <Text className="text-[14px] text-muted-foreground">€</Text>
          </View>
        ))}
      </View>

      {/* Reset */}
      <Pressable
        onPress={() => {
          setTarget("");
          setItems({});
        }}
        className="mb-2 mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 active:opacity-80"
      >
        <RotateCcw size={16} color={colors.mutedForeground} />
        <Text className="text-[14px] font-medium text-muted-foreground">
          Resetează
        </Text>
      </Pressable>

      <Text className="mb-4 text-center text-[11px] text-muted-foreground">
        Estimările sunt salvate doar pe acest dispozitiv.
      </Text>
    </SafeScreen>
  );
}
