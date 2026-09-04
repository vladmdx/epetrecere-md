// Invitation design templates — 4 curated variants.
// Each template defines color palette, fonts, decorative elements.
// The public invitation page and the send-email both render using these.

export type InvitationDesignId = "elegant-gold" | "romantic-floral" | "modern-minimal" | "classic-dark";

export interface InvitationDesign {
  id: InvitationDesignId;
  name: string;
  description: string;
  preview: {
    bg: string;
    accent: string;
    text: string;
  };
  /** CSS variables applied to the invitation container */
  cssVars: Record<string, string>;
  /** Google Font family (optional) */
  fontFamily?: string;
  fontHeading?: string;
  /** Decorative style */
  decorStyle: "sparkles" | "flowers" | "minimal" | "ornate";
}

export const INVITATION_DESIGNS: Record<InvitationDesignId, InvitationDesign> = {
  "elegant-gold": {
    id: "elegant-gold",
    name: "Elegant Auriu",
    description: "Eleganță atemporală cu accente de aur pe fundal crem",
    preview: {
      bg: "#FAF6EC",
      accent: "#C9A84C",
      text: "#2C2C3A",
    },
    cssVars: {
      "--inv-bg": "#FAF6EC",
      "--inv-bg-accent": "#F0E9D2",
      "--inv-accent": "#C9A84C",
      "--inv-accent-dark": "#8C7A35",
      "--inv-text": "#2C2C3A",
      "--inv-muted": "#6B6B7B",
      "--inv-card": "#FFFFFF",
      "--inv-border": "rgba(201, 168, 76, 0.3)",
    },
    fontFamily: "Cormorant Garamond",
    fontHeading: "Playfair Display",
    decorStyle: "ornate",
  },
  "romantic-floral": {
    id: "romantic-floral",
    name: "Romantic Floral",
    description: "Nuanțe pastelate cu motive florale delicate",
    preview: {
      bg: "#FEF5F2",
      accent: "#D4918E",
      text: "#3E2723",
    },
    cssVars: {
      "--inv-bg": "#FEF5F2",
      "--inv-bg-accent": "#F9E4E0",
      "--inv-accent": "#D4918E",
      "--inv-accent-dark": "#A66865",
      "--inv-text": "#3E2723",
      "--inv-muted": "#7A5F5A",
      "--inv-card": "#FFFFFF",
      "--inv-border": "rgba(212, 145, 142, 0.35)",
    },
    fontFamily: "Cormorant Garamond",
    fontHeading: "Dancing Script",
    decorStyle: "flowers",
  },
  "modern-minimal": {
    id: "modern-minimal",
    name: "Modern Minimalist",
    description: "Design curat și aerisit, tipografie modernă",
    preview: {
      bg: "#FFFFFF",
      accent: "#1A1A1A",
      text: "#1A1A1A",
    },
    cssVars: {
      "--inv-bg": "#FFFFFF",
      "--inv-bg-accent": "#F5F5F5",
      "--inv-accent": "#1A1A1A",
      "--inv-accent-dark": "#000000",
      "--inv-text": "#1A1A1A",
      "--inv-muted": "#6B6B6B",
      "--inv-card": "#FAFAFA",
      "--inv-border": "rgba(0, 0, 0, 0.1)",
    },
    fontFamily: "Inter",
    fontHeading: "Inter",
    decorStyle: "minimal",
  },
  "classic-dark": {
    id: "classic-dark",
    name: "Clasic Obsidian",
    description: "Fundal întunecat elegant cu accente de aur strălucitor",
    preview: {
      bg: "#0D0D0D",
      accent: "#C9A84C",
      text: "#FAF8F2",
    },
    cssVars: {
      "--inv-bg": "#0D0D0D",
      "--inv-bg-accent": "#1A1A2E",
      "--inv-accent": "#C9A84C",
      "--inv-accent-dark": "#A08839",
      "--inv-text": "#FAF8F2",
      "--inv-muted": "#B0B0C0",
      "--inv-card": "#1A1A2E",
      "--inv-border": "rgba(201, 168, 76, 0.25)",
    },
    fontFamily: "Playfair Display",
    fontHeading: "Playfair Display",
    decorStyle: "sparkles",
  },
};

