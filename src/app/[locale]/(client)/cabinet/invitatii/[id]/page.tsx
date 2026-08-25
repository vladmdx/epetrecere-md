import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { InvitationDetailClient } from "./client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return generateMetaAsync({
    title: { ro: "Invitație", ru: "Приглашение", en: "Invitation" },
    description: {
      ro: "Editează, gestionează invitații și vezi RSVP-uri",
      ru: "Редактируйте, управляйте приглашениями и просматривайте RSVP",
      en: "Edit, manage invitations and view RSVPs",
    },
    path: "/cabinet/invitatii",
    locale,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvitationDetailClient id={Number(id)} />;
}
