# Repunerea pe picioare a aplicației mobile

Întocmit 30 august 2026, din cinci sondaje independente peste `packages/mobile`,
`packages/shared` și suprafața `/api/v1`. 69 de constatări, dintre care 17 blocante.

Versiunea vizuală a acestui plan:
<https://claude.ai/code/artifact/55273b1a-726e-419f-91c9-93a732fa2894>

**Fazele sunt strict secvențiale.** Fiecare are o *poartă* — o condiție observabilă,
nu o impresie. Dacă poarta nu se deschide, faza următoare nu începe.

---

## Constatarea care schimbă premisa

`/api/v1/*` — suprafața pe care o folosește aplicația — **nu s-a schimbat cu niciun
octet** de la ultimul commit mobil (f3321b6, 31 iulie). Cele 19 rute API modificate în
luna care a trecut sunt toate în partea web. Luna de drift **nu** a stricat aplicația.

Ce a stricat-o: un upgrade de SDK comis dar niciodată instalat, plus câteva defecte
care existau și în iulie.

### Două note vechi, verificate ca fiind greșite

- **Mobile nu mai e workspace npm.** Rădăcina declară `workspaces: ["packages/shared"]`,
  iar `packages/mobile` are lockfile propriu. `npm ci` acolo **nu poate strica web-ul**.
  Teama venea de pe vremea când chiar era workspace; au rămas symlink-uri moarte ca dovadă.
- **`react-native-css-interop` e 0.2.6** în lockfile, nu 0.1.22. Regula „tot stilul
  trebuie inline" s-ar putea să nu mai fie necesară — de verificat după instalare, pe un
  ecran real, nu de presupus în vreo direcție.

---

## Faza 0 — Fă-l să pornească

**Poarta:** `expo start` pornește și typecheck-ul trece.

Arborele instalat e un SDK întreg în urmă și îi lipsește `babel-preset-expo`, fără de
care Metro nu transformă niciun fișier. Până aici nu se poate verifica nimic altceva.

| | cerut | instalat |
|---|---|---|
| expo | 54.0.35 | 52.0.49 |
| react-native | 0.81.5 | 0.76.7 |
| react | 19.1.0 | 18.3.1 |
| expo-router | 6.0.24 | 4.0.22 |

- [x] `npm ci` în `packages/mobile` — lockfile-ul e corect și sincron (1140 pachete)
- [x] Șterge cele 6 duplicate iCloud din `app/` — în expo-router fiecare fișier e o rută,
      deci sunt ecrane fantomă în navigație
- [x] Comite cele 5 fișiere netrackuite (`account/*`, `plan/new.tsx`, `CalendarPicker.tsx`)
      — EAS construiește din arborele git, deci azi ar compila fără ele
- [x] Exportă `CalendarPicker` din `components/ui/index.ts` — `plan/new.tsx:18` îl importă
      de acolo, azi typecheck-ul cade

**Verificare:** `npx expo start` pornește; `npm run typecheck` curat; `git status` fără
cod netrackuit; navigația fără rute cu spațiu în nume.

---

## Faza 1 — Fă erorile vizibile

**Poarta:** un endpoint oprit produce un mesaj, nu o rotiță.

Vine *înaintea* reparațiilor: cât timp fiecare eșec arată ca un spinner, nu ai cum să
confirmi că o reparație a funcționat.

- [x] Clientul aruncă la eșec — `packages/shared/src/api/index.ts:103, 111-118`
      (azi întoarce o valoare și pe eroare de rețea, și pe 4xx)
- [x] Citește `error`, nu `message` — `index.ts:97-100`. 139 de rute întorc `{error}`,
      una singură `{message}`, deci utilizatorul vede „HTTP 403"
- [x] Ramură de eroare cu reîncercare pe cele 7 ecrane de detaliu: `artist/[slug]:94`,
      `venue/[slug]:68`, `plan/[id]`, `(partner)/(tabs)/index:154`, +3

