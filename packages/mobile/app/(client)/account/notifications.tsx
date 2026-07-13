// Notifications inbox — lists the signed-in user's notifications
// (GET /notifications → { items, unreadCount }). Tapping a row with an
// actionUrl deep-routes into the app; otherwise it's informational.

import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell } from "lucide-react-native";
import { SafeScreen, Card } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { relativeTimeRO } from "@epetrecere/shared/utils";

interface Notif {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const api = useApi();

  const q = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: async () => {
      const res = await api.get<{ items: Notif[]; unreadCount: number }>(
        "/notifications",
        { query: { limit: 50 } },
      );
      return res.data ?? { items: [], unreadCount: 0 };
    },
  });

  const items = q.data?.items ?? [];

  return (
    <SafeScreen padded scroll={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 8,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>
          Notificări
        </Text>
      </View>

      {q.isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : items.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingBottom: 80,
          }}
        >
          <Bell size={40} color={colors.mutedForeground} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
            Nicio notificare
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
            Aici vor apărea actualizările despre rezervările și mesajele tale.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 10, paddingTop: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.gold}
            />
          }
        >
          {items.map((n) => (
            <Card key={n.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {!n.isRead && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.gold,
                    }}
                  />
                )}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: n.isRead ? "600" : "700",
                    color: colors.foreground,
                  }}
                >
                  {n.title}
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                {n.message}
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                {relativeTimeRO(n.createdAt)}
              </Text>
            </Card>
          ))}
        </ScrollView>
      )}
    </SafeScreen>
  );
}
