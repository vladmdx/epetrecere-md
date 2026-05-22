// Partner bottom tabs.
//
// 5 tabs aligned with the most-used partner actions:
//   Acasă     dashboard with KPIs + next event
//   Rezervări inbox of booking requests (most-used screen)
//   Calendar  availability + booked days
//   Mesaje    chat list with clients
//   Profil    profile edit + tarife + financiar + recenzii nav

import { Tabs } from "expo-router";
import { View } from "react-native";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  MessageSquare,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "../../../constants/theme";

export default function PartnerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 8,
          paddingBottom: 24,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Acasă",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={LayoutDashboard} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Rezervări",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={BookOpen} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              Icon={CalendarDays}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Mesaje",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={MessageSquare} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={User} color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  Icon,
  color,
  size,
  focused,
}: {
  Icon: LucideIcon;
  color: string;
  size: number;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 24,
          height: 3,
          borderRadius: 2,
          marginBottom: 4,
          backgroundColor: focused ? colors.gold : "transparent",
        }}
      />
      <Icon size={size - 2} color={color} />
    </View>
  );
}
