# Testarea fluxurilor autentificate, fără parole

Aplicația e complet închisă în spatele autentificării: `app/index.tsx:72`
redirecționează orice utilizator nelogat spre ecranul de login. Asta oprea orice
testare automată la formularul de autentificare — nimic din ce contează (rezervări,
înregistrare de partener, tarife, ștergerea contului) nu putea fi verificat fără ca
cineva să tasteze o parolă de mână.

Soluția nu e o parolă ascunsă undeva. E mecanismul pe care Clerk îl oferă exact
pentru asta: un **sign-in token** emis pe server, valabil un minut, schimbat de
aplicație pe o sesiune. Nicio parolă nu e stocată, tastată sau trimisă nicăieri.

## Cum funcționează

```
aplicație ──POST /api/dev/test-session──► serverul web local
   │            {email}, antet cu secretul
   │                                          ├─ verifică: nu suntem în producție
   │                                          ├─ verifică: secretul se potrivește
   │                                          ├─ verifică: emailul e pe listă
   │                                          └─ Clerk: createSignInToken(60s)
   │◄────────────── {ticket} ─────────────────┘
   │
   └─ signIn.create({ strategy: "ticket", ticket }) ──► sesiune
```

## De ce nu poate ajunge în producție

Endpointul (`src/app/api/dev/test-session/route.ts`) răspunde **404** dacă oricare
dintre acestea e adevărată:

1. `NODE_ENV === "production"` — orice build Vercel de producție
2. `VERCEL_ENV === "production"`
3. `DEV_TEST_LOGIN_SECRET` nu e setată — și nu are valoare implicită, deliberat

404, nu 403: un răspuns greșit nu trebuie să confirme că ruta există.

Chiar și cu secretul, emailul cerut trebuie să fie în `DEV_TEST_LOGIN_EMAILS`.
Cunoașterea secretului nu înseamnă acces la orice cont.

Partea din aplicație e închisă în `__DEV__`, pe care Metro îl înlocuiește cu
`false` literal într-un build de producție; ramura moartă e apoi eliminată, deci
un build livrat nu conține nici apelul, nici adresa.

Endpointul **nu** e sub `/api/v1`. v1 e suprafața pe care build-urile livrate o
apelează ani la rând; asta nu trebuie să ajungă niciodată parte din ea.

## Ce trebuie configurat

Pe mașina care rulează aplicația web (`.env.local`, ignorat de git):

```
DEV_TEST_LOGIN_SECRET=<un secret generat, lung>
DEV_TEST_LOGIN_EMAILS=cont.de.test@exemplu.md
```

În `packages/mobile/.env` (ignorat de git):

```
EXPO_PUBLIC_DEV_API_ORIGIN=http://localhost:3000
EXPO_PUBLIC_DEV_LOGIN_SECRET=<acelaşi secret>
EXPO_PUBLIC_DEV_LOGIN_EMAIL=cont.de.test@exemplu.md
```

`EXPO_PUBLIC_DEV_API_ORIGIN` e separată de `EXPO_PUBLIC_API_URL` intenționat:
aceea din urmă arată spre `https://epetrecere.md` în toate profilurile, inclusiv
cel de dezvoltare, deci derivarea din ea trimitea secretul la marginea producției.
Aplicația refuză acum să trimită secretul oriunde în afară de loopback sau o
adresă din rețeaua locală, și spune ce gazdă era pe cale să contacteze.

**Nu pune niciodată `EXPO_PUBLIC_DEV_LOGIN_SECRET` într-un profil EAS.** Un build
de dezvoltare sau preview are `__DEV__ === true`, deci ar duce secretul la
oricine îl instalează. Doar un `.env` local e sigur.

Contul trebuie **să existe deja** în Clerk. Ruta autentifică, nu înregistrează.

Dacă `CLERK_SECRET_KEY` e o cheie **live**, ruta rămâne oprită până când pui și
`DEV_TEST_LOGIN_ALLOW_LIVE=1`. Porțile de mediu spun unde *rulează* codul; ele nu
spun nimic despre ce instanță Clerk se atinge — asta o alege cheia. Un laptop
poate emite sesiuni pentru conturi reale, iar asta trebuie să fie o decizie
luată intenționat.

## Verificat, nu presupus

Cu o valoare-momeală în `.env`, un export de producție (`NODE_ENV=production
npx expo export --platform ios`) nu conține niciuna dintre acestea, căutate în
bytecode-ul Hermes: secretul, adresa contului, numele antetului
`x-dev-login-secret`, calea `api/dev/test-session`. Citirile sunt împachetate în
`__DEV__` ca să se plieze la compilare, nu ca să depindă de curățenia
minificatorului.

## Ce a înlocuit

Exista deja `/api/dev/sign-in-token` plus o pagină publică `/test-login`: un GET
simplu, fără secret și fără verificare de mediu, gardat doar de
`ENABLE_TEST_LOGIN=1` — un flag pe care propriul comentariu îndemna să-l pui pe
site-ul live. Trei adrese reale de cont erau compilate în bundle-ul public al
paginii și puteau fi descărcate de oricine. Ruta veche are acum refuzul pe mediu,
iar adresele nu mai ajung în browser; ea rămâne doar fiindcă suita E2E o
folosește.

## Ce trebuie știut înainte de a-l folosi

`.env.local` din acest proiect arată spre **baza de date și instanța Clerk de
producție**. Deci un profil de artist creat în timpul unui test e un rând real în
producție, care ajunge în coada de aprobări din admin. Fie folosești un cont de
test dedicat și cureți după, fie ridici o bază separată pentru testare.