export const INVITATION_DESIGN_LIST: InvitationDesign[] = Object.values(INVITATION_DESIGNS);

export function getInvitationDesign(id: string | null | undefined): InvitationDesign {
  if (!id) return INVITATION_DESIGNS["elegant-gold"];
  return INVITATION_DESIGNS[id as InvitationDesignId] || INVITATION_DESIGNS["elegant-gold"];
}

/** Google Fonts URL for the given design (used in both preview and email). */
export function googleFontsUrl(design: InvitationDesign): string {
  const fonts: string[] = [];
  if (design.fontFamily) fonts.push(design.fontFamily.replace(/\s+/g, "+") + ":wght@400;500;600");
  if (design.fontHeading && design.fontHeading !== design.fontFamily) {
    fonts.push(design.fontHeading.replace(/\s+/g, "+") + ":wght@400;700");
  }
  if (fonts.length === 0) return "";
  return `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${f}`).join("&")}&display=swap`;
}

/** Render invitation email HTML using the design template. */
export function invitationEmailHtml(opts: {
  design: InvitationDesign;
  guestName: string;
  /** "single" | "couple" | "family" — drives singular vs plural greeting. */
  guestType?: "single" | "couple" | "family";
  title: string;
  eventDate: string | null;
  ceremonyLocation: string | null;
  ceremonyTime: string | null;
  receptionLocation: string | null;
  receptionTime: string | null;
  message: string | null;
  dressCode: string | null;
  rsvpUrl: string;
  /** Per-host overrides loaded from invitations.customColors. */
  custom?: {
    headerText?: string;
    eventName?: string;
    decorIcon?: string;
    iconImageUrl?: string;
    iconSize?: string | number;
    iconAlign?: "left" | "center" | "right";
    bgColor?: string;
    textColor?: string;
    accentColor?: string;
    fontHeading?: string;
    titleSize?: string | number;
    titleAlign?: "left" | "center" | "right";
  };
}): string {
  const { design, guestName, guestType, title: rawTitle, eventDate, ceremonyLocation, ceremonyTime, receptionLocation, receptionTime, message, dressCode, rsvpUrl, custom } = opts;
  const fontsLink = googleFontsUrl(design);
  const font = design.fontFamily || "Helvetica, Arial, sans-serif";

  // Resolve template defaults vs host overrides.
  const heading = custom?.fontHeading || design.fontHeading || font;
  const bg = custom?.bgColor || design.cssVars["--inv-bg"];
  const text = custom?.textColor || design.cssVars["--inv-text"];
  const accent = custom?.accentColor || design.cssVars["--inv-accent"];
  const title = custom?.eventName || rawTitle;
  const titleSize = Number(custom?.titleSize ?? 42);
  const titleAlign = custom?.titleAlign ?? "center";
  const iconSize = Number(custom?.iconSize ?? 32);
  const iconAlign = custom?.iconAlign ?? "center";
  const privacyUrl = `${new URL(rsvpUrl).origin}/confidentialitate#liste-invitati`;

  // Singular / plural greeting line. Host can override with their own
  // text via custom.headerText.
  const headerText =
    custom?.headerText ||
    (guestType === "couple" || guestType === "family"
      ? "Sunteți invitați"
      : "Ești invitat");

  // Decorative element — uploaded image wins over emoji glyph.
  const decorations: Record<InvitationDesign["decorStyle"], string> = {
    sparkles: "✦",
    flowers: "❀",
    minimal: "—",
    ornate: "❦",
  };
  const fallbackDecor = custom?.decorIcon || decorations[design.decorStyle];
  const decorBlock = custom?.iconImageUrl
    ? `<img src="${custom.iconImageUrl}" alt="" style="display:inline-block;width:${iconSize}px;height:${iconSize}px;object-fit:contain;" />`
    : `<span style="font-size:${iconSize}px;color:${accent};line-height:1;">${fallbackDecor}</span>`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
