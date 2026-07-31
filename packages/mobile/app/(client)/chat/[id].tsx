// Chat thread.
//
// Messages render bottom-aligned (Inverted FlatList) so new ones
// appear at the bottom without re-scrolling the whole list on every
// receive. We poll every 8s for new messages while the screen is
// focused — sockets land in M5 with the rest of real-time work.
//
// Optimistic send: the user's message appears immediately with a
// "sending" pill; if the server returns OK we silently swap the
// temp row with the real one; on failure we surface a retry icon.

import {  useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Send,
  AlertCircle,
} from "lucide-react-native";
import { Avatar } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { relativeTimeRO } from "@epetrecere/shared/utils";

interface ChatMessage {
  id: number;
  conversationId: number;
  senderType: "client" | "artist" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
  _temp?: boolean;
  _failed?: boolean;
}

interface ConversationMeta {
  id: number;
  vendorName: string | null;
  vendorSlug: string | null;
  vendorKind: "artist" | "venue";
}

const POLL_MS = 8000;

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState("");
  const [tempMessages, setTempMessages] = useState<ChatMessage[]>([]);

  // Meta (vendor name) — comes from the conversations list cache when
  // we navigate here; otherwise we fetch.
  const metaQuery = useQuery({
    queryKey: ["conversation-meta", conversationId],
    enabled: Number.isFinite(conversationId),
    queryFn: async () => {
      const list = await api.get<ConversationMeta[]>(API_PATHS.conversations);
      return (
        list.data?.find((c) => c.id === conversationId) ?? null
      );
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["chat-messages", conversationId],
    enabled: Number.isFinite(conversationId),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const res = await api.get<ChatMessage[]>(
        API_PATHS.conversationMessages(conversationId),
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  // Clear temp messages once they appear server-side.
  useEffect(() => {
    if (!messagesQuery.data) return;
    const serverIds = new Set(messagesQuery.data.map((m) => m.id));
    setTempMessages((prev) =>
      prev.filter((t) => !messagesQuery.data!.some((m) =>
        m.message === t.message && Math.abs(new Date(m.createdAt).getTime() - new Date(t.createdAt).getTime()) < 30_000,
      )),
    );
    void serverIds; // referenced for clarity
  }, [messagesQuery.data]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await api.post(
        API_PATHS.conversationMessages(conversationId),
        { message },
      );
      if (!res.ok) throw new Error(res.error?.message ?? "send_failed");
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      void qc.invalidateQueries({ queryKey: ["my", "conversations"] });
    },
  });

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const tempId = -Date.now();
    setTempMessages((prev) => [
      ...prev,
      {
        id: tempId,
        conversationId,
        senderType: "client",
        senderName: "Tu",
        message: trimmed,
        createdAt: new Date().toISOString(),
        _temp: true,
      },
    ]);
    setDraft("");
    sendMutation.mutate(trimmed, {
      onError: () => {
        setTempMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, _temp: false, _failed: true } : m,
          ),
        );
      },
    });
  }

  // Merge server + temp, sort by createdAt, then reverse for inverted FlatList.
  const allMessages = useMemo(() => {
    const merged = [...(messagesQuery.data ?? []), ...tempMessages];
    merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return merged;
  }, [messagesQuery.data, tempMessages]);

  const meta = metaQuery.data;

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center gap-3 border-b border-border px-3 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          {meta && (
            <View className="flex-row flex-1 items-center gap-2">
              <Avatar
                uri={null}
                name={meta.vendorName ?? "?"}
                sizeClass="h-9 w-9"
              />
              <View className="flex-1">
                <Text
                  className="font-heading text-[15px] font-bold text-foreground"
                  numberOfLines={1}
                >
                  {meta.vendorName ?? "Furnizor"}
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  {meta.vendorKind === "artist" ? "Artist" : "Sală"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>

      {messagesQuery.isLoading && allMessages.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={allMessages}
          keyExtractor={(m) => String(m.id)}
          inverted
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => <Bubble msg={item} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View className="items-center py-8">
              <Text className="text-[13px] text-muted-foreground">
                Începe conversația — trimite primul mesaj.
              </Text>
            </View>
          }
        />
      )}

      <SafeAreaView edges={["bottom"]}>
        <View className="flex-row items-end gap-2 border-t border-border bg-background px-3 py-2">
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Scrie un mesaj…"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            multiline
            maxLength={4000}
            className="max-h-[120px] flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground"
            style={{ minHeight: 40 }}
          />
          <Pressable
            disabled={!draft.trim() || sendMutation.isPending}
            onPress={() => {
              handleSend();
              Keyboard.dismiss();
            }}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              draft.trim() ? "bg-gold" : "bg-muted"
            }`}
          >
            <Send
              size={18}
              color={draft.trim() ? colors.background : colors.mutedForeground}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isMine = msg.senderType === "client";
  return (
    <View className={isMine ? "items-end" : "items-start"}>
      <View
        className={`max-w-[78%] rounded-2xl px-4 py-2 ${
          isMine
            ? "rounded-br-md bg-gold"
            : "rounded-bl-md border border-border bg-card"
        }`}
      >
        <Text
          className={`text-[14px] leading-5 ${
            isMine ? "text-background" : "text-foreground"
          }`}
        >
          {msg.message}
        </Text>
      </View>
      <View className="mt-0.5 flex-row items-center gap-1">
        {msg._failed && (
          <AlertCircle size={11} color={colors.danger} />
        )}
        <Text className="text-[10px] text-muted-foreground">
          {msg._temp
            ? "Se trimite…"
            : msg._failed
              ? "Eșuat — atinge bula pentru a reîncerca"
              : relativeTimeRO(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}
