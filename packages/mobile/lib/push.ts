// Push notification registration + handler.
//
// Lifecycle:
//   1. On app start (after Clerk auth), call `registerPushToken()`.
//      Asks for permission (only if not already requested via the
//      onboarding permissions screen), gets the Expo token, POSTs it
//      to /api/v1/push-tokens.
//   2. On notification receive (foreground), display a banner inline
//      via the notification handler set below.
//   3. On notification tap (background or quit), deep-link to the
//      relevant screen based on the notification data payload.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";
import { colors } from "../constants/theme";

// Foreground behaviour: show the banner + play sound. Without this
// notifications are suppressed when the app is open, which is
// confusing ("why didn't I see it?").
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Configure the Android default channel — required for any push to
 *  appear at all on Android 8+. The colour and sound here apply to
 *  every notification we ship unless the payload overrides them. */
export async function configureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "ePetrecere",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.gold,
    sound: "default",
  });
}

interface RegisterOptions {
  apiUrl: string;
  getToken: () => Promise<string | null>;
}

/** Get a push token from Expo and POST it to our backend. Returns
 *  the token (or null on failure). Safe to call repeatedly — the
 *  backend upserts. */
export async function registerPushToken(
  opts: RegisterOptions,
): Promise<string | null> {
  if (!Device.isDevice) {
    // Push doesn't work on simulator. Don't pester.
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    finalStatus = requested;
  }
  if (finalStatus !== "granted") return null;

  // Expo's getExpoPushTokenAsync needs the projectId from app config.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    // Dev build without EAS — happens until `eas init` is run. Skip.
    return null;
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  const expoToken = tokenResult.data;

  try {
    const authToken = await opts.getToken();
    if (!authToken) return expoToken;
    await fetch(`${opts.apiUrl}/push-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        expoToken,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceLabel: Device.modelName ?? undefined,
      }),
    });
  } catch {
    // Network failure — try again next app start.
  }

  return expoToken;
}

/** Wire up the tap → deep-link bridge. Returns a cleanup function;
 *  call it on unmount to avoid double-handlers when Fast Refresh
 *  swaps the module. */
export function listenForNotificationTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | { kind?: string; id?: number }
        | undefined;
      if (!data) return;

      // Payload contract — keep in sync with the server-side push
      // sender. Add new kinds here as we wire more events.
      switch (data.kind) {
        case "booking_new":
          // Partner bookings live under the (tabs) group.
          router.push(`/(partner)/(tabs)/bookings?expand=${data.id}`);
          break;
        case "booking_accepted":
          // Client bookings is a stack screen (not a tab): (client)/bookings.
          router.push(`/(client)/bookings?expand=${data.id}`);
          break;
        case "message_new":
          // Shared chat detail screen — used by both client and partner.
          router.push(`/(client)/chat/${data.id}`);
          break;
        default:
          router.push("/");
      }
    },
  );
  return () => sub.remove();
}