${fontsLink ? `<link href="${fontsLink}" rel="stylesheet">` : ""}
${custom?.fontHeading ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(custom.fontHeading).replace(/%20/g, "+")}:wght@400;700&display=swap" rel="stylesheet">` : ""}
</head>
<body style="margin:0;padding:0;background:${bg};font-family:'${font}',serif;color:${text};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- Ornament -->
    <div style="text-align:${iconAlign};margin-bottom:12px;">${decorBlock}</div>

    <!-- Guest name (the new placeholder line) -->
    <p style="font-family:'${heading}',serif;font-size:${Math.round(titleSize * 0.55)}px;color:${text};margin:0 0 4px;text-align:${titleAlign};font-weight:500;">
      ${guestName}
    </p>

    <!-- Greeting line (singular/plural per guest type) -->
    <p style="font-size:12px;letter-spacing:4px;text-transform:uppercase;color:${accent};margin:0 0 16px;text-align:${titleAlign};">${headerText}</p>

    <!-- Event title -->
    <h1 style="font-family:'${heading}',serif;font-size:${titleSize}px;line-height:1.15;margin:0 0 24px;color:${text};font-weight:700;text-align:${titleAlign};">
      ${title}
    </h1>

    ${eventDate ? `<p style="font-size:18px;font-style:italic;color:${design.cssVars["--inv-muted"]};margin:0 0 32px;text-align:${titleAlign};">
      ${new Date(eventDate).toLocaleDateString("ro-RO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
    </p>` : ""}

    ${message ? `<div style="background:${design.cssVars["--inv-card"]};border:1px solid ${design.cssVars["--inv-border"]};border-radius:12px;padding:24px;margin:0 0 24px;">
      <p style="font-size:15px;font-style:italic;color:${design.cssVars["--inv-muted"]};margin:0;line-height:1.6;text-align:center;">"${message}"</p>
    </div>` : ""}

    <!-- Details -->
    <div style="text-align:left;background:${design.cssVars["--inv-card"]};border:1px solid ${design.cssVars["--inv-border"]};border-radius:12px;padding:20px;margin:0 0 24px;">
      ${ceremonyLocation ? `<div style="margin-bottom:12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${accent};margin-bottom:4px;">Ceremonia</div>
        <div style="font-size:14px;color:${text};">${ceremonyLocation}${ceremonyTime ? ` · ora ${ceremonyTime}` : ""}</div>
      </div>` : ""}
      ${receptionLocation ? `<div style="margin-bottom:12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${accent};margin-bottom:4px;">Petrecerea</div>
        <div style="font-size:14px;color:${text};">${receptionLocation}${receptionTime ? ` · ora ${receptionTime}` : ""}</div>
      </div>` : ""}
      ${dressCode ? `<div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${accent};margin-bottom:4px;">Cod Vestimentar</div>
        <div style="font-size:14px;color:${text};">${dressCode}</div>
      </div>` : ""}
    </div>

    <!-- RSVP -->
    <div style="text-align:${titleAlign};">
      <a href="${rsvpUrl}" style="display:inline-block;background:${accent};color:${bg};padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;font-family:'${font}',sans-serif;letter-spacing:1px;">
        Confirmă Prezența
      </a>
    </div>

    <p style="font-size:11px;color:${design.cssVars["--inv-muted"]};margin-top:32px;text-align:center;">
      Creat cu ePetrecere.md · <a href="${privacyUrl}" style="color:${accent};">Cum sunt protejate datele invitaților</a>
    </p>
  </div>
</body></html>`;
}
