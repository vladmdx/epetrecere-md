// Partner profile tab — entry point to all partner management
// screens. Sectioned settings-style list with avatar at the top.

import { View, Text, Pressable, Alert } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  User,
  Clock,
  DollarSign,
  Star,
  Bot,
  Bell,
  Globe,
  HelpCircle,
  Shield,
  FileText,
  Trash2,
  LogOut,
  ExternalLink,
  type LucideIcon,
} from "lucide-react-native";
import { SafeScreen, Avatar, Badge } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { useLanguagePicker } from "../../../lib/use-language-picker";
import { openExternal, WEB_LINKS } from "../../../lib/links";

interface ArtistProfile {
  id: number;
  nameRo: string;
  slug: string;
  photoUrl: string | null;
  isPremium: boolean;
  isVerified: boolean;
}

export default function PartnerProfileTab() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const api = useApi();
  const openLanguagePicker = useLanguagePicker();

  const artistQuery = useQuery({
    queryKey: ["my-artist"],
    queryFn: async () => {
      const res = await api.get<{ artist: ArtistProfile | null }>(
        API_PATHS.myArtist,
      );
      return res.data?.artist ?? null;
    },
  });
  const artist = artistQuery.data;

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
      {/* Artist card */}
      <View className="flex-row items-center gap-4 py-4">
        <Avatar
          uri={artist?.photoUrl ?? null}
          name={artist?.nameRo ?? user?.firstName ?? "?"}
          sizeClass="h-16 w-16"
          ring={artist?.isPremium ? "gold" : "none"}
        />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 font-heading text-[20px] font-bold text-foreground">
              {artist?.nameRo ?? "Partener"}
            </Text>
            {artist?.isPremium && (
              <Badge tone="gold" size="sm">
                Premium
              </Badge>
            )}
          </View>
          <Text className="text-[13px] text-muted-foreground">
            {user?.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </View>

      {/* Partner sections */}
      <Section title="Profilul tău">
        <Row
          Icon={User}
          label="Editează profilul"
          onPress={() => router.push("/(partner)/profile/edit")}
        />
        <Row
          Icon={Clock}
          label="Tarife & pachete"
          onPress={() => router.push("/(partner)/profile/edit?section=tarife" as never)}
        />
        <Row
          Icon={ExternalLink}
          label="Vezi profilul public"
          onPress={() =>
            artist?.slug
              ? openExternal(WEB_LINKS.artist(artist.slug))
              : Alert.alert(
                  "Profil indisponibil",
                  "Completează-ți profilul înainte să-l poți vedea public.",
                )
          }
        />
      </Section>

      <Section title="Activitate">
        <Row
          Icon={DollarSign}
          label="Financiar"
          onPress={() => router.push("/(partner)/financiar" as never)}
        />
        <Row
          Icon={Star}
          label="Recenzii"
          onPress={() => router.push("/(partner)/recenzii" as never)}
        />
        <Row
          Icon={Bot}
          label="AI Assistant"
          onPress={() => router.push("/(partner)/ai-assistant" as never)}
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
          onPress={() => router.push("/(partner)/profile/edit?section=notifications" as never)}
        />
      </Section>

      <Section title="Suport">
        <Row
          Icon={HelpCircle}
          label="Centrul de ajutor"
          onPress={() => openExternal(WEB_LINKS.contact)}
        />
        {/* Their own signed contract, not the generic published terms. */}
        <Row
          Icon={FileText}
          label="Documente semnate"
          onPress={() => router.push("/(partner)/documente")}
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
        ePetrecere Partener v0.1.0 (M4)
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
