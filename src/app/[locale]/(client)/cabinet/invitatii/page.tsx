import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { InvitationsListClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  // All three languages up front — generateMeta serves the one the middleware
  // resolved from the URL prefix, so /ru and /en stop shipping Romanian.
  return generateMetaAsync({
    title: {
      ro: "Invitațiile mele",
      ru: "Мои приглашения",
      en: "My invitations",
    },
    description: {
      ro: "Creează, editează și urmărește RSVP-urile pentru invitațiile tale digitale.",
      ru: "Создавайте, редактируйте и отслеживайте RSVP для ваших цифровых приглашений.",
      en: "Create, edit, and track RSVPs for your digital invitations.",
    },
    path: "/cabinet/invitatii",
  });
}

export default function InvitationsPage() {
  return <InvitationsListClient />;
}
