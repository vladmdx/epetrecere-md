import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { InvitationDetailClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Invitație",
  description: "Editează, gestionează invitații și vezi RSVP-uri",
  path: "/cabinet/invitatii",
});

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvitationDetailClient id={Number(id)} />;
}
