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

const copy = {
  ro: {
    title: "Preferințe de confidențialitate",
    description:
      "Folosim elemente esențiale pentru funcționare. Analytics și marketing sunt dezactivate până când alegi.",
    policy: "Politica Cookies",
    customize: "Personalizează",
    reject: "Refuz opționale",
    accept: "Accept toate",
    save: "Salvează alegerea",
    necessary: "Necesare",
    necessaryDesc: "Autentificare, securitate și funcții de bază. Mereu active.",
    preferences: "Preferințe",
    preferencesDesc: "Limba, aspectul și setările tale.",
    analytics: "Analytics",
    analyticsDesc: "Măsurare agregată a utilizării și performanței.",
    marketing: "Marketing",
    marketingDesc: "Atribuire campanii și conținut promoțional personalizat.",
    settings: "Setări cookies",
  },
  ru: {
    title: "Настройки конфиденциальности",
    description:
      "Необходимые элементы обеспечивают работу сайта. Аналитика и маркетинг отключены, пока вы не сделаете выбор.",
    policy: "Политика cookies",
    customize: "Настроить",
    reject: "Отклонить необязательные",
    accept: "Принять все",
    save: "Сохранить выбор",
    necessary: "Необходимые",
    necessaryDesc: "Вход, безопасность и базовые функции. Всегда активны.",
    preferences: "Предпочтения",
    preferencesDesc: "Язык, оформление и ваши настройки.",
    analytics: "Аналитика",
    analyticsDesc: "Сводная статистика использования и производительности.",
    marketing: "Маркетинг",
    marketingDesc: "Атрибуция кампаний и персонализированный контент.",
    settings: "Настройки cookies",
  },
  en: {
    title: "Privacy preferences",
    description:
      "Essential storage keeps the site working. Analytics and marketing stay off until you choose.",
    policy: "Cookie Policy",
    customize: "Customize",
    reject: "Reject optional",
    accept: "Accept all",
    save: "Save choices",
    necessary: "Necessary",
    necessaryDesc: "Authentication, security and core features. Always active.",
    preferences: "Preferences",
    preferencesDesc: "Language, appearance and your settings.",
    analytics: "Analytics",
    analyticsDesc: "Aggregated usage and performance measurement.",
    marketing: "Marketing",
    marketingDesc: "Campaign attribution and personalized promotional content.",
    settings: "Cookie settings",
  },
} as const;

export function CookieConsent() {
  const { locale } = useLocale();
  const labels = copy[locale];
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
          <h2 className="font-heading text-lg font-semibold">{labels.title}</h2>
          <p className="mt-1 text-xs leading-5 text-white/62 sm:text-sm">
            {labels.description}{" "}
            <Link href="/cookies" className="text-gold underline underline-offset-2">
              {labels.policy}
            </Link>
          </p>
        </div>
      </div>

      {customize && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ConsentRow
            label={labels.necessary}
            description={labels.necessaryDesc}
            checked
            disabled
            onChange={() => {}}
          />
          <ConsentRow
            label={labels.preferences}
            description={labels.preferencesDesc}
            checked={preferences}
            onChange={setPreferences}
          />
          <ConsentRow
            label={labels.analytics}
            description={labels.analyticsDesc}
            checked={analytics}
            onChange={setAnalytics}
          />
          <ConsentRow
            label={labels.marketing}
            description={labels.marketingDesc}
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
            {labels.customize}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => persist({ preferences: false, analytics: false, marketing: false })}
          className="border-white/16 bg-transparent text-white/78 hover:bg-white/8 hover:text-white"
        >
          {labels.reject}
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
          {customize ? labels.save : labels.accept}
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
  const { locale } = useLocale();
  return (
    <Button type="button" variant="outline" onClick={openConsentSettings}>
      <Settings2 className="mr-2 h-4 w-4" />
      {copy[locale].settings}
    </Button>
  );
}