**Verificare:** cu rețeaua oprită, un profil de artist arată mesaj și buton de reîncercare;
o rezervare invalidă arată textul real de la server; reîncercarea reface cererea.

---

## Faza 2 — Cele trei defecte fatale

**Poarta:** un partener nou ajunge la panou; o rezervare pleacă.

Fiecare oprește singur un utilizator real. Niciunul nu ține de drift — existau în iulie.

- [x] **Partener nou → rotiță infinită.** `app/(partner)/(tabs)/index.tsx:154`.
      Dashboard-ul întoarce 404 `no_artist_profile` pentru un utilizator fără rând de
      artist; clientul îl face `data:null`; garda nu se mai deschide. Trebuie stare goală
      cu „creează-ți profilul".
- [x] **Fiecare rezervare respinsă cu 400.** `booking-new.tsx:56-57, 85, 89-90` trimite
      `null` explicit pentru câmpuri `.optional()` fără `.nullable()`. Trimite `undefined`,
      sau adaugă `.nullable()` pe server.
- [x] **Telefon fals pe fiecare rezervare.** `booking-new.tsx:84` — `?? "+37300000000"`.
      11 cifre neuniforme, deci trece de garda serverului și ajunge la partener ca număr real.
- [x] **Primul plan de eveniment → 400.** `planning.tsx:35, 49-51`, același tipar de `null`.
      Ecranul corect (`plan/new.tsx`) există dar nu e legat nicăieri.

**Verificare:** cont nou → rol artist → stare goală cu pas următor; o rezervare apare în
`booking_requests` și în panoul partenerului, cu telefonul real; butonul din starea goală
a planificatorului duce la un plan creat.

---

## Faza 3 — Alinierea cu platforma

**Poarta:** un artist se înregistrează complet, de pe telefon.

- [x] **Semnarea contractului** — ecran nou + `POST /api/legal/accept` cu datele părții
      (tip, denumire, IDNO, sediu), documentele bifate, numele și semnătura desenată.
      Fără ea un partener **nu se poate înregistra deloc** din aplicație: web-ul refuză
      acum înregistrarea nesemnată. Pad-ul pe RN cere altă implementare decât canvas-ul web.
- [x] **Preț pe eveniment** — `app/(partner)/tarife/[id].tsx`. Tariful e tipat doar
      `{price, durationHours}`; `pricingMode` și `eventType` nu ajung pe telefon.
- [x] **Editarea unui tarif salvează gol** — `tarife/[id].tsx:159, 191-196`. Formularul e
      montat necondiționat, deci `useState` se inițializează cât `pkg` e încă null.
- [x] **Cele trei tipuri de eveniment noi** — `src/app/api/artist-packages/*` listează 7
      chei, vocabularul canonic are 10. Drift pe server, nu în aplicație.
- [x] **Comisionul, vizibil partenerului** — `app/(partner)/financiar.tsx` arată doar
      încasările; web-ul arată ce se datorează.

Găsit pe parcurs, nu era în plan: **nimic din aplicație nu putea crea un profil de artist.**
Butonul „Completează profilul" din Faza 2 ducea la un ecran susținut de `PUT /artists/crud`,
care doar actualizează un rând existent. Deci a fost nevoie de un ecran de înregistrare
întreg, nu doar de semnătură, plus patru rute expuse în v1: `legal/documents`,
`legal/accept`, `auth/register-artist` și `commissions`.

**Verificare:** înregistrare completă de pe telefon până la „trimis spre aprobare"; rând în
`legal_acceptances` cu rechizitele; un tarif pe eveniment creat de pe telefon apare în
profilul public; editarea păstrează valorile.

---

## Faza 4 — Cerințele magazinelor

**Poarta:** o construcție de producție urcă în TestFlight.

Șapte puncte, cercetate fiecare separat și apoi verificate advers. **Două s-au
dovedit greșite în plan** — sunt notate ca atare, nu „reparate".

