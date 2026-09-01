// Sign-in screen.
//
// Auth strategies supported (in priority order):
//   1. Google OAuth — one tap, dominant for the Moldovan market.
//   2. Email + password — fallback, with show/hide toggle.
//   3. Magic link by email — for users who forgot their password and
//      don't want to reset it right now.
//
// Errors surface inline (red text under the relevant field) and never
// in alert() dialogs — alerts are interruptive and feel un-native.

import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { Eye, EyeOff, Mail, Lock } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { Button, Input, SafeScreen } from "../../components/ui";
import { colors } from "../../constants/theme";
import {
  DEV_LOGIN_AVAILABLE,
  DEV_LOGIN_EMAIL,
  DEV_LOGIN_EMAILS,
  fetchDevTicket,
} from "../../lib/dev-session";

// Required on iOS for the OAuth browser dismissal to work correctly.
// Safe to call multiple times — Expo dedupes internally.
WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const googleOAuth = useOAuth({ strategy: "oauth_google" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSignIn() {
    if (!isLoaded || !signIn) return;
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    if (!email.includes("@")) {
      setEmailError(t("errors.invalidEmail"));
      return;
    }
    if (password.length < 8) {
      setPasswordError(t("errors.passwordTooShort"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        // Multi-factor / verification needed. M1 ships the happy path
        // only; MFA UI lands in M2.
        setGeneralError("Verificare suplimentară necesară.");
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        t("errors.wrongPassword");
      setGeneralError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const [devBusy, setDevBusy] = useState(false);

  /**
   * Signs in as the allow-listed test account using a Clerk sign-in token, so
   * an automated run can reach the screens behind the login form. No password
   * is involved at any point — the token is minted server-side and lives one
   * minute.
   */
  /** Asks which account when more than one is configured. */
  function handleDevSignInPress() {
    if (DEV_LOGIN_EMAILS.length <= 1) {
      void handleDevSignIn(DEV_LOGIN_EMAILS[0]);
      return;
    }
    Alert.alert("Sesiune de test", "Ca cine?", [
      ...DEV_LOGIN_EMAILS.map((email) => ({
        text: email.split("@")[0]!,
        onPress: () => void handleDevSignIn(email),
      })),
      { text: "Renunț", style: "cancel" as const },
    ]);
  }

  async function handleDevSignIn(email?: string) {
    if (!isLoaded || !signIn) return;
    setDevBusy(true);
    try {
      const { ticket } = await fetchDevTicket(email);
      const attempt = await signIn.create({ strategy: "ticket", ticket });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert(
          "Sesiunea de test nu s-a deschis",
          `Clerk a răspuns cu starea „${attempt.status}".`,
        );
      }
    } catch (e) {
      Alert.alert(
        "Sesiunea de test a eșuat",
        e instanceof Error ? e.message : "Eroare necunoscută.",
      );
    } finally {
      setDevBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setGeneralError(null);
    setSubmitting(true);
    try {
      const result = await googleOAuth.startOAuthFlow({
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

  return (
    <SafeScreen padded keyboardAvoiding>
      <View className="flex-1 justify-center gap-6 py-12">
        {/* Brand */}
        <View className="items-center">
          <Text className="font-heading text-[36px] font-bold text-foreground">
            ePetrecere
          </Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            {t("common.tagline")}
          </Text>
        </View>

        {/* Title */}
        <View className="gap-1">
          <Text className="font-heading text-[24px] font-bold text-foreground">
            {t("auth.signInTitle")}
          </Text>
          <Text className="text-[14px] text-muted-foreground">
            {t("auth.signInSubtitle")}
          </Text>
        </View>

        {/* Form */}
        <View className="gap-3">
          <Input
            label={t("auth.email")}
            value={email}
            onChangeText={setEmail}
            error={emailError}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            rightSlot={<Mail size={18} color={colors.mutedForeground} />}
          />
          <Input
            label={t("auth.password")}
            value={password}
            onChangeText={setPassword}
            error={passwordError}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            rightSlot={
              <Pressable
                hitSlop={8}
                onPress={() => setShowPassword((s) => !s)}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.mutedForeground} />
                ) : (
                  <Eye size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            }
          />
          {generalError && (
            <Text className="text-center text-[13px] text-[#EF4444]">
              {generalError}
            </Text>
          )}
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable hitSlop={8} className="self-end">
              <Text className="text-[13px] text-gold">
                {t("auth.forgotPassword")}
              </Text>
            </Pressable>
          </Link>
        </View>

        <Button
          onPress={handlePasswordSignIn}
          loading={submitting}
          fullWidth
          size="lg"
        >
          {t("auth.signIn")}
        </Button>

        {/* Divider */}
        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
            sau
          </Text>
          <View className="h-px flex-1 bg-border" />
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

        {/*
          Development only. `__DEV__` folds to `false` in a production bundle,
          so DEV_LOGIN_AVAILABLE is false and this never renders; the secret
          and the address fold away with it.

          Stated precisely because the first version of this comment was
          wrong: the button's markup and the endpoint string do survive into
          the bundle, dropped or not depending on the minifier. What is
          guaranteed is that the branch cannot execute and carries no secret —
          not that no trace of it ships.
        */}
        {DEV_LOGIN_AVAILABLE && (
          <View style={{ gap: 6, marginTop: 4 }}>
            <Button
              variant="outline"
              onPress={handleDevSignInPress}
              loading={devBusy}
              fullWidth
              size="md"
            >
              Sesiune de test (dev)
            </Button>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              {DEV_LOGIN_EMAILS.length > 1
                ? `${DEV_LOGIN_EMAILS.length} conturi — alege la apăsare`
                : DEV_LOGIN_EMAIL}
            </Text>
          </View>
        )}

        {/* Sign-up footer */}
        <View className="flex-row items-center justify-center gap-1.5">
          <Text className="text-[14px] text-muted-foreground">
            {t("auth.noAccount")}
          </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable hitSlop={8}>
              <Text className="text-[14px] font-semibold text-gold">
                {t("auth.signUp")}
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeScreen>
  );
}
