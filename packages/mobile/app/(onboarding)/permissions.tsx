// Onboarding step 2: permissions request.
//
// We ask for notifications + location + camera in one screen because
// (1) it gives the user context (why we need each) and (2) it reduces
// permission fatigue — three back-to-back system dialogs spread across
// the app feel intrusive.
//
// Important: we do NOT request push permission here on iOS without
// the system dialog — that would be a "ghost" deny we couldn't recover
// from. Instead this screen shows our explanatory copy, then the user
// taps "Permite" which triggers the native dialog. If they decline,
// they can still continue; we just stash that fact and never re-prompt.

import { useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { Bell, MapPin, type LucideIcon } from "lucide-react-native";
import { Button, Card, SafeScreen } from "../../components/ui";
import { colors } from "../../constants/theme";

// Camera permission is intentionally NOT requested here — Expo-camera
// v16 removed the static request method, and iOS shows its own modal
// the first time the user opens the QR scanner anyway. Asking it here
// would only fire on Android and create asymmetric UX.

type Permission = "notifications" | "location";
type Status = "idle" | "granted" | "denied";

export default function OnboardingPermissions() {
  const { t } = useTranslation();
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<Permission, Status>>({
    notifications: "idle",
    location: "idle",
  });
  const [busy, setBusy] = useState<Permission | null>(null);

  async function request(p: Permission) {
    setBusy(p);
    try {
      let granted = false;
      if (p === "notifications") {
        const res = await Notifications.requestPermissionsAsync();
        granted = res.granted || res.status === "granted";
      } else if (p === "location") {
        const res = await Location.requestForegroundPermissionsAsync();
        granted = res.granted;
      }
      setStatuses((s) => ({ ...s, [p]: granted ? "granted" : "denied" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeScreen padded>
      <View className="gap-6 py-8" style={{ gap: 24, paddingVertical: 32 }}>
        <View className="gap-2" style={{ gap: 8 }}>
          <Text
            className="font-heading text-[28px] font-bold text-foreground"
            style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}
          >
            {t("onboarding.permissionsTitle")}
          </Text>
          <Text
            className="text-[14px] text-muted-foreground"
            style={{ fontSize: 14, color: colors.mutedForeground }}
          >
            {t("onboarding.permissionsBody")}
          </Text>
        </View>

        <View className="gap-3" style={{ gap: 12 }}>
          <PermissionRow
            Icon={Bell}
            title={t("onboarding.permissionNotifications")}
            description={t("onboarding.permissionNotificationsDesc")}
            status={statuses.notifications}
            busy={busy === "notifications"}
            onGrant={() => request("notifications")}
            t={t}
          />
          <PermissionRow
            Icon={MapPin}
            title={t("onboarding.permissionLocation")}
            description={t("onboarding.permissionLocationDesc")}
            status={statuses.location}
            busy={busy === "location"}
            onGrant={() => request("location")}
            t={t}
          />
        </View>

        <View className="flex-1" style={{ flex: 1 }} />

        <Button
          onPress={() => router.replace("/(onboarding)/role-picker")}
          fullWidth
          size="lg"
        >
          {t("common.continue")}
        </Button>
      </View>
    </SafeScreen>
  );
}

function PermissionRow({
  Icon,
  title,
  description,
  status,
  busy,
  onGrant,
  t,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  status: Status;
  busy: boolean;
  onGrant: () => void;
  t: (k: string) => string;
}) {
  const granted = status === "granted";
  return (
    <Card>
      <View
        className="flex-row items-start gap-3"
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-xl bg-gold/15"
          style={{
            height: 44,
            width: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            backgroundColor: "rgba(201,168,76,0.15)",
          }}
        >
          <Icon size={22} color={colors.gold} />
        </View>
        <View className="flex-1" style={{ flex: 1 }}>
          <Text
            className="text-[15px] font-semibold text-foreground"
            style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}
          >
            {title}
          </Text>
          <Text
            className="mt-0.5 text-[13px] leading-5 text-muted-foreground"
            style={{ marginTop: 2, fontSize: 13, lineHeight: 20, color: colors.mutedForeground }}
          >
            {description}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row gap-2" style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
        {granted ? (
          <Button variant="ghost" size="sm" onPress={() => {}} disabled>
            ✓ {t("common.done")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onPress={onGrant}
            loading={busy}
          >
            {t("onboarding.grant")}
          </Button>
        )}
      </View>
    </Card>
  );
}
