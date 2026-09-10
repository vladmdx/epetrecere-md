# Registrul furnizorilor și transferurilor

Registrul descrie implementarea tehnică. Pentru fiecare furnizor, administratorul societății păstrează separat contractul, DPA-ul/termenii aplicabili, lista subprocessatorilor și dovada mecanismului de transfer. Marcajul „de confirmat” nu permite lansarea unui flux nou cu date sensibile.

| Furnizor | Serviciu și date | Locație / transfer | Documente care trebuie păstrate | Revizie |
|---|---|---|---|---|
| Clerk (activ) | autentificare, email/telefon, identificator, tokenuri sesiune | infrastructură internațională conform contului Clerk | Terms, DPA, subprocessori, regiunea instanței | anual și la schimbarea planului |
| Supabase (activ) | PostgreSQL: conturi, planuri, rezervări, chat, liste criptate | proiect configurat în `eu-central-1`, Frankfurt, Germania | DPA, regiune, subprocessori, backup/ștergere | trimestrial |
| Vercel / Vercel Blob (activ) | găzduire, request metadata, fișiere și fotografii | funcțiile configurate în `fra1`, Frankfurt; regiunea și subprocessatorii Blob se confirmă contractual | DPA, subprocessori, regiune Blob, retenție backup | trimestrial |
| Cloudflare (condiționat de rutarea traficului) | DNS/WAF și protecție bot; R2 nu este activ în configurația verificată | rețea globală | DPA, subprocessori, clauze transfer, setări cache | trimestrial |
| Upstash (inactiv) | rate limit extern; aplicația folosește fallback local cât integrarea nu este configurată | n/a până la activare | actualizare registru, DPA, regiune și TTL înainte de activare | înainte de activare |
| Resend (activ) | email tranzacțional, adresă și conținut invitație/notificare | infrastructură internațională conform contului | DPA, subprocessori, retenția logurilor | anual |
| OpenAI (activ) | prompturi pentru asistent/recomandări | procesare internațională conform contului API și listei curente de subprocessatori | DPA/termeni business, data controls, subprocessori | trimestrial |
| Anthropic (activ) | prompturi pentru asistent/recomandări | procesare internațională conform contului API | commercial terms/DPA, retenție, subprocessori | trimestrial |
| Sentry (inactiv) | erori, stack trace și metadata tehnică | n/a până la activare | actualizare registru, DPA, scrub PII, regiune și retenție înainte de activare | înainte de activare |
| Google Maps (activ) | adresă/coordonate și încărcare hartă | infrastructură internațională Google | termeni, DPA unde este aplicabil, setări API, limitarea cheii | anual |
| Meta / WhatsApp (inactiv) | număr și mesaj solicitat de utilizator | n/a până la activare | actualizare registru, terms business, DPA și template/consimțământ înainte de activare | înainte de activare |

Control tehnic obligatoriu:

- cheile sunt numai în variabile de mediu și nu sunt trimise clientului, cu excepția cheilor publice proiectate astfel;
- datele sensibile se reduc înainte de apelul extern;
- logurile aplicației nu includ corpul RSVP, alergiile, semnătura sau tokenurile;
- furnizorul se scoate din politica publică numai după eliminarea efectivă din producție;
- un furnizor nou nu este activat înainte de actualizarea registrului, notificării și, dacă este necesar, a DPIA.

## Dosarul de dovezi

Pentru fiecare furnizor activ, administratorul completează înainte de aprobarea trimestrială: data acceptării DPA/termenilor, linkul sau copia documentului, versiunea listei de subprocessatori, statele de prelucrare, mecanismul de transfer, retenția logurilor/backupurilor și persoana care a verificat. Documentele contractuale nu se publică în repository și nu se marchează drept „confirmate” fără copia păstrată în dosarul corporativ.
