import { useState } from "react";
import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TriangleAlert, Download } from "lucide-react-native";
import { API_PATHS } from "@epetrecere/shared/api";
import { useApi } from "../lib/api";
import { colors } from "../constants/theme";
import { Button, Input } from "../components/ui";
import { openExternal, WEB_BASE } from "../lib/links";

/**
 * Deleting your account, from inside the app.
 *
 * App Store 5.1.1(v) and Google Play both require this of any app that
 * creates accounts, and both account screens stopped at "sign out" — the only
 * way to be erased was to email support, which is precisely what the rule
 * exists to end. It is also the app's half of GDPR Art. 17, which the website
 * has honoured since M11.
 *
 * A root-level route rather than one screen per role: the flow is identical
 * for a client and a partner, and the root Stack declares no explicit
 * children, so a file here is registered automatically and cannot hit the
 * unmatched-route trap that a group route would.
 */

/** Typed to confirm. Same word the website asks for, so support can describe
 *  one procedure rather than two. */
const CONFIRM_WORD = "ȘTERGE";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const { signOut } = useAuth();

  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function doDelete() {
    setBusy(true);
    try {
      const res = await api.delete(API_PATHS.deleteAccount);
      if (!res.ok) {
        Alert.alert(
          "Contul nu a putut fi șters",
          res.error?.message ??
            "Încearcă din nou. Dacă problema persistă, scrie-ne la privacy@epetrecere.md.",
        );
        return;
      }

      // The React Query cache is persisted to disk, so without this the next
      // person to sign in on this device would open the app onto the deleted
      // user's bookings and messages.
      qc.clear();

      // The account is already gone server-side; a failed sign-out must not
      // strand the user on a screen for an account that no longer exists.
      await signOut().catch(() => {});
      router.replace("/(auth)/sign-in");
    } finally {
      setBusy(false);
    }
  }

  function confirmThenDelete() {
    Alert.alert(
      "Ștergi contul definitiv?",
      "Această acțiune nu poate fi anulată.",
      [
        { text: "Renunț", style: "cancel" },
        { text: "Șterge contul", style: "destructive", onPress: doDelete },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text
            style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}
          >
            Șterge contul
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 40,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.danger,
            backgroundColor: colors.danger + "12",
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TriangleAlert size={18} color={colors.danger} />
            <Text
              style={{ color: colors.danger, fontSize: 15, fontWeight: "700" }}
            >
              Ce se șterge definitiv
            </Text>
          </View>
          {[
            "Contul și datele tale de profil",
            "Planurile de eveniment, invitații și listele de invitați",
            "Conversațiile și mesajele tale",
            "Fotografiile încărcate",
          ].map((line) => (
            <Text
              key={line}
              style={{ color: colors.foreground, fontSize: 13.5, lineHeight: 20 }}
            >
              •  {line}
            </Text>
          ))}
        </View>

        {/* Said plainly rather than buried, because a person deleting an
            account deserves to know what does not disappear with it. */}
        <View style={{ gap: 8 }}>
          <Text
            style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}
          >
            Ce rămâne
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            Recenziile pe care le-ai scris rămân publicate, sub numele cu care
            le-ai semnat — o notă nu poate fi ștearsă închizând contul.
            Contractele semnate ca partener se păstrează ca dovadă legală, iar
            profilul tău public, dacă ai unul, este scos imediat de pe site.
          </Text>
        </View>

        <Pressable
          onPress={() => openExternal(`${WEB_BASE}/cabinet/date`)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 13,
          }}
        >
          <Download size={18} color={colors.gold} />
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 14 }}>
            Descarcă-ți întâi datele
          </Text>
        </Pressable>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            Scrie {CONFIRM_WORD} mai jos ca să confirmi.
          </Text>
          <Input
            label="Confirmare"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        <Button
          onPress={confirmThenDelete}
          disabled={!matches}
          loading={busy}
          variant="danger"
          fullWidth
          size="lg"
        >
          Șterge contul definitiv
        </Button>

        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 12.5,
            textAlign: "center",
            lineHeight: 18,
          }}
        >
          Întrebări? privacy@epetrecere.md
        </Text>
      </ScrollView>
    </View>
  );
}
