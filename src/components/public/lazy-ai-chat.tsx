"use client";

import dynamic from "next/dynamic";

const PublicAiChat = dynamic(
  () =>
    import("@/components/public/public-ai-chat").then((m) => m.PublicAiChat),
  { ssr: false },
);

export function LazyAiChat() {
  return <PublicAiChat />;
}
