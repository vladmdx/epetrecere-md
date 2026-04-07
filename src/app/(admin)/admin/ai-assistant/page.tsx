import { AIChat } from "@/components/shared/ai-chat";

export default function AdminAIAssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Asistent inteligent pentru gestionarea platformei
        </p>
      </div>
      <AIChat context="admin" />
    </div>
  );
}
