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
import { View, Text, Pressable, Platform } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { Eye, EyeOff, Mail, Lock, Apple } from "lucide-react-native";
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
            {t("auth.signInSubtitle")}
          </Text>
        </View>

        {/* Form */}
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
            <Text style={{ textAlign: "center", fontSize: 13, color: colors.danger }}>
              {generalError}
            </Text>
          )}
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable hitSlop={8} style={{ alignSelf: "flex-end" }}>
              <Text style={{ fontSize: 13, color: colors.gold }}>
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
      </View>
    </SafeScreen>
  );
}
