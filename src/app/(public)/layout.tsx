import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { PublicAiChat } from "@/components/public/public-ai-chat";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
      <PublicAiChat />
    </>
  );
}
