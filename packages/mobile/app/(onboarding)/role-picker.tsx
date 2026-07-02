// Onboarding step 3: client or artist?
//
// This is the last step before the user lands on a real screen. The
// pick determines which tab bar they see (client vs partner) and gets
// persisted server-side via /api/v1/me/role-preference.

import { useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import * as SecureStore from "expo-secure-store";
import { Calendar, Briefcase, type LucideIcon } from "lucide-react-native";
import { Button, Card, SafeScreen } from "../../components/ui";
import { colors } from "../../constants/theme";
import { cn } from "../../lib/cn";

type Role = "client" | "artist";

export default function OnboardingRolePicker() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    if (!role) return;
    setSubmitting(true);
    try {
      // Cache locally so the next cold start lands on the right tab
      // immediately, even before the role API resolves.
      await SecureStore.setItemAsync(
        "epetrecere.role.v1",
        role === "artist" ? "partner" : "client",
      );
      // Persist server-side. For artists this kicks off the
      // dashboard-pending state until they finish profile creation.
      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
      await fetch(`${apiUrl}/me/role-preference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: role === "artist" ? "artist" : "user" }),
      }).catch(() => {
        // Network failure — the local cache is enough to land the
        // user; we'll retry the server update on next focus.
      });

      if (role === "artist") {
        // Artists land on the partner tab bar; its home tab surfaces the
        // "complete your profile" CTA until the artist row exists.
        router.replace("/(partner)/(tabs)");
      } else {
        router.replace("/(client)/(tabs)");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeScreen padded>
      <View className="flex-1 gap-6 py-8">
        <View className="gap-2">
          <Text className="font-heading text-[28px] font-bold text-foreground">
            {t("onboarding.rolePickerTitle")}
          </Text>
          <Text className="text-[14px] text-muted-foreground">
            {t("onboarding.rolePickerBody")}
          </Text>
        </View>

        <View className="gap-3">
          <RoleOption
            Icon={Calendar}
            title={t("onboarding.roleClient")}
            description={t("onboarding.roleClientDesc")}
            selected={role === "client"}
            onPress={() => setRole("client")}
          />
          <RoleOption
            Icon={Briefcase}
            title={t("onboarding.roleArtist")}
            description={t("onboarding.roleArtistDesc")}
            selected={role === "artist"}
            onPress={() => setRole("artist")}
          />
        </View>

        <View className="flex-1" />

        <Button
          onPress={handleContinue}
          loading={submitting}
          disabled={!role}
          fullWidth
          size="lg"
        >
          {t("onboarding.getStarted")}
        </Button>
      </View>
    </SafeScreen>
  );
}

function RoleOption({
  Icon,
  title,
  description,
  selected,
  onPress,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} className={cn(selected && "border-gold")}>
      <View className="flex-row items-start gap-3">
        <View
          className={cn(
            "h-11 w-11 items-center justify-center rounded-xl",
            selected ? "bg-gold/30" : "bg-muted",
          )}
        >
          <Icon size={22} color={selected ? colors.gold : colors.mutedForeground} />
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-semibold text-foreground">
            {title}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {description}
          </Text>
        </View>
        {selected && (
          <View className="h-6 w-6 items-center justify-center rounded-full bg-gold">
            <Text className="text-[12px] font-bold text-background">✓</Text>
          </View>
        )}
      </View>
    </Card>
  );
}
