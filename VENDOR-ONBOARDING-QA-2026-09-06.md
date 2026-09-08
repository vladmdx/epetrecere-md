# Înregistrare și fluxuri partener/sală: verificare 6 septembrie 2026

## Corecții implementate

- Un singur acord explicit, inițial nebifat, cu documentele enumerate separat. Versiunile nu mai aglomerează formularul, dar se păstrează în dovada semnată.
- Contractul poate fi deschis înaintea completării datelor. Semnarea rămâne blocată până la identitate completă, nume corespunzător, acord și semnătură desenată validă.
- Schimbarea datelor sau revenirea la pasul final invalidează acordul anterior. Citirea și resemnarea funcționează fără stare React învechită.
- Containerele dashboardului folosesc înălțime dinamică și scroll cu `min-height: 0`, pentru a evita decuparea formularului lung. Confirmarea vizuală pe dispozitivul utilizatorului rămâne obligatorie.
- Orașul de bază actualizează toate etichetele deplasării, în RO/RU/EN, și se salvează împreună cu raza, suplimentul și preferința de afișare a prețului.
- Filtrul localității ia în calcul raza declarată înainte de paginare, folosind tabelul existent de distanțe aproximative. Rutele necunoscute nu sunt presupuse.
- Validări pentru fotografie, încărcări în curs, tarife, capacitate și adresă; protecție împotriva navigării în timpul trimiterii.
- Adminul vede detalii de înregistrare și linkuri la copiile semnate. Aprobarea cere pachetul contractual curent; acțiunile invalide sunt respinse.
- Proprietarul sălii nu poate activa sau recomanda singur profilul. Câmpurile opționale pot fi golite.
- Emailul clientului nu apare în lista de recenzii a furnizorului înainte de confirmarea bilaterală. Textele recenziilor din API-urile publice sunt filtrate pentru contacte.
- Recenziile sălilor folosesc numele și linkul sălii; aprobarea, modificările de profil și moderarea invalidează cache-ul public.
- Contraofertele sunt adăugate atomic; datele și intervalele invalide, precum și finalizarea înaintea datei rezervate, sunt respinse.
- Notificările folosesc mecanismul de lucru după răspuns, astfel încât oprirea funcției serverless să nu le întrerupă.
- Înregistrările întrerupte pot continua folosind un pachet contractual curent, complet și verificat de server. Formularul afișează identitatea și copiile înghețate, fără a substitui alte date sub semnătura existentă; corectarea părții juridice cere revizuire separată.
- Navigarea din meniurile artistului și sălii păstrează limba; linkul profilului se actualizează după înregistrare.

## Verificări efectuate

- Build de producție reușit, 459 pagini, inclusiv îmbunătățirea de reluare a înregistrării.
- 44 verificări de integrare cu handler-ele reale și constrângerile PostgreSQL, inclusiv reluarea pe baza contractului salvat; tranzacția de test a fost anulată integral.
- 16 callback-uri deferred executate și 20 invalidări de cache în testul de integrare; zero mesaje externe în acel test.
- 14 teste de securitate, validarea deplasării, sincronizarea orașului, protejarea activării sălii și acțiunile administratorului.
- Test izolat al componentelor React reale, în StrictMode: artist și sală, RO/RU/EN, persoană fizică/juridică, semnatar necorespunzător, revenire la pas și resemnare.
- 72 teste pentru dovezile contractuale și 12 scenarii izolate pentru hook-ul și cardul de reluare: RO/RU/EN, artist/sală, reîncărcare, schimbarea limbii, eroare după semnare, răspuns pierdut și pachete blocate.
- Verificare HTTP live după prima publicare: `/`, `/artisti`, `/sali`, `/ru/artisti`, `/en/sali` răspund 200; API-urile de administrare, contracte și profil privat răspund 401 fără autentificare.
- Patru conturi sintetice private pregătite pentru artist, sală, client și admin. Numai telefonul și alegerea rolului pentru artist au fost parcurse manual până acum. Nu au fost create profiluri publice sau semnate contracte live în această sesiune.

## Verificări manuale încă necesare

1. Finalizarea onboardingului artistului și sălii pe versiunea nouă, inclusiv fotografie, oraș, tarife și contract.
2. Aprobarea prin interfața admin și verificarea semnăturii, datei, IP-ului și dispozitivului în copia semnată.
3. Vizibilitatea contractului din contul furnizorului, editarea profilului și actualizarea imediată în catalog.
4. Filtrare și rezervare ca client, contraofertă, acceptare și confirmare bilaterală pentru ambii furnizori.
5. Finalizare, recenzie, moderare și răspuns; doar rezervările sintetice pot fi ajustate pentru simularea trecerii datei evenimentului.
6. Verificare vizuală mobilă pentru lipsa decupării/benzii negre și curățarea exactă a datelor QA după test.

## Blocaje de mediu

- Mac blocat în timpul testelor; browserul nu mai poate fi controlat până la deblocarea manuală.
- GitHub CLI are acreditare invalidă. Connectorul poate citi, dar operația de scriere a fost refuzată cu 403. Commitul local `fb5e139` este păstrat, `main` remote era încă `f87f8d8` la verificare.
- Prima încercare Vercel a răspuns `Not authorized`; reîncercarea a publicat cu succes deploymentul `dpl_8o3Vkbive38WwSh66iphYcnBHm6S` pe `https://epetrecere.md`, la 19:31 UTC.
- Publicarea finală este `dpl_CJMaBKVyTHUvG1SFkjF7mQeCjuHW`, stare `READY`, alias `https://epetrecere.md`. Include commitul `555920b`, recuperarea înregistrării și meniurile localizate. Nu mai există blocaj de publicare Vercel; rămân accesul GitHub și Mac-ul blocat pentru testele manuale.

Acest raport separă verificările automate de testarea manuală live. Nu afirmă că toate funcțiile platformei sunt lipsite de buguri.

## Continuare: 7 septembrie 2026

Mac-ul a fost deblocat. Testele folosesc acum browserul separat din Codex, fără a interfera cu altă sarcină care controlează Chrome.

### Verificări manuale live efectuate

- Autentificare în contul sintetic al artistului, categoria Foto & Video vizibilă și selectabilă.
- Încărcarea fotografiei din formular a reușit, cu mesajul de confirmare.
- Nume și descriere QA, oraș Bălți, deplasare 150 km și supliment 20 EUR; toate etichetele distanței s-au actualizat din Chișinău în Bălți.
- Tarif de nuntă per eveniment, 300 EUR; pasul următor rămâne blocat cât tariful adăugat este gol.
- Pasul final prezintă corect categoria, orașul, deplasarea, suplimentul și tariful.
- Contractul se deschide și înainte de completarea identității. Completarea identității regenerează documentul afișat și invalidează citirea anterioară; deschiderea tuturor secțiunilor marchează citirea, păstrată după închiderea panoului.
- La viewport 390 × 844: o singură bifă, lista documentelor fără versiuni în etichete, canvas de semnătură și butoane finale accesibile prin scroll; fără depășire orizontală sau decuparea jumătății inferioare în starea încă nesemnată. Consola nu a raportat erori/avertizări în această verificare.
- Semnarea și trimiterea live nu sunt încă efectuate: s-a cerut confirmarea expresă pentru cele două semnături fictive QA, fără reprezentarea unei persoane reale.

### Probleme suplimentare găsite și corecții în lucru

