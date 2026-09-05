# DPIA: invitați, alergii, minori, Event Moments și AI

Data evaluării: 5 septembrie 2026  
Decizie: funcțiile pot rula numai cu controalele descrise mai jos active implicit.

## Necesitate și proporționalitate

Lista invitaților este necesară pentru organizare și RSVP, dar contactul și alergiile nu sunt necesare în orice listă. Contactul se folosește doar pentru invitația cerută, iar alergiile sunt introduse de invitat după acord separat. Fotografiile sunt opționale și limitate la o galerie privată a evenimentului. AI primește doar textul necesar răspunsului și nu decide acceptarea, prețul sau accesul unei persoane.

## Riscuri și măsuri

| Risc | Nivel inițial | Măsură | Nivel rezidual |
|---|---|---|---|
| acces neautorizat la lista de invitați | ridicat | AES-256-GCM, control de proprietar, fără acces furnizor/admin obișnuit, export auditat | scăzut-mediu |
| folosirea alergiilor fără acord | ridicat | organizatorul nu poate completa câmpul; invitatul îl completează prin RSVP cu acord explicit | scăzut |
| invitat neinformat deoarece datele au fost primite de la organizator | ridicat | notificare în RSVP/email, link individual, ștergere fără cont | scăzut-mediu |
| galerie descoperită sau indexată | ridicat | slug aleator, PIN server-side, cookie HttpOnly, noindex/noarchive, no-referrer, fără cache public | scăzut |
| publicarea unei fotografii nepotrivite | ridicat | fiecare upload intră neaprobat, organizatorul aprobă, orice invitat poate raporta și ascunde imediat | mediu |
| fotografie a unui minor fără autoritate | ridicat | confirmare activă separată adult/părinte-tutore, moderare implicită, instrucțiune clară | mediu |
| localizare sau identificatori ascunși în EXIF | ridicat | decodare, rotire și re-encodare WebP fără metadata | scăzut |
| păstrarea nelimitată a fotografiilor | ridicat | ștergere automată la 180 zile, inclusiv Blob | scăzut |
| abuz sau încărcări masive | mediu | PIN, rate limit, limită per dispozitiv, limită fișier, validare și redimensionare | scăzut |
| date sensibile introduse în AI | ridicat | avertizare lângă input, limitare prompt, furnizori API fără training implicit, fără persistență server a chatului public | mediu |
| date trimise în afara Moldovei | ridicat | registru de furnizori, minimizare, garanții contractuale, audit anual și la schimbare | mediu |

## Teste obligatorii înainte de fiecare lansare relevantă

- un utilizator nu poate citi planul altuia;
- un admin obișnuit nu poate citi lista nominală a invitaților;
- endpointurile Moments refuză lipsa PIN/cookie;
- uploadul refuză lipsa confirmărilor și elimină EXIF/GPS;
- fotografia raportată dispare din galeria publică;
- autorul poate șterge fotografia de pe același dispozitiv;
- cronul șterge rândul și obiectul Blob expirat;
- exportul conține datele persoanei, iar ștergerea elimină obiectele active.

Riscul rezidual trebuie reevaluat dacă se introduce recunoaștere facială, galerie publică indexabilă, analiză biometrică, reclamă comportamentală sau folosirea fotografiilor la antrenarea modelelor. Aceste utilizări nu sunt autorizate de prezenta DPIA.
