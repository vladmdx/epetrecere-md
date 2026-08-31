import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../constants/theme";
import { ApiError } from "../../lib/api";

/**
 * What a screen shows when a read fails.
 *
 * Until now nothing did: the API client never threw, so React Query resolved
 * successfully with `data: null`, and the usual guard
 * `if (isLoading || !data) return <Spinner/>` stayed true forever. Seven detail
 * screens span indefinitely on any failure — a dead network and a deleted
 * record looked exactly alike, and both looked like slowness.
 *
 * Styling is inline rather than by className. That was a workaround for an old
 * css-interop version and may no longer be required, but this component is on
 * the path every failure takes, so it is the wrong place to find out.
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
  full = true,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  full?: boolean;
}) {
  const api = error instanceof ApiError ? error : null;

  // A signed-out session and a missing record need different words: one is
  // fixed by signing in, the other cannot be fixed by retrying at all.
  const title = api?.isAuth
    ? "Sesiunea a expirat"
    : api?.status === 404
      ? "Nu am găsit ce căutai"
      : api?.status === 0
        ? "Fără conexiune"
        : "Ceva nu a mers";

  const detail =
    api?.message ??
    (error instanceof Error ? error.message : "Încearcă din nou peste puțin.");

  const canRetry = !!onRetry && api?.status !== 404;

  const body = (
    <View
      style={{
        flex: full ? 1 : undefined,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        paddingVertical: full ? 0 : 40,
        gap: 10,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontSize: 17,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.mutedForeground,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
        }}
      >
        {detail}
      </Text>
      {canRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Încearcă din nou"
          disabled={retrying}
          style={({ pressed }) => ({
            marginTop: 8,
            paddingHorizontal: 20,
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.gold,
            opacity: pressed || retrying ? 0.6 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          })}
        >
          {retrying && <ActivityIndicator size="small" color={colors.gold} />}
          <Text style={{ color: colors.gold, fontSize: 15, fontWeight: "600" }}>
            {retrying ? "Se încarcă…" : "Încearcă din nou"}
          </Text>
        </Pressable>
      )}
    </View>
  );

  if (!full) return body;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {body}
    </SafeAreaView>
  );
}
