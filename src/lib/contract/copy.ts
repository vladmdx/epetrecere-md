export type BookingContractLocale = "ro" | "ru" | "en";

export function bookingContractLocale(value: string | null | undefined): BookingContractLocale {
  return value === "ru" || value === "en" ? value : "ro";
}

export function bookingContractSignatureIsValid(value: string): boolean {
  return [...value.matchAll(/\p{L}/gu)].length >= 2;
}

/**
 * One versioned presentation source for both the confirmation dialog and PDF.
 * Changing these terms is a legal-content change, not a layout-only edit.
 */
export const BOOKING_CONTRACT_COPY = {
  ro: {
    header: "Contract de prestări servicii pentru evenimente",
    continuation: "continuare",
    generatedAt: "Data generării",
    parties: "PĂRȚILE CONTRACTANTE",
    venue: "Local (Prestator):",
    hall: "  Sala:",
    artist: "Artist (Prestator):",
    phone: "  Telefon:",
    email: "  E-mail:",
    client: "Client (Beneficiar):",
    eventDetails: "DETALIILE EVENIMENTULUI",
    eventType: "Tipul evenimentului:",
    date: "Data:",
    time: "Intervalul orar:",
    guests: "Numărul de invitați:",
    price: "Prețul agreat:",
    negotiable: "de negociat",
    notes: "DETALII ȘI OBSERVAȚII",
    termsTitle: "TERMENI ȘI CONDIȚII",
    terms: [
      "Prestatorul se obligă să execute serviciile convenite la data și în intervalul orar stabilit.",
      "Clientul se obligă să achite prețul agreat conform modalității stabilite.",
      "Anularea se face conform politicii platformei ePetrecere.md.",
      "Semnătura electronică are valoare juridică echivalentă cu semnătura pe hârtie, conform legislației RM.",
    ],
    signature: "SEMNĂTURA BENEFICIARULUI",
    signedAt: "Semnat electronic la",
    unsigned: "(nesemnat)",
    page: "Pagina",
  },
  ru: {
    header: "Договор об оказании услуг для мероприятий",
    continuation: "продолжение",
    generatedAt: "Дата создания",
    parties: "ДОГОВАРИВАЮЩИЕСЯ СТОРОНЫ",
    venue: "Заведение (Исполнитель):",
    hall: "  Зал:",
    artist: "Артист (Исполнитель):",
    phone: "  Телефон:",
    email: "  E-mail:",
    client: "Клиент (Заказчик):",
    eventDetails: "ДЕТАЛИ МЕРОПРИЯТИЯ",
    eventType: "Тип мероприятия:",
    date: "Дата:",
    time: "Время:",
    guests: "Количество гостей:",
    price: "Согласованная цена:",
    negotiable: "по договорённости",
    notes: "ДЕТАЛИ И ПРИМЕЧАНИЯ",
    termsTitle: "УСЛОВИЯ ДОГОВОРА",
    terms: [
      "Исполнитель обязуется выполнить согласованные услуги в установленную дату и время.",
      "Клиент обязуется оплатить согласованную цену в установленном порядке.",
      "Отмена осуществляется согласно политике платформы ePetrecere.md.",
      "Электронная подпись имеет юридическую силу, эквивалентную подписи на бумаге, согласно законодательству РМ.",
    ],
    signature: "ПОДПИСЬ ЗАКАЗЧИКА",
    signedAt: "Подписано электронно",
    unsigned: "(не подписано)",
    page: "Страница",
  },
  en: {
    header: "Event services agreement",
    continuation: "continued",
    generatedAt: "Generated on",
    parties: "CONTRACTING PARTIES",
    venue: "Venue (Provider):",
    hall: "  Hall:",
    artist: "Artist (Provider):",
    phone: "  Phone:",
    email: "  E-mail:",
    client: "Client (Beneficiary):",
    eventDetails: "EVENT DETAILS",
    eventType: "Event type:",
    date: "Date:",
    time: "Time range:",
    guests: "Number of guests:",
    price: "Agreed price:",
    negotiable: "to be negotiated",
    notes: "DETAILS AND NOTES",
    termsTitle: "TERMS AND CONDITIONS",
    terms: [
      "The provider agrees to perform the agreed services on the set date and time.",
      "The client agrees to pay the agreed price by the arranged method.",
      "Cancellation follows the ePetrecere.md platform policy.",
      "The electronic signature has legal value equivalent to a handwritten signature under the laws of Moldova.",
    ],
    signature: "BENEFICIARY SIGNATURE",
    signedAt: "Signed electronically on",
    unsigned: "(unsigned)",
    page: "Page",
  },
} as const;

export function bookingContractCopy(locale: string | null | undefined) {
  return BOOKING_CONTRACT_COPY[bookingContractLocale(locale)];
}
