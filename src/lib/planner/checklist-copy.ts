import { CATEGORY_LABELS, getPlannerTemplate } from "./templates";

/** Canonical Romanian title, Russian display copy, English display copy.
 * These are presentation strings, never persisted over a user's task title. */
export const CHECKLIST_TITLE_COPY: ReadonlyArray<readonly [string, string, string]> = [
  ["Stabilește bugetul total și împarte-l pe categorii", "Определите общий бюджет и распределите его по категориям", "Set the total budget and divide it into categories"],
  ["Alege data și anotimpul evenimentului", "Выберите дату и сезон мероприятия", "Choose the event date and season"],
  ["Rezervă sala / restaurantul", "Забронируйте зал или ресторан", "Book the venue or restaurant"],
  ["Fă lista preliminară de invitați", "Составьте предварительный список гостей", "Draft the guest list"],
  ["Rezervă fotograf și videograf", "Забронируйте фотографа и видеографа", "Book a photographer and videographer"],
  ["Rezervă formația / DJ-ul / cântăreții", "Забронируйте группу, диджея или исполнителей", "Book the band, DJ or singers"],
  ["Alege moderatorul (MC)", "Выберите ведущего", "Choose the event host (MC)"],
  ["Rochia de mireasă — primele probe", "Свадебное платье: первые примерки", "Wedding dress: first fittings"],
  ["Costumul mirelui", "Подберите костюм жениха", "Choose the groom's suit"],
  ["Comandă invitațiile și trimite save-the-date", "Закажите приглашения и заранее сообщите гостям дату", "Order invitations and send save-the-date notices"],
  ["Rezervă decorul și florile", "Закажите оформление и цветы", "Book the decorations and flowers"],
  ["Stabilește meniul cu restaurantul", "Согласуйте меню с рестораном", "Agree on the menu with the restaurant"],
  ["Degustare meniu", "Проведите дегустацию меню", "Attend a menu tasting"],
  ["Comandă tortul de nuntă", "Закажите свадебный торт", "Order the wedding cake"],
  ["Rezervă transport pentru miri (mașină / limuzină)", "Забронируйте транспорт для молодожёнов: автомобиль или лимузин", "Book transport for the couple: car or limousine"],
  ["Trimite invitațiile", "Отправьте приглашения", "Send the invitations"],
  ["Finalizează lista de invitați și confirmările RSVP", "Уточните окончательный список гостей и ответы на приглашения", "Finalize the guest list and RSVP responses"],
  ["Aranjează harta de mese", "Составьте план рассадки за столами", "Arrange the seating plan"],
  ["Probe finale rochie & costum", "Проведите последние примерки платья и костюма", "Complete the final dress and suit fittings"],
  ["Cumpără verighetele", "Купите обручальные кольца", "Buy the wedding rings"],
  ["Programare la cununia civilă / religioasă", "Запишитесь на регистрацию брака или венчание", "Schedule the civil or religious wedding ceremony"],
  ["Confirmă numărul final de invitați cu restaurantul", "Подтвердите ресторану окончательное число гостей", "Confirm the final guest count with the restaurant"],
  ["Confirmă ora cu artiștii și fotografii", "Подтвердите время с артистами и фотографами", "Confirm the schedule with performers and photographers"],
  ["Pregătește lista cu dedicațiile și muzica preferată", "Подготовьте список музыкальных пожеланий и посвящений", "Prepare the song requests and dedications"],
  ["Plata finală a vendorilor", "Внесите окончательную оплату подрядчикам", "Make the final payments to suppliers"],
  ["Delegă sarcini pentru ziua nunții (cine aduce ce)", "Распределите задачи на день свадьбы: кто и что привозит", "Assign wedding-day tasks, including who brings what"],
  ["Odihnă — nu plănui nimic cu o zi înainte", "Отдохните: не планируйте дел накануне свадьбы", "Rest: leave the day before the wedding free"],
  ["Alege nașii", "Выберите крёстных", "Choose the godparents"],
  ["Programează slujba la biserică", "Договоритесь о дате службы в церкви", "Schedule the church service"],
  ["Rezervă restaurantul pentru masa festivă", "Забронируйте ресторан для праздничного обеда", "Book a restaurant for the celebration meal"],
  ["Comandă crijma și rochița/costumașul", "Подготовьте крестильное полотенце и наряд ребёнка", "Order the baptismal towel and the child's outfit"],
  ["Rezervă fotograf", "Забронируйте фотографа", "Book a photographer"],
  ["Comandă tortul / dulciuri", "Закажите торт или сладости", "Order the cake or sweets"],
  ["Cumpără mărturiile (bomboniere)", "Купите памятные подарки для гостей", "Buy the guest favours"],
  ["Pregătește lista definitivă de invitați", "Подготовьте окончательный список гостей", "Prepare the final guest list"],
  ["Confirmă detaliile cu preotul", "Согласуйте детали со священником", "Confirm the details with the priest"],
  ["Stabilește lista de cumătri", "Составьте список кумовьёв и приглашённых на кумэтрию", "Prepare the list of guests for the cumătrie celebration"],
  ["Rezervă moderator / formație", "Забронируйте ведущего или музыкальную группу", "Book a host or band"],
  ["Angajează fotograf", "Наймите фотографа", "Hire a photographer"],
  ["Comandă tortul și dulciurile", "Закажите торт и сладости", "Order the cake and sweets"],
  ["Pregătește lista finală", "Подготовьте окончательный список", "Prepare the final list"],
  ["Confirmă meniul cu restaurantul", "Подтвердите меню с рестораном", "Confirm the menu with the restaurant"],
  ["Alege tema petrecerii", "Выберите тему праздника", "Choose the party theme"],
  ["Rezervă locația", "Забронируйте площадку", "Book the venue"],
  ["Rezervă DJ sau playlist", "Забронируйте диджея или подготовьте плейлист", "Book a DJ or prepare a playlist"],
  ["Comandă tortul", "Закажите торт", "Order the cake"],
  ["Cumpără decorul / baloanele", "Купите украшения или воздушные шары", "Buy decorations or balloons"],
  ["Pregătește meniul sau catering-ul", "Подготовьте меню или закажите кейтеринг", "Plan the menu or catering"],
  ["Cumpără băuturile", "Купите напитки", "Buy the drinks"],
  ["Aprobă bugetul cu managementul", "Согласуйте бюджет с руководством", "Get management approval for the budget"],
  ["Rezervă sală conferință sau restaurant", "Забронируйте конференц-зал или ресторан", "Book a conference room or restaurant"],
  ["Trimite save-the-date angajaților", "Заранее сообщите сотрудникам дату мероприятия", "Send save-the-date notices to employees"],
  ["Rezervă DJ / moderator / echipament tehnic", "Забронируйте диджея, ведущего и техническое оборудование", "Book a DJ, host and technical equipment"],
  ["Angajează fotograf / videograf corporate", "Наймите фотографа или видеографа для корпоративного мероприятия", "Hire a corporate event photographer or videographer"],
  ["Comandă meniul de catering", "Закажите кейтеринговое меню", "Order the catering menu"],
  ["Pregătește agenda / discursuri", "Подготовьте программу и выступления", "Prepare the agenda and speeches"],
  ["Confirmă lista finală de participanți", "Подтвердите окончательный список участников", "Confirm the final participant list"],
  ["Stabilește bugetul", "Определите бюджет", "Set the budget"],
  ["Rezervă muzica / animație", "Закажите музыку и развлекательную программу", "Book the music and entertainment"],
  ["Stabilește meniul", "Определитесь с меню", "Plan the menu"],
  ["Confirmă invitații", "Уточните участие гостей", "Confirm guest attendance"],
  ["Stabilește bugetul ceremoniei", "Определите бюджет церемонии", "Set the ceremony budget"],
  ["Depune actele la starea civilă / parohie", "Подайте документы в орган регистрации брака или приход", "Submit the paperwork to the registry office or parish"],
  ["Confirmă data și ora ceremoniei", "Подтвердите дату и время церемонии", "Confirm the ceremony date and time"],
  ["Alege nașii și confirmă prezența", "Выберите посажёных родителей и подтвердите их присутствие", "Choose the wedding sponsors and confirm their attendance"],
  ["Comandă buchetul și decorul", "Закажите букет и оформление", "Order the bouquet and decorations"],
  ["Probează ținutele", "Примерьте праздничные наряды", "Try on the outfits"],
  ["Verifică muzica pentru ceremonie", "Проверьте музыку для церемонии", "Check the ceremony music"],
  ["Confirmă transportul", "Подтвердите транспорт", "Confirm the transport arrangements"],
  ["Pregătește verighetele și actele", "Подготовьте обручальные кольца и документы", "Prepare the wedding rings and documents"],
  ["Rezervă locația sau pregătește spațiul", "Забронируйте площадку или подготовьте помещение", "Book a venue or prepare the space"],
  ["Rezervă animator / clovn / magician", "Забронируйте аниматора, клоуна или фокусника", "Book an entertainer, clown or magician"],
  ["Trimite invitațiile părinților", "Отправьте приглашения родителям", "Send invitations to the parents"],
  ["Pregătește meniul pentru copii și părinți", "Подготовьте меню для детей и родителей", "Plan the menu for children and parents"],
  ["Comandă baloane și decor", "Закажите воздушные шары и оформление", "Order balloons and decorations"],
  ["Pregătește cadourile pentru invitați", "Подготовьте подарки для гостей", "Prepare gifts for the guests"],
  ["Confirmă prezența copiilor", "Уточните, какие дети придут", "Confirm which children will attend"],
  ["Alege inelul", "Выберите кольцо", "Choose the ring"],
  ["Alege locul și verifică-l la ora potrivită", "Выберите место и посетите его в нужное время суток", "Choose the location and visit it at the intended time"],
  ["Cere acordul locației pentru decor și foto", "Получите разрешение площадки на оформление и съёмку", "Get the venue's permission for decorations and photography"],
  ["Rezervă fotograful (discret)", "Забронируйте фотографа для незаметной съёмки", "Book a photographer who can capture the moment discreetly"],
  ["Comandă florile și decorul", "Закажите цветы и оформление", "Order the flowers and decorations"],
  ["Alege muzica sau instrumentistul", "Выберите музыку или музыканта", "Choose the music or an instrumentalist"],
  ["Pregătește un pretext credibil pentru ziua respectivă", "Придумайте правдоподобный предлог для этого дня", "Prepare a believable pretext for the day"],
  ["Anunță-i pe cei care trebuie să știe (și pe nimeni altcineva)", "Расскажите только тем, кому необходимо знать", "Tell only the people who need to know"],
  ["Verifică vremea și pregătește varianta de rezervă", "Проверьте погоду и подготовьте запасной вариант", "Check the weather and prepare a backup plan"],
  ["Pune inelul în buzunar", "Положите кольцо в карман", "Put the ring in your pocket"],
];

