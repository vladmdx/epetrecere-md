import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { InvitationsListClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Invitațiile mele",
  description:
    "Creează, editează și urmărește RSVP-urile pentru invitațiile tale digitale.",
  path: "/cabinet/invitatii",
});
}

export default function InvitationsPage() {
  return <InvitationsListClient />;
}
