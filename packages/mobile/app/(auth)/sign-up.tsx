// Sign-up screen — three-step flow:
//   1. Email + password + first name + last name
//   2. Email verification (6-digit code from Clerk)
//   3. → onboarding
//
// The verification step uses Clerk's `prepareEmailAddressVerification`
// with `strategy: "email_code"`. We keep the UI on the same screen and
// just swap the form body to avoid a navigation jump that disorients
// the user mid-signup.

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Link, useRouter } from "expo-router";
import { useSignUp } from "@clerk/clerk-expo";
import { Eye, EyeOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, Input, SafeScreen } from "../../components/ui";
import { colors } from "../../constants/theme";

export default function SignUp() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    firstName?: string;
    code?: string;
    general?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSignUp() {
    if (!isLoaded || !signUp) return;
    const newErrors: typeof errors = {};
    if (!email.includes("@")) newErrors.email = t("errors.invalidEmail");
    if (password.length < 8) newErrors.password = t("errors.passwordTooShort");
    if (firstName.trim().length < 2)
      newErrors.firstName = "Prenumele e obligatoriu.";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName: lastName || undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err: unknown) {
      const code = (err as { errors?: { code?: string }[] })?.errors?.[0]?.code;
      if (code === "form_identifier_exists") {
        setErrors({ email: t("errors.emailExists") });
      } else {
        const msg =
          (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
          t("errors.generic");
        setErrors({ general: msg });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded || !signUp) return;
    if (code.length !== 6) {
      setErrors({ code: "Codul are 6 cifre." });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(onboarding)/welcome");
      } else {
        setErrors({ general: "Verificarea n-a putut fi completată." });
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        "Cod incorect.";
      setErrors({ code: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeScreen padded keyboardAvoiding>
      <View style={{ gap: 24, paddingTop: 20, paddingBottom: 24 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}>
            {step === "form" ? t("auth.signUpTitle") : "Verifică emailul"}
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
            {step === "form"
              ? t("auth.signUpSubtitle")
              : `Am trimis un cod de 6 cifre la ${email}.`}
          </Text>
        </View>

        {step === "form" ? (
          <View style={{ gap: 12 }}>
            <Input
              label={t("auth.firstName")}
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
              autoCapitalize="words"
              textContentType="givenName"
            />
            <Input
              label={t("auth.lastName")}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              textContentType="familyName"
            />
            <Input
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Input
              label={t("auth.password")}
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              hint={t("auth.passwordHint")}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType="newPassword"
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
            {errors.general && (
              <Text style={{ textAlign: "center", fontSize: 13, color: colors.danger }}>
                {errors.general}
              </Text>
            )}
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 11, lineHeight: 16, color: colors.mutedForeground }}>
              {t("auth.agreeTerms")}
            </Text>
            <Button
              onPress={handleSignUp}
              loading={submitting}
              fullWidth
              size="lg"
            >
              {t("auth.signUp")}
            </Button>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Input
              label={t("auth.enterCode")}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              error={errors.code}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
            />
            {errors.general && (
              <Text style={{ textAlign: "center", fontSize: 13, color: colors.danger }}>
                {errors.general}
              </Text>
            )}
            <Button
              onPress={handleVerify}
              loading={submitting}
              fullWidth
              size="lg"
            >
              {t("common.confirm")}
            </Button>
            <Button
              variant="ghost"
              onPress={() => setStep("form")}
              fullWidth
              size="md"
            >
              {t("common.back")}
            </Button>
          </View>
        )}

        {step === "form" && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
              {t("auth.hasAccount")}
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable hitSlop={8}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.gold }}>
                  {t("auth.signIn")}
                </Text>
              </Pressable>
            </Link>
          </View>
        )}
      </View>
    </SafeScreen>
  );
}
