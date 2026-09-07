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
