import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AppearanceSettings } from "@/components/shared/appearance-settings";
import { PushSubscribeButton } from "@/components/shared/push-subscribe-button";
import { WhatsAppPhoneInput } from "@/components/shared/whatsapp-phone-input";
import { NotificationSoundToggle } from "@/components/shared/notification-sound-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const { userId: clerkId } = await auth();
  let phone: string | null = null;
  if (clerkId) {
    const [u] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    phone = u?.phone ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Setări</h1>
        <p className="text-muted-foreground">
          Personalizează aspectul și notificările.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-gold" />
            Notificări instant pe dispozitiv
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Activează notificările browser / PWA ca să primești un ping
            imediat ce un artist sau o sală îți acceptă cererea, sau când
            primești un mesaj.
          </p>
          <PushSubscribeButton />
          <NotificationSoundToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-green-500" />
            WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsAppPhoneInput initialValue={phone} />
        </CardContent>
      </Card>

      <AppearanceSettings />
    </div>
  );
}
