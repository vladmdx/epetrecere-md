# Registrul furnizorilor și transferurilor

Registrul descrie implementarea tehnică. Pentru fiecare furnizor, administratorul societății păstrează separat contractul, DPA-ul/termenii aplicabili, lista subprocessatorilor și dovada mecanismului de transfer. Marcajul „de confirmat” nu permite lansarea unui flux nou cu date sensibile.

| Furnizor | Serviciu și date | Locație / transfer | Documente care trebuie păstrate | Revizie |
|---|---|---|---|---|
| Clerk | autentificare, email/telefon, identificator, tokenuri sesiune | infrastructură internațională conform contului Clerk | Terms, DPA, subprocessori, regiunea instanței | anual și la schimbarea planului |
| Neon | PostgreSQL: conturi, planuri, rezervări, chat, liste criptate | regiunea proiectului trebuie confirmată în consola Neon | DPA, regiune, subprocessori, backup/ștergere | trimestrial |
| Vercel / Vercel Blob | găzduire, request metadata, fișiere și fotografii | funcțiile configurate în `fra1`; regiunea Blob se confirmă în proiect | DPA, subprocessori, regiune Blob, retenție backup | trimestrial |
| Cloudflare / R2 | DNS/WAF, protecție bot, stocare obiecte unde este configurată | rețea globală; locația R2 se confirmă | DPA, subprocessori, clauze transfer, setări cache | trimestrial |
| Upstash | rate limit: chei pseudonimizate/IP tehnic | regiunea Redis a proiectului | DPA, regiune, TTL-uri | trimestrial |
| Resend | email tranzacțional, adresă și conținut invitație/notificare | internațional conform contului | DPA, subprocessori, retenția logurilor | anual |
| OpenAI | prompturi pentru asistent/recomandări | procesare internațională; endpointul chat/completions fără stocare de stare | DPA/termeni business, data controls, subprocessori | trimestrial |
| Anthropic | prompturi pentru asistent/recomandări | procesare internațională conform API | commercial terms/DPA, retenție, subprocessori | trimestrial |
| Sentry | erori, stack trace și metadata tehnică | regiunea proiectului Sentry | DPA, scrub PII, regiune, retenție | trimestrial |
| Google Maps | adresă/coordonate și încărcare hartă | infrastructură Google | termeni, setări API, limitarea cheii | anual |
| Meta / WhatsApp | număr și mesaj solicitat de utilizator | infrastructură internațională | terms business, DPA, template/consimțământ | anual |

Control tehnic obligatoriu:

- cheile sunt numai în variabile de mediu și nu sunt trimise clientului, cu excepția cheilor publice proiectate astfel;
- datele sensibile se reduc înainte de apelul extern;
- logurile aplicației nu includ corpul RSVP, alergiile, semnătura sau tokenurile;
- furnizorul se scoate din politica publică numai după eliminarea efectivă din producție;
- un furnizor nou nu este activat înainte de actualizarea registrului, notificării și, dacă este necesar, a DPIA.
