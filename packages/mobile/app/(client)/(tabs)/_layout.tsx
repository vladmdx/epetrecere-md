// Client bottom tabs.
//
// 5 tabs match the iOS standard (more than 5 feels cluttered):
//   Acasă     home + recently viewed + featured
//   Caută     search + filters + map toggle
//   Favorite  saved artists/venues
//   Cabinet   user's events + bookings + checklist
//   Cont      profile + settings + language + sign-out
//
// Visually the gold active indicator is a 4-px tall pill at the top
// of the tab — same style as the web's gold active border, so users
// who switch between web and mobile recognize the affordance.

import { Tabs } from "expo-router";
import { View } from "react-native";
import {
  Home,
  Search,
  Heart,
  CalendarDays,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { colors } from "../../../constants/theme";

export default function ClientTabsLayout() {
  const { t } = useTranslation();

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
            <TabIcon Icon={Home} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("common.search"),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={Search} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favorite",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={Heart} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cabinet"
        options={{
          title: "Cabinet",
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
        name="account"
        options={{
          title: "Cont",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={User} color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

/** Icon + indicator pill stack. We render the pill separately rather
 *  than relying on tabBarIndicatorStyle because expo-router's Tabs
 *  doesn't expose the indicator props consistently across platforms. */
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
