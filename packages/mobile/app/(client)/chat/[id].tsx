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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // The server stamps senderType with the sender's side of the conversation:
  // "client", "artist" or "venue" (see POST /conversations/[id]/messages).
  senderType: "client" | "artist" | "venue" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
  _temp?: boolean;
  _failed?: boolean;
}

interface ConversationMeta {
  id: number;
  // Present when fetched as the CLIENT (role=client): the vendor we're talking to.
  vendorName?: string | null;
  vendorSlug?: string | null;
  vendorKind?: "artist" | "venue";
  // Present when fetched as the VENDOR (role=vendor): the client on the other side.
  clientName?: string | null;
}

const POLL_MS = 8000;

export default function ChatThreadScreen() {
  // This thread screen is SHARED: the client opens it from their chat-list,
  // and the partner/vendor opens it from their Mesaje tab (they navigate to
  // the same /(client)/chat/[id] route with ?as=vendor). Without knowing the
  // viewer's side, bubble alignment + the header name would always assume the
  // viewer is the client — so the vendor saw the client's messages aligned as
  // their own and an empty header. `as` fixes both.
  const { id, as } = useLocalSearchParams<{ id: string; as?: string }>();
  const conversationId = Number(id);
  const viewerIsVendor = as === "vendor" || as === "artist" || as === "venue";
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState("");
  const [tempMessages, setTempMessages] = useState<ChatMessage[]>([]);

  // Meta (vendor name) — comes from the conversations list cache when
  // we navigate here; otherwise we fetch.
  const metaQuery = useQuery({
    queryKey: ["conversation-meta", conversationId, viewerIsVendor],
    enabled: Number.isFinite(conversationId),
    queryFn: async () => {
      // The vendor's conversations only surface under role=vendor (role=client,
      // the default, never lists them) — and that payload carries the client's
      // name, which is what the vendor's header should show.
      const list = await api.get<ConversationMeta[]>(
        API_PATHS.conversations,
        viewerIsVendor ? { query: { role: "vendor" } } : undefined,
      );
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
        // Stamp the optimistic row with the viewer's own side so it aligns as
        // "mine" (the server will stamp the real row the same way).
        senderType: viewerIsVendor ? "artist" : "client",
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
  const headerName = viewerIsVendor
    ? meta?.clientName ?? "Client"
    : meta?.vendorName ?? "Furnizor";

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center gap-3 border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderBottomWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
            }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          {meta && (
            <View
              className="flex-row flex-1 items-center gap-2"
              style={{ flexDirection: "row", flex: 1, alignItems: "center", gap: 8 }}
            >
              <Avatar
                uri={null}
                name={headerName}
                sizeClass="h-9 w-9"
              />
              <View className="flex-1" style={{ flex: 1 }}>
                <Text
                  className="font-heading text-[15px] font-bold text-foreground"
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}
                >
                  {headerName}
                </Text>
                <Text
                  className="text-[11px] text-muted-foreground"
                  style={{ fontSize: 11, color: colors.mutedForeground }}
                >
                  {viewerIsVendor
                    ? "Client"
                    : meta.vendorKind === "artist"
                      ? "Artist"
                      : "Sală"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>

      {messagesQuery.isLoading && allMessages.length === 0 ? (
        <View
          className="flex-1 items-center justify-center"
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={allMessages}
          keyExtractor={(m) => String(m.id)}
          inverted
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <Bubble msg={item} viewerIsVendor={viewerIsVendor} />
          )}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View className="items-center py-8" style={{ alignItems: "center", paddingVertical: 32 }}>
              <Text
                className="text-[13px] text-muted-foreground"
                style={{ fontSize: 13, color: colors.mutedForeground }}
              >
                Începe conversația — trimite primul mesaj.
              </Text>
            </View>
          }
        />
      )}

      <SafeAreaView edges={["bottom"]}>
        <View
          className="flex-row items-end gap-2 border-t border-border bg-background px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            borderTopWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
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
            style={[
              {
                maxHeight: 120,
                flex: 1,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontSize: 15,
                color: colors.foreground,
              },
              { minHeight: 40 },
            ]}
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
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: draft.trim() ? colors.gold : colors.muted,
            }}
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

function Bubble({
  msg,
  viewerIsVendor,
}: {
  msg: ChatMessage;
  viewerIsVendor: boolean;
}) {
  // "Mine" depends on who is looking: the client owns "client" messages, the
  // vendor owns "artist"/"venue" messages. (admin messages are nobody's — they
  // stay left-aligned for both sides.)
  const isMine = viewerIsVendor
    ? msg.senderType === "artist" || msg.senderType === "venue"
    : msg.senderType === "client";
  return (
    <View
      className={isMine ? "items-end" : "items-start"}
      style={{ alignItems: isMine ? "flex-end" : "flex-start" }}
    >
      <View
        className={`max-w-[78%] rounded-2xl px-4 py-2 ${
          isMine
            ? "rounded-br-md bg-gold"
            : "rounded-bl-md border border-border bg-card"
        }`}
        style={{
          maxWidth: "78%",
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 8,
          ...(isMine
            ? { borderBottomRightRadius: 10, backgroundColor: colors.gold }
            : {
                borderBottomLeftRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              }),
        }}
      >
        <Text
          className={`text-[14px] leading-5 ${
            isMine ? "text-background" : "text-foreground"
          }`}
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: isMine ? colors.background : colors.foreground,
          }}
        >
          {msg.message}
        </Text>
      </View>
      <View
        className="mt-0.5 flex-row items-center gap-1"
        style={{ marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        {msg._failed && (
          <AlertCircle size={11} color={colors.danger} />
        )}
        <Text
          className="text-[10px] text-muted-foreground"
          style={{ fontSize: 10, color: colors.mutedForeground }}
        >
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
