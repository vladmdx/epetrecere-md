import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { InvitationWizard } from "./wizard";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
    title: {
      ro: "Creează invitație digitală",
      ru: "Создать цифровое приглашение",
      en: "Create digital invitation",
    },
    description: {
      ro: "Creează o invitație digitală frumoasă în 4 pași. Alege un template, completează detaliile și invită-ți oaspeții.",
      ru: "Создайте красивое цифровое приглашение в 4 шага. Выберите шаблон, заполните детали и пригласите гостей.",
      en: "Create a beautiful digital invitation in 4 steps. Choose a template, fill in details, and invite your guests.",
    },
    path: "/cabinet/invitatii/nou",
  });
}

export default function NewInvitationPage() {
  return <InvitationWizard />;
}
