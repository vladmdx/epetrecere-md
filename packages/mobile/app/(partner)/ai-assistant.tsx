// AI Assistant — chat with Claude for partner queries.
//
// Same inverted-FlatList bubble pattern as the human chat thread,
// but messages persist only in-memory (no server-side conversations
// table for AI chat yet). The POST /api/v1/ai/chat endpoint is
// stateless — we send the full message history each time.

import { useState, useRef } from "react";
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
import { useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Send, Sparkles, Bot } from "lucide-react-native";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

const SUGGESTED_PROMPTS = [
  "Câte cereri am primit săptămâna asta?",
  "Sfaturi pentru a primi mai multe rezervări",
  "Cum optimizez profilul pentru a urca în topul artiștilor?",
  "Cum răspund la o cerere cu un buget prea mic?",
];

export default function AIAssistantScreen() {
  const router = useRouter();
  const api = useApi();
  const inputRef = useRef<TextInput>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      content:
        "Salut! Sunt asistentul tău AI. Te pot ajuta cu sfaturi de marketing, răspunsuri la cereri, optimizarea profilului. Întreabă-mă orice.",
    },
  ]);
  const [draft, setDraft] = useState("");

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post<{ reply: string }>("/ai/chat", {
        messages: [...messages.filter((m) => !m.pending), { role: "user", content }].map(
          (m) => ({ role: m.role, content: m.content }),
        ),
        context: "partner_assistant",
      });
      if (!res.ok) throw new Error(res.error?.message ?? "ai_failed");
      return res.data;
    },
    onSuccess: (data, content) => {
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        {
          id: Date.now() + 1,
          role: "assistant",
          content: data?.reply ?? "(răspuns gol)",
        },
      ]);
    },
    onError: () => {
      setMessages((prev) =>
        prev.map((m) =>
          m.pending
            ? {
                ...m,
                pending: false,
                content: m.content + "\n\n(Eroare — încearcă din nou.)",
              }
            : m,
        ),
      );
    },
  });

  function handleSend(text?: string) {
    const content = (text ?? draft).trim();
    if (!content) return;
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content,
    };
    const placeholder: Message = {
      id: Date.now() + 0.5,
      role: "assistant",
      content: "…",
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setDraft("");
    Keyboard.dismiss();
    sendMutation.mutate(content);
  }

  // Inverted list needs reversed data
  const reversed = [...messages].reverse();

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
              Sfaturi & răspunsuri rapide
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={reversed}
        keyExtractor={(m) => String(m.id)}
        inverted
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => <Bubble msg={item} />}
        ListFooterComponent={
          // Reversed = footer is at the visual top → suggestions row
          messages.length <= 1 ? (
            <View className="gap-2 pb-4">
              <View className="flex-row items-center gap-2 pb-1">
                <Sparkles size={12} color={colors.gold} />
                <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Sugestii
                </Text>
              </View>
              {SUGGESTED_PROMPTS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => handleSend(p)}
                  className="rounded-xl border border-border bg-card px-4 py-3 active:bg-gold/5"
                >
                  <Text className="text-[14px] text-foreground">{p}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />

      <SafeAreaView edges={["bottom"]}>
        <View className="flex-row items-end gap-2 border-t border-border bg-background px-3 py-2">
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Întreabă AI-ul…"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            multiline
            maxLength={2000}
            className="max-h-[120px] flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground"
            style={{ minHeight: 40 }}
          />
          <Pressable
            disabled={!draft.trim() || sendMutation.isPending}
            onPress={() => handleSend()}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              draft.trim() ? "bg-gold" : "bg-muted"
            }`}
          >
            <Send size={18} color={draft.trim() ? colors.background : colors.mutedForeground} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "rounded-br-md bg-gold"
            : "rounded-bl-md border border-border bg-card"
        }`}
      >
        {msg.pending ? (
          <ActivityIndicator size="small" color={colors.gold} />
        ) : (
          <Text
            className={`text-[14px] leading-5 ${
              isUser ? "text-background" : "text-foreground"
            }`}
          >
            {msg.content}
          </Text>
        )}
      </View>
    </View>
  );
}
