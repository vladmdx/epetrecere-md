// Romanian — the default locale. This is the canonical strings file;
// the other languages (ru, en) inherit the same keys.
//
// Conventions:
//   - Nested namespaces: auth.*, onboarding.*, common.*, errors.*
//   - {{interpolated}} placeholders for dynamic values
//   - Plural variants via i18next's `_one` / `_other` keys

export default {
  common: {
    appName: "ePetrecere",
    tagline: "Marketplace pentru evenimente",
    continue: "Continuă",
    cancel: "Anulează",
    save: "Salvează",
    delete: "Șterge",
    back: "Înapoi",
    next: "Următorul",
    skip: "Sari peste",
    done: "Gata",
    loading: "Se încarcă…",
    retry: "Reîncearcă",
    yes: "Da",
    no: "Nu",
    edit: "Editează",
    search: "Caută",
    seeAll: "Vezi toate",
    seeMore: "Vezi mai multe",
    confirm: "Confirmă",
  },

  auth: {
    signInTitle: "Bun venit înapoi",
    signInSubtitle: "Conectează-te ca să continui",
    signUpTitle: "Creează cont",
    signUpSubtitle: "Începe să planifici evenimente în câteva minute",
    forgotTitle: "Resetare parolă",
    forgotSubtitle: "Îți trimitem un cod pe email",
    email: "Email",
    password: "Parolă",
    passwordHint: "Minim 8 caractere",
    firstName: "Prenume",
    lastName: "Nume",
    phone: "Telefon",
    signIn: "Conectează-te",
    signUp: "Creează cont",
    signOut: "Ieși din cont",
    signInWithGoogle: "Conectează-te cu Google",
    signInWithApple: "Conectează-te cu Apple",
    signInWithMagicLink: "Trimite-mi un link magic pe email",
    noAccount: "Nu ai cont încă?",
    hasAccount: "Ai deja cont?",
    forgotPassword: "Ai uitat parola?",
    sendResetCode: "Trimite codul",
    enterCode: "Codul primit pe email",
    newPassword: "Parolă nouă",
    resetPassword: "Resetează parola",
    agreeTerms: "Continuând, accepți Termenii și Politica de Confidențialitate.",
    termsLink: "Termenii",
    privacyLink: "Politica de Confidențialitate",
    // Split out of agreeTerms so the two document names can be tapped. The
    // sentence is assembled around them rather than interpolated, because
    // the link text differs per language and has to stay translatable.
    agreeTermsPrefix: "Continuând, accepți",
    and: "și",
  },

  onboarding: {
    welcomeTitle: "Bun venit la ePetrecere",
    welcomeBody: "Găsește artiști, săli și planifică evenimentul de la A la Z — într-un singur loc.",
    discoverTitle: "Descoperă artiști de top",
    discoverBody: "Cântăreți, DJ, moderatori, fotografi — sute de furnizori verificați.",
    planTitle: "Planifică totul ușor",
    planBody: "Buget, invitați, checklist, RSVP și calendar — toate sincronizate.",
    momentsTitle: "Photo Moments live",
    momentsBody: "Cod QR pe mese — invitații încarcă pozele direct în galeria ta.",
    permissionsTitle: "Hai să configurăm aplicația",
    permissionsBody: "Avem nevoie de câteva permisiuni ca să funcționăm bine.",
    permissionNotifications: "Notificări",
    permissionNotificationsDesc: "Te anunțăm când primești cereri, mesaje sau confirmări.",
    permissionLocation: "Locație",
    permissionLocationDesc: "Pentru a-ți arăta artiști și săli din apropierea ta.",
    permissionCamera: "Camera",
    permissionCameraDesc: "Pentru scanare QR la Photo Moments și încărcare poze.",
    grant: "Permite",
    later: "Mai târziu",
    rolePickerTitle: "Cum vrei să folosești aplicația?",
    rolePickerBody: "Poți schimba oricând din Setări.",
    roleClient: "Plănuiesc un eveniment",
    roleClientDesc: "Cont normal de client — pentru nunți, botezuri, aniversări.",
    roleArtist: "Sunt artist / dețin sală",
    roleArtistDesc: "Înregistrează-te ca furnizor — primești cereri direct în app.",
    getStarted: "Începe",
  },

  errors: {
    network: "Nu s-a putut conecta la server. Verifică internetul.",
    generic: "A apărut o eroare. Încearcă din nou.",
    invalidEmail: "Email invalid.",
    invalidPhone: "Număr de telefon invalid.",
    passwordTooShort: "Parola trebuie să aibă minim 8 caractere.",
    wrongPassword: "Email sau parolă greșite.",
    emailExists: "Acest email este deja înregistrat.",
    sessionExpired: "Sesiunea a expirat. Conectează-te din nou.",
  },
} as const;

export type Translations = typeof import("./ro").default;
