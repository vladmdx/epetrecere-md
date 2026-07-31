import { metaForPath } from "@/lib/seo/page-meta";

export async function generateMetadata() {
  return metaForPath("/cum-functioneaza", {
    title: "Cum funcționează",
    description:
      "Află cum te ajută ePetrecere.md să planifici și să organizezi evenimentul tău.",
  });
}

export default function HowItWorksPage() {
  return (
    <main
      aria-label="Cum funcționează"
      className="-mt-16 min-h-[calc(100vh-4rem)] bg-[#05080d] pt-16"
    />
  );
}
