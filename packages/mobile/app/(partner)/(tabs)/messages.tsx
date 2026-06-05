// Partner messages — list of conversations with clients.
//
// We reuse the same /api/v1/conversations endpoint that the client
// side uses, but request it with ?role=vendor so the server returns the
// conversations where this user is the VENDOR (their artist + venue
// inboxes) instead of the buyer chats they opened themselves. For
// partners, the avatar shows the CLIENT name (not vendor name, because
// the partner IS the vendor here). The chat thread screen at
// /(client)/chat/[id] auto-detects the user role from Clerk and flips
// the bubble alignment accordingly.

import { useCallback } from "react";
import { View, Text, Pressable, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { MessageCircle } from "lucide-react-native";
import { SafeScreen, Avatar } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { relativeTimeRO, initials as toInitials } from "@epetrecere/shared/utils";

interface PartnerConversation {
  id: number;
  // Fetched with ?role=vendor, so each row carries the CLIENT name
  // (the buyer who opened the chat) in `clientName`. The client-role
  // payload would instead label the other party `vendorName`; we keep
  // that field optional purely as a defensive fallback for display.
  clientName?: string;
  vendorName?: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  // Vendor-side unread counter — incremented when the client sends a
  // message the partner hasn't read yet.
  artistUnread: number;
  clientUnread: number;
}

export default function PartnerMessagesScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();

  const query = useQuery({
    queryKey: ["partner-conversations"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      // The partner inbox must list conversations where the signed-in
      // user is the VENDOR (artist and/or venue), not the buyer chats
      // they opened themselves. The endpoint defaults role to "client"
      // when no param is sent, so we explicitly request role=vendor —
      // that branch merges the user's artist + venue conversations and
      // returns `clientName` / `artistUnread`, which is what this screen
      // renders.
      const res = await api.get<PartnerConversation[]>(API_PATHS.conversations, {
        query: { role: "vendor" },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const handleRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return (
    <SafeScreen padded={false} scroll={false}>
      <View className="border-b border-border px-5 pb-3 pt-2">
        <Text className="font-heading text-[24px] font-bold text-foreground">
          Mesaje
        </Text>
        <Text className="mt-1 text-[12px] text-muted-foreground">
          {(query.data ?? []).length} conversații
        </Text>
      </View>

      <FlatList
        data={query.data ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        ItemSeparatorComponent={() => <View className="h-px bg-border/40" />}
        renderItem={({ item }) => {
          const displayName = item.clientName ?? item.vendorName ?? "Client";
          return (
            <Pressable
              onPress={() => router.push(`/(client)/chat/${item.id}` as never)}
              className="flex-row items-center gap-3 py-3 active:bg-gold/5"
            >
              <Avatar uri={null} name={displayName} sizeClass="h-12 w-12" />
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text
                    className="flex-1 text-[15px] font-semibold text-foreground"
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {relativeTimeRO(item.lastMessageAt)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text
                    className="flex-1 text-[13px] text-muted-foreground"
                    numberOfLines={1}
                  >
                    {item.lastMessagePreview ?? "—"}
                  </Text>
                  {item.artistUnread > 0 && (
                    <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5">
                      <Text className="text-[11px] font-bold text-background">
                        {item.artistUnread}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          query.isLoading ? null : (
            <View className="items-center gap-3 py-16">
              <MessageCircle size={48} color={colors.mutedForeground} />
              <Text className="font-heading text-[18px] font-bold text-foreground">
                Nicio conversație încă
              </Text>
              <Text className="max-w-[260px] text-center text-[13px] text-muted-foreground">
                Mesajele clienților vor apărea aici imediat ce te contactează.
              </Text>
            </View>
          )
        }
      />
    </SafeScreen>
  );
}
