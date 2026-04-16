import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { InvitationWizard } from "./wizard";

export const metadata: Metadata = generateMeta({
  title: "Creează invitație digitală",
  description:
    "Creează o invitație digitală frumoasă în 4 pași. Alege un template, completează detaliile și invită-ți oaspeții.",
  path: "/cabinet/invitatii/nou",
});

export default function NewInvitationPage() {
  return <InvitationWizard />;
}
