// Account tab — profile + settings + language + sign out.
//
// Sectioned list of options. Each row has an icon, label, optional
// trailing value, and chevron. Same pattern as iOS Settings.app.

import { View, Text, Pressable, Alert } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  User,
  Bell,
  Globe,
  HelpCircle,
  Shield,
  LogOut,
  Star,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react-native";
import { SafeScreen, Avatar } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useLanguagePicker } from "../../../lib/use-language-picker";

export default function AccountTab() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const openLanguagePicker = useLanguagePicker();

  async function handleSignOut() {
    Alert.alert(t("auth.signOut"), "Sigur vrei să ieși?", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("auth.signOut"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  }

  const langLabel: Record<string, string> = {
    ro: "Română",
    ru: "Русский",
    en: "English",
  };

  return (
    <SafeScreen padded>
      {/* Profile header */}
      <View
        className="flex-row items-center gap-4 py-4"
        style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 16 }}
      >
        <Avatar
          uri={user?.imageUrl}
          name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "?"}
          sizeClass="h-16 w-16"
          ring="gold"
        />
        <View className="flex-1" style={{ flex: 1 }}>
          <Text
            className="font-heading text-[20px] font-bold text-foreground"
            style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}
          >
            {user?.firstName ?? "Utilizator"}{" "}
            {user?.lastName ?? ""}
          </Text>
          <Text
            className="text-[13px] text-muted-foreground"
            style={{ fontSize: 13, color: colors.mutedForeground }}
          >
            {user?.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </View>

      {/* Settings sections */}
      <Section title="Cont">
        <Row
          Icon={CalendarCheck}
          label="Rezervările mele"
          onPress={() => router.push("/(client)/bookings")}
        />
        <Row
          Icon={User}
          label="Editează profilul"
          onPress={() => router.push("/(client)/account/profile-edit")}
        />
        <Row
          Icon={Star}
          label="Recenzii date de mine"
          onPress={() => router.push("/(client)/account/reviews")}
        />
      </Section>

      <Section title="Preferințe">
        <Row
          Icon={Globe}
          label="Limbă"
          trailing={langLabel[i18n.language] ?? "Română"}
          onPress={openLanguagePicker}
        />
        <Row
          Icon={Bell}
          label="Notificări"
          onPress={() => router.push("/(client)/account/notifications")}
        />
      </Section>

      <Section title="Suport">
        <Row
          Icon={HelpCircle}
          label="Centrul de ajutor"
          onPress={() => {}}
        />
        <Row
          Icon={Shield}
          label="Termeni & Confidențialitate"
          onPress={() => {}}
        />
      </Section>

      <Pressable
        onPress={handleSignOut}
        className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3"
        style={{
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(244,63,94,0.3)",
          backgroundColor: "rgba(244,63,94,0.1)",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <LogOut size={18} color={colors.danger} />
        <Text
          className="text-[14px] font-semibold text-rose-300"
          style={{ fontSize: 14, fontWeight: "600", color: "#FB7185" }}
        >
          {t("auth.signOut")}
        </Text>
      </Pressable>

      <Text
        className="mt-4 text-center text-[11px] text-muted-foreground"
        style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: colors.mutedForeground }}
      >
        ePetrecere v0.1.0 (M2)
      </Text>
    </SafeScreen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4" style={{ marginTop: 16 }}>
      <Text
        className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
        style={{
          marginBottom: 8,
          fontSize: 11,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 2,
          color: colors.mutedForeground,
        }}
      >
        {title}
      </Text>
      <View
        className="overflow-hidden rounded-2xl border border-border bg-card"
        style={{
          overflow: "hidden",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  Icon,
  label,
  trailing,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  trailing?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 active:bg-gold/5"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed ? "rgba(201,168,76,0.05)" : "transparent",
      })}
    >
      <Icon size={18} color={colors.mutedForeground} />
      <Text
        className="flex-1 text-[14px] text-foreground"
        style={{ flex: 1, fontSize: 14, color: colors.foreground }}
      >
        {label}
      </Text>
      {trailing && (
        <Text
          className="text-[13px] text-muted-foreground"
          style={{ fontSize: 13, color: colors.mutedForeground }}
        >
          {trailing}
        </Text>
      )}
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}
