import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { InvitationsListClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Invitațiile mele",
  description:
    "Creează, editează și urmărește RSVP-urile pentru invitațiile tale digitale.",
  path: "/cabinet/invitatii",
});

export default function InvitationsPage() {
  return <InvitationsListClient />;
}
