import { AIChat } from "@/components/shared/ai-chat";

export default function VendorAIAssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Asistentul tău personal pentru gestionarea profilului
        </p>
      </div>
      <AIChat context="vendor" />
    </div>
  );
}
