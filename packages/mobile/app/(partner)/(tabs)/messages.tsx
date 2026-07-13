// Partner messages — list of conversations with clients.
//
// We reuse the same /api/v1/conversations endpoint that the client
// side uses. For partners, the avatar shows the CLIENT name (not
// vendor name, because the partner IS the vendor here). The chat
// thread screen at /(client)/chat/[id] auto-detects the user role
// from Clerk and flips the bubble alignment accordingly.

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
  // The client side names this `vendorName`. On the partner side we
  // actually want the CLIENT name — the endpoint returns both, but
  // labels them differently. We'll display whatever name is in the
  // payload's `clientName` or fall back to the `lastMessagePreview`
  // signature.
  clientName?: string;
  vendorName?: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
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
      // MUST pass role=artist — the server defaults to role=client, so without
      // this the partner never sees the conversations clients started with them.
      const res = await api.get<PartnerConversation[]>(
        API_PATHS.conversations,
        { query: { role: "artist" } },
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const handleRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return (
    <SafeScreen padded={false} scroll={false}>
      <View
        className="border-b border-border px-5 pb-3 pt-2"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 20,
          paddingBottom: 12,
          paddingTop: 8,
        }}
      >
        <Text
          className="font-heading text-[24px] font-bold text-foreground"
          style={{ fontFamily: "Cormorant", fontSize: 24, fontWeight: "700", color: colors.foreground }}
        >
          Mesaje
        </Text>
        <Text
          className="mt-1 text-[12px] text-muted-foreground"
          style={{ marginTop: 4, fontSize: 12, color: colors.mutedForeground }}
        >
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
        ItemSeparatorComponent={() => (
          <View
            className="h-px bg-border/40"
            style={{ height: 1, backgroundColor: "rgba(42,42,42,0.4)" }}
          />
        )}
        renderItem={({ item }) => {
          const displayName = item.clientName ?? item.vendorName ?? "Client";
          return (
            <Pressable
              onPress={() => router.push(`/(client)/chat/${item.id}` as never)}
              className="flex-row items-center gap-3 py-3 active:bg-gold/5"
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
            >
              <Avatar uri={null} name={displayName} sizeClass="h-12 w-12" />
              <View className="flex-1" style={{ flex: 1 }}>
                <View
                  className="flex-row items-center justify-between"
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Text
                    className="flex-1 text-[15px] font-semibold text-foreground"
                    numberOfLines={1}
                    style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground }}
                  >
                    {displayName}
                  </Text>
                  <Text
                    className="text-[11px] text-muted-foreground"
                    style={{ fontSize: 11, color: colors.mutedForeground }}
                  >
                    {relativeTimeRO(item.lastMessageAt)}
                  </Text>
                </View>
                <View
                  className="flex-row items-center gap-2"
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    className="flex-1 text-[13px] text-muted-foreground"
                    numberOfLines={1}
                    style={{ flex: 1, fontSize: 13, color: colors.mutedForeground }}
                  >
                    {item.lastMessagePreview ?? "—"}
                  </Text>
                  {item.artistUnread > 0 && (
                    <View
                      className="h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5"
                      style={{
                        height: 20,
                        minWidth: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 9999,
                        backgroundColor: colors.gold,
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text
                        className="text-[11px] font-bold text-background"
                        style={{ fontSize: 11, fontWeight: "700", color: colors.background }}
                      >
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
            <View
              className="items-center gap-3 py-16"
              style={{ alignItems: "center", gap: 12, paddingVertical: 64 }}
            >
              <MessageCircle size={48} color={colors.mutedForeground} />
              <Text
                className="font-heading text-[18px] font-bold text-foreground"
                style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
              >
                Nicio conversație încă
              </Text>
              <Text
                className="max-w-[260px] text-center text-[13px] text-muted-foreground"
                style={{ maxWidth: 260, textAlign: "center", fontSize: 13, color: colors.mutedForeground }}
              >
                Mesajele clienților vor apărea aici imediat ce te contactează.
              </Text>
            </View>
          )
        }
      />
    </SafeScreen>
  );
}
