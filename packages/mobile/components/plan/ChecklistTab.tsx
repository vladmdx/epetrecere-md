// Checklist tab — interactive list with tap-to-toggle.
//
// Uses optimistic mutations: the item flips visually before the
// server confirms. If the PATCH fails we revert and surface a small
// toast (M5 adds toasts; for now we just revert silently).
//
// Items render in a single flat list. The web also groups by
// category, but on mobile the extra hierarchy makes the screen feel
// noisy and the per-category collapse adds taps with no value.

import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Circle } from "lucide-react-native";
import { Card } from "../ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface ChecklistItem {
  id: number;
  title: string;
  done: boolean;
  category: string | null;
  dueDaysBefore: number | null;
}

interface PlanDetailResponse {
  checklist?: ChecklistItem[];
}

export function ChecklistTab({ planId }: { planId: number }) {
  const api = useApi();
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["plan", planId],
    queryFn: async () => {
      const res = await api.get<PlanDetailResponse>(API_PATHS.eventPlan(planId));
      return res.data ?? {};
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (item: ChecklistItem) => {
      const path = `${API_PATHS.eventPlan(planId)}/checklist/${item.id}`;
      const res = await api.request("PATCH", path, { done: !item.done });
      if (!res.ok) throw new Error(res.error?.message ?? "toggle_failed");
      return res.data;
    },
    onMutate: async (item) => {
      // Optimistic: flip the value in the cache, return previous for rollback.
      await qc.cancelQueries({ queryKey: ["plan", planId] });
      const prev = qc.getQueryData<PlanDetailResponse>(["plan", planId]);
      qc.setQueryData<PlanDetailResponse>(["plan", planId], (old) => {
        if (!old?.checklist) return old;
        return {
          ...old,
          checklist: old.checklist.map((i) =>
            i.id === item.id ? { ...i, done: !i.done } : i,
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(["plan", planId], ctx.prev);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plan", planId] });
    },
  });

  if (detailQuery.isLoading) {
    return (
      <View className="py-8 items-center">
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const list = detailQuery.data?.checklist ?? [];
  const done = list.filter((i) => i.done).length;

  if (list.length === 0) {
    return (
      <Card className="items-center gap-2 p-6">
        <Text className="font-heading text-[15px] font-bold text-foreground">
          Niciun task încă
        </Text>
        <Text className="text-center text-[12px] text-muted-foreground">
          Activează checklist-ul în Setări sau generează unul cu AI.
        </Text>
      </Card>
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-[12px] text-muted-foreground">
        {done} din {list.length} bifate
      </Text>
      {list.map((item) => (
        <ChecklistRow
          key={item.id}
          item={item}
          onToggle={() => toggleMutation.mutate(item)}
        />
      ))}
    </View>
  );
}

function ChecklistRow({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:bg-gold/5"
    >
      {item.done ? (
        <CheckCircle size={22} color={colors.success} />
      ) : (
        <Circle size={22} color={colors.mutedForeground} />
      )}
      <View className="flex-1">
        <Text
          className={`text-[14px] ${
            item.done ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {item.title}
        </Text>
        {(item.category || item.dueDaysBefore != null) && (
          <Text className="mt-0.5 text-[11px] text-muted-foreground">
            {item.category ?? ""}
            {item.dueDaysBefore != null
              ? ` · ${item.dueDaysBefore} zile înainte`
              : ""}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
