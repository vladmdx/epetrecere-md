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
