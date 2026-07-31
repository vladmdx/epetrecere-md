// Guests tab — list with RSVP pills + add-guest modal.
//
// Stats row at the top (Total/Confirmați/În așteptare/Refuzați).
// Tap a guest row to cycle RSVP (pending → accepted → declined →
// maybe → pending). Long-press to delete. Plus button opens the
// add-guest sheet.

import { useState } from "react";
import { View, Text, Pressable, FlatList, Modal } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  CheckCircle,
  Clock,
  XCircle,
  HelpCircle,
  X,
} from "lucide-react-native";
import { Card, Button, Badge, Input, type BadgeTone } from "../ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface Guest {
  id: number;
  fullName: string;
  partySize: number;
  rsvp: "pending" | "accepted" | "declined" | "maybe";
  contactChannel: "whatsapp" | "viber" | "telegram" | "sms" | "email";
  contactValue: string | null;
}

interface PlanDetailResponse {
  guests?: Guest[];
  plan?: { guestCountTarget?: number | null };
}

const NEXT_RSVP: Record<Guest["rsvp"], Guest["rsvp"]> = {
  pending: "accepted",
  accepted: "declined",
  declined: "maybe",
  maybe: "pending",
};

export function GuestsTab({ planId }: { planId: number }) {
  const api = useApi();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["plan", planId],
    queryFn: async () => {
      const res = await api.get<PlanDetailResponse>(API_PATHS.eventPlan(planId));
      return res.data ?? {};
    },
  });

  const rsvpMutation = useMutation({
    mutationFn: async (guest: Guest) => {
      const next = NEXT_RSVP[guest.rsvp];
      const path = `${API_PATHS.eventPlan(planId)}/guests/${guest.id}`;
      const res = await api.request("PATCH", path, { rsvp: next });
      if (!res.ok) throw new Error(res.error?.message ?? "rsvp_failed");
      return res.data;
    },
    onMutate: async (guest) => {
      await qc.cancelQueries({ queryKey: ["plan", planId] });
      const prev = qc.getQueryData<PlanDetailResponse>(["plan", planId]);
      qc.setQueryData<PlanDetailResponse>(["plan", planId], (old) => {
        if (!old?.guests) return old;
        return {
          ...old,
          guests: old.guests.map((g) =>
            g.id === guest.id ? { ...g, rsvp: NEXT_RSVP[g.rsvp] } : g,
          ),
        };
      });
      return { prev };
    },
    onError: (_e, _g, ctx) => {
      if (ctx?.prev) qc.setQueryData(["plan", planId], ctx.prev);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plan", planId] });
    },
  });

  const guests = detailQuery.data?.guests ?? [];
  const target = detailQuery.data?.plan?.guestCountTarget ?? 0;
  const counts = {
    total: guests.reduce((s, g) => s + g.partySize, 0),
    accepted: guests
      .filter((g) => g.rsvp === "accepted")
      .reduce((s, g) => s + g.partySize, 0),
    pending: guests.filter((g) => g.rsvp === "pending").length,
    declined: guests.filter((g) => g.rsvp === "declined").length,
  };

  return (
    <View className="gap-3">
      {/* Stats */}
      <View className="flex-row gap-2">
        <StatChip label="Total" value={`${counts.total}/${target || "—"}`} tone="default" />
        <StatChip label="Confirmați" value={String(counts.accepted)} tone="success" />
        <StatChip label="În așteptare" value={String(counts.pending)} tone="warning" />
        <StatChip label="Refuzați" value={String(counts.declined)} tone="danger" />
      </View>

      <Button
        onPress={() => setShowAdd(true)}
        size="md"
        fullWidth
        leftIcon={<Plus size={18} color={colors.background} />}
      >
        Adaugă invitat
      </Button>

      <FlatList
        data={guests}
        keyExtractor={(g) => String(g.id)}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => (
          <GuestRow guest={item} onPress={() => rsvpMutation.mutate(item)} />
        )}
        ListEmptyComponent={
          <Card className="items-center gap-2 p-6">
            <Text className="text-[13px] text-muted-foreground">
              Niciun invitat încă. Adaugă unul cu butonul de mai sus.
            </Text>
          </Card>
        }
      />

      <AddGuestModal
        visible={showAdd}
        onDismiss={() => setShowAdd(false)}
        planId={planId}
      />
    </View>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: BadgeTone;
}) {
  return (
    <View className="flex-1 items-center rounded-xl border border-border bg-card p-2">
      <Text className="font-heading text-[16px] font-bold text-foreground">
        {value}
      </Text>
      <Badge tone={tone} size="sm">
        {label}
      </Badge>
    </View>
  );
}

