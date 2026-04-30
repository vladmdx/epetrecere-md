// One-shot seed: populate Romanian SEO content for every artist + service
// category, optimized for Moldova / Chișinău local search intent. Skips
// imageUrl entirely — admin will replace those manually.
//
// Run with:
//   DATABASE_URL=... npx tsx scripts/seed-category-seo.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

interface CategorySeed {
  slug: string;
  imageAlt: string;
  shortDescription: string; // 1-2 sentences shown above grid
  seoTitle: string; // <60 chars
  seoDescription: string; // <160 chars
  seoBody: string; // long-form, paragraphs separated by blank lines
}

const CATEGORIES: CategorySeed[] = [
  // ── ARTIST ───────────────────────────────────────────────
  {
    slug: "moderatori",
    imageAlt: "Moderator profesionist la nuntă în Chișinău, Moldova",
    shortDescription:
      "Moderatori și prezentatori profesioniști pentru nuntă, cumătrie, botez și evenimente corporate în Moldova.",
    seoTitle: "Moderatori pentru Nuntă în Chișinău, Moldova — ePetrecere.md",
    seoDescription:
      "Cei mai buni moderatori și prezentatori MC pentru nunta, cumătria sau evenimentul tău în Moldova. Profile verificate, prețuri transparente, recenzii reale.",
    seoBody: `## Moderatori profesioniști pentru evenimente în Moldova

Pe ePetrecere.md găsești cei mai buni moderatori și prezentatori (MC) pentru nuntă, cumătrie, botez și evenimente corporate din Chișinău, Bălți, Cahul, Orhei și restul Republicii Moldova. Toți moderatorii noștri au experiență dovedită, profile verificate și recenzii reale de la clienți care au organizat deja evenimente.

## De ce contează un moderator bun la nuntă?

Moderatorul este liantul care ține petrecerea unită — el conduce ceremonia, prezintă momentele importante (intrarea mirilor, dansul mirilor, tortul, aruncarea buchetului), gestionează tranzițiile cu DJ-ul și formația și menține atmosfera pe parcursul întregii seri. Un moderator profesionist din Moldova știe specificul nunților moldovenești — alternanța dintre tradițional și modern, momentele de cumătrie, hora și sârba, dar și cum să integreze invitații vorbitori de limba rusă sau engleză.

## Cât costă un moderator în Moldova?

Tariful unui moderator în Chișinău începe de la 200€ pentru evenimente scurte (botez, cumătrie, corporate) și ajunge la 500-1000€ pentru moderatorii premium, bilingvi sau cu programe show incluse. Pe ePetrecere.md vezi prețul de start direct pe profil, iar la rezervare poți negocia direct cu moderatorul prin chat.

## Cum alegi moderatorul potrivit?

Verifică portfolio-ul (video din evenimente reale), citește recenziile, asigură-te că are experiență în tipul tău de eveniment (nunți tradiționale moldovenești, evenimente corporate, botez creștin etc.) și verifică disponibilitatea calendarului direct pe ePetrecere.md. Toate rezervările sunt protejate — nu plătești nimic în plus, prețul agreat în chat e prețul final.`,
  },
  {
    slug: "dj",
    imageAlt: "DJ profesionist la nuntă cu lumini și echipament în Chișinău",
    shortDescription:
      "DJ profesioniști pentru nuntă, corporate și aniversare în Moldova — echipament propriu, mix de muzică pentru toate gusturile.",
    seoTitle: "DJ pentru Nuntă și Petreceri în Chișinău, Moldova",
    seoDescription:
      "Rezervă cei mai buni DJ-i din Moldova pentru nuntă, corporate sau aniversare. Echipament propriu, lumini, mix muzical adaptat pentru fiecare eveniment.",
    seoBody: `## DJ-i profesioniști pentru evenimente în Moldova

Pe ePetrecere.md poți rezerva direct cei mai buni DJ-i din Chișinău, Bălți și restul Moldovei pentru nuntă, aniversare, petrecere corporate, club party sau orice alt tip de eveniment. Toți DJ-ii noștri au echipament propriu (boxe, mixer, lumini), portfolio video și recenzii verificate.

## Ce muzică poate mixa un DJ moldovenesc?

DJ-ii din Moldova sunt obișnuiți cu publicul mixt — alternează fluent între muzică populară românească și moldovenească (Adi de la Vâlcea, Andra, Vali Vijelie, Dan Bursuc), hituri internaționale (pop, hip-hop, EDM), muzică rusă/sovietică pentru invitații mai în vârstă și genuri specifice (manele, retro, house). Un DJ bun la nuntă citește publicul și schimbă atmosfera de la momente romantice (dans miri) la party sus.

## Cât costă un DJ în Chișinău?

Prețurile pornesc de la 150-200€ pentru evenimente de 4-6 ore (botez, cumătrie, aniversare) și urcă la 400-700€ pentru nunți de 8-12 ore cu echipament premium și show de lumini extins. Vezi prețul de start direct pe fiecare profil de DJ și negociază în chat cu prețuri transparente.

## DJ + echipament inclus sau separat?

Majoritatea DJ-ilor de pe ePetrecere.md vin cu propria stație profesională — boxe, mixer, microfoane, lumini de bază. Pentru evenimente mai mari (peste 200 invitați) sau locații fără sonorizare, poți rezerva separat și echipament tehnic suplimentar (proiectoare, lumini moving heads, fum). Verifică în descrierea DJ-ului ce e inclus și ce se închiriază adițional.`,
  },
  {
    slug: "cantareti",
    imageAlt: "Cântăreț profesionist pe scenă la eveniment în Moldova",
    shortDescription:
      "Cântăreți profesioniști pentru nuntă, corporate, concert și aniversări în Moldova — voci excepționale pentru momentele speciale.",
    seoTitle: "Cântăreți pentru Evenimente în Chișinău, Moldova",
    seoDescription:
      "Rezervă cântăreți profesioniști din Moldova pentru nuntă, aniversare sau concert. Repertoriu variat — pop, populară, romantică, retro. Audiție și prețuri în profil.",
    seoBody: `## Cântăreți profesioniști pentru orice eveniment în Moldova

Pe ePetrecere.md găsești cântăreți pentru toate stilurile și ocaziile — de la voci de estradă pentru nunți și cumătrii în Chișinău, până la artiști pentru concerte private și evenimente corporate în toată Moldova. Fiecare cântăreț are profil cu sample-uri audio, video live și calendar de disponibilitate actualizat.

## Stiluri muzicale disponibile

Repertoriul cântăreților din Moldova acoperă tot — muzică populară românească și moldovenească pentru momentele tradiționale ale nunții, pop internațional și românesc pentru atmosfera modernă, romantice și balade pentru dansul mirilor, retro 80-90 pentru invitații mai în vârstă, și covere internaționale (engleză, italiană, spaniolă) pentru evenimente mai cosmopolite.

## Cât costă un cântăreț la nuntă în Moldova?

Prețurile încep de la 200-300€ pentru cântăreți la evenimente scurte și pot ajunge la 1500-3000€ pentru artiști renumiți cu nume de scenă cunoscute. Cântăreții care vin cu propria formație au prețuri mai ridicate (incluse repetiția și echipamentul). Pe ePetrecere.md vezi prețul "de la" direct pe card și poți negocia în chat fără comisioane ascunse.

## Cum aleg cântărețul potrivit?

Ascultă sample-urile audio din profil, verifică video-urile live (atmosferă, voce reală fără auto-tune), citește recenziile clienților anteriori și asigură-te că repertoriul lor include genurile tale. Pentru nunți recomandăm cântăreți cu experiență în muzică populară moldovenească — pentru momentele de horă, sârbă și cumătrie.`,
  },
  {
    slug: "cantareti-de-estrada",
    imageAlt: "Cântăreață de estradă la nuntă cu microfon și rochie elegantă",
    shortDescription:
      "Cântăreți de estradă cu repertoriu pop, romantic și retro pentru nunți și evenimente în Moldova.",
    seoTitle: "Cântăreți de Estradă pentru Nuntă în Moldova",
    seoDescription:
      "Cântăreți de estradă pentru nunta sau evenimentul tău în Chișinău și Moldova. Pop, romantice, retro, populară. Sample-uri audio și video în profil.",
    seoBody: `## Cântăreți de estradă pentru nunți în Moldova

Estrada este genul muzical clasic al nunților moldovenești — pop romantic, balade, hituri retro și interpretări live ale celor mai populare melodii din spațiul ex-sovietic și european. Pe ePetrecere.md poți rezerva cântăreți de estradă din Chișinău, Bălți și alte orașe pentru nuntă, cumătrie, aniversare sau concert privat.

## Repertoriu tipic

Un cântăreț de estradă moldovenesc are de obicei 2-3 ore de repertoriu live — combinație de pop românesc (Andra, Loredana, Inna), pop rusesc (Стас Михайлов, Григорий Лепс), balade internaționale (Whitney Houston, Celine Dion, Adele) și muzică populară pentru momentele tradiționale. Pentru nunți, repertoriul se adaptează la momentele cheie — intrarea mirilor, dansul mirilor, ridicarea voalului.

## Preț orientativ

Cântăreții de estradă în Moldova au prețuri pornind de la 200€ pentru un program de 1-2 ore și 500-1500€ pentru cântăreți cu nume și formație de însoțire inclusă. Verifică în chat dacă prețul include echipamentul de sonorizare sau dacă acesta se închiriază separat.`,
  },
  {
    slug: "interpreti-muzica-populara",
    imageAlt: "Interpreți de muzică populară moldovenească la cumătrie",
    shortDescription:
      "Interpreți autentici de muzică populară moldovenească și românească pentru nuntă, cumătrie și sărbători tradiționale.",
    seoTitle: "Interpreți Muzică Populară Moldovenească pentru Evenimente",
    seoDescription:
      "Cei mai buni interpreți de muzică populară moldovenească pentru nuntă, cumătrie, botez și sărbători. Repertoriu autentic și voci de neuitat. Rezervare online.",
    seoBody: `## Muzica populară — sufletul nunților moldovenești

Pe ePetrecere.md găsești interpreți autentici de muzică populară moldovenească și românească, cu repertoriu bogat de doine, hore, sârbe, brâuri și cântece bătrânești. Sunt cântăreții care creează atmosfera adevărată la nuntă, cumătrie, botez și la orice eveniment unde tradiția și ospitalitatea moldovenească contează.

## Tipuri de evenimente potrivite

Muzica populară este indispensabilă la momentele tradiționale ale nunții moldovenești — dansul socrilor, hora la masă, jocul cu nașii, alaiul de cumetri. La cumătrie și botez, repertoriul se concentrează pe melodii calde, cântece pentru părinți și nași, și momente vesele cu joc. La sărbătorile naționale, evenimentele turistice și concertele tematice, interpreții de muzică populară aduc autenticitatea peisajului cultural moldovenesc.

## Preț și rezervare

Prețurile încep de la 250-400€ pentru un interpret solo cu acompaniament și pot ajunge la 1000-2500€ pentru ansambluri mari cu instrumente live (acordeon, vioară, fluier, cobză). Rezervă din timp — interpreții buni de muzică populară din Moldova sunt rezervați cu luni înainte pentru sezonul de nunți (mai-octombrie).`,
  },
  {
    slug: "formatii",
    imageAlt: "Formație live la nuntă cu instrumente și cântăreț în Moldova",
    shortDescription:
      "Formații muzicale live pentru nuntă, cumătrie, corporate și concerte în toată Moldova.",
    seoTitle: "Formații pentru Nuntă în Chișinău, Moldova",
    seoDescription:
      "Rezervă formații muzicale live pentru nunta sau evenimentul tău în Moldova. Repertoriu adaptat — populară, pop, retro, internațional. Demo audio și video.",
    seoBody: `## Formații muzicale live pentru evenimente în Moldova

Pe ePetrecere.md poți rezerva formații live pentru nuntă, cumătrie, corporate sau orice eveniment unde muzica live face diferența față de un DJ. Avem formații complete (cântăreți + instrumente live), trupe specializate pe genuri (jazz, rock, populară, latino) și ansambluri pentru evenimente mari.

## Ce repertoriu acoperă o formație în Moldova?

Formațiile profesioniste din Chișinău și Moldova au în repertoriu zeci de melodii din genuri variate — populară românească și moldovenească pentru momentele tradiționale, hituri internaționale (Beatles, Queen, ABBA), pop modern (Bruno Mars, Coldplay, Rihanna), romantice pentru dansul mirilor și piese rusești pentru invitații mai în vârstă. O formație bună adaptează lista de melodii înainte de eveniment împreună cu organizatorii.

## Cât costă o formație de nuntă?

Prețurile pornesc de la 500€ pentru formații cu 3-4 membri (perfecte pentru cumătrii și evenimente mai mici) și ajung la 2000-5000€ pentru formații mari de 6-10 membri cu reputație în Moldova. Pe ePetrecere.md vezi prețul de start direct în profil și poți discuta detaliile cu liderul formației prin chat.

## Formație + DJ împreună sau separat?

Combinația ideală pentru nunți moldovenești e formație live pentru momentele importante (3-4 ore) și DJ pentru after party. Multe formații colaborează deja cu DJ-i sau pot recomanda parteneri de încredere. Discută în chat cu formația ta dacă fac transition direct sau dacă rezervi separat.`,
  },
  {
    slug: "cover-band",
    imageAlt: "Cover band cu chitară și tobe la concert în Chișinău",
    shortDescription:
      "Cover band-uri pentru evenimente private, corporate și nunți — covere live ale celor mai populare hituri.",
    seoTitle: "Cover Band pentru Evenimente în Moldova",
    seoDescription:
      "Cover band-uri profesioniste din Moldova pentru nuntă, corporate și petreceri private. Hituri internaționale și românești în interpretare live de calitate.",
    seoBody: `## Cover band-uri pentru evenimente moderne în Moldova

Un cover band aduce energia muzicii live cu repertoriul cunoscut al hiturilor populare — perfect pentru clienții care vor atmosferă autentică, dar fără a pierde melodiile preferate. Pe ePetrecere.md găsești cover band-uri din Chișinău și Moldova specializate pe rock clasic, pop, indie, jazz și genuri internaționale.

## Cu ce se diferențiază un cover band de o formație tradițională?

Un cover band se concentrează pe interpretarea live a melodiilor cunoscute (Queen, Coldplay, Maroon 5, ABBA, Imagine Dragons), de obicei într-un format apropiat de original. O formație tradițională are repertoriu mai larg, incluzând muzică populară. Cover band-urile sunt alegerea ideală pentru evenimente corporate, lansări de produs, petreceri private sau nunți unde clienții vor o atmosferă mai modernă și internațională.

## Tarife și disponibilitate

Cover band-urile bune din Moldova au prețuri pornind de la 600-1000€ pentru un set de 2-3 ore și ajung la 2500-4000€ pentru concerte private mai lungi sau evenimente corporate cu cerințe tehnice mai mari. Rezervă cu cel puțin 2-3 luni înainte pentru a prinde band-ul preferat.`,
  },
  {
    slug: "instrumentalisti",
    imageAlt: "Violonist și instrumentaliști live la nuntă elegantă",
    shortDescription:
      "Instrumentaliști solo și grupuri pentru ceremonia civilă, ritual de cunună sau momente romantice la nuntă.",
    seoTitle: "Instrumentaliști pentru Nuntă în Moldova — Ceremonie",
    seoDescription:
      "Violonisti, pianiști, saxofoniști și instrumentaliști pentru ceremonia de nuntă, cocktail party și momente speciale. Atmosferă rafinată în Chișinău, Moldova.",
    seoBody: `## Instrumentaliști pentru momentele rafinate ale evenimentului

Un violonist la ceremonia civilă, un saxofonist la cocktail party-ul de la nuntă, un pianist la cina de logodnă — instrumentaliștii live transformă orice moment într-o experiență memorabilă. Pe ePetrecere.md găsești instrumentaliști solo și grupuri mici (duo, trio) din Chișinău și Moldova pentru toate tipurile de evenimente.

## Tipuri de instrumentaliști disponibili

- **Violoniști** — pentru ceremonia civilă, intrarea miresei, momente romantice
- **Pianiști** — pentru recepție, cocktail party, dineu elegant
- **Saxofoniști** — pentru atmosferă jazz / lounge, after-party
- **Chitariști clasici și flamenco** — pentru cocktail-uri și momente de relaxare
- **Acordeoniști** — pentru atmosferă tradițională și muzică populară

## Preț orientativ

Un instrumentalist solo costă între 150-300€ pentru o oră de program la nuntă sau eveniment privat. Pentru grupuri mici (trio, cvartet), prețurile pornesc de la 400-600€. Verifică în profilul fiecărui artist sample audio și video înainte să rezervi.`,
  },
  {
    slug: "cvartet",
    imageAlt: "Cvartet de coarde la ceremonia de nuntă elegantă în Moldova",
    shortDescription:
      "Cvartete clasice și moderne pentru ceremonia civilă, cocktail party și momente speciale la nuntă în Moldova.",
    seoTitle: "Cvartet pentru Nuntă și Ceremonii în Chișinău",
    seoDescription:
      "Cvartete profesioniste pentru ceremonia de nuntă, cocktail party și evenimente elegante în Moldova. Repertoriu clasic și covere moderne pentru atmosferă rafinată.",
    seoBody: `## Cvartet pentru atmosferă elegantă la evenimentul tău

Un cvartet este alegerea perfectă pentru cei care vor să transforme momente cheie ale evenimentului — ceremonia civilă, intrarea miresei, dineul de gală — într-o experiență sofisticată. Pe ePetrecere.md găsești cvartete din Chișinău cu repertoriu clasic (Bach, Vivaldi, Pachelbel) și covere moderne (Coldplay, Adele, Ed Sheeran) interpretate la coarde sau alte combinații instrumentale.

## Tipuri de cvartete disponibile

- **Cvartet de coarde** (2 viori, violă, violoncel) — clasic, elegant, ideal pentru ceremonie
- **Cvartet vocal a cappella** — pentru momente speciale fără instrumente
- **Cvartet jazz** (saxofon, pian, contrabas, baterie) — pentru cocktail party
- **Cvartet pop / cover** — pentru recepție mai relaxată

## Cât costă un cvartet la nuntă în Moldova?

Cvartetele clasice profesioniste din Moldova au prețuri între 600-1200€ pentru un program de 1-2 ore. Pentru evenimente lungi (3+ ore) sau cvartete cu solist invitat, prețurile cresc la 1500-2500€. Rezervă cu cel puțin 2 luni înainte — cvartetele bune sunt rezervate rapid pentru sezonul de nunți.`,
  },
  {
    slug: "dansatori",
    imageAlt: "Dansatori profesioniști într-un show la nuntă în Chișinău",
    shortDescription:
      "Dansatori profesioniști pentru show-uri la nuntă, corporate și evenimente speciale în Moldova.",
    seoTitle: "Dansatori Profesioniști pentru Show la Nuntă în Moldova",
    seoDescription:
      "Show-uri de dans profesionist pentru nunta sau evenimentul tău în Chișinău. Stiluri variate — modern, latino, clasic, contemporan. Costume și coregrafii spectaculoase.",
    seoBody: `## Dansatori profesioniști pentru momente WOW la evenimentul tău

Un show de dans profesionist transformă orice eveniment într-o experiență de neuitat. Pe ePetrecere.md găsești dansatori solo, perechi și grupuri (4-12 persoane) pentru nunți, evenimente corporate, lansări, petreceri tematice și concerte private în Chișinău și toată Moldova.

## Stiluri de dans disponibile

- **Dans contemporan și modern** — pentru momente artistice și emoționale
- **Latino** (salsa, bachata, samba) — pentru atmosferă fierbinte
- **Hip-hop și street dance** — pentru show-uri energice
- **Clasic și balet** — pentru momente rafinate
- **Dans de seducție și show de scenă** — pentru evenimente premium

## Costume și coregrafii personalizate

Majoritatea echipelor de dansatori din Moldova vin cu mai multe seturi de costume incluse în preț și pot adapta coregrafia la tema evenimentului tău. Pentru nunți, momentul popular este show-ul "First Dance" sau intrarea spectaculoasă a mirilor, urmate de ore lungi de party.

## Tarife

Un dansator solo / pereche costă 200-400€ pentru un show de 5-10 minute. Echipele de 4-8 dansatori au prețuri între 600-2000€ în funcție de numărul de show-uri, costumele și complexitatea coregrafiei. Pentru evenimente mari cu mai multe momente, negociază pachetul direct în chat.`,
  },
  {
    slug: "dansuri-populare",
    imageAlt: "Ansamblu de dansuri populare moldovenești la nuntă",
    shortDescription:
      "Ansambluri de dansuri populare moldovenești și românești pentru nuntă, sărbători tradiționale și concerte.",
    seoTitle: "Dansuri Populare Moldovenești pentru Nuntă",
    seoDescription:
      "Ansambluri profesioniste de dansuri populare moldovenești și românești pentru nuntă, cumătrie și sărbători. Costume tradiționale și coregrafii autentice.",
    seoBody: `## Dansuri populare moldovenești — autenticitate la evenimentul tău

Un show de dansuri populare este momentul tradițional indispensabil al multor nunți moldovenești și românești. Pe ePetrecere.md găsești ansambluri profesioniste din Chișinău și toată Moldova specializate pe folclor moldovenesc, românesc și balcanic, cu costume autentice și coregrafii lucrate de zeci de ani.

## Repertoriu tradițional

Ansamblurile de dansuri populare din Moldova interpretează **hora**, **sârba**, **brâul**, **bătuta**, **mărunțica** și alte dansuri ritmice tipice spațiului românesc. Pentru momentele speciale ale nunții — intrarea mirilor, jocul nașilor, ruperea cununiei — show-ul de dansuri populare aduce o încărcătură emoțională și culturală unică.

## Ansamblu mic vs. mare

- **Pereche / cvartet** (2-4 dansatori) — pentru evenimente intime, prețuri 300-600€
- **Ansamblu mediu** (6-10 dansatori) — show-uri de 15-20 minute, prețuri 800-1500€
- **Ansamblu mare** (12-20 dansatori) — show-uri de gală, prețuri 2000-4000€

Costumele tradiționale (ie, catrință, brâu, opinci) sunt incluse. Verifică în profil video-uri din spectacole reale ca să vezi nivelul artistic.`,
  },
  {
    slug: "ansamblu-tiganesc",
    imageAlt: "Ansamblu țigănesc cu costume și instrumente la nuntă",
    shortDescription:
      "Ansambluri țigănești autentice cu cântăreți, dansatori și instrumentiști pentru nunți și evenimente vesele.",
    seoTitle: "Ansamblu Țigănesc pentru Nuntă în Moldova",
    seoDescription:
      "Ansambluri țigănești cu cântăreți, dansatori și formație live pentru nunta sau petrecerea ta în Chișinău. Show-uri energice, costume autentice, atmosferă fierbinte.",
    seoBody: `## Ansamblu țigănesc — energie și atmosferă caldă la nuntă

Un ansamblu țigănesc aduce atmosfera unică pe care doar muzica și dansurile țigănești o pot crea — energie, pasiune, ritm și culoare. Perfect pentru nunți moldovenești tradiționale, petreceri private sau evenimente tematice unde vrei un show de neuitat.

## Componența ansamblului

Un ansamblu țigănesc complet din Moldova include de obicei:
- 2-3 **cântăreți / cântărețe** cu repertoriu clasic țigănesc (Очи Чёрные, Шумел Камыш) și românesc
- 4-6 **dansatori și dansatoare** în costume tradiționale
- **Formație live** — chitară, acordeon, vioară, contrabas
- Show de 15-30 minute cu mai multe momente coregrafice

## Pentru ce evenimente?

Ansamblul țigănesc se potrivește perfect la nuntă (după ceremonia civilă, ca moment surpriză), petreceri private cu prietenii (atmosferă boemă), evenimente corporate cu temă (rusă, balcanică, est-europeană) sau aniversări mari unde vrei să impresionezi invitații.

## Tarife

Show-urile complete de ansamblu țigănesc costă 1000-2500€ în funcție de numărul de artiști și durata programului. Multe ansambluri pot adapta show-ul la tematica evenimentului — discută detaliile direct în chat cu liderul ansamblului.`,
  },
  {
    slug: "dans-oriental",
    imageAlt: "Dansatoare de dans oriental cu costum strălucitor pe scenă",
    shortDescription:
      "Show-uri de dans oriental (belly dance) pentru evenimente private, petreceri tematice și surprize romantice.",
    seoTitle: "Dans Oriental pentru Evenimente în Chișinău",
    seoDescription:
      "Dansatoare profesioniste de dans oriental (belly dance) pentru petreceri private, aniversări și evenimente tematice în Moldova. Costume autentice, atmosferă magică.",
    seoBody: `## Dans oriental — magie și senzualitate la evenimentul tău

Dansul oriental (belly dance) este un show spectaculos cu rădăcini în Egipt, Liban și Turcia, perfect pentru a aduce o notă exotică la evenimentul tău din Chișinău sau oriunde în Moldova. Pe ePetrecere.md găsești dansatoare profesioniste cu zeci de spectacole în portfolio.

## Tipuri de show-uri

- **Show clasic egiptean** — costume bogate, evantai, voal, sabie
- **Tribal fusion** — stil modern, mai energic
- **Show-uri tematice** — Las Vegas, Bollywood, fusion oriental + modern
- **Show + lecție de dans** pentru invitații care vor să încerce

## Pentru ce evenimente se potrivește?

Aniversări (în special bărbăteşti — burlăcițe, surpriză romantică), petreceri private cu prietenii, evenimente corporate cu tematică internațională, festivaluri și concerte private. Mai puțin recomandat pentru cumătrii și botez (audiență tradițională cu copii).

## Preț

Un show de dans oriental durează 5-15 minute și costă 200-500€ în funcție de complexitatea costumelor și numărul de schimbări. Pachetele cu lecție inclusă sau show-uri mai lungi cu mai multe dansatoare ajung la 800-1500€.`,
  },
  {
    slug: "striptiz",
    imageAlt: "Show de striptiz profesionist la petrecere privată",
    shortDescription:
      "Show-uri de striptiz pentru petreceri burlăcițe / burlaci și evenimente private — discreție garantată.",
    seoTitle: "Show Striptiz pentru Burlăcițe / Burlaci în Chișinău",
    seoDescription:
      "Show-uri de striptiz profesionist pentru burlăcițe, burlaci și petreceri private în Chișinău. Discreție totală, profile verificate, locații private sau cluburi.",
    seoBody: `## Show striptiz pentru petrecerile tale private

Pe ePetrecere.md poți rezerva discret și sigur show-uri de striptiz profesionist pentru petrecerile burlăcițelor, ale burlacilor sau alte evenimente private exclusiv pentru adulți. Toți artiștii sunt profesioniști cu experiență de scenă și show-uri lucrate.

## Tipuri de show-uri

- **Striptiz feminin** — pentru petreceri de burlaci, aniversări masculine
- **Striptiz masculin** — pentru petreceri de burlăcițe, aniversări feminine
- **Show-uri tematice** — polițist, pompier, marinar, doctor (pentru momentul surpriză)
- **Show de pereche** — programe coregrafiate de 2 dansatori

## Discreție și siguranță

Toți artiștii de pe ePetrecere.md sunt profesioniști — nu sunt amatori. Discuția se face prin chat-ul platformei (toate conversațiile rămân private), iar locația poate fi privată (vilă, hotel) sau în cluburile partenere din Chișinău. Pentru evenimente speciale există și opțiuni cu show-uri exclusive în VIP.

## Preț orientativ

Un show standard de striptiz durează 8-15 minute și costă 150-400€ în funcție de artist și complexitatea costumului. Pachete cu mai multe show-uri sau seri întregi de divertisment se negociază direct în chat.

**Important:** Show-urile sunt destinate exclusiv adulților (18+) și se desfășoară în locații private sau cluburi specializate.`,
  },
  {
    slug: "show-program",
    imageAlt: "Show program complet cu dansatori și artiști pe scenă",
    shortDescription:
      "Pachete complete show program pentru evenimente — combinații de dans, magie, animatori și momente surpriză.",
    seoTitle: "Show Program pentru Evenimente Mari în Moldova",
    seoDescription:
      "Pachete complete show program pentru nunți, corporate și evenimente private în Moldova. Dansatori, magicieni, focuri de artificii — totul într-un singur show.",
    seoBody: `## Show program — totul într-un singur pachet

Un show program este combinația perfectă de divertisment pentru evenimentele mari unde vrei să oferi invitaților o experiență completă, fără să rezervi separat fiecare artist. Pe ePetrecere.md găsești pachete show program coordonate de profesioniști din Chișinău, perfecte pentru nunți premium, evenimente corporate sau aniversări speciale.

## Ce conține un show program tipic?

Un pachet complet poate include:
- **Show de dans** (3-5 momente coregrafiate)
- **Magicien sau iluzionist** (15-20 minute)
- **Animatori** pentru momentele de tranziție
- **Show de focuri** sau efecte speciale
- **MC / prezentator** care leagă toate momentele

Show program-ul durează 1-2 ore și e structurat ca o mini-petrecere în interiorul evenimentului tău.

## Avantaje vs. rezervare separată

Rezervând un show program complet de la un singur furnizor:
- Plătești mai puțin decât suma rezervărilor individuale
- Toate tranzițiile sunt sincronizate (un singur MC, o singură muzică, lumini coordonate)
- Ai un singur partener pentru comunicare și logistică
- Echipamentul tehnic e adus de o echipă unică

## Tarife

Pachetele show program complete costă între 1500-5000€ pentru evenimente medii (50-100 invitați) și 5000-12000€ pentru evenimente premium cu efecte speciale, dansatori internaționali și show-uri unice. Discută detaliile cu producătorul direct în chat.`,
  },
  {
    slug: "iluzionisti-magicieni",
    imageAlt: "Iluzionist cu pălărie și carduri la show de magie",
    shortDescription:
      "Magicieni și iluzioniști profesioniști pentru nuntă, corporate și petreceri tematice — show-uri close-up sau scenă.",
    seoTitle: "Iluzioniști și Magicieni pentru Evenimente în Moldova",
    seoDescription:
      "Magicieni profesioniști pentru nunta, evenimentul corporate sau petrecerea ta în Chișinău. Show-uri close-up și de scenă, mentalism, iluzii spectaculoase.",
    seoBody: `## Magicieni și iluzioniști profesioniști pentru evenimente memorabile

Un magician profesionist transformă orice eveniment într-o experiență WOW — fie că alege un show de scenă cu iluzii spectaculoase, fie close-up magic la mese (perfect pentru cocktail party și recepții). Pe ePetrecere.md găsești iluzioniști din Chișinău și Moldova cu experiență la nunți, evenimente corporate, lansări de produs și petreceri private.

## Tipuri de show-uri magice

- **Show de scenă** — iluzii mari, asistente, costume, durata 20-45 minute
- **Close-up magic** — magicianul circulă printre invitați la cocktail / cină, magie cu cărți, monede, obiecte împrumutate
- **Mentalism și hipnoză** — show-uri psihologice, citirea gândurilor, predicții
- **Magie pentru copii** — pentru botez, cumătrie, aniversări de copii (cu animatori incluși)

## Avantajele close-up magic la nuntă

Close-up magic e tendința care prinde la nunțile moderne din Moldova — magicianul intră în spațiul intim al meselor, surprinde grupuri mici de invitați și creează momente de "wow" care se filmează viral. Nu necesită scenă sau echipament special — perfect pentru locații cu spațiu limitat.

## Preț

Un show de scenă costă 400-1000€ pentru 30-45 minute. Close-up magic la mese costă 300-700€ pentru 1-2 ore. Magicieni internaționali sau cu programe complexe (asistente, iluzii mari) au prețuri 1500-3000€.`,
  },
  {
    slug: "animatori",
    imageAlt: "Animator pentru copii cu costum colorat și baloane",
    shortDescription:
      "Animatori pentru petreceri de copii — botez, cumătrie, aniversări. Activități, jocuri, baloane modelate.",
    seoTitle: "Animatori pentru Copii la Botez și Aniversări în Moldova",
    seoDescription:
      "Animatori profesioniști pentru botez, cumătrie și aniversări de copii în Chișinău. Jocuri, ateliere, baloane modelate, picturi pe față, divertisment garantat.",
    seoBody: `## Animatori pentru copii — divertisment de calitate la botez și aniversări

Pe ePetrecere.md găsești animatori profesioniști pentru petreceri de copii din Chișinău și toată Moldova. Sunt persoane verificate, cu experiență în lucrul cu copii (vârste 2-12 ani), care se ocupă să țină invitații mici fericiți și ocupați în timp ce părinții se bucură de eveniment.

## Activități tipice

Un animator de copii din Moldova vine pregătit cu o gamă largă de activități:
- **Jocuri de grup** — adaptate pe vârste, cu premii mici
- **Baloane modelate** — animale, săbii, coronițe (toți copiii primesc unul)
- **Pictură pe față** — modele simple, vopsele hipoalergenice
- **Ateliere creative** — desen, pictură, mini-creații manuale
- **Mascote / costume** — Mickey, Frozen, Spider-Man, Paw Patrol

## La ce evenimente se potrivește?

Botez, cumătrie, aniversări de copii (1-12 ani), nunți unde sunt mulți copii invitați, evenimente corporate cu zone pentru familii. Pentru evenimente cu peste 15 copii, recomandăm 2 animatori — astfel se pot organiza grupe pe vârste.

## Preț

Un animator solo costă 100-200€ pentru 2-3 ore de program (cu baloane și pictură incluse). Pachete cu doi animatori, mascotă și activități extra ajung la 300-500€. Verifică în profil ce e inclus și ce e opțional.`,
  },
  {
    slug: "show-ul-focului",
    imageAlt: "Show cu focuri și efecte pirotehnice spectaculoase la nuntă",
    shortDescription:
      "Show-uri spectaculoase cu focuri, efecte pirotehnice și jonglerii cu foc pentru momente WOW la evenimentul tău.",
    seoTitle: "Show cu Foc pentru Nuntă și Evenimente în Moldova",
    seoDescription:
      "Show-uri profesioniste cu focuri și efecte pirotehnice pentru nuntă, lansări și evenimente corporate în Moldova. Spectacol de neuitat, siguranță garantată.",
    seoBody: `## Show-ul focului — momentul de neuitat al evenimentului tău

Un show cu foc transformă evenimentul tău într-un spectacol vizual memorabil. Pe ePetrecere.md găsești performeri profesioniști din Chișinău și Moldova care fac jonglerii cu foc, dans cu poi flacără, suflători de foc și efecte pirotehnice controlate, perfect pentru nunți, lansări de produs și evenimente corporate.

## Tipuri de show

- **Show outdoor cu foc** — jonglerii, poi, suflători, durata 8-15 minute
- **Pirotehnică profesională** — fântâni, jeturi, focuri de artificii (la sfârșitul nopții)
- **Show de scenă cu foc** — pentru locații închise cu acoperire pe înaltime suficientă
- **Show LED + foc** — combinație modernă, mai sigur pentru anumite locații

## Siguranța contează

Toți performerii cu foc verificați pe ePetrecere.md au:
- **Asigurare de răspundere civilă** pentru evenimente
- **Echipament de stingere** la show (extinctor, pătură de foc)
- **Inspectare prealabilă** a locației pentru identificarea zonelor sigure
- **Coordonare cu echipa locației** pentru autorizații (acolo unde e cazul)

## Preț

Un show cu foc de 10-15 minute costă 400-800€. Pirotehnia mai amplă (focuri de artificii în formă de inimă, scriere cu foc) costă 1000-3000€. Discută cu performerul detalii despre locație — terenuri exterioare deschise sunt cele mai potrivite.`,
  },
  {
    slug: "clovni",
    imageAlt: "Clovn cu costum colorat și balon făcând copiii să râdă",
    shortDescription:
      "Clovni profesioniști pentru petreceri de copii și evenimente vesele. Glume, baloane, momente comice.",
    seoTitle: "Clovni pentru Petreceri de Copii în Chișinău",
    seoDescription:
      "Clovni profesioniști pentru aniversări de copii și petreceri vesele în Chișinău și Moldova. Glume, baloane modelate, magie simplă, atmosferă plină de râs.",
    seoBody: `## Clovni profesioniști pentru veselia copiilor

Un clovn bun nu e doar machiaj și haine colorate — e un performer cu sute de glume, trucuri de magie simple, baloane modelate și abilitatea de a face zeci de copii să râdă timp de o oră întreagă. Pe ePetrecere.md găsești clovni cu experiență din Chișinău și Moldova pentru aniversări de copii, parcuri de distracții și evenimente private.

## Programul tipic

Un clovn profesionist aduce la eveniment:
- **Glume și momente comice** — cu interacțiune directă cu copiii
- **Baloane modelate** — pentru fiecare copil prezent
- **Mini-show de magie** — trucuri simple potrivite vârstei
- **Pictură pe față** (uneori inclus, uneori opțional)
- **Concursuri și jocuri** cu premii mici

## Ce vârste sunt potrivite?

Clovnii sunt cei mai apreciați de copii între 3 și 9 ani. Sub 3 ani unii copii se sperie de costume, iar peste 10 ani interesul scade. Pentru petrecerile cu mix de vârste, clovnul colaborează cu un animator pentru a oferi activități paralele.

## Preț

Un clovn pentru o petrecere de 1-2 ore costă 100-200€, cu baloane și momente de magie incluse. Pentru evenimente mai mari sau show-uri solicitante (peste 20 copii), prețurile cresc la 250-400€.`,
  },
  {
    slug: "interesant-la-sarbatoare",
    imageAlt: "Atracții și momente surpriză interesante la sărbătoare",
    shortDescription:
      "Atracții și momente surpriză unice pentru sărbătorile tale — totul pentru un eveniment de neuitat.",
    seoTitle: "Atracții Speciale pentru Sărbători în Moldova",
    seoDescription:
      "Idei și atracții speciale pentru sărbătorile și evenimentele tale în Moldova. Momente surpriză, activități unice, divertisment creativ pentru toate vârstele.",
    seoBody: `## Atracții și surprize creative pentru evenimentul tău

Categoria "Interesant la Sărbătoare" reunește toate atracțiile, momentele surpriză și activitățile mai puțin obișnuite care fac un eveniment să iasă în evidență. Pe ePetrecere.md găsești performeri din Moldova pentru:
- **Animatori cu mascote** (Mickey Mouse, Spider-Man, Frozen)
- **Statui vii** și mimi pentru evenimente elegante
- **Bartenderi cu show** (flair bartending)
- **Caricaturiști live** pentru invitați
- **Cabine foto cu accesorii** și albume instant
- **Atracții cu animale** (ponei, pisici de companie pentru petreceri)

## Cum aleg atracția potrivită?

Gândește-te la profilul invitaților. Pentru un eveniment cu copii — mascote, animatori cu jocuri, pictură pe față. Pentru un eveniment elegant adult — statui vii, caricaturiști, bartenderi cu show. Pentru o nuntă modernă — cabine foto interactive, animatori bărbătești pentru burlăcițe.

## Preț

Atracțiile speciale au prețuri foarte variabile — de la 150€ (caricaturist 2 ore) la 800€ (bartender cu flair show). Verifică în fiecare profil ce e inclus și ce e opțional.`,
  },
  {
    slug: "show-circus",
    imageAlt: "Show de circ cu acrobați și jonglieri la eveniment privat",
    shortDescription:
      "Show-uri de circ cu acrobați, jonglieri, contorsionism — momente spectaculoase la evenimentele tale.",
    seoTitle: "Show Circus pentru Evenimente Premium în Moldova",
    seoDescription:
      "Show-uri profesioniste de circ pentru nunți, lansări și evenimente corporate în Chișinău. Acrobați, jonglieri, contorsioniști, atmosferă spectaculoasă.",
    seoBody: `## Show-uri de circ profesionale — spectacol garantat

Un show de circ aduce la evenimentul tău numere artistice de înalt nivel — acrobații, jonglerii, contorsionism, dans aerian. Pe ePetrecere.md găsești performeri de circ din Chișinău și Moldova pentru nunți premium, lansări de produs, evenimente corporate și aniversări speciale.

## Numere disponibile

- **Acrobații aeriene** (silks, hoop, trapez) — necesită înălțime de tavan minimă 5m
- **Jonglerii** — torțe, mingi, clube — show-uri de 5-10 minute
- **Contorsionism** — show de scenă spectaculos
- **Acrobații la sol** — pentru locații cu tavan jos
- **Show-uri tematice** — Cirque du Soleil-style, mai puțin tradițional decât circul clasic

## Cerințe tehnice

Pentru show-uri aeriene e nevoie de:
- Înălțime tavan minimă 5m
- Punct de ancorare verificat (sau structură portabilă)
- Spațiu liber sub aparatura aeriană (3x3m minim)

Discută în prealabil cu performerul ce e fezabil în locația ta.

## Preț

Un show de circ cu 1-2 numere durează 10-20 minute și costă 600-1500€. Pachete complete (3-5 numere, 30-45 minute) ajung la 2000-4000€.`,
  },
  {
    slug: "stand-up",
    imageAlt: "Comediant la show stand-up pe scenă cu microfon",
    shortDescription:
      "Comedianți de stand-up pentru evenimente corporate, aniversări și petreceri private în Moldova.",
    seoTitle: "Stand Up Comedy pentru Evenimente Corporate în Moldova",
    seoDescription:
      "Rezervă cei mai amuzanți comedianți de stand-up din Moldova pentru evenimente corporate, lansări și petreceri private. Show-uri în română și rusă.",
    seoBody: `## Stand-up comedy pentru evenimentele tale corporate

Stand-up comedy e cel mai popular gen de divertisment la evenimente corporate moderne — relaxează atmosfera, leagă echipele și creează amintiri comune. Pe ePetrecere.md găsești comedianți de stand-up din Chișinău și Moldova cu experiență la evenimente corporate, lansări de produs și petreceri private.

## Pentru ce evenimente se potrivește?

- **Evenimente corporate** (team building, corporate dinner, lansări)
- **Aniversări de adulți** (35+) — atmosferă mai sofisticată
- **Petreceri tematice** (burlăcie, vinerea seara la birou)
- **Festival-uri și concerte** (ca opening pentru artiști mai mari)

**NU recomandăm** stand-up la nunți tradiționale moldovenești sau la evenimente de familie cu copii — audiența nu e potrivită.

## Limbi și stiluri

Comedianții din Moldova fac show-uri în română, rusă sau bilingv (în funcție de profilul invitaților). Stilurile variază de la observational comedy (situații din viața de zi cu zi), la roast (comedia "ușor agresivă" pentru evenimente private), satira politică/socială sau improvizație. Pentru evenimente corporate, evită teme controversate și ai grijă la "PG-13" rating.

## Preț

Un set standard de 30-45 minute de stand-up costă 400-1000€. Pentru comedianți cu nume sau show-uri private mai lungi (1+ ore), prețurile pornesc de la 1500€.`,
  },
  {
    slug: "mos-craciun",
    imageAlt: "Moș Crăciun cu sac de cadouri pentru copii",
    shortDescription:
      "Moș Crăciun profesionist pentru petreceri corporate, evenimente școlare și surprize pentru copii.",
    seoTitle: "Moș Crăciun pentru Petreceri Corporate și Copii în Chișinău",
    seoDescription:
      "Rezervă Moș Crăciun pentru petrecerea de Crăciun a companiei tale, evenimente școlare sau acasă în Chișinău. Costum profesionist, sac cu cadouri, magie autentică.",
    seoBody: `## Moș Crăciun pentru sărbătorile de iarnă

Decembrie e luna magiei și pe ePetrecere.md poți rezerva Moș Crăciun profesionist pentru petrecerea de Crăciun a companiei, eveniment școlar sau surpriză pentru copii acasă în Chișinău și toată Moldova.

## Pentru ce evenimente?

- **Petreceri corporate** (Crăciun la birou, premii pentru copiii angajaților)
- **Evenimente școlare și grădinițe** (programul de iarnă)
- **Vizite acasă** (surpriză pentru copii)
- **Evenimente comunitare** (centre comerciale, restaurante cu programe de iarnă)

## Ce conține o vizită standard?

Un Moș Crăciun profesionist vine cu:
- **Costum complet autentic** — barbă, haină roșie, cizme
- **Sac de cadouri** (clientul aduce cadourile, Moșul le distribuie)
- **Program interactiv** — întreabă fiecare copil dacă a fost cuminte, distribuie cadourile cu nume
- **Poze cu copiii** (incluse de obicei în pachet)
- **Posibilitate de show extra** — magie simplă, cântece de iarnă, glume cu spiriduși

## Tarife

O vizită de Moș Crăciun acasă (30-45 minute) costă 70-150€. Pentru evenimente corporate cu mulți copii (1-2 ore, 20+ copii), prețurile pornesc de la 200-400€. Rezervă cu cel puțin 2-3 săptămâni înainte de Crăciun — Moș Crăciunii buni sunt rezervați rapid.`,
  },

  // ── SERVICE ─────────────────────────────────────────────
  {
    slug: "fotografi",
    imageAlt: "Fotograf de nuntă cu aparat profesionist la eveniment",
    shortDescription:
      "Fotografi profesioniști pentru nuntă, botez, cumătrie și evenimente corporate în Moldova.",
    seoTitle: "Fotografi pentru Nuntă în Chișinău, Moldova",
    seoDescription:
      "Cei mai buni fotografi de nuntă, botez și evenimente corporate din Chișinău și Moldova. Portfolio verificat, prețuri transparente, livrări rapide.",
    seoBody: `## Fotografi profesioniști pentru evenimente în Moldova

Pe ePetrecere.md găsești fotografi profesioniști din Chișinău și toată Moldova specializați pe nunți, botezuri, cumătrii, evenimente corporate, ședințe foto private și sesiuni de logodnă. Toți fotografii au portfolio verificat, recenzii reale și calendar de disponibilitate actualizat.

## Stiluri foto disponibile

- **Reportaj de eveniment** — naturali, momente spontane, posing minim
- **Stil fine art** — lumini moi, prelucrare cinematic, atmosferă romantică
- **Stil fashion / editorial** — pentru ședințe trash the dress, save the date
- **Stil clasic / tradițional** — momentele pozate clasice, family portraits

## Ce e inclus într-un pachet standard de nuntă?

Un pachet tipic de nuntă în Moldova include:
- 8-12 ore de prezență la eveniment
- 400-800 fotografii prelucrate (selectate din 2000+ originale)
- Album foto digital (Google Drive / WeTransfer)
- Album foto fizic premium (opțional, +100-300€)
- Sesiune de logodnă pre-nuntă (opțional, +200-400€)

## Preț orientativ

Fotografii de nuntă în Chișinău au prețuri pornind de la 500-800€ (fotografi începători cu portfolio bun) și ajung la 1500-3000€ (fotografi cu nume, premii, peste 100 nunți în portfolio). Verifică pachetele exacte în profilul fiecăruia și negociază în chat.

## Sfat de rezervare

Rezervă fotograful preferat cu 6-12 luni înainte de nuntă, mai ales dacă te căsătorești în sezonul de vârf (mai-octombrie). Cei mai buni fotografi din Moldova sunt rezervați un an înainte.`,
  },
  {
    slug: "videografi",
    imageAlt: "Videograf de nuntă cu cameră 4K și gimbal la eveniment",
    shortDescription:
      "Videografi profesioniști pentru nuntă și evenimente — cinematic wedding films în 4K cu drone și gimbal.",
    seoTitle: "Videografi pentru Nuntă în Chișinău, Moldova",
    seoDescription:
      "Videografi profesioniști pentru nuntă, botez și evenimente corporate în Moldova. Filmări 4K, dronă, gimbal, trailere cinematic, livrare rapidă.",
    seoBody: `## Videografi profesioniști pentru filmul tău de nuntă

Pe ePetrecere.md găsești videografi cu echipament profesional (4K, drone DJI, gimbal Ronin, microfoane lavalier) din Chișinău și toată Moldova. Filmul de nuntă rămâne după zeci de ani — alegerea videografului contează cel puțin la fel de mult ca cea a fotografului.

## Tipuri de filme livrate

- **Trailer de nuntă** (3-5 min) — cinematic, muzică sincronizată, momentele cheie
- **Highlights film** (10-15 min) — povestea zilei condensată artistic
- **Full ceremony** (45-90 min) — toată ceremonia civilă / religioasă necondensată
- **Reception highlights** (15-30 min) — discursurile, dansul mirilor, hora
- **Same Day Edit** — un trailer scurt proiectat la sfârșitul nopții (extra 200-400€)

## Echipament tipic

Un videograf de nuntă profesionist vine cu:
- 2-3 camere 4K (mirrorless full-frame de obicei)
- 1-2 drone (DJI Mavic 3 / Air 3) cu autorizație de zbor
- Gimbal stabilizator (Ronin / Crane)
- Microfoane wireless (lavalier pentru ceremonia civilă)
- Lumini portabile pentru momentele întunecate

## Preț

Un pachet standard de videografie nuntă în Moldova costă 600-1200€ (videografi solo, 8 ore, trailer + highlights). Echipele de 2 videografi cu drone și editing premium costă 1500-3500€. Rezervă cu 6-12 luni înainte.

## Combo foto + video

Multe firme oferă pachete combo foto + video la preț redus (de obicei 1500-3000€ pentru ambele). Avantaj: sincronizare între cele 2 echipe pe teren și un singur partener pentru comunicare.`,
  },
  {
    slug: "decor",
    imageAlt: "Decor de nuntă elegant cu flori și aranjamente premium",
    shortDescription:
      "Decoratori și floriști pentru nunți, botezuri și evenimente corporate în Moldova — totul de la concept la realizare.",
    seoTitle: "Decor și Floristică pentru Nuntă în Moldova",
    seoDescription:
      "Decoratori profesioniști pentru nunta sau evenimentul tău în Chișinău. Aranjamente florale, decor sală, scenografie tematică, iluminat ambiental.",
    seoBody: `## Decor și floristică pentru evenimente memorabile

Decorul transformă orice sală obișnuită într-un loc de poveste. Pe ePetrecere.md găsești decoratori și floriști profesioniști din Chișinău și Moldova cu experiență în nunți, botezuri, cumătrii, evenimente corporate, lansări de produs și petreceri tematice.

## Servicii incluse

Un decorator de evenimente complet oferă:
- **Concept și moodboard** (consultanță gratuită inițială)
- **Aranjamente florale** — buchet mireasă, butoniere, decor mese, arc cununie, decor scaune
- **Decor scenografic** — backdrop foto, candy bar, mese rituale, alei florale
- **Iluminat ambiental** — uplighting, lumini de cunună, ghirlande LED, lumini decorative
- **Mobilier de eveniment** — fotolii lounge, baruri, mese cocktail (extra)
- **Montaj și demontaj** la locație (incluse în preț)

## Stiluri populare în Moldova

- **Rustic** — flori de câmp, lemn natural, dantelă, jurubițe
- **Romantic clasic** — trandafiri, hortensii, cristal, alb-bej-roz
- **Modern minimalist** — verdeață abundentă, accente metalice, geometric
- **Boho** — pampas grass, macrame, culori pastel, accente etno
- **Glam / Premium** — flori importate, cristale, lumini abundente

## Preț

Pachetele de decor pentru nunți în Moldova pornesc de la 800€ (decor minim — buchet, butoniere, decor mese de bază) și ajung la 5000-15000€ pentru evenimente premium cu zeci de aranjamente florale, scenografie complexă și mobilier închiriat.

## Cum alegi decoratorul?

Verifică portfolio-ul (poze din evenimente reale, nu doar inspiration boards), citește recenziile și asigură-te că discuți concept-ul cu tine — un decorator bun ascultă ce vrei și sugerează soluții potrivite bugetului. Nu rezerva pe baza prețului celui mai mic — calitatea florilor și execuția contează.`,
  },
  {
    slug: "echipament-tehnic",
    imageAlt: "Echipament tehnic profesional cu boxe lumini DJ pentru nuntă",
    shortDescription:
      "Închiriere echipament tehnic profesional — sonorizare, lumini, ecrane LED, fum, pirotehnie pentru evenimente.",
    seoTitle: "Echipament Tehnic pentru Evenimente în Chișinău",
    seoDescription:
      "Închiriere sonorizare, lumini profesionale, ecrane LED, mașini de fum și pirotehnie pentru evenimente în Moldova. Montaj și operare incluse.",
    seoBody: `## Închiriere echipament tehnic pentru evenimente

Pentru evenimente medii și mari, echipamentul tehnic adus de DJ / formație nu mai e suficient. Pe ePetrecere.md găsești firme din Chișinău și Moldova specializate pe închiriere echipament tehnic — sonorizare, lumini, ecrane LED, video mapping, pirotehnie controlată — cu montaj și operare profesionale incluse.

## Echipament tipic disponibil

- **Sonorizare** (boxe line array, mixere digitale, microfoane wireless) — pentru audiență 50-1000+ persoane
- **Lumini concert** (moving heads, lasere, beam-uri, blinder) — pentru atmosferă club / concert
- **Ecrane LED** (panouri P3-P5 indoor, P6-P10 outdoor) — pentru video mapping, clipuri, slideshow
- **Mașini de fum** (haze, low fog cu CO2 — efect "dansul mirilor pe nori")
- **Pirotehnie controlată** (fântâni, jeturi, geysers indoor)
- **Generatoare** pentru evenimente outdoor fără sursă de curent

## Pentru ce evenimente?

Echipament tehnic profesionist e necesar pentru:
- **Nunți premium** (peste 200 invitați, sală mare)
- **Evenimente outdoor** (curte, conac, camping rustic)
- **Evenimente corporate cu prezentări** (lansări, conferințe)
- **Concerte private** și festivaluri mici
- **Filmări video / fotografie cu lumini**

## Preț

Pachetele tehnice pentru o nuntă medie costă 600-1500€ (sonorizare bună + lumini de bază + montaj). Pachetele premium cu ecrane LED, lasere și pirotehnie ajung la 3000-8000€. Întreabă în chat ce e inclus și care sunt opționalele.

## Operator inclus

Toate firmele profesioniste includ în preț 1-2 tehnicieni care rămân la eveniment pentru operarea echipamentului — important pentru sonorizare (mixaj live cu DJ-ul / formația) și lumini (sincronizare cu show-uri).`,
  },
  {
    slug: "foto-video",
    imageAlt: "Echipă completă foto și video profesionistă la nuntă",
    shortDescription:
      "Pachete combinate foto + video pentru nuntă și evenimente — o singură echipă, sincronizare perfectă, preț mai bun.",
    seoTitle: "Pachete Foto + Video pentru Nuntă în Moldova",
    seoDescription:
      "Pachete complete foto + video pentru nunta sau evenimentul tău în Chișinău. O singură echipă, două abordări creative, prețuri mai mici decât rezervarea separată.",
    seoBody: `## Pachete foto + video — cea mai bună combinație pentru evenimente

Combinarea fotografului și videografului într-o singură echipă oferă avantaje semnificative — sincronizare pe teren (nu se "calcă în picioare" la momente cheie), un singur partener de comunicare și prețuri mai mici decât rezervarea separată. Pe ePetrecere.md găsești firme din Chișinău și Moldova care oferă pachete combo foto + video.

## Ce conține un pachet tipic?

- **2-3 fotografi + 2 videografi** la eveniment (8-12 ore acoperire)
- **400-800 fotografii prelucrate** + trailer 3-5 min + highlights film 10-15 min
- **Drone footage** pentru momente outdoor
- **Same Day Edit** (opțional) — trailer scurt proiectat la sfârșitul nopții
- **Album foto premium** (opțional)
- **USB cu toate materialele** + acces online

## Avantaje vs. rezervare separată

- **Preț cu 20-30% mai mic** decât suma rezervărilor individuale
- **Coordonare pe teren** — echipele nu se blochează una pe alta la momentele cheie
- **Stilistică unitară** — color grading similar pentru foto și video
- **Un singur contract și un singur punct de contact**
- **Materialele se livrează simultan** la 4-8 săptămâni de la eveniment

## Preț

Pachete combo foto + video în Moldova pornesc de la 1500€ pentru pachete de bază (fotograf + videograf solo, 8 ore, trailer scurt) și ajung la 4000-7000€ pentru pachete premium (echipe de 4-5 persoane, drone, Same Day Edit, albume premium).`,
  },
  {
    slug: "foto-zona-selfie",
    imageAlt: "Zonă foto cu accesorii și cadru selfie la petrecere",
    shortDescription:
      "Cabine foto și zone selfie cu accesorii pentru nuntă, corporate și petreceri — distracție și amintiri instant.",
    seoTitle: "Cabină Foto și Zonă Selfie pentru Nuntă în Moldova",
    seoDescription:
      "Cabine foto profesionale și zone selfie cu printer instant pentru nunta sau petrecerea ta în Chișinău. Accesorii distractive, atmosferă plină de bună dispoziție.",
    seoBody: `## Cabine foto și zone selfie — distracția numărul 1 la evenimente

Cabinele foto au devenit unul dintre cele mai populare divertismente la nunțile, evenimentele corporate și petrecerile private din Moldova. Pe ePetrecere.md găsești firme din Chișinău cu cabine foto profesionale (cu printer instant, fond personalizabil, accesorii) și zone selfie tematice.

## Ce conține un pachet tipic?

- **Cabină foto modernă** (open booth cu fond verde / personalizat sau closed booth)
- **Cameră DSLR profesională** + iluminare studio
- **Printer instant** (poze 10x15 sau 5x15 cm tip strip) — invitații primesc poza pe loc
- **Cadre tematice personalizate** (cu numele mirilor, data, hashtag eveniment)
- **Accesorii distractive** (pălării, ochelari, mustăți, plăcuțe cu mesaje)
- **Galerie digitală** (toate pozele pe Google Drive)
- **Operator** la cabină (asistență, tehnică, distribuire poze)

## Tipuri de cabine

- **Open booth** — fond colorat, mai aerisit, bun pentru grupuri
- **Closed booth** — clasic, mai intim, bun pentru poze mai personale
- **360° photo booth** (NOU) — video circular interactiv, viral pe social media
- **Mirror photo booth** — cabină ca o oglindă cu animații touch screen
- **Foto zona DIY** — fond + accesorii fără operator (pentru bugete mici)

## Preț

O cabină foto pentru o nuntă (5-6 ore) costă 400-700€ în pachetul standard cu printer și operator. Cabinele 360° și mirror booth au prețuri 800-1500€. Verifică în profil ce e inclus (număr poze nelimitat? print nelimitat? album fizic la final?).`,
  },
];

async function run() {
  console.log(`Seeding SEO content for ${CATEGORIES.length} categories...`);
  let updated = 0;
  for (const c of CATEGORIES) {
    const result = await sql`
      UPDATE categories
      SET
        image_alt = ${c.imageAlt},
        description_ro = ${c.shortDescription},
        seo_title_ro = ${c.seoTitle},
        seo_desc_ro = ${c.seoDescription},
        seo_body_ro = ${c.seoBody}
      WHERE slug = ${c.slug}
      RETURNING id, slug
    `;
    if (result.length === 0) {
      console.warn(`  ✗ ${c.slug}  — slug not found in DB`);
      continue;
    }
    updated++;
    console.log(`  ✓ ${c.slug}  — title: ${c.seoTitle.slice(0, 50)}`);
  }
  console.log(`\nDone. Updated ${updated}/${CATEGORIES.length} categories.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