- Lipsa negocierii și a istoricului ofertelor în dashboardul sălii; clientul nu avea contraofertă accesibilă în cabinet. Implementare adăugată, inclusiv sincronizarea după refresh, numele/linkul sălii și protecția contactelor. 12 teste trecute.
- Ștergerea profilurilor/conturilor nu invalida consecvent catalogul public. Invalidare adăugată după operația reușită, cu validarea ID-urilor și păstrarea dovezilor contractuale. 13 verificări izolate ale handlerelor trecute, fără operații externe.
- Traducătorul automat modifica fragmente ale contractului românesc afișat pe interfața EN, de exemplu înlocuia cuvinte în interiorul propozițiilor. Textul juridic și datele dovezilor sunt acum excluse explicit din traducerea automată, în onboarding, documentele publice, contul furnizorului și administrare. Sunt protejate și mutațiile atributelor. 24 verificări de integritate trecute, fără modificarea documentelor/versionării/dovezilor.
- Acordul partenerului v2.1 nu are încă un corp publicat RU/EN. Interfața indică explicit versiunea română disponibilă, fără să pretindă că este o traducere. Referirea greșită la Anexa 2 a fost scoasă numai din textele ajutătoare; numerotarea anexelor și conținutul juridic nu au fost schimbate.
- Helperul pentru cele patru identități QA poate neutraliza telefonul/notificările și închide numai sesiunile persoanei QA verificate prin marker, email, ID aplicație și ID Clerk. Cinci teste de siguranță trecute. Comenzile mutante nu au fost încă executate.
- Reexecutate 76 teste de regresie pentru onboarding și recuperarea pachetului contractual; toate trecute. Typecheck și verificarea diff-ului au trecut.

### Publicare și reverificare

- Build local și Vercel reușite, 459 pagini. Commit sursă `c35ded7`.
- Publicat pe `https://epetrecere.md`: deployment `dpl_3tKRvrcXvPqy53QxjfcGbnTzk8cq`, stare `READY`, URL de deployment `https://epetrecere-djep1zupy-vladstalker96-7582s-projects.vercel.app`.
- HTTP live după publicare: homepage, artiști, săli, acord parteneri EN/RU răspund 200; `/api/legal/accept`, `/api/me/artist`, `/api/me/venue` răspund 401 fără autentificare.
- Verificat manual contractul public EN/RU după încărcare: nota privind limba română este afișată, conținutul are protecțiile de traducere și `lang="ro"`; fragmentele `5% din valoarea finală` și `partener din aceeași categorie` rămân intacte. Fără erori/avertizări în consola verificată EN.
- Reexecutat manual onboardingul artistului după publicare, de la categorie până la pasul final: fotografie încărcată, Bălți, 150 km, supliment 20 EUR, nuntă 300 EUR. Butonul contractului se deschide, nota de limbă este afișată, textul taxei rămâne intact, iar explicația dovezii nu mai trimite la Anexa 2 inexistentă în acel document.
- Reverificat vizual finalul formularului la 390 × 844: lista cu o singură bifă, canvasul și butoanele sunt accesibile prin scroll, fără decupare în starea nesemnată. Viewportul temporar a fost resetat; fila cu formularul pregătit este păstrată pentru continuare.

Fluxurile manuale de semnare, aprobare, rezervare, negociere, confirmare și recenzie rămân de parcurs pentru ambii furnizori QA. Confirmarea expresă pentru semnăturile fictive este încă în așteptare; nu s-a trimis niciun contract QA și nu s-au creat profiluri publice în această continuare. Corecțiile negocierii/ștergerii au verificări automate, nu sunt prezentate drept scenarii manuale live finalizate.

## Continuare după confirmarea semnăturilor QA: 7 septembrie 2026

Utilizatorul a confirmat explicit semnarea fictivă pentru ambele conturi. Această secțiune actualizează stările intermediare de mai sus, fără a le prezenta retroactiv drept teste finalizate.

### Onboarding, contracte și aprobare manuală live

- Artistul QA, profil 561, `qa-test-foto-video-balti`: Foto & Video, Bălți, 150 km, supliment 20 EUR, tarif nuntă per eveniment 300 EUR. Fotografia a fost încărcată din formular.
- Semnătura fictivă QA Test Artist a fost desenată și trimisă la 2026-09-07 15:28:43 UTC. Cele cinci acceptări 258-262 sunt legate de artistul 561. Identitatea, semnătura PNG, data, IP-ul, dispozitivul și hash-urile copiilor sunt prezente și consistente. Verificarea automată PNG confirmă antetul; desenul a fost văzut manual în interfață.
- Sala QA, profil 24, `qa-test-venue`: QA Test Sală Bălți, adresă explicit fictivă, 30-150 invitați, fotografie încărcată. Persoană juridică fictivă, reprezentant QA Test Venue, semnare la 2026-09-07 15:43:02 UTC, acceptări 263-268.
- Pentru ambele formulare la 390 × 844, după bifare și desenarea semnăturii: contractul se deschide, o singură bifă, butoanele finale și canvasul sunt accesibile prin scroll, fără jumătate inferioară decupată. Viewportul a fost resetat după test.
- În setările ambilor furnizori apar documentele, semnătura și informațiile de acceptare. Contractul artistului și acordul sălii au fost expandate și descărcate manual cu eveniment de download confirmat.
- Adminul QA a văzut ambele cereri, fotografia, orașul, capacitatea/deplasarea, descrierea și linkurile copiilor. Descărcarea autentificată a copiilor 258 și 264 a fost verificată. Aprobarea manuală a ambelor cereri a reușit; `is_active` a devenit true numai după această acțiune.
- Contractele nu au fost modificate, suprascrise sau traduse automat după semnare. Datele tehnice brute, semnăturile și linkurile secrete de calendar nu sunt reproduse în acest raport.

### Probleme găsite în testarea manuală și prima publicare

- Dashboardul artistului declara greșit profilul online înaintea aprobării. Acum ambele roluri afișează starea reală a publicării; linkurile publice sunt ascunse cât profilul este inactiv.
- Navigarea din dashboardurile artistului, sălii, adminului și clientului putea reseta EN/RU la RO. Legăturile și redirecturile din zonele remediate păstrează limba.
- Calendarul sălii avea tipuri de eveniment netraduse și abrevierea engleză Tuesday tradusă greșit în „You”. Etichetele sunt localizate și protejate de traducere repetată.
- Cererile admin afișau descrierile HTML/Markdown literal. Rezumatul este acum text sigur, fără modificarea documentelor juridice.
- Mesajul de la telefon explică acum corect că datele nu sunt publice, dar devin accesibile celeilalte părți după confirmarea finală bilaterală.
- Commit `94524d1`, build local reușit, 459 pagini; 41 teste de publicare/calendar/admin/client trecute. Publicat pe epetrecere.md: `dpl_DTCnmJU3FetETZwfAoGqvGAGRRp1`, READY, `https://epetrecere-4qletk61a-vladstalker96-7582s-projects.vercel.app`.
- Vercel a refuzat prima încercare cu Not authorized, dar contul a fost verificat prin whoami, iar reîncercarea pe același canal a reușit. Nu s-a schimbat găzduirea și nu s-a ocolit refuzul GitHub.
- Reverificat live dashboardul artistului aprobat: starea Profile published, cererea nouă și toate linkurile inspectate folosesc /en/.

### Scenarii client în curs

