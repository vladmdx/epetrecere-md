# Politica internă de păstrare și ștergere

Principiu: se păstrează minimum necesar pentru scop, contract, obligații legale și apărarea drepturilor. Un litigiu, o investigație sau o obligație legală documentată suspendă ștergerea doar pentru datele relevante.

| Categorie | Perioadă operațională | Ștergere / anonimizare |
|---|---:|---|
| Liste nominale de invitați, RSVP și alergii | 90 zile după eveniment | cron zilnic; ștergere anticipată de invitat sau organizator |
| Fotografii Event Moments, mesaje și ID dispozitiv | 180 zile după eveniment; fără dată, 180 zile după upload | cron zilnic, loturi de 500; eliminare DB și Blob |
| Solicitări de contact fără contract | 24 luni de la ultima activitate | ștergere sau anonimizare trimestrială |
| Cereri, rezervări și chat | 36 luni după închidere | ștergere/anonimizare; suspendare documentată la litigiu |
| Conversații AI autentificate | 30 zile | ștergere automată zilnică |
| Notificări în aplicație | 12 luni dacă sunt citite; maximum 24 luni | ștergere automată zilnică |
| Tokenuri și abonări push inactive | 60 zile de inactivitate | ștergere automată zilnică |
| Cont activ și planuri | până la ștergerea contului sau încetarea serviciului | ștergere din DB și Clerk; profil furnizor dezactivat |
| Fișierele clientului | odată cu obiectul sau contul de care aparțin, dacă nu există obligație de păstrare | ștergere din DB și stocarea obiectelor |
| Dovezi ale contractelor și evidențe financiar-contabile | perioada obligatorie prevăzută de lege și prescripția aplicabilă | arhivare cu acces restrâns, apoi distrugere controlată |
| Loguri de securitate ale aplicației | IP și user-agent 90 zile, dacă nu documentează un incident | minimizare automată; acțiunea administrativă rămâne în jurnal, incidentul se separă în registrul de incidente |
| Prompturi AI publice | aplicația nu le persistă pe server; în browser până la resetare | utilizatorul folosește Reset; furnizor API poate păstra loguri până la 30 zile |
| Preferințe cookie | 12 luni | nouă alegere sau expirare |
| Copii de siguranță | conform ciclului contractual al procesatorului, obiectiv maximum 35 zile | expirare automată; datele șterse nu se readuc în producție |

Control lunar:

1. Se verifică rezultatul cronurilor și erorile de ștergere Blob.
2. Se verifică existența cererilor cu suspendare legală și aprobarea lor.
3. Se selectează aleatoriu câte un obiect din fiecare categorie pentru confirmarea ștergerii.
4. Excepțiile se înscriu în registrul operațional cu motiv, proprietar și dată de revizuire.
