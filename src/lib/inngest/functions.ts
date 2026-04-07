import { inngest } from "./client";
import { sendEmail } from "@/lib/email/send";
import { leadConfirmationEmail } from "@/lib/email/templates/lead-confirmation";
import { adminNotificationEmail } from "@/lib/email/templates/admin-notification";

// Trigger 1: New lead → emails
export const onLeadCreated = inngest.createFunction(
  {
    id: "on-lead-created",
    triggers: [{ event: "lead/created" }],
  },
  async ({ event, step }) => {
    const lead = event.data.lead as Record<string, string | number | undefined>;

    if (lead.email) {
      await step.run("send-confirmation", async () => {
        await sendEmail({
          to: lead.email as string,
          subject: "Solicitarea ta a fost primită — ePetrecere.md",
          html: leadConfirmationEmail({
            name: String(lead.name || ""),
            eventType: String(lead.eventType || "Eveniment"),
            eventDate: String(lead.eventDate || "TBD"),
          }),
        });
      });
    }

    await step.run("notify-admin", async () => {
      await sendEmail({
        to: process.env.EMAIL_FROM || "admin@epetrecere.md",
        subject: `Solicitare nouă: ${lead.name}`,
        html: adminNotificationEmail({
          leadName: String(lead.name || ""),
          phone: String(lead.phone || ""),
          email: lead.email as string | undefined,
          eventType: String(lead.eventType || "Eveniment"),
          eventDate: String(lead.eventDate || "TBD"),
          location: lead.location as string | undefined,
          guestCount: lead.guestCount as number | undefined,
          budget: lead.budget as number | undefined,
          source: String(lead.source || "form"),
          score: (lead.score as number) || 0,
        }),
      });
    });
  },
);

// Trigger 2: 24h follow-up
export const leadFollowUp = inngest.createFunction(
  {
    id: "lead-follow-up-24h",
    triggers: [{ event: "lead/created" }],
  },
  async ({ event, step }) => {
    await step.sleep("wait-24h", "24h");
    await step.run("alert-admin", async () => {
      const name = (event.data.lead as Record<string, string>).name;
      await sendEmail({
        to: process.env.EMAIL_FROM || "admin@epetrecere.md",
        subject: `Lead necontactat 24h: ${name}`,
        html: `<p>Lead-ul <strong>${name}</strong> nu a fost contactat în 24h.</p>`,
      });
    });
  },
);

// Trigger 3: Daily reminders for events in 7 days
export const eventReminder = inngest.createFunction(
  {
    id: "event-reminder-7d",
    triggers: [{ cron: "0 9 * * *" }],
  },
  async ({ step }) => {
    await step.run("check-events", async () => {
      // Query DB for bookings with eventDate = today + 7
      console.log("Checking upcoming events...");
    });
  },
);

export const functions = [onLeadCreated, leadFollowUp, eventReminder];
