// Chat list — all conversations the user has open with vendors.
// Sorted by lastMessageAt desc; unread count badge on the right.

import { useCallback } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { ArrowLeft, MessageCircle } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { relativeTimeRO } from "@epetrecere/shared/utils";

interface Conversation {
  id: number;
  vendorName: string | null;
  vendorSlug: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
}

export default function ChatListScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();

  const conversationsQuery = useQuery({
    queryKey: ["my", "conversations"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<Conversation[]>(API_PATHS.conversations);
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const handleRefresh = useCallback(() => {
    void conversationsQuery.refetch();
  }, [conversationsQuery]);

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
          <Text className="font-heading text-[20px] font-bold text-foreground">
            Mesaje
          </Text>
        </View>
      </SafeAreaView>

      <FlatList
        data={conversationsQuery.data ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={conversationsQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        ItemSeparatorComponent={() => (
          <View className="h-px bg-border/40" />
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(client)/chat/${item.id}`)}
            className="flex-row items-center gap-3 py-3 active:bg-gold/5"
          >
            <Avatar
              uri={null}
              name={item.vendorName ?? "?"}
              sizeClass="h-12 w-12"
            />
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text
                  className="flex-1 text-[15px] font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {item.vendorName ?? "Furnizor"}
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
                {item.clientUnread > 0 && (
                  <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5">
                    <Text className="text-[11px] font-bold text-background">
                      {item.clientUnread}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          conversationsQuery.isLoading ? null : (
            <View className="items-center gap-3 py-16">
              <MessageCircle size={48} color={colors.mutedForeground} />
              <Text className="font-heading text-[18px] font-bold text-foreground">
                Niciun mesaj încă
              </Text>
              <Text className="max-w-[260px] text-center text-[13px] text-muted-foreground">
                Deschide o conversație de pe profilul unui artist sau o sală.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
