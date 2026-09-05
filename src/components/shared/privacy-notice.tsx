"use client";

import Link from "@/components/shared/locale-link";
import { useLocale } from "@/hooks/use-locale";

type PrivacyContext = "signup" | "contact" | "planner" | "ai";

const COPY = {
  ro: {
    signup:
      "Prin continuare confirmi că ai citit Termenii și Politica de confidențialitate. Datele de cont sunt folosite pentru autentificare, administrarea profilului și furnizarea serviciului.",
    contact:
      "Folosim numele, telefonul, emailul opțional și mesajul pentru a răspunde solicitării. Accesul este limitat la echipa de suport și furnizorii tehnici necesari. Solicitările fără relație contractuală sunt șterse după cel mult 24 de luni.",
    planner:
      "Detaliile evenimentului și datele contului sunt folosite pentru crearea planului, recomandări și transmiterea cererilor numai către furnizorii aleși. Nu introduce date sensibile despre alte persoane în câmpurile libere.",
    ai:
      "Mesajul este transmis, în funcție de disponibilitate, către OpenAI sau Anthropic pentru generarea răspunsului. Conversația rămâne în browserul tău, iar furnizorul AI poate păstra jurnale de siguranță până la 30 de zile. Nu introduce date sensibile sau datele altor persoane.",
    terms: "Termenii",
    privacy: "Politica de confidențialitate",
    details: "Detalii",
  },
  ru: {
    signup:
      "Продолжая, вы подтверждаете, что прочитали Условия и Политику конфиденциальности. Данные аккаунта используются для входа, управления профилем и предоставления сервиса.",
    contact:
      "Имя, телефон, необязательный email и сообщение используются для ответа на обращение. Доступ имеют только служба поддержки и необходимые технические поставщики. Обращения без договорных отношений удаляются не позднее чем через 24 месяца.",
    planner:
      "Данные события и аккаунта используются для создания плана, рекомендаций и передачи запросов только выбранным поставщикам. Не вводите чувствительные данные других лиц в свободные поля.",
    ai:
      "В зависимости от доступности сообщение передается OpenAI или Anthropic для подготовки ответа. История остается в вашем браузере, а AI-поставщик может хранить журналы безопасности до 30 дней. Не вводите чувствительные данные или данные других лиц.",
    terms: "Условия",
    privacy: "Политика конфиденциальности",
    details: "Подробнее",
  },
  en: {
    signup:
      "By continuing, you confirm that you have read the Terms and Privacy Policy. Account data is used for authentication, profile administration and delivery of the service.",
    contact:
      "We use your name, phone, optional email and message to answer the enquiry. Access is limited to support staff and necessary technical providers. Enquiries without a contractual relationship are deleted within 24 months.",
    planner:
      "Event and account details are used to create your plan, provide recommendations and send enquiries only to suppliers you select. Do not enter sensitive data about other people in free-text fields.",
    ai:
      "Depending on availability, your message is sent to OpenAI or Anthropic to generate the reply. The conversation remains in your browser, while the AI provider may retain safety logs for up to 30 days. Do not enter sensitive data or another person's data.",
    terms: "Terms",
    privacy: "Privacy Policy",
    details: "Details",
  },
} as const;

export function PrivacyNotice({
  context,
  className = "",
}: {
  context: PrivacyContext;
  className?: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  return (
    <p className={`text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      {copy[context]}{" "}
      {context === "signup" ? (
        <>
          <Link href="/termeni" className="text-gold underline underline-offset-2">
            {copy.terms}
          </Link>{" "}
          ·{" "}
          <Link href="/confidentialitate" className="text-gold underline underline-offset-2">
            {copy.privacy}
          </Link>
        </>
      ) : (
        <Link href="/confidentialitate" className="text-gold underline underline-offset-2">
          {copy.details}
        </Link>
      )}
    </p>
  );
}
