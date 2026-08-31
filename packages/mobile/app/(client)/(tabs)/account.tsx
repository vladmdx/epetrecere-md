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
  FileText,
  Trash2,
  LogOut,
  Star,
  type LucideIcon,
} from "lucide-react-native";
import { SafeScreen, Avatar } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useLanguagePicker } from "../../../lib/use-language-picker";
import { openExternal, WEB_LINKS } from "../../../lib/links";

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
      <View className="flex-row items-center gap-4 py-4">
        <Avatar
          uri={user?.imageUrl}
          name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "?"}
          sizeClass="h-16 w-16"
          ring="gold"
        />
        <View className="flex-1">
          <Text className="font-heading text-[20px] font-bold text-foreground">
            {user?.firstName ?? "Utilizator"}{" "}
            {user?.lastName ?? ""}
          </Text>
          <Text className="text-[13px] text-muted-foreground">
            {user?.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </View>

      {/* Settings sections */}
      <Section title="Cont">
        <Row
          Icon={User}
          label="Editează profilul"
          onPress={() => router.push("/(client)/settings/profile-edit")}
        />
        <Row
          Icon={Star}
          label="Recenzii date de mine"
          onPress={() => router.push("/(client)/settings/reviews")}
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
          onPress={() => router.push("/(client)/settings/notifications")}
        />
      </Section>

      <Section title="Suport">
        <Row
          Icon={HelpCircle}
          label="Centrul de ajutor"
          onPress={() => openExternal(WEB_LINKS.contact)}
        />
        <Row
          Icon={FileText}
          label="Termeni și condiții"
          onPress={() => openExternal(WEB_LINKS.terms)}
        />
        {/* Split from the terms row it used to share. The label promised a
            privacy policy and opened /termeni; WEB_LINKS.privacy was defined
            and used nowhere. Both stores require the policy to be reachable
            from inside the app, and it has to be the policy. */}
        <Row
          Icon={Shield}
          label="Politica de confidențialitate"
          onPress={() => openExternal(WEB_LINKS.privacy)}
        />
        <Row
          Icon={Trash2}
          label="Șterge contul"
          onPress={() => router.push("/delete-account")}
        />
      </Section>

      <Pressable
        onPress={handleSignOut}
        className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3"
      >
        <LogOut size={18} color={colors.danger} />
        <Text className="text-[14px] font-semibold text-rose-300">
          {t("auth.signOut")}
        </Text>
      </Pressable>

      <Text className="mt-4 text-center text-[11px] text-muted-foreground">
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
    <View className="mt-4">
      <Text className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
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
    >
      <Icon size={18} color={colors.mutedForeground} />
      <Text className="flex-1 text-[14px] text-foreground">{label}</Text>
      {trailing && (
        <Text className="text-[13px] text-muted-foreground">{trailing}</Text>
      )}
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}
