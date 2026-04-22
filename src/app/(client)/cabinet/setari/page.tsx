import { AppearanceSettings } from "@/components/shared/appearance-settings";

export default function ClientSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Setări</h1>
        <p className="text-muted-foreground">
          Personalizează aspectul site-ului după preferințele tale.
        </p>
      </div>

      <AppearanceSettings />
    </div>
  );
}
