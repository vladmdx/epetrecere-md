// M4 — Planning checklist templates.
//
// When a client creates a new event_plan we seed the checklist with a
// preset tailored to the event type. Each item has a rough "due days
// before the event" so we can sort / highlight overdue items.

export type TemplateEventType =
  | "wedding"
  | "baptism"
  | "cumatrie"
  | "birthday"
  | "corporate"
  | "other";

export interface TemplateItem {
  title: string;
  category: string;
  priority: "low" | "medium" | "high";
  dueDaysBefore: number;
}

// ───────────────────────────────────────────────────────
// Wedding (the crown jewel of Moldovan events)
// ───────────────────────────────────────────────────────
const WEDDING_TEMPLATE: TemplateItem[] = [
  // 9+ months out
  { title: "Stabilește bugetul total și împarte-l pe categorii", category: "budget", priority: "high", dueDaysBefore: 270 },
  { title: "Alege data și anotimpul evenimentului", category: "date", priority: "high", dueDaysBefore: 270 },
  { title: "Rezervă sala / restaurantul", category: "venue", priority: "high", dueDaysBefore: 240 },
  { title: "Fă lista preliminară de invitați", category: "guests", priority: "high", dueDaysBefore: 240 },

  // 6 months out
  { title: "Rezervă fotograf și videograf", category: "media", priority: "high", dueDaysBefore: 180 },
  { title: "Rezervă formația / DJ-ul / cântăreții", category: "artists", priority: "high", dueDaysBefore: 180 },
  { title: "Alege moderatorul (MC)", category: "artists", priority: "high", dueDaysBefore: 180 },
  { title: "Rochia de mireasă — primele probe", category: "outfits", priority: "high", dueDaysBefore: 180 },
  { title: "Costumul mirelui", category: "outfits", priority: "medium", dueDaysBefore: 180 },

  // 3-4 months out
  { title: "Comandă invitațiile și trimite save-the-date", category: "guests", priority: "medium", dueDaysBefore: 120 },
  { title: "Rezervă decorul și florile", category: "decor", priority: "medium", dueDaysBefore: 120 },
  { title: "Stabilește meniul cu restaurantul", category: "menu", priority: "high", dueDaysBefore: 120 },
  { title: "Degustare meniu", category: "menu", priority: "medium", dueDaysBefore: 90 },
  { title: "Comandă tortul de nuntă", category: "menu", priority: "medium", dueDaysBefore: 90 },
  { title: "Rezervă transport pentru miri (mașină / limuzină)", category: "logistics", priority: "low", dueDaysBefore: 90 },

  // 1-2 months
  { title: "Trimite invitațiile", category: "guests", priority: "high", dueDaysBefore: 60 },
  { title: "Finalizează lista de invitați și confirmările RSVP", category: "guests", priority: "high", dueDaysBefore: 30 },
  { title: "Aranjează harta de mese", category: "seating", priority: "high", dueDaysBefore: 21 },
  { title: "Probe finale rochie & costum", category: "outfits", priority: "high", dueDaysBefore: 21 },
  { title: "Cumpără verighetele", category: "ceremony", priority: "high", dueDaysBefore: 30 },
  { title: "Programare la cununia civilă / religioasă", category: "ceremony", priority: "high", dueDaysBefore: 60 },

  // Week of
  { title: "Confirmă numărul final de invitați cu restaurantul", category: "venue", priority: "high", dueDaysBefore: 7 },
  { title: "Confirmă ora cu artiștii și fotografii", category: "artists", priority: "high", dueDaysBefore: 7 },
  { title: "Pregătește lista cu dedicațiile și muzica preferată", category: "artists", priority: "medium", dueDaysBefore: 7 },
  { title: "Plata finală a vendorilor", category: "budget", priority: "high", dueDaysBefore: 3 },
  { title: "Delegă sarcini pentru ziua nunții (cine aduce ce)", category: "logistics", priority: "medium", dueDaysBefore: 3 },
  { title: "Odihnă — nu plănui nimic cu o zi înainte", category: "logistics", priority: "low", dueDaysBefore: 1 },
];

// ───────────────────────────────────────────────────────
// Baptism (botez)
// ───────────────────────────────────────────────────────
const BAPTISM_TEMPLATE: TemplateItem[] = [
  { title: "Alege nașii", category: "ceremony", priority: "high", dueDaysBefore: 60 },
  { title: "Programează slujba la biserică", category: "ceremony", priority: "high", dueDaysBefore: 45 },
  { title: "Rezervă restaurantul pentru masa festivă", category: "venue", priority: "high", dueDaysBefore: 45 },
  { title: "Comandă crijma și rochița/costumașul", category: "outfits", priority: "medium", dueDaysBefore: 30 },
  { title: "Rezervă fotograf", category: "media", priority: "high", dueDaysBefore: 30 },
  { title: "Comandă tortul / dulciuri", category: "menu", priority: "medium", dueDaysBefore: 14 },
  { title: "Trimite invitațiile", category: "guests", priority: "high", dueDaysBefore: 21 },
  { title: "Cumpără mărturiile (bomboniere)", category: "decor", priority: "medium", dueDaysBefore: 14 },
  { title: "Pregătește lista definitivă de invitați", category: "guests", priority: "high", dueDaysBefore: 10 },
  { title: "Confirmă detaliile cu preotul", category: "ceremony", priority: "high", dueDaysBefore: 3 },
];

