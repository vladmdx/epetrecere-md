// Single source of truth for the public /utilitati landing pages.
// Each tool maps a public slug → the in-cabinet route the user lands on
// after sign-in. SEO content is hand-written for Moldova / Chișinău search
// intent. Image is a placeholder until the admin uploads a real one.

export interface ToolDef {
  slug: string; // /utilitati/[slug]
  cabinetPath: string; // where to redirect after login
  emoji: string;
  title: string; // H1
  metaTitle: string; // <60 chars
  metaDescription: string; // <160 chars
  shortPitch: string; // 1-sentence subheading under H1
  features: string[]; // bullet points
  seoBody: string; // long-form SEO text
  imageAlt: string;
  /** Placeholder until admin uploads. Falls back to gold gradient if missing. */
  placeholderImage: string;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    slug: "checklist",
    cabinetPath: "/cabinet/checklist",
    emoji: "✅",
    title: "Checklist Eveniment",
    metaTitle: "Checklist Nuntă & Eveniment Online : ePetrecere.md",
    metaDescription:
      "Checklist complet pentru organizarea nunții, cumătriei sau botezului în Moldova. Sarcini cu termen, prioritate, progres salvat. Gratuit pe ePetrecere.md.",
    shortPitch:
      "Lista completă cu tot ce trebuie făcut pentru un eveniment perfect : de la rezervarea sălii până la mulțumirile finale.",
    features: [
      "Sarcini predefinite pe tipuri de eveniment (nuntă, botez, cumătrie, corporate)",
      "Termen-limită automate calculate față de data evenimentului",
      "Prioritate (înaltă/medie/scăzută) și progres salvat în cont",
      "Adaugă sarcini personalizate și asignează membri ai echipei",
      "Notificări când se apropie deadline-uri importante",
    ],
    seoBody: `## Checklist eveniment : totul în control, nimic uitat

Organizarea unei nunți sau a oricărui eveniment mare în Moldova implică zeci de sarcini distribuite pe luni de zile. Un checklist online te ajută să nu uiți nimic : de la rezervarea sălii cu 6 luni înainte, la confirmarea meniului final cu 2 săptămâni înainte și la mulțumirile post-eveniment.

## De ce un checklist online?

Spre deosebire de listele pe hârtie sau în notițe, un checklist online pe ePetrecere.md îți oferă:
- **Sincronizare** între tine și partener (sau echipa de organizare) : toți vedeți același progres
- **Termene calculate automat** față de data evenimentului : știi exact când să faci fiecare lucru
- **Categorii** (sală, artiști, foto-video, decor, juridic, transport) : vezi rapid ce e gata și ce nu
- **Notificări** când se apropie deadline-uri critice
- **Acces de pe orice dispozitiv** : telefon, tablet, laptop

## Ce conține checklist-ul standard pentru nuntă?

Checklist-ul predefinit pentru nuntă în Moldova include peste 80 de sarcini grupate pe perioade:
- **6-12 luni înainte**: rezervare sală, formație/DJ, foto-video, alegerea naşilor
- **3-6 luni înainte**: invitații, rochia miresei, costumul mirelui, verighete
- **1-3 luni înainte**: meniu final, decor, transport, lista invitați finală
- **2-4 săptămâni înainte**: confirmări telefonice, ședință foto pre-nuntă, listă servicii
- **1 săptămână înainte**: împachetare obiecte, repetiții, plata avansurilor
- **Ziua evenimentului**: timeline minut cu minut

## Începe gratuit acum

Creează-ți contul în mai puțin de 1 minut și deschide checklist-ul potrivit evenimentului tău. Toate sarcinile sunt deja pregătite : tu doar bifezi pe măsură ce le rezolvi.`,
    imageAlt: "Checklist online pentru organizarea nunții în Moldova",
    placeholderImage: "/images/utilitati/checklist-placeholder.jpg",
  },
  {
    slug: "budget",
    cabinetPath: "/cabinet/buget",
    emoji: "💰",
    title: "Buget și cheltuieli",
    metaTitle: "Buget Nuntă Online : Calculator Cheltuieli Moldova",
    metaDescription:
      "Urmărește bugetul nunții sau evenimentului tău în Moldova. Adaugă cheltuieli, vezi categoriile depășite, exportă raportul. Gratuit pe ePetrecere.md.",
    shortPitch:
      "Urmărește bugetul evenimentului în timp real : categorii, cheltuieli efective vs. estimate, export PDF.",
    features: [
      "Stabilește bugetul total și împarte pe categorii (sală, artiști, foto, decor, mâncare)",
      "Adaugă cheltuieli efective pe măsură ce se fac plățile",
      "Vezi într-un singur ecran cât ai cheltuit, cât mai ai și unde te depășești",
      "Notificări când o categorie ajunge la 80% din alocare",
      "Export raport PDF pentru documentație personală",
    ],
    seoBody: `## Bugetul nunții : sub control de la prima plată până la ultima

Cea mai mare sursă de stres la organizarea unei nunți în Moldova este urmărirea cheltuielilor. Avansuri pe ici, plăți pe colo, schimbări de meniu, costuri ascunse : la final te trezești că ai depășit bugetul cu 30%. Cu instrumentul Buget și cheltuieli de pe ePetrecere.md vezi clar fiecare leu unde a plecat.

## Cum funcționează?

1. **Stabilești bugetul total** (ex: 15.000€ pentru o nuntă de 200 invitați la Chișinău)
2. **Aloci pe categorii** (sală 30%, mâncare 25%, artiști 15%, foto-video 10%, decor 10%, alte 10%)
3. **Adaugi cheltuielile** pe măsură ce le faci : avansuri, plăți finale, surprize
4. **Vezi rapid** ce categorii sunt sub control și care s-au depășit

## Categorii standard pentru nuntă în Moldova

- **Sala / Restaurant** : închiriere, meniu, băuturi, taxă curățenie
- **Artiști & Divertisment** : DJ, formație, moderator, dansatori, focuri
- **Foto & Video** : fotograf, videograf, drone, editing premium, album
- **Decor & Floristică** : buchete, aranjamente mese, decor sală, lumini
- **Vestimentație** : rochia miresei, costumul mirelui, verighete, accesorii
- **Transport** : limuzină, autobuz invitați, mașini foto
- **Documente & Logistică** : taxe oficiu stare civilă, biserică, invitații

## Avantaje vs. Excel sau notițe

- **Vizualizare grafică** : bare de progres pe fiecare categorie
- **Acces de oriunde** : pe telefon, tabletă, laptop
- **Sincronizare** între tine și partener
- **Backup automat** : nu pierzi datele dacă schimbi telefonul
- **Export PDF** pentru a tipări dacă trebuie

## Începe gratuit

Creează-ți contul și începe să urmărești bugetul în 2 minute. Toate categoriile sunt pre-configurate : tu doar adaugi sumele.`,
    imageAlt: "Calculator buget pentru nuntă online : categorii și cheltuieli",
    placeholderImage: "/images/utilitati/budget-placeholder.jpg",
  },
  {
    slug: "invitatii-electronice",
    cabinetPath: "/cabinet/invitatii",
    emoji: "✉️",
    title: "Invitații Electronice",
    metaTitle: "Invitații Electronice Nuntă & Cumătrie în Moldova",
    metaDescription:
      "Creează invitații electronice profesioniste pentru nuntă, cumătrie sau botez în Moldova. Design elegant, RSVP online, link partajabil pe WhatsApp.",
    shortPitch:
      "Creează invitații electronice frumoase, trimite-le pe WhatsApp și colectează confirmările RSVP automat : fără hârtii.",
    features: [
      "Template-uri elegante adaptate pentru nuntă, cumătrie, botez și corporate",
      "Personalizare completă : text, imagini, culori, music background",
      "Link partajabil instant pe WhatsApp, Instagram, Email",
      "RSVP online : invitații confirmă cu un click",
      "Lista invitaților se actualizează automat din confirmări",
      "Codul QR pentru check-in la intrare",
    ],
    seoBody: `## Invitații electronice : economice, elegante, eco

Invitațiile pe hârtie sunt scumpe (3-10 lei pe bucată în Moldova), durează 2-3 săptămâni să le imprimi, le pierzi pe drum, iar invitații care le primesc pe WhatsApp oricum nu le păstrează. Invitațiile electronice rezolvă toate aceste probleme.

## De ce invitații electronice pentru evenimentul tău?

- **Cost redus** : pentru o nuntă de 200 invitați, economisești 600-2000 lei față de invitațiile tipărite
- **Trimitere instant** : generează link unic pentru fiecare invitat și-l trimiți pe WhatsApp
- **RSVP automat** : invitații dau click pe "Confirm prezența" și apare instant la tine
- **Update-uri ușoare** : schimbi locația în 2 click-uri, toți invitații văd noul detaliu
- **Cod QR pentru check-in** : la intrare scanezi codul de pe telefonul invitatului, marchezi prezența
- **Eco-friendly** : zero hârtie, zero plicuri, zero deplasări

## Tipuri de invitații disponibile

Pe ePetrecere.md găsești template-uri pentru:
- **Nuntă** : clasic elegant, modern minimalist, rustic, boho, glam
- **Cumătrie** : calde, familiale, cu accente populare
- **Botez** : delicate, romantice, cu motive religioase
- **Aniversări** : pentru copii, adulți, vârste de aur
- **Corporate** : pentru lansări, gale, evenimente de companie

## Personalizare completă

Cu instrumentul de invitații electronice, ai control total asupra:
- **Textului** : bilingv (română + rusă) pentru invitațiile mixte
- **Imaginilor** : încarci poze cu mirii / sărbătoriți
- **Culorilor** : palete predefinite sau custom
- **Muzicii** : adaugi un fond muzical scurt
- **Detaliilor logistice** : locația cu hartă, agenda evenimentului, contact

## Începe acum gratuit

Creează-ți contul, alege un template și trimite primele invitații în 10 minute.`,
    imageAlt: "Invitații electronice pentru nuntă : template și RSVP online",
    placeholderImage: "/images/utilitati/invitatii-placeholder.jpg",
  },
  {
    slug: "lista-invitati",
    cabinetPath: "/cabinet/invitatii",
    emoji: "👥",
    title: "Listă Invitați & Așezare Mese",
    metaTitle: "Listă Invitați Nuntă + Așezare Mese Online | Moldova",
    metaDescription:
      "Gestionează lista invitaților și așezarea la mese pentru nunta sau evenimentul tău în Moldova. Drag & drop, RSVP, mesaje în masă. ePetrecere.md.",
    shortPitch:
      "Gestionează lista invitaților, marchează confirmările și așază-i la mese cu drag & drop : totul într-un singur loc.",
    features: [
      "Lista invitaților cu nume, telefon, email, status RSVP",
      "Import din Excel sau CSV (păstrează listele vechi)",
      "Trimite mesaje în masă pe WhatsApp (link invitație, reminder)",
      "Așezare mese vizuală : drag & drop, mese rotunde sau dreptunghiulare",
      "Restricții (pe vârstă, alergii, scaune speciale) păstrate cu invitatul",
      "Print final tabel mese pentru ospătari",
    ],
    seoBody: `## Listă invitați și așezare la mese : fără stres în zilele dinaintea nunții

Cu o săptămână înainte de nuntă, multe cupluri din Moldova încă încearcă să decidă cine cu cine stă la masă. Este un dezastru organizatoric care duce la nopți pierdute și uneori la conflicte de familie. Instrumentul Listă Invitați & Așezare Mese de pe ePetrecere.md face asta în 30 de minute.

## De ce un instrument digital?

Listele pe hârtie / Excel funcționează, dar:
- **Nu vezi vizual** cum se distribuie oamenii
- **Nu sincronizează** între tine și partener
- **Nu se updatează automat** când cineva confirmă / refuză
- **Nu generează print final** pentru ospătari

Cu instrumentul nostru, lista invitaților e centrală și se conectează automat cu invitațiile electronice, RSVP-urile și planul de mese.

## Funcționalități cheie

### Lista invitați
- Adaugă manual sau **import din Excel**
- **Categorii**: familia mirelui, familia miresei, prieteni, colegi, nași
- **Status RSVP** : invitat / a confirmat / a refuzat / nu a răspuns
- **Detalii**: alergii, scaun copil, vârsta, persoană însoțitoare
- **Telefon + email** pentru reminder-e

### Așezare la mese
- Mese **rotunde** (8-12 persoane) sau **dreptunghiulare** (10-16)
- **Drag & drop** : muți invitații cu mouse-ul / degetul
- **Mese pre-configurate** pentru evenimente standard moldovenești
- **Restricții** : invitații cu copii la mese speciale, naşii la masa principală
- **Vizualizare grafică** : vezi tot planul de aranjare la o privire

### Print final pentru ospătari
La final, generezi automat un PDF cu:
- Plan grafic al sălii cu mesele numerotate
- Lista alfabetică a invitaților + numărul mesei
- Lista per masă (cine cu cine stă)
- Restricții speciale (alergii, scaune copii)

## Trimite mesaje în masă

Tot din același instrument poți:
- **Trimite link invitație** la toți invitații prin WhatsApp
- **Reminder cu 1 săptămână** înainte celor care nu au confirmat
- **Update de last-minute** (schimbarea locației, agenda)
- **Mulțumiri post-eveniment** cu link la galeria foto

## Începe gratuit

Înregistrează-te în 1 minut și începe să adaugi invitații.`,
    imageAlt: "Listă invitați și așezare la mese pentru nuntă online",
    placeholderImage: "/images/utilitati/lista-invitati-placeholder.jpg",
  },
  {
    slug: "momente-eveniment",
    cabinetPath: "/cabinet/moments",
    emoji: "📸",
    title: "Momente Eveniment",
    metaTitle: "Momente Eveniment & Galerie Foto Nuntă : Moldova",
    metaDescription:
      "Colectează poze de la invitații nunții sau evenimentului tău în Moldova. Galerie comună, link partajabil, descărcare instant pe ePetrecere.md.",
    shortPitch:
      "Colectează toate pozele de la invitații tăi într-o galerie comună : fără să mai scrii la fiecare în parte.",
    features: [
      "Galerie comună unde invitații încarcă poze direct de pe telefon",
      "Link unic + cod QR de partajat la intrare sau la mese",
      "Toate pozele apar în timp real : vezi momentele cum se întâmplă",
      "Filtrare după invitat (cine ce a încărcat) și moment (ceremonia, dansuri, party)",
      "Descărcare în masă a tuturor pozelor după eveniment",
      "Album partajabil cu părinții și familia post-eveniment",
    ],
    seoBody: `## Toate pozele de la nuntă, într-un singur loc

La o nuntă obișnuită din Moldova, fiecare invitat face între 20 și 100 de poze cu telefonul. Asta înseamnă 4.000-20.000 de poze totale : pe care le pierzi pentru totdeauna pentru că nimeni nu ți le trimite. Instrumentul Momente Eveniment de pe ePetrecere.md rezolvă această problemă.

## Cum funcționează?

1. Creezi un eveniment (nuntă, cumătrie, botez)
2. Generezi un **link unic** și un **cod QR**
3. Plasezi codul QR la intrare, la mese sau în invitația electronică
4. Invitații **scanează codul** sau **apasă pe link**
5. Pe telefonul lor se deschide o pagină simplă: "Adaugă poze de la nuntă"
6. **Pozele apar instant** în galeria ta comună : în timp real, pe ecranul tău mare la sală

## Avantaje uriașe

### Pentru tine
- **NU mai aștepti săptămâni** să primești pozele de la fiecare invitat
- **Nu pierzi momente** pe care invitații le-au surprins în timp ce tu erai prins
- **Album complet** cu toate perspectivele : nu doar ce a văzut fotograful oficial
- **Descărcare în masă** : toate pozele într-un ZIP la sfârșitul nopții

### Pentru invitați
- **Nu trebuie să se înregistreze** nicăieri
- **Nu trebuie aplicații** speciale : totul prin browser
- **Văd și ei** ce au încărcat alții : atmosferă de "wedding hashtag" digitală

## Cazuri de utilizare

- **Nuntă** : colectezi toate momentele, inclusiv petrecerea de noapte când fotograful a plecat
- **Cumătrie / Botez** : când nu există fotograf oficial, dar vrei poze cu copilul cu fiecare invitat
- **Corporate** : team-building, lansări, conferințe : pentru raport intern
- **Aniversări** : în special copii : colectezi toate pozele de la prieteni

## Securitate și control

- Galeria e **privată** : accesibilă doar prin linkul tău
- Tu poți **șterge** poze nepotrivite oricând
- **Backup automat** pe servere securizate
- Galerie disponibilă **30 zile** după eveniment, apoi descărcare completă

## Începe gratuit

Creează contul și galeria în 2 minute. Codul QR e gata de printat în 5 minute.`,
    imageAlt: "Galerie foto nuntă : colectare poze de la invitați online",
    placeholderImage: "/images/utilitati/momente-placeholder.jpg",
  },
];

export const TOOLS_BY_SLUG: Record<string, ToolDef> = TOOL_DEFS.reduce(
  (acc, tool) => {
    acc[tool.slug] = tool;
    return acc;
  },
  {} as Record<string, ToolDef>,
);
