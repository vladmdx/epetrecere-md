// AI Assistant — streaming chat with markdown render.
//
// Replaces the M4 one-shot fetch with an SSE stream so the assistant
// bubble grows token-by-token. Each user message kicks off a stream;
// the partial assistant response is held in a ref so re-renders don't
// re-run the generator. Smart-suggestion chips above the input refresh
// based on the user's current state.

import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";
import { ArrowLeft, Send, Sparkles, Bot, Mic, MicOff } from "lucide-react-native";
import { colors } from "../../constants/theme";
import { streamAiChat, type ChatTurn } from "../../lib/ai-stream";
import { useApi } from "../../lib/api";
import { useVoiceRecorder } from "../../lib/voice-recorder";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

interface Suggestion {
  prompt: string;
  category: "marketing" | "pricing" | "responses" | "profile" | "general";
}

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { prompt: "Câte cereri am primit săptămâna asta?", category: "general" },
  { prompt: "Sfaturi pentru a primi mai multe rezervări", category: "marketing" },
  { prompt: "Cum optimizez profilul pentru a urca în topul artiștilor?", category: "profile" },
  { prompt: "Cum răspund la o cerere cu un buget prea mic?", category: "responses" },
];

export default function AIAssistantScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const api = useApi();
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      content:
        "Salut! Sunt asistentul tău AI. Te pot ajuta cu sfaturi de marketing, răspunsuri la cereri, optimizarea profilului. Întreabă-mă orice.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);

  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "https://epetrecere.md/api/v1";

  // Smart suggestions — context-aware. /api/v1/ai/suggestions returns
  // 4 prompts tailored to the partner's current state (pending bookings,
  // upcoming events, low completion). Falls back to static list on miss.
  const suggestionsQuery = useQuery({
    queryKey: ["ai-suggestions", "partner"],
    queryFn: async () => {
      const res = await api.get<{ suggestions: Suggestion[] }>(
        "/ai/suggestions?context=partner",
      );
      return res.ok ? res.data?.suggestions ?? FALLBACK_SUGGESTIONS : FALLBACK_SUGGESTIONS;
    },
    staleTime: 5 * 60 * 1000,
  });
  const suggestions = suggestionsQuery.data ?? FALLBACK_SUGGESTIONS;

  // Voice recording → Whisper transcription → drop text into input.
  const { isRecording, startRecording, stopRecording, transcribing } =
    useVoiceRecorder({
      apiUrl,
      getToken: () => getToken(),
      onTranscript: (text) => setDraft((d) => (d ? `${d} ${text}` : text)),
    });

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? draft).trim();
      if (!content || streaming) return;

      const userMsg: Message = { id: Date.now(), role: "user", content };
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: "",
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setDraft("");
      Keyboard.dismiss();
      setStreaming(true);

      // Build the full history Claude sees — exclude the pending
      // placeholder we just added.
      const history: ChatTurn[] = [...messages, userMsg]
        .filter((m) => !m.pending)
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      const token = await getToken();
      if (!token) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsg.id
              ? { ...m, pending: false, content: "Eroare: nu ești autentificat." }
              : m,
          ),
        );
        setStreaming(false);
        return;
      }

      let acc = "";
      try {
        for await (const ev of streamAiChat({
          apiUrl,
          token,
          messages: history,
          context: "partner_assistant",
          signal: controller.signal,
        })) {
          if (ev.type === "token" && ev.text) {
            acc += ev.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsg.id ? { ...m, content: acc, pending: false } : m)),
            );
          } else if (ev.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsg.id
                  ? {
                      ...m,
                      pending: false,
                      content:
                        acc + `\n\n_Eroare: ${ev.message ?? "stream întrerupt"}._`,
                    }
                  : m,
              ),
            );
            break;
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsg.id
              ? {
                  ...m,
                  pending: false,
                  content:
                    acc +
                    "\n\n_Eroare de rețea — încearcă din nou._",
                }
              : m,
          ),
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [apiUrl, draft, getToken, messages, streaming],
  );

  // Cancel in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reversed = [...messages].reverse();
  const isEmpty = messages.length <= 1;

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
          <View className="h-10 w-10 items-center justify-center rounded-full bg-gold/15">
            <Bot size={20} color={colors.gold} />
          </View>
          <View className="flex-1">
            <Text className="font-heading text-[15px] font-bold text-foreground">
              AI Assistant
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {streaming ? "Scrie un răspuns…" : "Sfaturi & răspunsuri rapide"}
            </Text>
          </View>
          {streaming && (
            <Pressable
              hitSlop={8}
              onPress={() => abortRef.current?.abort()}
              className="rounded-full bg-rose-500/15 px-3 py-1.5"
            >
              <Text className="text-[12px] font-semibold text-rose-300">Stop</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <FlatList
        data={reversed}
        keyExtractor={(m) => String(m.id)}
        inverted
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => <Bubble msg={item} />}
        ListFooterComponent={
          isEmpty ? (
            <View className="gap-2 pb-4">
              <View className="flex-row items-center gap-2 pb-1">
                <Sparkles size={12} color={colors.gold} />
                <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Sugestii
                </Text>
              </View>
              {suggestions.map((s) => (
                <Pressable
                  key={s.prompt}
                  onPress={() => handleSend(s.prompt)}
                  className="rounded-xl border border-border bg-card px-4 py-3 active:bg-gold/5"
                >
                  <Text className="text-[14px] text-foreground">{s.prompt}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />

      <SafeAreaView edges={["bottom"]}>
        {transcribing && (
          <View className="flex-row items-center justify-center gap-2 bg-gold/15 py-1.5">
            <ActivityIndicator size="small" color={colors.gold} />
            <Text className="text-[11px] text-gold">Se transcrie…</Text>
          </View>
        )}
        <View className="flex-row items-end gap-2 border-t border-border bg-background px-3 py-2">
          <Pressable
            disabled={transcribing || streaming}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              isRecording ? "bg-rose-500" : "bg-card border border-border"
            }`}
          >
            {isRecording ? (
              <Mic size={18} color="#fff" />
            ) : (
              <MicOff size={18} color={colors.foreground} />
            )}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={isRecording ? "Ascult…" : "Întreabă AI-ul…"}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            multiline
            editable={!isRecording}
            maxLength={2000}
            className="max-h-[120px] flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground"
            style={{ minHeight: 40 }}
          />
          <Pressable
            disabled={!draft.trim() || streaming || transcribing}
            onPress={() => handleSend()}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              draft.trim() && !streaming ? "bg-gold" : "bg-muted"
            }`}
          >
            <Send
              size={18}
              color={
                draft.trim() && !streaming ? colors.background : colors.mutedForeground
              }
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Bubble with markdown render ──────────────────────────────

const markdownStyles = {
  body: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  strong: { color: colors.foreground, fontWeight: "700" as const },
  em: { color: colors.foreground, fontStyle: "italic" as const },
  paragraph: { marginVertical: 4 },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  code_inline: {
    backgroundColor: colors.muted,
    color: colors.gold,
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: "monospace",
  },
  fence: {
    backgroundColor: colors.muted,
    color: colors.foreground,
    padding: 8,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 13,
  },
  link: { color: colors.gold, textDecorationLine: "underline" as const },
  blockquote: {
    backgroundColor: colors.muted,
    borderLeftColor: colors.gold,
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginVertical: 4,
  },
  heading1: { fontSize: 18, fontWeight: "700" as const, marginTop: 8, marginBottom: 4 },
  heading2: { fontSize: 16, fontWeight: "700" as const, marginTop: 6, marginBottom: 4 },
  heading3: { fontSize: 14, fontWeight: "700" as const, marginTop: 4, marginBottom: 2 },
};

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "rounded-br-md bg-gold"
            : "rounded-bl-md border border-border bg-card"
        }`}
      >
        {msg.pending && !msg.content ? (
          <ActivityIndicator size="small" color={colors.gold} />
        ) : isUser ? (
          <Text className="text-[14px] leading-5 text-background">{msg.content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{msg.content}</Markdown>
        )}
      </View>
    </View>
  );
}
