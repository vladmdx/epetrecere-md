import { metaForPath } from "@/lib/seo/page-meta";

export async function generateMetadata() {
  // All three languages up front — metaForPath serves the one the
  // middleware resolved from the URL prefix.
  return metaForPath("/cum-functioneaza", {
    ro: {
      title: "Cum funcționează",
      description:
        "Află cum te ajută ePetrecere.md să planifici și să organizezi evenimentul tău.",
    },
    ru: {
      title: "Как это работает",
      description:
        "Узнайте, как ePetrecere.md помогает спланировать и организовать ваше мероприятие.",
    },
    en: {
      title: "How It Works",
      description:
        "See how ePetrecere.md helps you plan and organise your event from start to finish.",
    },
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
