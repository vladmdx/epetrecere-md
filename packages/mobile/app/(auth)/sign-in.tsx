// Sign-in screen.
//
// Auth strategies (must match the website, which is PASSWORDLESS):
//   1. Email + one-time code (OTP) — primary. Accounts created on the site
//      have no password, so sign-in emails a 6-digit code and verifies it.
//   2. Google OAuth — one tap, dominant for the Moldovan market.
//   3. Apple OAuth — iOS only (App Store requirement alongside Google).
//
// Two steps on the same screen: enter email → enter the emailed code. Errors
// surface inline (red text under the field), never in alert() dialogs.

import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { Lock, Apple } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { Button, Input, SafeScreen } from "../../components/ui";
import { colors } from "../../constants/theme";

// Required on iOS for the OAuth browser dismissal to work correctly.
// Safe to call multiple times — Expo dedupes internally.
WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const googleOAuth = useOAuth({ strategy: "oauth_google" });
  const appleOAuth = useOAuth({ strategy: "oauth_apple" });

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — look the user up by email and send them a one-time code.
  async function handleSendCode() {
    if (!isLoaded || !signIn) return;
    setEmailError(null);
    setGeneralError(null);

    if (!email.includes("@")) {
      setEmailError(t("errors.invalidEmail"));
      return;
    }

    setSubmitting(true);
    try {
      const attempt = await signIn.create({ identifier: email.trim() });
      const emailFactor = (attempt.supportedFirstFactors ?? []).find(
        (ff) => ff.strategy === "email_code",
      );
      if (!emailFactor || !("emailAddressId" in emailFactor)) {
        setGeneralError(t("errors.generic"));
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
      setStep("code");
    } catch (err: unknown) {
      const code = (err as { errors?: { code?: string }[] })?.errors?.[0]?.code;
      if (code === "form_identifier_not_found") {
        setEmailError(t("errors.noAccountEmail"));
      } else {
        const msg =
          (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
          t("errors.generic");
        setGeneralError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2 — verify the code and open the session.
  async function handleVerifyCode() {
    if (!isLoaded || !signIn) return;
    setCodeError(null);
    setGeneralError(null);

    if (code.length !== 6) {
      setCodeError(t("errors.codeLength"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setGeneralError(t("errors.generic"));
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        t("errors.generic");
      setCodeError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Shared OAuth runner — Clerk's browser flow both signs in and, for a new
  // Apple/Google account, signs up. Same redirect scheme for every provider.
  async function runOAuth(
    startOAuthFlow: (typeof googleOAuth)["startOAuthFlow"],
  ) {
    setGeneralError(null);
    setSubmitting(true);
    try {
      const result = await startOAuthFlow({
        redirectUrl: "epetrecere://oauth-callback",
      });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        router.replace("/");
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        t("errors.generic");
      setGeneralError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const handleGoogleSignIn = () => runOAuth(googleOAuth.startOAuthFlow);
  const handleAppleSignIn = () => runOAuth(appleOAuth.startOAuthFlow);

  return (
    <SafeScreen padded keyboardAvoiding>
      <View style={{ gap: 24, paddingTop: 20, paddingBottom: 24 }}>
        {/* Brand */}
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 34, fontWeight: "700", color: colors.foreground }}>
            ePetrecere
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
            {t("common.tagline")}
          </Text>
        </View>

        {/* Title */}
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>
            {t("auth.signInTitle")}
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
            {step === "email"
              ? t("auth.signInSubtitle")
              : t("auth.codeSentTo", { email })}
          </Text>
        </View>

        {step === "email" ? (
          <>
            {/* Email + send code */}
            <View style={{ gap: 12 }}>
              <Input
                label={t("auth.email")}
                value={email}
                onChangeText={setEmail}
                error={emailError}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                onSubmitEditing={handleSendCode}
                returnKeyType="send"
              />
              {generalError && (
                <Text style={{ textAlign: "center", fontSize: 13, color: colors.danger }}>
                  {generalError}
                </Text>
              )}
            </View>

            <Button onPress={handleSendCode} loading={submitting} fullWidth size="lg">
              {t("auth.sendResetCode")}
            </Button>

            {/* Divider */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
              <Text style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: colors.mutedForeground }}>
                sau
              </Text>
              <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
            </View>

            <Button
              variant="outline"
              onPress={handleGoogleSignIn}
              loading={submitting}
              fullWidth
              size="lg"
              leftIcon={<Lock size={18} color={colors.gold} />}
            >
              {t("auth.signInWithGoogle")}
            </Button>

            {/* Sign in with Apple — iOS only. Required by App Store review when
                any other third-party sign-in (Google) is offered. */}
            {Platform.OS === "ios" && (
              <Button
                variant="outline"
                onPress={handleAppleSignIn}
                loading={submitting}
                fullWidth
                size="lg"
                leftIcon={<Apple size={18} color={colors.gold} />}
              >
                {t("auth.signInWithApple")}
              </Button>
            )}

            {/* Sign-up footer */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                {t("auth.noAccount")}
              </Text>
              <Link href="/(auth)/sign-up" asChild>
                <Pressable hitSlop={8}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.gold }}>
                    {t("auth.signUp")}
                  </Text>
                </Pressable>
              </Link>
            </View>
          </>
        ) : (
          <>
            {/* Code entry */}
            <View style={{ gap: 12 }}>
              <Input
                label={t("auth.enterCode")}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                error={codeError}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                autoFocus
                onSubmitEditing={handleVerifyCode}
                returnKeyType="done"
              />
              {generalError && (
                <Text style={{ textAlign: "center", fontSize: 13, color: colors.danger }}>
                  {generalError}
                </Text>
              )}
            </View>

            <Button onPress={handleVerifyCode} loading={submitting} fullWidth size="lg">
              {t("auth.signIn")}
            </Button>

            <Button
              variant="ghost"
              onPress={() => {
                setStep("email");
                setCode("");
                setCodeError(null);
                setGeneralError(null);
              }}
              fullWidth
              size="md"
            >
              {t("auth.changeEmail")}
            </Button>
          </>
        )}
      </View>
    </SafeScreen>
  );
}