const titleCopy = new Map(CHECKLIST_TITLE_COPY.map(([ro, ru, en]) => [ro, { ru, en }]));

export const CHECKLIST_CATEGORY_COPY: Record<string, { ru: string; en: string }> = {
  budget: { ru: "Бюджет", en: "Budget" },
  date: { ru: "Дата и место", en: "Date and location" },
  venue: { ru: "Зал и площадка", en: "Venue" },
  guests: { ru: "Гости", en: "Guests" },
  media: { ru: "Фото и видео", en: "Photo and video" },
  artists: { ru: "Артисты и музыка", en: "Performers and music" },
  menu: { ru: "Меню и кейтеринг", en: "Menu and catering" },
  decor: { ru: "Оформление", en: "Decorations" },
  outfits: { ru: "Наряды", en: "Outfits" },
  ceremony: { ru: "Церемония", en: "Ceremony" },
  logistics: { ru: "Организация и логистика", en: "Logistics" },
  seating: { ru: "Рассадка за столами", en: "Table seating" },
  other: { ru: "Другое", en: "Other" },
};

interface ChecklistTextItem {
  title: string;
  category: string | null;
  priority: "low" | "medium" | "high";
  dueDaysBefore: number | null;
  sortOrder: number | null;
}

export function checklistDisplayTitle(item: ChecklistTextItem, eventType: string | null | undefined, locale: string): string {
  if (locale !== "ru" && locale !== "en") return item.title;
  if (item.sortOrder == null || !Number.isSafeInteger(item.sortOrder) || item.sortOrder < 0) return item.title;
  // Match the exact seed identity, not just similar text. Custom UI tasks
  // have no dueDaysBefore. Edited titles/priorities/categories/dates stay raw.
  // No provenance column exists, so an exact API-created clone is inherently
  // indistinguishable; even then this only changes presentation, never DB.
  const template = getPlannerTemplate(eventType)[item.sortOrder];
  if (!template || template.title !== item.title || template.category !== item.category ||
      template.priority !== item.priority || template.dueDaysBefore !== item.dueDaysBefore) return item.title;
  return titleCopy.get(item.title)?.[locale] ?? item.title;
}

export function checklistCategoryLabel(category: string, locale: string): string {
  const copy = Object.prototype.hasOwnProperty.call(CHECKLIST_CATEGORY_COPY, category) ? CHECKLIST_CATEGORY_COPY[category] : null;
  if (copy && (locale === "ru" || locale === "en")) return copy[locale];
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category) ? CATEGORY_LABELS[category] : category === "other" ? "Altele" : category;
}