- [x] **Ștergerea contului din aplicație** (5.1.1(v) + Play) — ecran nou la
      `/delete-account`, plus `me/delete-account` și `me/data-export` expuse în v1.
      Ștergerea făcea și mai puțin decât spunea: `artists.user_id` e `SET NULL`, deci
      un partener șters lăsa în urmă un profil public viu, care primea cereri fără
      cont care să răspundă. Acum profilul e scos din vitrină înainte de ștergere.
- [x] **Icoanele** — **icoana aplicației era încă placeholderul.** Brandul nou a ajuns
      pe site pe 29 august și niciodată în aplicație. Refăcute din marcă: iOS 1024 RGB
      fără alfa și cu colțuri drepte, prim-planul Android pe transparență cu marca în
      cercul sigur de 66% (semi-diagonală 328px față de rază 338px), plus stratul
      monocrom pentru Android 13.
- [x] **Politica de confidențialitate accesibilă** — rândul etichetat „Termeni &
      Confidențialitate" deschidea doar termenii. Acum două rânduri care corespund
      etichetelor, linkuri apăsabile chiar în consimțământul de la înregistrare, și
      URL-uri după limbă: politica RU și EN existau și erau inaccesibile din aplicație.
- [x] ~~**Cheia Google Maps**~~ — **planul greșea.** `eas env:list` arată
      `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` setată în toate cele trei medii. Defectul real
      era `PROVIDER_GOOGLE`, care forța Google și pe iOS și dezactiva tăcut
      `userInterfaceStyle="dark"` (documentat Apple-Maps-only). Prop-ul e scos.
- [x] ~~**`google-services.json`**~~ — **planul greșea.** `app.config.js:22` citește
      `GOOGLE_SERVICES_JSON`, iar EAS îl ține ca fișier secret în fiecare mediu.
- [ ] **Sign in with Apple** (Ghidul 4.8) — **blocat pe cont, nu pe cod.** Instanța
      Clerk de producție `clerk.epetrecere.md` are activat exact un furnizor social:
      `oauth_google`. Un buton Apple adăugat acum ar eșua la rulare, ceea ce e mai rău
      decât lipsa lui. Cere: capacitatea Sign In with Apple pe App ID
      `md.epetrecere.app`, un Services ID și o cheie `.p8`, apoi conexiunea Apple în
      Clerk. **Notă:** PR #1 (`fix/security-hardening`) conține deja un buton Apple
      pe jumătate construit, fără dependință și fără `usesAppleSignIn` — de nu merjat
      ca atare.
- [ ] **Credențialele de trimitere** — **blocat pe cont.** `eas.json:53` arată spre
      `./credentials/AuthKey_32F8XDP8TG.p8`, care nu există nicăieri pe mașină (căutat
      exhaustiv, inclusiv `mdfind`), iar `:58` spre un cont de serviciu Play la fel de
      absent. Cere chei noi din App Store Connect și Google Play Console.

## Faza 5 — Testarea, pe fluxuri întregi

**Poarta:** fiecare parcurs se închide fără intervenție din web.

Nu ecran cu ecran — defectele s-au ascuns tocmai în îmbinări.

- [ ] **Client: descoperire → rezervare.** Se închide când partenerul primește cererea, cu
      telefonul real, și poate răspunde. *2 simulatoare.*
- [ ] **Partener: înregistrare completă.** Rol → profil → tarife → contract semnat. Se
      închide când apare în aprobările din admin, cu rechizitele în contract. *Telefon real.*
- [ ] **Negociere bidirecțională.** Propunere de preț, acceptare, respingere. Ambele părți
      văd aceeași stare și comisionul se ridică. *2 simulatoare.*
- [ ] **Planificator.** Plan nou → invitați → buget → checklist. Planul creat pe telefon se
      vede identic în cabinetul web. *Telefon + web.*
