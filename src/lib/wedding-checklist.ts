// M8 Intern #6 — 12-month wedding checklist template.
// Pre-populated from typical Moldovan wedding planning timelines.

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

export interface ChecklistPhase {
  id: string;
  label: string;
  description: string;
  items: ChecklistItem[];
}

export const WEDDING_CHECKLIST: ChecklistPhase[] = [
  {
    id: "12m",
    label: "12 luni înainte",
    description: "Fundația planificării — rezervă prioritățile",
    items: [
      { id: "12m-budget", label: "Stabilește bugetul total" },
      { id: "12m-date", label: "Alege data nunții" },
      { id: "12m-guest-list", label: "Schițează lista de invitați" },
      { id: "12m-venue", label: "Vizitează & rezervă sala" },
      { id: "12m-theme", label: "Alege tematica și paleta de culori" },
      { id: "12m-nasi", label: "Alege nașii" },
    ],
  },
  {
    id: "9m",
    label: "9 luni înainte",
    description: "Rezervă furnizorii principali",
    items: [
      { id: "9m-photo", label: "Contractează fotograful" },
      { id: "9m-video", label: "Contractează videograful" },
      { id: "9m-band", label: "Rezervă formația sau DJ-ul" },
      { id: "9m-mc", label: "Alege moderatorul (MC)" },
      { id: "9m-priest", label: "Stabilește cu preotul detaliile cununiei" },
      { id: "9m-dress", label: "Începe căutarea rochiei de mireasă" },
    ],
  },
  {
    id: "6m",
    label: "6 luni înainte",
    description: "Detalii importante & documente",
    items: [
      { id: "6m-florist", label: "Rezervă florărie & aranjamente" },
      { id: "6m-decor", label: "Contractează decoratorul sălii" },
      { id: "6m-cake", label: "Comandă tortul de nuntă" },
      { id: "6m-menu", label: "Stabilește meniul cu restaurantul" },
      { id: "6m-suit", label: "Comandă costumul mirelui" },
      { id: "6m-rings", label: "Alege verighetele" },
      { id: "6m-honeymoon", label: "Rezervă luna de miere" },
      { id: "6m-invites-design", label: "Comandă invitațiile" },
    ],
  },
  {
    id: "4m",
    label: "4 luni înainte",
    description: "Definitivează detaliile",
    items: [
      { id: "4m-send-invites", label: "Trimite invitațiile" },
      { id: "4m-transport", label: "Rezervă limuzina / transportul" },
      { id: "4m-makeup", label: "Rezervă machiajul & coafura" },
      { id: "4m-tailor", label: "Prima probă la rochie/costum" },
      { id: "4m-favors", label: "Comandă mărțișoare / daruri pentru invitați" },
      { id: "4m-playlist", label: "Începe playlist-ul pentru formație/DJ" },
    ],
  },
  {
    id: "2m",
    label: "2 luni înainte",
    description: "Verificări & confirmări",
    items: [
      { id: "2m-rsvp", label: "Urmărește confirmările invitaților" },
      { id: "2m-seating", label: "Fă planul meselor" },
      { id: "2m-tasting", label: "Tasting meniu la restaurant" },
      { id: "2m-fitting", label: "Probă finală rochie/costum" },
      { id: "2m-vows", label: "Scrie jurămintele (opțional)" },
      { id: "2m-church", label: "Confirmă detaliile cununiei la biserică" },
    ],
  },
  {
    id: "1m",
    label: "1 lună înainte",
    description: "Ultimele pregătiri",
    items: [
      { id: "1m-marriage-license", label: "Depune actele la starea civilă" },
      { id: "1m-payments", label: "Plătește avansurile finale" },
      { id: "1m-vendor-confirm", label: "Confirmă cu toți furnizorii" },
      { id: "1m-hairtrial", label: "Probă de coafură & machiaj" },
      { id: "1m-emergency-kit", label: "Pregătește kit de urgență" },
    ],
  },
  {
    id: "1w",
    label: "Săptămâna nunții",
    description: "Finisări și odihnă",
    items: [
      { id: "1w-final-list", label: "Trimite lista finală invitaților la restaurant" },
      { id: "1w-pack-honeymoon", label: "Fă bagajele pentru luna de miere" },
      { id: "1w-manicure", label: "Manichiură & pedichiură" },
      { id: "1w-spa", label: "Relaxare la spa sau masaj" },
      { id: "1w-rehearse", label: "Repetiție cu nașii & martorii" },
      { id: "1w-sleep", label: "Odihnește-te suficient ultima noapte" },
    ],
  },
];
