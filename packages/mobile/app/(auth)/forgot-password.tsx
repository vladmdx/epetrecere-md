// Forgot-password — two steps:
//   1. enter email → Clerk sends a reset code
//   2. enter code + new password → reset complete → /

import { useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import { Button, Input, SafeScreen } from "../../components/ui";
import { colors } from "../../constants/theme";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest() {
    if (!isLoaded || !signIn) return;
    setError(null);
    if (!email.includes("@")) {
      setError(t("errors.invalidEmail"));
      return;
    }
    setSubmitting(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setStep("reset");
    } catch (err: unknown) {
      setError(
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
          t("errors.generic"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!isLoaded || !signIn) return;
    setError(null);
    if (newPassword.length < 8) {
      setError(t("errors.passwordTooShort"));
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      }
    } catch (err: unknown) {
      setError(
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
          t("errors.generic"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeScreen padded keyboardAvoiding>
      <View style={{ gap: 20, paddingTop: 20, paddingBottom: 24 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}>
            {t("auth.forgotTitle")}
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
            {step === "request"
              ? t("auth.forgotSubtitle")
              : `Cod trimis la ${email}. Introdu-l mai jos cu parola nouă.`}
          </Text>
        </View>

        {step === "request" ? (
          <>
            <Input
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              error={error}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Button onPress={handleRequest} loading={submitting} fullWidth size="lg">
              {t("auth.sendResetCode")}
            </Button>
          </>
        ) : (
          <>
            <Input
              label={t("auth.enterCode")}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
            />
            <Input
              label={t("auth.newPassword")}
              value={newPassword}
              onChangeText={setNewPassword}
              error={error}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            <Button onPress={handleReset} loading={submitting} fullWidth size="lg">
              {t("auth.resetPassword")}
            </Button>
          </>
        )}

        <Button variant="ghost" onPress={() => router.back()} fullWidth size="md">
          {t("common.back")}
        </Button>
      </View>
    </SafeScreen>
  );
}
