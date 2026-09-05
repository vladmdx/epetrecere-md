"use client";

import { useState } from "react";
import { SignUp } from "@clerk/nextjs";
import Link from "@/components/shared/locale-link";
import { PrivacyNotice } from "@/components/shared/privacy-notice";
import type { AppLocale } from "@/lib/i18n/routing";

const COPY = {
  ro: {
    title: "Înainte de a crea contul",
    consent: "Am citit și accept Termenii și condițiile și confirm că am luat cunoștință de Politica de confidențialitate.",
    terms: "Termenii și condițiile",
    privacy: "Politica de confidențialitate",
    continue: "Continuă la înregistrare",
  },
  ru: {
    title: "Перед созданием аккаунта",
    consent: "Я прочитал(а) и принимаю Условия использования и подтверждаю, что ознакомился(-ась) с Политикой конфиденциальности.",
    terms: "Условия использования",
    privacy: "Политика конфиденциальности",
    continue: "Продолжить регистрацию",
  },
  en: {
    title: "Before creating your account",
    consent: "I have read and accept the Terms and Conditions and acknowledge the Privacy Policy.",
    terms: "Terms and Conditions",
    privacy: "Privacy Policy",
    continue: "Continue to registration",
  },
} as const;

export function SignupConsentGate({ locale }: { locale: AppLocale }) {
  const c = COPY[locale];
  const [accepted, setAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  if (!acceptedAt) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A3E] bg-[#1A1A2E] p-6 text-[#FAF8F2] shadow-xl">
        <h1 className="text-xl font-semibold text-[#C9A84C]">{c.title}</h1>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[#C9A84C]"
          />
          <span>
            {c.consent}{" "}
            <Link href="/termeni" target="_blank" className="text-[#C9A84C] underline">
              {c.terms}
            </Link>{" "}
            ·{" "}
            <Link href="/confidentialitate" target="_blank" className="text-[#C9A84C] underline">
              {c.privacy}
            </Link>
          </span>
        </label>
        <button
          type="button"
          disabled={!accepted}
          onClick={() => setAcceptedAt(new Date().toISOString())}
          className="mt-5 w-full rounded-lg bg-[#C9A84C] px-4 py-3 font-semibold text-[#0D0D0D] transition hover:bg-[#A08839] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {c.continue}
        </button>
        <PrivacyNotice context="signup" className="mt-4" />
      </div>
    );
  }

  return (
    <>
      <SignUp
        unsafeMetadata={{
          legalAcceptance: {
            acceptedAt,
            termsVersion: "1.0",
            privacyVersion: "1.1",
            source: "signup-gate",
          },
        }}
        appearance={{
          options: {
            termsPageUrl: locale === "ro" ? "/termeni" : `/${locale}/termeni`,
            privacyPageUrl: locale === "ro" ? "/confidentialitate" : `/${locale}/confidentialitate`,
          },
          variables: {
            colorPrimary: "#C9A84C",
            colorBackground: "#1A1A2E",
            colorForeground: "#FAF8F2",
            colorMutedForeground: "#B0B0C0",
            colorInput: "#141428",
            colorInputForeground: "#FAF8F2",
          },
          elements: {
            formButtonPrimary: "!bg-[#C9A84C] hover:!bg-[#A08839] !text-[#0D0D0D] !font-semibold",
            card: "!bg-[#1A1A2E] !border !border-[#2A2A3E] !shadow-xl",
            headerTitle: "!text-[#C9A84C]",
            headerSubtitle: "!text-[#B0B0C0]",
            socialButtonsBlockButton: "!border-[#2A2A3E] !text-[#FAF8F2] !bg-[#141428] hover:!bg-[#1E1E38]",
            socialButtonsBlockButtonText: "!text-[#FAF8F2]",
            formFieldLabel: "!text-[#FAF8F2]",
            formFieldInput: "!bg-[#141428] !border-[#2A2A3E] !text-[#FAF8F2]",
            footerActionLink: "!text-[#C9A84C] hover:!text-[#A08839]",
            footer: "!text-[#B0B0C0]",
            footerActionText: "!text-[#B0B0C0]",
            dividerLine: "!bg-[#2A2A3E]",
            dividerText: "!text-[#B0B0C0]",
            identityPreviewEditButton: "!text-[#C9A84C]",
            formFieldInputShowPasswordButton: "!text-[#B0B0C0]",
          },
        }}
      />
      <PrivacyNotice context="signup" className="max-w-md text-center" />
    </>
  );
}