function GuestRow({ guest, onPress }: { guest: Guest; onPress: () => void }) {
  const cfg = rsvpConfig(guest.rsvp);
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:bg-gold/5"
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${cfg.bg}`}
      >
        <cfg.Icon size={18} color={cfg.color} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-foreground">
          {guest.fullName}
        </Text>
        {(guest.partySize > 1 || guest.contactValue) && (
          <Text className="text-[12px] text-muted-foreground">
            {guest.partySize > 1 ? `${guest.partySize} persoane` : ""}
            {guest.partySize > 1 && guest.contactValue ? " · " : ""}
            {guest.contactValue ?? ""}
          </Text>
        )}
      </View>
      <Badge tone={cfg.tone} size="sm">
        {cfg.label}
      </Badge>
    </Pressable>
  );
}

function rsvpConfig(rsvp: Guest["rsvp"]) {
  switch (rsvp) {
    case "accepted":
      return {
        label: "Confirmat",
        tone: "success" as BadgeTone,
        Icon: CheckCircle,
        color: colors.success,
        bg: "bg-emerald-500/15",
      };
    case "declined":
      return {
        label: "Refuzat",
        tone: "danger" as BadgeTone,
        Icon: XCircle,
        color: colors.danger,
        bg: "bg-rose-500/15",
      };
    case "maybe":
      return {
        label: "Posibil",
        tone: "warning" as BadgeTone,
        Icon: HelpCircle,
        color: colors.warning,
        bg: "bg-amber-500/15",
      };
    default:
      return {
        label: "În așteptare",
        tone: "default" as BadgeTone,
        Icon: Clock,
        color: colors.mutedForeground,
        bg: "bg-muted",
      };
  }
}

function AddGuestModal({
  visible,
  onDismiss,
  planId,
}: {
  visible: boolean;
  onDismiss: () => void;
  planId: number;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [contactValue, setContactValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Numele e prea scurt");
      return;
    }
    setSubmitting(true);
    try {
      // The server derives partySize from guestType: single→1, couple→2,
      // family→clamp(2..8, partySize). It ignores a raw partySize unless
      // guestType==='family', so map the entered count to a guestType to
      // avoid every guest being silently saved as 1 person.
      const size = Math.max(1, Number(partySize) || 1);
      const guestType =
        size <= 1 ? "single" : size === 2 ? "couple" : "family";
      const res = await api.post(
        `${API_PATHS.eventPlan(planId)}/guests`,
        {
          fullName: name.trim(),
          guestType,
          partySize: size,
          contactChannel: "whatsapp",
          contactValue: contactValue.trim() || null,
        },
      );
      if (!res.ok) {
        setError(res.error?.message ?? "A apărut o eroare");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["plan", planId] });
      setName("");
      setPartySize("1");
      setContactValue("");
      onDismiss();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Text className="font-heading text-[18px] font-bold text-foreground">
            Adaugă invitat
          </Text>
          <Pressable hitSlop={8} onPress={onDismiss}>
            <X size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View className="gap-3 p-5">
          <Input
            label="Nume invitat"
            value={name}
            onChangeText={setName}
            error={error}
            autoCapitalize="words"
            autoFocus
          />
          <Input
            label="Persoane (cu însoțitor)"
            value={partySize}
            onChangeText={(v) => setPartySize(v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Input
            label="Telefon / WhatsApp"
            value={contactValue}
            onChangeText={setContactValue}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Button
            onPress={handleAdd}
            loading={submitting}
            fullWidth
            size="lg"
          >
            Adaugă
          </Button>
        </View>
      </View>
    </Modal>
  );
}