// ───────────────────────────────────────────────────────
// Cumătrie (tradițional first-haircut celebration)
// ───────────────────────────────────────────────────────
const CUMATRIE_TEMPLATE: TemplateItem[] = [
  { title: "Stabilește lista de cumătri", category: "guests", priority: "high", dueDaysBefore: 60 },
  { title: "Rezervă sala / restaurantul", category: "venue", priority: "high", dueDaysBefore: 45 },
  { title: "Rezervă moderator / formație", category: "artists", priority: "high", dueDaysBefore: 45 },
  { title: "Angajează fotograf", category: "media", priority: "medium", dueDaysBefore: 30 },
  { title: "Comandă tortul și dulciurile", category: "menu", priority: "medium", dueDaysBefore: 14 },
  { title: "Trimite invitațiile", category: "guests", priority: "high", dueDaysBefore: 21 },
  { title: "Pregătește lista finală", category: "guests", priority: "high", dueDaysBefore: 7 },
  { title: "Confirmă meniul cu restaurantul", category: "menu", priority: "high", dueDaysBefore: 3 },
];

// ───────────────────────────────────────────────────────
// Birthday
// ───────────────────────────────────────────────────────
const BIRTHDAY_TEMPLATE: TemplateItem[] = [
  { title: "Alege tema petrecerii", category: "decor", priority: "medium", dueDaysBefore: 30 },
  { title: "Rezervă locația", category: "venue", priority: "high", dueDaysBefore: 30 },
  { title: "Trimite invitațiile", category: "guests", priority: "high", dueDaysBefore: 21 },
  { title: "Rezervă DJ sau playlist", category: "artists", priority: "medium", dueDaysBefore: 21 },
  { title: "Comandă tortul", category: "menu", priority: "high", dueDaysBefore: 7 },
  { title: "Cumpără decorul / baloanele", category: "decor", priority: "low", dueDaysBefore: 7 },
  { title: "Pregătește meniul sau catering-ul", category: "menu", priority: "medium", dueDaysBefore: 3 },
  { title: "Cumpără băuturile", category: "menu", priority: "medium", dueDaysBefore: 2 },
];

// ───────────────────────────────────────────────────────
// Corporate
// ───────────────────────────────────────────────────────
const CORPORATE_TEMPLATE: TemplateItem[] = [
  { title: "Aprobă bugetul cu managementul", category: "budget", priority: "high", dueDaysBefore: 60 },
  { title: "Rezervă sală conferință sau restaurant", category: "venue", priority: "high", dueDaysBefore: 45 },
  { title: "Trimite save-the-date angajaților", category: "guests", priority: "high", dueDaysBefore: 30 },
  { title: "Rezervă DJ / moderator / echipament tehnic", category: "artists", priority: "high", dueDaysBefore: 30 },
  { title: "Angajează fotograf / videograf corporate", category: "media", priority: "medium", dueDaysBefore: 21 },
  { title: "Comandă meniul de catering", category: "menu", priority: "high", dueDaysBefore: 14 },
  { title: "Pregătește agenda / discursuri", category: "ceremony", priority: "medium", dueDaysBefore: 7 },
  { title: "Confirmă lista finală de participanți", category: "guests", priority: "high", dueDaysBefore: 3 },
];

// ───────────────────────────────────────────────────────
// Fallback "other"
// ───────────────────────────────────────────────────────
const OTHER_TEMPLATE: TemplateItem[] = [
  { title: "Stabilește bugetul", category: "budget", priority: "high", dueDaysBefore: 60 },
  { title: "Rezervă locația", category: "venue", priority: "high", dueDaysBefore: 45 },
  { title: "Trimite invitațiile", category: "guests", priority: "high", dueDaysBefore: 21 },
  { title: "Rezervă muzica / animație", category: "artists", priority: "medium", dueDaysBefore: 21 },
  { title: "Stabilește meniul", category: "menu", priority: "medium", dueDaysBefore: 14 },
  { title: "Confirmă invitații", category: "guests", priority: "high", dueDaysBefore: 7 },
];

const TEMPLATES: Record<TemplateEventType, TemplateItem[]> = {
  wedding: WEDDING_TEMPLATE,
  baptism: BAPTISM_TEMPLATE,
  cumatrie: CUMATRIE_TEMPLATE,
  birthday: BIRTHDAY_TEMPLATE,
  corporate: CORPORATE_TEMPLATE,
  other: OTHER_TEMPLATE,
};

export function getPlannerTemplate(eventType: string | null | undefined): TemplateItem[] {
  const key = (eventType ?? "other").toLowerCase();
  if (key in TEMPLATES) return TEMPLATES[key as TemplateEventType];
  return TEMPLATES.other;
}

export const CATEGORY_LABELS: Record<string, string> = {
  budget: "Buget",
  date: "Dată & locație",
  venue: "Sală / locație",
  guests: "Invitați",
  media: "Foto & video",
  artists: "Artiști & muzică",
  menu: "Meniu & catering",
  decor: "Decor",
  outfits: "Ținute",
  ceremony: "Ceremonie",
  logistics: "Logistică",
  seating: "Așezare mese",
};
