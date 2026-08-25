"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import {
  OPEN_CONSENT_EVENT,
  openConsentSettings,
  readConsent,
  saveConsent,
} from "@/lib/privacy/consent";

export function CookieConsent() {
  const { t } = useLocale();
  const [show, setShow] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const existing = readConsent();
      if (existing) {
        setPreferences(existing.preferences);
        setAnalytics(existing.analytics);
        setMarketing(existing.marketing);
      } else {
        setShow(true);
      }
    }, 0);

    const open = () => {
      const current = readConsent();
      if (current) {
        setPreferences(current.preferences);
        setAnalytics(current.analytics);
        setMarketing(current.marketing);
      }
      setCustomize(true);
      setShow(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener(OPEN_CONSENT_EVENT, open);
    };
  }, []);

  function persist(next: {
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  }) {
    saveConsent(next);
    setPreferences(next.preferences);
    setAnalytics(next.analytics);
    setMarketing(next.marketing);
    setShow(false);
    setCustomize(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-4xl rounded-2xl border border-gold/25 bg-[#090c12]/98 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,.6)] backdrop-blur-xl sm:inset-x-6 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
          <Cookie className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-semibold">{t("cookies.title")}</h2>
          <p className="mt-1 text-xs leading-5 text-white/62 sm:text-sm">
            {t("cookies.description")}{" "}
            <Link href="/cookies" className="text-gold underline underline-offset-2">
              {t("cookies.policy")}
            </Link>
          </p>
        </div>
      </div>

      {customize && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ConsentRow
            label={t("cookies.necessary")}
            description={t("cookies.necessaryDesc")}
            checked
            disabled
            onChange={() => {}}
          />
          <ConsentRow
            label={t("cookies.preferences")}
            description={t("cookies.preferencesDesc")}
            checked={preferences}
            onChange={setPreferences}
          />
          <ConsentRow
            label={t("cookies.analytics")}
            description={t("cookies.analyticsDesc")}
            checked={analytics}
            onChange={setAnalytics}
          />
          <ConsentRow
            label={t("cookies.marketing")}
            description={t("cookies.marketingDesc")}
            checked={marketing}
            onChange={setMarketing}
          />
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!customize && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCustomize(true)}
            className="text-white/72 hover:bg-white/8 hover:text-white"
          >
            <Settings2 className="mr-2 h-4 w-4" />
            {t("cookies.customize")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => persist({ preferences: false, analytics: false, marketing: false })}
          className="border-white/16 bg-transparent text-white/78 hover:bg-white/8 hover:text-white"
        >
          {t("cookies.reject")}
        </Button>
        <Button
          size="sm"
          onClick={() =>
            customize
              ? persist({ preferences, analytics, marketing })
              : persist({ preferences: true, analytics: true, marketing: true })
          }
          className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {customize ? t("cookies.save") : t("cookies.accept")}
        </Button>
      </div>
    </div>
  );
}

function ConsentRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-white/[.025] p-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[#e6b84d]"
      />
      <span>
        <span className="block text-xs font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-white/48">{description}</span>
      </span>
    </label>
  );
}

export function CookieSettingsButton() {
  const { t } = useLocale();
  return (
    <Button type="button" variant="outline" onClick={openConsentSettings}>
      <Settings2 className="mr-2 h-4 w-4" />
      {t("cookies.settings")}
    </Button>
  );
}