- Planificare manuală completă: plan 99, QA Test Nuntă Bălți 20 septembrie, data 2026-09-20, Bălți, 14:00-00:00, 60 invitați, sală în oraș și categoria Foto & Video; checklist, invitați și Photo Moments activate.
- Sala QA apare corect în filtrul Bălți/capacitate. Profilul public nou a fost deschis; nu afișează telefonul sau emailul furnizorului. Headerul mobil era însă prea lat pentru client autentificat, iar butoanele din dreapta erau decupate. Corecție suplimentară în lucru, nu încă inclusă în prima publicare.
- Artistul QA apare în categoria Photo & Video și în recomandările pentru data planului.
- Cererea sălii 256 și cererea artistului 257 sunt create prin UI, pending, legate de planul 99 și exclusiv de conturile QA. Artistul primește intervalul 14:00-21:00 și mesajul explicit de test. Telefonul/emailul clientului nu sunt afișate în dashboardul artistului înainte de confirmare.
- Telefonul neutralizat QA TEST este corect respins de validatorul cererii. Pentru crearea celor două cereri s-a folosit temporar numărul fictiv rezervat +12025550123, din intervalul [NANPA 555-0100-0199](https://nanpa.com/numbering/555-line-numbers), apoi telefonul utilizatorului QA a fost imediat neutralizat din nou înaintea schimbărilor de status. Nu s-au schimbat validările sau notificările produsului pentru a permite testul.
- Probleme reale suplimentare: cererea rapidă a sălii nu prelua orele planului; URL-ul se schimba spre tabul artiștilor fără actualizarea conținutului; pachetul per-eveniment fără durată al artistului era eliminat din modal, afișând greșit lipsa tarifelor. Corecțiile și regresiile sunt în lucru, urmează publicare și reverificare.

Rămân de încheiat negocierea, confirmările, finalizarea simulată după data evenimentului, recenziile, editarea și reverificările după a doua publicare, plus curățarea exactă a datelor QA. Dovezile contractuale semnate trebuie păstrate.

### Continuare: negociere, editare și remedieri suplimentare

- Negociere manuală artist 257: ofertă furnizor 320 EUR, contraofertă client 300 EUR, acceptată de artist. Sală 256: 2000 EUR, contraofertă 1800 EUR, acceptată de sală. La acest punct ambele sunt `accepted`, nu confirmate bilateral, fără comisioane sau recenzii.
- Calendarul sălii afișează corect cererea pe 20 septembrie, 60 persoane, 1800 EUR, starea Accepted. Detaliile calendarului nu afișează telefonul sau emailul clientului. La 390 × 844 lățimea documentului este 390 px, fără overflow orizontal.
- Editare manuală sală: nume EN/RU, capacitate maximă 160, preț 35 EUR/persoană și telefon de profil fictiv rezervat. Salvarea și afișarea publică a numelui EN/capacității/prețului au fost reverificate. Dovezile contractuale rămân cu identitatea exactă de la semnare, nu sunt rescrise prin editarea profilului.
- Asistentul sălii a răspuns la o cerere explicit doar-citire cu numele propriei săli, capacitatea 30-160 și starea acceptată a rezervării, fără a divulga contacte sau a modifica date.
- Bug confirmat manual în ambele sensuri: mesajul inline al rezervării folosea `/api/chat`, care permitea și returna contactele înainte de confirmare, deși mesageria principală avea protecție. A fost trimis exclusiv textul fictiv `qa@example.invalid +12025550123`, văzut apoi și în contul artistului. Corecție pregătită pentru GET/POST legacy și mesagerie, inclusiv numele expeditorului, atașamentele și notificările. Reverificarea live după deploy rămâne obligatorie. Nu s-au rescris mesajele istorice sau contractele.
- Bug manual: reautentificarea clientului a creat planul duplicat 100 din autosalvarea planului 99. Protocolul nou separă autosalvarea de trimiterea explicită și păstrează aceeași cheie la retry/StrictMode. Migrarea aditivă `20260907161706_wizard_submission_idempotency.sql` a fost aplicată cu tranzacție și timeout: 36 planuri înainte și după, inclusiv aceleași două planuri QA. Două coloane nullable și index unic per proprietar, fără rescrierea datelor existente.
- Proba DB a indexului/idempotency/atomicității a folosit numai clientul QA, ID-uri temporare negative și rollback obligatoriu: planuri QA 2→2, checklist 54→54, amprente existente identice, zero rânduri temporare rămase și fără consum de secvențe. Aceasta nu este prezentată ca test HTTP concurent 200/409.
- Remedieri pregătite: header mobil și meniu cont accesibil prin click/touch/tastatură; polling notificări păstrat; statistici sală din cererile actuale cu istoricul vechi separat; aceeași lună Moldova în calendar/statistici; intervalul cererii rapide; taburi sincronizate cu URL; tarif artist per-eveniment; termen vizual 72h sală/24h artist; date localizate; finalizare disponibilă numai după confirmare și data permisă; moderarea recenziilor raportează succes numai după răspuns HTTP reușit; dublurile concurente de recenzii recunosc codul SQLSTATE inclusiv în eroarea Drizzle.

Aceste remedieri suplimentare sunt încă în pregătirea celei de-a doua publicări; nu sunt confundate cu versiunea live `94524d1`. Autentificarea QA folosește identități izolate și bilete temporare, nu verifică livrarea emailurilor reale sau OAuth. Nicio plată nu a fost executată.

### Verificarea finală a pachetului înainte de publicare

- Extinsă protecția contactelor la notificările istorice, feedul sălii, preview-urile conversațiilor și exportul din setări. Exportul păstrează exact datele proprii și acceptările juridice ale titularului; elimină notele administrative și protejează contactele, semnăturile și PDF-urile celeilalte părți cât rezervarea nu este confirmată bilateral.
- Proiecțiile pentru rezervări, dashboard și calendar/iCal neutralizează și contactele introduse în nume sau texte codificate HTML. Calendarul public expune disponibilitatea, nu notele private ale furnizorului. Datele valide precum 20.09.2026 14:00 nu mai sunt confundate cu numere de telefon.
- Manual artist: schimbare Bălți→Orhei, salvare, apoi setările afișează explicit `Up to 150 km from Orhei`. Orașul a fost readus în Bălți prin profil. Telefonul profilului este fictiv rezervat, iar telefonul contului pentru notificări este neutralizat.
- Manual AI artist: rezervarea era citită corect, dar profilul propriu lipsea din context. Patch-ul adaugă numai numele localizate, orașul și categoriile profilului autentificat, fără contacte/contracte și fără permisiuni noi. AI sală a răspuns deja corect la nume/capacitate/stare; AI artist trebuie reverificat după publicare.
- Suita completă locală `npx tsx --test scripts/*.test.ts scripts/*.test.mjs scripts/*regression.cts`: 308 teste raportate, toate trecute, zero eșecuri. Include teste de handler cu servicii simulate, nu este prezentată ca 308 scenarii manuale sau operații externe.
- Tentativa de acces la copia artistului din sesiunea sălii a fost blocată de browser cu `ERR_BLOCKED_BY_CLIENT`. Aceasta nu este pretinsă drept dovadă HTTP 403; nu s-a încercat ocolirea blocării prin alt canal. Accesul propriului titular și al adminului a fost verificat anterior prin UI.

### A doua publicare și reverificări live

- Commit `af8cf8a`, build local și Vercel reușite, 459 pagini. Deployment `dpl_462he2s7D3UvhX9TQ7mne9cFHgXc`, READY, `https://epetrecere-krkhse53k-vladstalker96-7582s-projects.vercel.app`, alias activ `https://epetrecere.md`.
- Reverificat ca artist pentru cererea 257 încă `accepted`: numele și datele listei sunt corecte în EN, butonul Completed este dezactivat. În chat, contactele mesajului QA istoric sunt mascate. O nouă trimitere cu email/telefon rămâne în draft și nu apare în istoric; mesajul de control fără contacte, cu data `20.09.2026 la 14:00`, este trimis și apare în conversație.
- Problemă UI suplimentară observată după reload: linkul `?expand=257` nu selectează tabul Accepted și predeschide conversația fără a-i încărca mesajele. Închiderea/redeschiderea încarcă corect mesajele. Corecție mică în lucru pentru tabul potrivit, încărcarea conversației și eroare de contact mai clară; protecția serverului este deja live.

### Confirmare bilaterală, finalizare și moderare QA

- AI artist reverificat live după `af8cf8a`: răspunde corect cu numele QA Test Foto Video Bălți, orașul Bălți, categoria Foto & Video și rezervarea acceptată 14:00-21:00. Întrebarea a fost explicit doar-citire.
- Reautentificarea clientului după deploy nu mai creează un plan nou: aceleași planuri 99 și 100. Planul duplicat 100 provine din bugul anterior, nu din noul protocol.
- Header client verificat la 390 și 320 px: Plan, limba, contul și meniul sunt în limitele viewportului. Meniul expune Mesaje/Notificări, contul se deschide prin click/touch și se închide cu Escape. Viewportul a fost resetat. Aceasta este emulare Chromium IAB, nu test pe Safari/iPhone fizic.
- Clientul a confirmat artistul 257 și a acceptat oferta sălii 256; sala a efectuat apoi confirmarea finală. Contactele fictive devin vizibile numai după confirmarea bilaterală. Mesajul istoric mascat înainte de confirmare reapare integral după aceasta, fără rescriere în DB.
- Dashboardul sălii arată corect rezervarea confirmată, 1800 EUR venit lunar estimat și o zi ocupată. Comisioane unice: artist 15 EUR (5% din 300), sală 200 EUR (tariful pentru nuntă), ambele scadente la 2026-10-07, 30 zile după confirmare. Tariful 50 EUR privește celelalte categorii prevăzute în anexă, nu nunta. TVA nu este adăugat; nu s-a marcat nimic drept achitat.
- Simulare explicită de trecere a timpului, nu reprogramare reală: helperul strict a modificat numai data celor două rezervări QA 256/257 din 2026-09-20 în 2026-09-06, păstrând toate celelalte date și receipt cu originalele. Ambele au fost apoi finalizate manual de furnizorul propriu și au devenit `completed`.
- Clientul a trimis câte o recenzie de 5 stele, ambele marcate explicit QA TEST ONLY, fără eveniment/prestare reală și fără recomandare comercială. După trimitere, formularele nu mai permit o a doua recenzie. Adminul a aprobat individual numai cele două recenzii QA; lista de moderare a devenit goală.
- În `/en/admin/contracte`, ambele contracte QA au fost expandate: 209 blocuri pentru acordul sălii și 159 pentru partener. Semnăturile sunt imagini încărcate valide, ambele 282 × 180, iar datele titularilor, data, IP-ul, dispozitivul și hash-urile sunt prezente. Valorile tehnice brute nu sunt copiate în raport.
- Regresii suplimentare în pregătire: deep-link conversație artist, descriere publică fără Markdown literal și etichete neutre pentru Foto & Video, destinații corecte pentru notificările sălii. Suita Node intermediară: 333 teste trecute și TypeScript curat.

### Reverificări suplimentare și întreruperea accesului la browser

- Răspunsul sălii la recenzia QA a fost salvat și reapare în propriul dashboard. Recenzia aprobată apare pe profilul public nou, însă răspunsul lipsea acolo. Rendererul public artist/sală a fost corectat în cod pentru a afișa numai răspunsurile aferente recenziilor aprobate, ca text sigur; necesită reverificare după publicare.
- Asistentul admin a răspuns onest că nu putea verifica sala și rezervările după ID, dar a răspuns în RO deși interfața/întrebarea erau EN. Extensie strict read-only pregătită: căutare artist/sală și statusul rezervărilor după ID, DTO minimal fără contacte/date juridice/date ale invitaților, rol admin verificat server-side; limba interfeței este validată și transmisă promptului.
- Cele două încercări de răspuns ale artistului la recenzia 12 nu au fost confirmate în DB. Logurile filtrate Vercel arată un timeout de 300 secunde în edge-middleware pentru una dintre cereri, nu o dovadă de respingere de către handler-ul de recenzii. Nu este atribuită o cauză neverificată artistului sau furnizorului de autentificare. Formularul necesită feedback pentru rezultat necunoscut și reconciliere înainte de retry.
- Revizuirea invitaților a găsit numărarea incorectă a cuplurilor/familiilor drept un singur loc. Fix pregătit pentru sumar, listă, așezare, auto-așezare și verificarea capacității în API. Scrierile relevante sunt serializate pe planul propriului utilizator și verifică adulți + copii; fără migrare sau rescriere a datelor existente. Testul manual cu 1 + 2 + 4 persoane rămâne de efectuat după publicare.
- În exportul HTML/PDF al meselor a fost identificată interpolarea nesigură a numelor. Escaparea tuturor textelor este pregătită separat, fără a folosi date sau payloaduri malițioase în producție.
- La încercarea curățării planului duplicat 100, controlul browserului a raportat explicit că Mac-ul este blocat. Nu s-a confirmat ștergerea planului și nu se presupune că aceasta a reușit. Ultima verificare read-only: 100 aparține exact clientului QA, fără invitați, mese, poze, invitație sau rezervări, doar 27 sarcini automate. Planul 99 și istoricul contractelor trebuie păstrate.
- Utilizatorului i s-a cerut deblocarea Mac-ului. Până atunci rămân neconfirmate manual: răspunsul artistului, rendererul public al răspunsurilor, noile instrumente AI admin, deep-link-ul chatului, grupurile la mese și cleanup-ul final. Nu sunt prezentate drept teste trecute.

### Pachet final și cleanup financiar limitat

- Commit `9bebda4`: chat deep-link, profiluri și răspunsuri publice, notificări sală, AI admin read-only cu limba selectată, headcount familii/cupluri, capacity locking, escapare HTML la exportul meselor și reconciliere după timeout la răspunsul recenziilor. PUT-ul de răspuns existent nu a fost modificat; noul GET este minimal, numai proprietar/admin, fără datele clientului. Timeoutul acoperă și citirea JSON, draftul este păstrat, fără retrimitere automată.
- Verificare finală pe tree înghețat: 359 teste Node trecute, TypeScript și diff-check curate. Testele de export execută callbackul real cu popup simulat, fără browser sau execuția HTML-ului rezultat. Buildul local anterior ultimelor protecții mici a generat 459 pagini; buildul final este validat de publicarea Vercel, nu este confundat cu cel local anterior.
- Cleanup financiar executat exact: comisioanele QA 26 (rezervare sală 256, 200 EUR) și 25 (rezervare artist 257, 15 EUR) au trecut din pending în cancelled. Numai două rânduri modificate, cu notă QA și receipt cu originale. Sumele, scadențele, rezervările completed și acceptările juridice sunt păstrate. Nicio plată primită sau înregistrată.
- Profilurile și conturile QA, recenziile și planurile 99/100 rămân pentru testele manuale întrerupte. Ștergerea duplicatului 100, dezactivarea profilurilor publice QA și dezactivarea linkurilor Photo Moments nu au fost confirmate. Nu trebuie șterse conturile sau dovezile contractuale.
- Publicare finală reușită: `dpl_9byz83Hmdgx8WrfjigoGCpcv5u2Z`, READY, `https://epetrecere-hkjs5hmkf-vladstalker96-7582s-projects.vercel.app`, alias `https://epetrecere.md`. Buildul Vercel final a trecut și a generat 459 pagini. Verificări HTTP anonime după publicare: `/en`, profil artist QA, profil sală QA și `/en/planifica` răspund toate 200. Acestea sunt probe de disponibilitate HTTP, nu înlocuiesc testele manuale întrerupte.
- Sesiunea clientului QA a fost revocată la încheierea acestei continuări; sesiunile celorlalte roluri QA fuseseră deja revocate la schimbarea conturilor. Nu s-au închis sesiunile utilizatorilor reali. Viewportul fusese readus la desktop înainte de blocarea Mac-ului.

Următoarea continuare după deblocare: verificare răspuns artist 12 și reîncercare controlată dacă încă lipsește; recenzii publice și linkuri în EN/RU; AI admin după deploy; deep-link conversație 257; grupuri la mese în planul 99; checklist/Moments și cereri QA noi pentru intervalul sălii/tariful per-eveniment (anulate ulterior fără comisioane); verificare exactă și ștergere duplicat 100; dezactivare profiluri QA 561/24 și linkuri Moments, păstrând conturile și contractele. Nu se repetă simularea de dată sau anularea taxelor fără consultarea receipt-urilor existente.

### Continuare manuală: recenzii și grupuri de invitați

- După deblocare, răspunsul sălii la recenzia 13 a fost verificat pe profilul public EN. Răspunsul artistului la recenzia 12 a fost trimis manual cu text explicit QA, salvat în dashboard și verificat pe profilul public. Ambele sunt acum vizibile după aprobare; nu reprezintă evenimente sau recomandări comerciale reale.
- Profilul Foto & Video afișează descrierea fără marcaje Markdown literale și eticheta neutră pentru servicii, nu cea pentru muzică. Deep-link-ul `?expand=257` selectează corect Past și rezervarea Completed; acest tab nu afișează chat, deci nu este considerat test al autoîncărcării conversației pentru o cerere în curs.
- În planul 99, Table Seating a fost activat prin Settings și salvarea a persistat. Au fost adăugate manual trei grupuri exclusiv sintetice, fără telefoane/emailuri: QA Invitat Individual (1 adult), QA Cuplu Test (2 adulți), QA Familie Test (3 adulți și 1 copil). Toate au fost confirmate RSVP prin UI. Lista și repartizarea afișează 7 persoane, nu 3 rânduri.
- Masa personalizată QA Test Masă 6 a fost creată manual, cu 6 locuri. Repartizarea nu este încă verificată: apăsarea Automatic suggestion a blocat fila IAB la dialogul nativ; API-ul de dialog nu a expus o confirmare controlabilă. O filă nouă a permis citirea stării, care arată încă 0/7 persoane așezate. Nu se afirmă că problema este reprodusă pe Safari sau că repartizarea s-a salvat.
- În checklist, textul QA TEST workflow checklist a fost introdus, dar nu s-a confirmat salvarea după blocarea dialogului. Nu se repetă trimiterea fără verificarea stării. Șabloanele standard rămân parțial RO în interfața EN, o problemă separată de datele introduse de utilizator.
- Verificare read-only la 20:43 UTC: cele două rezervări rămân Completed, comisioanele 25/26 Cancelled, răspunsurile ambelor recenzii sunt salvate, toate cele 11 dovezi juridice au hash-uri valide și nicio rezervare legată din afara fixture-ului QA nu a fost identificată.

### Corecții suplimentare pregătite, încă nepublicate

- Navigarea mobilă a planificatorului nu mai taie ultimele două instrumente: toate taburile eligibile apar în bara derulabilă, cu starea curentă accesibilă.
- Importul XLSX/CSV păstrează tipul grupului, adulții, copiii, însoțitorii, RSVP, câmpurile de contact și notele/preferințele exportate în RO/RU/EN. Fișierul este validat înainte de primul POST; fișierele vechi rămân compatibile. Importul adaugă rânduri, nu deduplică sau înlocuiește lista existentă.
- Revizuirea independentă a găsit pierderea prefixului 0/+ la telefoanele CSV. Citirea folosește acum opțiunile comune raw, iar regresia citește aceiași bytes și aceleași opțiuni ca interfața. Nu se loghează datele în clar din parser. 17 teste țintite și TypeScript trecute; suita intermediară anterioară acestei ultime corecții avea 371 teste trecute.
- În lucru: selector accesibil pentru așezarea fără drag-and-drop, confirmări explicite în dialogul paginii și traducerea exclusiv la afișare a sarcinilor standard, fără rescrierea sarcinilor personalizate sau a bazei de date.

### Pachet suplimentar: 7 septembrie UTC / 8 septembrie, ora Moldovei

- Checklist: cele 87 de titluri standard și 12 categorii au traduceri RU/EN numai la afișare, inclusiv Overview. Recunoașterea verifică exact titlul, categoria, termenul, ordinea și prioritatea șablonului. Sarcinile personalizate și textul din DB nu sunt rescrise. Categoriile și prioritățile selectate afișează eticheta tradusă de la prima randare. Scrierile au protecție comună împotriva dublurilor, tratarea erorilor de rețea și rollback pentru actualizările optimiste nereușite.
- Așezare: selector accesibil pentru fiecare grup, cu locuri disponibile și opțiuni insuficiente dezactivate; drag-and-drop păstrat. Repartizarea automată și ștergerea mesei cer confirmare explicită în dialogul paginii, fără cerere la simpla deschidere sau anulare. Toate cele șapte căi de scriere folosesc aceeași protecție sincronă împotriva suprascrierii stării prin cereri concurente.
- Locuri: formularul și API-urile POST/PATCH acceptă consecvent doar numere întregi între 1 și 30. Forma aleasă este transmisă și salvată explicit, independent de numărul de locuri. Mesele vechi fără formă păstrează aspectul anterior, fără presupuneri sau backfill.
- Migrarea aditivă `20260907210204_seating_table_shape.sql` a fost aplicată înainte de noul cod: câmp text nullable, fără default, cu CHECK pentru round/rectangular/long. Ghidul PostgreSQL a fost folosit pentru tranzacție scurtă, lock timeout 2s, statement timeout 5s și constrângere idempotentă. Helperul verifică hash-ul exact al migrării. Rezultat live: 7 mese înainte, 7 după, aceeași amprentă a tuturor câmpurilor anterioare, CHECK validat. Nu au fost șterse sau rescrise mese, invitați, rezervări ori contracte.
- Photo Moments: review-ul a identificat posibilitatea de a atașa un URL arbitrar și apoi de a-l folosi pentru descărcare server-side sau ștergere din storage cu tokenul global. Nu a fost exploatată pe date reale. Patch-ul trece încărcarea proprietarului la multipart atomic, cu ownership verificat înaintea procesării, imagine reprocesată fără EXIF și nume/cale generate de server pentru planul respectiv. Atașarea arbitrară prin JSON este respinsă.
- Ștergerea/fetch-ul din storage cer namespace-ul planului și confirmarea fișierului exact în propriul store. URL-urile neverificabile nu sunt fetch-uite sau șterse din Blob. Înregistrările vechi rămân afișate; la eliminarea cerută de proprietar se scoate numai legătura din galerie și se arată avertisment dacă ștergerea din storage nu este verificabilă. Fără migrare sau ștergere automată a fotografiilor existente.
- ZIP: buget de imagini 3,5 MiB, maximum 500 intrări, citire limitată a fluxului, redirecturi interzise și verificare finală de 4 MiB. Limita veche de 40 MiB era incompatibilă cu [limita Vercel Functions de 4,5 MB](https://vercel.com/docs/functions/limitations). Arhiva indică fișierele omise fără a expune URL-uri private sau secrete.
- Limitare de confidențialitate păstrată explicit: PIN-ul Moments protejează galeria și API-ul, nu revocă accesul direct la fișierele existente din Public Blob pentru cine cunoaște URL-ul. [Documentația Vercel Blob](https://vercel.com/docs/vercel-blob/security) descrie acest model. Acest patch nu migrează storage-ul la Private Blob și nu pretinde confidențialitate per fișier.
- Review-ul independent a identificat și consumatorul Expo care încă trimitea URL prin JSON. Este adaptat la același upload multipart; asta corectează sursa aplicației mobile, nu înseamnă publicarea unei noi versiuni instalabile în App Store/Google Play. Clientul vechi nu primește o excepție nesigură la verificarea proprietarului.

Aceste ultime corecții așteaptă verificarea completă și publicarea comună. Testele de handler/componentă sunt izolate, nu sunt prezentate drept încărcări, ștergeri sau scenarii manuale live. Fila IAB blocată la dialogul nativ a fost semnalată utilizatorului; nu au fost folosite mecanisme alternative pentru a ocoli protecții ale browserului.

### Verificarea comună a pachetului suplimentar, 8 septembrie

- Source freeze confirmat de autorii celor trei subtaskuri. Suita completă pe acest pachet: 386 teste Node trecute, zero eșecuri, zero omise; TypeScript web și `git diff --check` curate. Aceste rezultate sunt teste automate locale, nu 386 scenarii manuale live.
- Uploadul invitaților în Moments are aceeași limită de 4 MiB ca uploadul proprietarului, cu HTTP 413 și cod `PHOTO_TOO_LARGE`. Întreaga selecție și toate imaginile rezultate după filtrul vintage sunt verificate înainte de primul POST. Testele includ limita exactă, al doilea fișier prea mare și rezultatul vintage mărit: zero încărcări parțiale în aceste cazuri. Instrucțiunile și erorile sunt localizate RO/RU/EN.
- Verificarea separată TypeScript a aplicației Expo nu poate fi confirmată în acest checkout: lipsesc dependențele native, inclusiv baza tsconfig Expo, React Native și Expo Router. Nu s-a instalat sau publicat o versiune mobilă nativă. Buildul web nu constituie validare a aplicației instalabile.
- La reluarea controlului browserului, instrumentul a raportat explicit că Mac-ul este blocat și deblocarea automată nu a reușit. Utilizatorului i s-a cerut deblocarea. Această blocare curentă este distinctă de dialogul nativ anterior; nu se pretinde că vreun test UI ulterior a trecut.
- Buildul local al pachetului complet a trecut și a generat 459 pagini. Review-ul independent final al limitei de upload și al compatibilității formei meselor nu a găsit blocaje de publicare.
- Reverificare DB strict read-only la 2026-09-07 21:22 UTC: 7 mese, aceeași amprentă `54878ad4b42633275fd9615f6270f3b8`; contractele QA au în continuare toate cele 11 dovezi valide; rezervările 256/257 sunt Completed, taxele 25/26 Cancelled, ambele răspunsuri la recenzii sunt salvate. Profilurile QA rămân active pentru testele manuale neîncheiate.

### Ce rămâne de reverificat manual după deblocare

1. Planul 99: repartizarea grupurilor 1 + 2 + 4, refuzul unei mese cu locuri insuficiente, păstrarea formei după reload, anularea/confirmarea repartizării automate și a ștergerii mesei. Nu s-a confirmat încă nicio repartizare a celor 7 persoane.
2. Checklist: traducerile EN/RU în interfața live, adăugare, bifare, reload și eliminarea exclusivă a sarcinii QA. Importul XLSX/CSV trebuie probat manual pe un plan QA separat, fiind append, nu deduplicare.
3. Moments: încărcare sintetică proprietar/invitat, accesul privat al galeriei, aprobare, favorite, export și ștergerea doar a propriului fișier QA. Limita uploadului și protecțiile storage au teste automate; fluxul manual nou nu este încă verificat.
4. Artist/sală: o cerere QA nouă pentru verificarea conversației în curs prin deep-link, a intervalului sălii și a tarifului per-eveniment. Cererile se anulează fără comisioane după verificare; nu se reiau simulările de dată sau anulările deja executate.
5. Admin: răspunsul AI cu noile instrumente read-only și limba EN trebuie reverificat manual. Copiile contractelor și aprobarea ambelor profiluri au fost deja verificate prin UI.
6. Cleanup final: reverificarea dependențelor și ștergerea doar a duplicatului QA 100; dezactivarea profilurilor QA 561/24 și a linkurilor Moments. Conturile și dovezile contractuale semnate se păstrează. Nu s-au executat aceste operații în lipsa confirmării stării prin fluxul de test.

Sesiunea activă a clientului QA a fost revocată prin helperul cu verificarea identității exacte: o sesiune revocată. Sesiunile utilizatorilor reali nu au fost atinse. Testarea pe Safari/iPhone fizic, livrarea emailurilor reale, OAuth, plățile și distribuirea aplicației mobile native nu sunt declarate verificate.

### Publicarea pachetului suplimentar, confirmată

- Sursa publicată: commit `c76ce20`, `Fix planner accessibility, imports and Moments asset security`.
- Vercel: `dpl_FTJBsC6bHMSV48q9dwJe9eENUPuz`, starea READY, build final reușit cu 459 pagini. Deployment `https://epetrecere-gqpicxr50-vladstalker96-7582s-projects.vercel.app`, alias de producție confirmat `https://epetrecere.md`.
- Smoke HTTP anonim după publicare: `/en`, `/en/planifica`, profilul artistului QA și profilul sălii QA răspund 200. GET-urile pentru planul 99, fotografiile sale, ZIP-ul Moments și varianta mobilă `/api/v1/event-plans/99/photos` răspund 401 JSON fără autentificare. Nu s-a citit sau imprimat conținut privat și nu s-au executat scrieri prin aceste verificări.
- După publicare, o nouă verificare a controlului browserului a confirmat că Mac-ul este încă blocat. Lista manuală de mai sus rămâne deschisă; verificările HTTP și cele 386 teste locale nu sunt substituite verificărilor de interfață.
- Nu s-a făcut push către GitHub; publicarea a folosit proiectul Vercel existent prin CLI, cu snapshotul commitului local. Ultima actualizare a acestui raport este numai documentară și nu necesită o nouă publicare a aplicației.

### Continuare manuală din 8 septembrie: invitați, mese și checklist

- Browserul a redevenit accesibil. Planul 99: repartizare manuală prin dropdown pentru grupurile de 1 și 2 persoane la masa de 6 locuri; grupul de 4 nu poate selecta această masă când mai sunt numai 3 locuri. Creată separat masa «QA Test Rectangular 7», explicit rectangulară, cu 7 locuri; familia de 4 a fost repartizată acolo. După reload, 7/7 persoane așezate, toate grupurile intacte și forma păstrată.
- Familia a fost scoasă temporar de la masă: 3/7 persoane așezate. Anularea dialogului Automatic suggestion nu a modificat repartizarea. Confirmarea lui a așezat cele 4 persoane rămase împreună: 7/7. La viewport 390 × 844 nu a fost observat overflow orizontal al documentului. Acestea sunt teste manuale Chromium, nu Safari/iPhone fizic.
- Checklist EN: adăugare «QA TEST workflow checklist», bifare, reload cu 1/28 completate, schimbare în RU cu titlurile standard traduse și textul QA păstrat literal; eliminarea exclusivă a sarcinii QA a readus 0/27. Planul păstrează cele 27 de sarcini standard.
- Pentru import a fost folosit un XLSX sintetic creat și verificat cu instrumentele Spreadsheets, fără telefoane/emailuri: individual 1 adult, cuplu 2 adulți, familie 3 adulți + 1 copil, toate accepted. Importul manual prin file chooser în planul 100, anterior fără invitați, a produs 3 rânduri și 7 persoane confirmate. Importul adaugă, nu deduplică. Export Excel a fost apăsat, dar browserul nu a confirmat descărcarea, deci exportul manual rămâne neconfirmat.
- Planul 100 nu mai este un duplicat gol: a fost reutilizat ca «QA Test follow-up Bălți 22 septembrie», data 22.09.2026, 60 invitați țintă. Orice cleanup trebuie să țină cont de cele trei grupuri importate și de cererile noi, nu de vechea stare goală.
- Cereri noi create prin UI numai între identitățile QA: sală 258, plan 100, 22.09.2026, 14:00–00:00; artist 259, 14:00–21:00, 300 EUR per eveniment. Verificarea DB read-only confirmă intervalele, fără multiplicarea tarifului cu 7 ore. Telefonul temporar de rezervare al clientului QA a fost înlocuit imediat cu QA TEST înaintea schimbărilor de status. Nicio cerere reală sau plată nu a fost trimisă.
- În contul artistului, cererea 259 afișează clientul QA fără email/telefon. Dialogul de mesaj arată contactele fictive istorice mascate înainte de confirmare. Un mesaj neutru nou despre data 22.09.2026 a fost trimis și apare în conversație.

### Photo Moments privat și localizare: pachet în curs de finalizare

- Store separat creat: epetrecere-moments-private, store_Rsj9DsxnVigM2DHs, acces private, fra1. Conectat exclusiv Production. Vercel a generat MOMENTS_READ_WRITE_TOKEN pentru prefixul MOMENTS_; variabila nouă a fost redenumită explicit în MOMENTS_BLOB_READ_WRITE_TOKEN, fără schimbarea valorii. Verificarea ulterioară confirmă token privat prezent, store accesibil și tokenul public BLOB_READ_WRITE_TOKEN neschimbat. Nu se imprimă secrete sau URL-uri private.
- Localizarea pregătită include RSVP, datele din cabinet/plan, tipul evenimentului și categoriile din Setări și lista suplimentară de parteneri. Tarifele implicite de eveniment folosesc limba curentă, iar numele personalizate rămân intacte. Calendarul nu mai traduce abrevierea engleză Tu în You.
- Review-ul independent al noii rute de fișier nu a identificat ocoliri ale ownership/PIN/publicării sau ale protecției cache. Totuși, a găsit pierderea evidenței la eșecul ștergerii din Blob; corecția este în lucru și nu este declarată rezolvată până la verificare/publicare.
- Fotografia legacy 26 / plan 42: verificare numai în citire, 51 tabele și 347 coloane text/JSON/array; URL-ul apare exclusiv în event_photos.url, o referință. Apartenența obiectului la store-ul public este confirmată. PNG 3420 × 1798, 461.585 bytes, hash SHA-256 e17ffdb1cd76b50ab6cf0d6e19b174d57ec2d6f9fdd82847cd64fc65c549fddd. Nu a fost încă mutată sau ștearsă; existența copiilor externe nu poate fi exclusă prin DB.

Starea acestei secțiuni este intermediară. Publicarea noului pachet, probele manuale Moments/AI admin și cleanup-ul fixture-urilor rămân deschise.

### Închiderea cererilor suplimentare și verificarea locală finală

- Sala a respins manual cererea QA 258 cu motivul Other și o notă de test. Artistul a acceptat manual 259, fără confirmare din partea clientului; linkul `/en/dashboard/rezervari?expand=259` a selectat fila Accepted și a deschis conversația cu mesajul nou. Contactele au rămas mascate, iar finalizarea nu era disponibilă înainte de confirmare. Ulterior artistul a anulat manual 259. Verificarea DB read-only: 258 rejected, 259 cancelled, zero comisioane pentru ambele, intervalele corecte păstrate.
- AI admin a fost probat manual în EN cu citiri pentru profilurile și rezervările QA. Stările și intervalele au fost corecte. Lipsa sumei negociate în DTO a fost identificată și corectată prin câmpul minimal agreedPrice, cu teste de autorizare și confidențialitate. Răspunsul live după această corecție rămâne de reverificat.
- Recenziile QA 12/13 au fost retrase din publicare, nu șterse, printr-o tranzacție cu verificarea identităților și proprietății exacte. Răspunsurile, rezervările și dovezile contractuale rămân intacte; ratingurile profilurilor QA au fost recalculate. Receipt local protejat, fără publicarea datelor personale.
- Ștergerea fotografiilor păstrează acum rândul și URL-ul dacă eliminarea din storage eșuează sau apartenența nu poate fi verificată. Curățarea în loturi este limitată și reluabilă. Ștergerea contului verifică din nou fotografiile sub lock, înainte de minimizarea profilurilor, într-o tranzacție scurtă. Testele includ revenirea după eșec și upload concurent.
- Interfața Photo Moments serializează uploadul, publicarea și ștergerea, păstrează draftul la eroare și reconciliază starea după un răspuns incert. Nu repetă automat scrieri cu rezultat necunoscut. Motivul Other al refuzului sălii este afișat localizat.
- Source freeze: build web reușit, 459 pagini; verificarea TypeScript din build a trecut. Suita completă reluată cu concurență limitată: 415 teste trecute, zero eșecuri, zero omise; `git diff --check` curat. Acestea sunt verificări locale automate, nu teste manuale live.
- Controlul browserului a devenit intermitent la pointer și tastatură; navigarea și citirea au rămas parțial disponibile. Nu a fost raportată explicit blocarea Mac-ului în acest punct. Dezactivarea profilului prin UI nu a fost confirmată și nu se declară executată. Verificările prin API vor fi etichetate distinct.
- Limitări preexistente rămase pentru hardening separat: eșecul ștergerii identității Clerk după ștergerea locală necesită o coadă de reconciliere; eșecul simultan al inserării unei fotografii în DB și al ștergerii compensatorii poate lăsa un fișier privat orfan. Nu se pretinde rezolvarea tuturor situațiilor de indisponibilitate distribuită. Nu este publicată o versiune Expo nativă.

### Publicare și constatări din integrarea reală

- Commit 64515a8 publicat READY, deployment dpl_FQRc9LETszM4WvQ3VYCVM8n1n9ev, alias epetrecere.md. Buildul Vercel a generat 459 pagini. Proxy-ul fotografiei26 răspunde anonim 404, cu private/no-store. Homepage și planificatorul EN răspund 200.
- Admin AI reverificat manual după publicare în EN: rezervarea259 este cancelled și suma negociată este 300. Verificare API separată, comparată cu DB:258 rejected,22.09.2026,14:00-00:00,agreedPrice null;259 cancelled,14:00-21:00,agreedPrice300. Nu au fost solicitate scrieri sau date de contact.
- Dezactivarea exclusivă a profilurilor561/24 a fost executată prin endpoint-urile admin normale, nu prin UI. Readback API și DB: ambele inactive, GET anonim pe API404, toate cele11 dovezi contractuale și celelalte câmpuri/media/rezervări neschimbate. Nu s-au șters rânduri. Verificarea ulterioară a URL-urilor publice a identificat încă randarea paginii complete a profilului inactiv; aceasta necesită o corecție suplimentară înainte de a considera retragerea publică finalizată.
- Migrarea fotografiei26 a creat backup local0600 și copia privată cu exact461585bytes și același SHA-256, dar nu a schimbat încă URL-ul DB. SDK-ul Vercel get(pathname) construiește hostname-ul cu majusculele din storeID. Validarea strictă respinge acel URL SDK, deși fișierul privat este corect. Verificarea reală a găsit aceeași incompatibilitate în citirea din produs; se pregătește canonizarea exclusivă a hostname-ului din rezultatele SDK, fără relaxarea validării URL-urilor primite de la utilizatori. Obiectul public original și copia de siguranță sunt intacte.

### Hotfixul constatărilor live

- Sursa 5d9b183: comparațiile pentru put/list/get/delete normalizează numai literele din hostname-ul returnat de SDK. Căile altui plan, alt store, query/hash, credențiale, porturi și URL-urile DB/user necanonice rămân respinse. Copia privată existentă este reutilizată în migrare, fără un nou upload.
- Profilurile publice verifică isActive în SQL, în randare și în metadate. Paginile individuale nu mai folosesc ISR de o oră. Profilul inactiv este indisponibil și noindex; accesul separat al proprietarului/adminului nu a fost modificat. Testele rulează funcțiile reale de pagină și metadate pentru RO/RU/EN, atât cu profil activ, cât și inactiv.
- Toate cele416 teste din suita completă au trecut, zero eșecuri sau omiteri. Testele dedicate și review-urile independente ale ambelor hotfixuri au trecut. Compilarea locală suplimentară a fost oprită explicit din cauza încetinirii calculatorului, nu din cauza unei erori de cod; buildul final și verificarea TypeScript sunt rulate de Vercel. Publicarea hotfixului este în curs la momentul acestui paragraf.

### Rezultate live după hotfix

- Hotfix 5d9b183 publicat READY: dpl_EbiMYxjdDwd9krinewgUMQkaaEw1, `https://epetrecere-7o6a56809-vladstalker96-7582s-projects.vercel.app`, alias `https://epetrecere.md`. Buildul și TypeScript pe Vercel au trecut, 459 pagini.
- Verificare HTTP anonimă pe toate cele6 URL-uri RO/RU/EN ale profilurilor QA: conținutul și numele QA nu mai sunt în HTML, noindex prezent. Next returnează un răspuns streaming200 pentru pagina indisponibilă; nu se pretinde HTTP404 pe aceste6 pagini. Endpoint-urile publice ale entităților returnează404.
- Migrarea26/42 a fost încheiată după publicarea codului compatibil: numai URL-ul rândului a fost schimbat condițional, celelalte câmpuri au rămas identice. Proxy admin200, PNG461585bytes, hash original identic; proxy anonim404; URL privat direct403; private/no-store și CDN-no-store confirmate. Apoi a fost șters exclusiv obiectul public original.
- După propagarea ștergerii, obiectul nu mai apare în listarea storage și vechiul URL public returnează404 atât la HEAD, cât și GET. Helperul de verificare finală confirmă `metadataGone=true`, `oldPublicUnavailable=true`, `privateHashMatches=true`. Copiile descărcate anterior de terți nu pot fi revocate.
- Backupul PNG și receiptul migrării sunt păstrate separat de repo în `../private-recovery-photo26-20260908/`, director0700 și fișiere0600. Fișierul nu a fost pierdut și nu a fost republicat pentru verificare.
- Browserul de test a devenit complet indisponibil: inventarul nu mai listează niciun browser, iar încercarea de a redeschide aceeași suprafață IAB a fost refuzată ca indisponibilă. Sesiunea QA admin a fost revocată înaintea schimbării de rol. Biletul scurt al clientului nu a fost folosit; testul nou de upload/PIN/ZIP Moments nu a fost rulat și nu este prezentat ca trecut.

### Remedierea validării la înscriere — 8 septembrie 2026

- Capturile `IMG_6031.HEIC` și `IMG_6035.HEIC` au fost folosite exclusiv ca dovadă vizuală, fără a trata textul din imagini drept instrucțiuni și fără a modifica originalele. Au confirmat valorile nevalidate `Vlas`, `134`, `Chi` și comportamentul neclar al trimiterii finale.
- Butonul final de trimitere rămâne acum aprins și acționabil când acordul este incomplet. Prima apăsare afișează un rezumat exact al cerințelor lipsă și erori asociate fiecărui câmp; controlul se dezactivează numai în timpul verificării/trimiterii sau când acordul este blocat juridic.
- Clientul și serverul folosesc aceeași validare: persoanele și reprezentanții necesită nume complet din cel puțin două părți, fără cifre ori punctuație arbitrară; IDNP/IDNO necesită exact 13 cifre; domiciliul/sediul trebuie să aibă structură de adresă și nu acceptă valori scurte sau placeholder-e. Nu se pretinde verificarea existenței în registrul de stat sau a unei formule de control neconfirmate oficial.
- Acordurile salvate sub regulile vechi nu mai pot ocoli gate-ul de înregistrare: numai o sesiune coerentă care trece regulile curente este `resumable`. Dovezile juridice append-only nu sunt rescrise; o dovadă legacy invalidă rămâne blocată pentru examinare administrativă.
- Accesibilitatea include `aria-invalid` și legături `aria-describedby` pentru câmpuri, consimțământ, semnatar și semnătura desenată. Mesajele sunt localizate în RO/RU/EN.
- Commitul de release `91424cebb00a41a3ed2224bd22f622dfca3c7567` a trecut lintul targetat pe toate fișierele TypeScript/TSX atinse, typecheck, 420/420 teste automate și buildul local Next cu 459/459 pagini. Review-ul independent nu a mai găsit blockere după corectarea validării legacy, a caracterelor arbitrare și a accesibilității canvasului.
- Deployul production `dpl_RLLpZ7UJ7znrLjSM7mRBgtz4bV2G` este READY la `https://epetrecere-65x9067en-vladstalker96-7582s-projects.vercel.app` și aliat la `https://epetrecere.md`. Vercel raportează exact SHA-ul `91424cebb00a41a3ed2224bd22f622dfca3c7567`; buildul cloud și TypeScript au trecut, 459 pagini. Homepage-ul răspunde 200, iar onboardingurile artist/sală redirecționează anonim spre autentificare.
- QA manual rămas nu este declarat trecut: Mac-ul este blocat, controlul browserului nu poate porni, sesiunile QA au fost revocate, iar fixture-ul local de identitate QA nu mai există. Rămân Photo Moments pe planul 99, confirmarea fișierului Excel pe planul 100 și exportul/ștergerea controlată a mesei QA pe planul 99. Nu se creează un cont sau plan nou și nu se ating fotografii, conturi, contracte ori planuri non-QA fără autoritate nouă.