- [ ] **Căi de eșec.** Rețea oprită, sesiune expirată, server 500 — fiecare produce mesaj
      lizibil și cale de ieșire. *Simulator.*

**La fiecare parcurs se notează:** ce s-a văzut, nu ce ar fi trebuit, cu captură la orice
abatere. Dacă a fost nevoie de web ca să se închidă parcursul, parcursul a picat.

---

## Găsite la rulare, pe simulator

Niciuna nu blochează publicarea; toate au apărut abia când aplicația a rulat efectiv.

- **`expo-av` e depreciat** și anunțat pentru eliminare — `lib/voice-recorder.ts:13` încă îl
  folosește, iar `package.json:34` îl fixează la `~16.0.8`. Merge azi pe SDK 54, dar se rupe
  la următorul. Înlocuitorii sunt `expo-audio` / `expo-video`.
- **`Intl.PluralRules` lipsește** din runtime, deci i18next cade pe formatul v3. Azi e inofensiv:
  niciun fișier de traducere nu are chei de plural (`_one`, `_few`, `_many`). Devine vizibil în
  momentul în care cineva adaugă prima — și rusa are reguli de plural complexe.
- **Vechea regulă „tot stilul trebuie inline" nu mai e necesară.** `className` randează corect
  pe SDK 54 cu css-interop 0.2.6, verificat pe ecrane reale.

---

## Lăsate deoparte deliberat

Reale, dar niciuna nu blochează un utilizator care poate deja rezerva și se poate înregistra.
Decizii separate, nu strecurate aici.

- **Partea de săli** — web-ul are 11 ecrane; aplicația oferă doar client și artist, iar API-ul
  v1 acceptă doar aceste două roluri. E o a treia aplicație înăuntru: decizie de produs.
- **Invitațiile și check-in-ul la ușă** — designer, trimitere, urmărire per invitat, scanare
  la intrare. Valoare mare pe telefon, dar după ce fluxurile de bază țin.
- **Traducerea completă** — infrastructura i18n e corectă, dar acoperă 4 spații de nume, iar
  10 din 62 de fișiere o folosesc. Platforma vorbește trei limbi, aplicația doar română.
- **Fluxul de recenzii** — mort de două ori: endpoint-urile lipsesc din v1, iar ecranul care
  funcționează nu e legat în navigație.

---

## Jurnal de execuție

Se completează pe măsură ce fazele trec.

| fază | stare | notă |
|---|---|---|
| 0 | **trecută** | npm ci; 6 rute fantomă șterse; 5 fișiere comise; CalendarPicker exportat. Bundle 21,3 MB, tsc 0 erori. |
| 1 | **trecută** | clientul aruncă prin `unwrap()`; citește `error` nu `message`; 7 ecrane au ramură de eroare cu reîncercare. |
| 2 | **trecută** | 404 „fără profil" tratat ca prima stare; null-uri eliminate din rezervare și planificator; telefonul cerut de la utilizator. Payload validat cu schema serverului. |
| 3 | **cod gata, poarta neverificată** | ecran de înregistrare în 3 pași + pad de semnătură pe react-native-svg; 4 rute expuse în v1 și confirmate live; editarea tarifelor nu mai salvează gol; preț pe eveniment și comision pe telefon. Poarta cere un simulator — blocat de `xcode-select`. |
| 4 | **5 din 7 făcute** | ștergerea contului, icoanele din brandul nou, politica accesibilă și localizată, harta pe Apple Maps; două puncte din plan s-au dovedit false. Rămân Apple Sign-In și credențialele de trimitere — ambele cer acces la conturi. |
| 5 | **deblocată** | dev client rulează pe simulator; sesiunea de test funcționează fără parolă (vezi TESTARE-AUTENTIFICATA.md), aplicația e logată ca `client.test@epetrecere.md` și apelurile autentificate trec. Parcursurile pot începe. |
