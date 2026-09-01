import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { API_PATHS } from "@epetrecere/shared/api";
import { useApi, unwrap } from "../../lib/api";
import { colors } from "../../constants/theme";
import { ErrorState } from "../../components/ui";
import { DocumentReader } from "../../components/legal/DocumentReader";
import { openExternal } from "../../lib/links";

/**
 * The documents this partner has signed, and their signature on them.
 *
 * There was nowhere in the app to see this. A partner registered from the
 * phone, signed a contract, and then had no way back to it — the only legal
 * rows in the profile tab open the generic public terms in a browser, which
 * is not their document.
 *
 * What is shown is the copy frozen on the acceptance, not whatever the
 * published pack says today. Those are different things the moment a
 * document is superseded, which is exactly what replacing the partner
 * agreement with v2.0 did.
 */

interface Acceptance {
  id: number;
  documentSlug: string;
  documentVersion: string;
  documentTitle: string;
  documentTitleStored: string | null;
  documentBlocks: { type: string; text: string }[] | null;
  packVersion: string;
  locale: string;
  signatureName: string;
  acceptedAt: string;
  deviceSummary: string | null;
  ipAddress: string | null;
}

export default function DocumenteSemnateScreen() {
  const router = useRouter();
  const api = useApi();

  const q = useQuery({
    queryKey: ["legal-acceptances"],
    queryFn: async () => {
      const res = await api.get<{ items: Acceptance[] }>(API_PATHS.legalAccept);
      return unwrap(res).items ?? [];
    },
  });

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
            style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            Documente semnate
          </Text>
        </View>
      </SafeAreaView>

      {q.isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : q.isError || !q.data ? (
        <ErrorState
          error={q.error}
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
        />
      ) : q.data.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 14,
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            Nu ai semnat încă niciun document. Apar aici imediat ce îți creezi
            profilul de partener.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
        >
          {q.data.map((a) => (
            <View key={a.id} style={{ gap: 8 }}>
              {a.documentBlocks?.length ? (
                <DocumentReader
                  title={a.documentTitleStored ?? a.documentTitle}
                  version={a.documentVersion}
                  blocks={a.documentBlocks}
                  signature={{
                    name: a.signatureName,
                    date: new Date(a.acceptedAt),
                  }}
                />
              ) : (
                // Signed before the text was kept on the acceptance. Saying so
                // is better than opening today's version as if it were theirs.
                <Pressable
                  onPress={() => openExternal(`/legal/${a.documentSlug}`)}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 14,
                    padding: 14,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: colors.gold, fontSize: 14, fontWeight: "600" }}>
                    {a.documentTitle} · v{a.documentVersion}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                    Semnat înainte ca textul să fie păstrat pe acceptare — se
                    deschide versiunea publicată acum.
                  </Text>
                </Pressable>
              )}
              <Text style={{ color: colors.mutedForeground, fontSize: 11.5, lineHeight: 17 }}>
                Pachet legal v{a.packVersion} · {a.locale.toUpperCase()}
                {a.deviceSummary ? ` · ${a.deviceSummary}` : ""}
                {a.ipAddress ? ` · IP ${a.ipAddress}` : ""}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
