import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { InvitationDetailClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Invitație",
  description: "Editează, gestionează invitații și vezi RSVP-uri",
  path: "/cabinet/invitatii",
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
