export interface EditorialFaq {
  question: string;
  answer: string;
}

export interface EditorialPost2026 {
  slug: string;
  titleRo: string;
  titleRu: string;
  titleEn: string;
  excerptRo: string;
  excerptRu: string;
  excerptEn: string;
  contentRo: string;
  contentRu: string;
  contentEn: string;
  coverImageUrl: string;
  coverAltRo: string;
  coverAltRu: string;
  coverAltEn: string;
  category: string;
  tags: string[];
  seoTitleRo: string;
  seoTitleRu: string;
  seoTitleEn: string;
  seoDescRo: string;
  seoDescRu: string;
  seoDescEn: string;
  faq: {
    ro: EditorialFaq[];
    ru: EditorialFaq[];
    en: EditorialFaq[];
  };
}

export const EDITORIAL_POSTS_2026: EditorialPost2026[] = [
  {
    slug: "cat-costa-o-nunta-in-moldova-2026",
    titleRo: "Cât costă o nuntă în Moldova în 2026: buget realist pe categorii",
    titleRu: "Сколько стоит свадьба в Молдове в 2026 году: реальный бюджет",
    titleEn: "How Much Does a Wedding Cost in Moldova in 2026?",
    excerptRo:
      "Un ghid practic pentru un buget de nuntă realist în Chișinău și Moldova, cu intervale orientative pentru sală, foto-video, muzică, decor și rezerve.",
    excerptRu:
      "Практический бюджет свадьбы в Кишиневе и Молдове с ориентировочными диапазонами для зала, фото и видео, музыки, декора и резерва.",
    excerptEn:
      "A practical wedding budget for Chișinău and Moldova, with indicative ranges for the venue, photo and video, music, decor and contingency.",
    coverImageUrl: "/images/blog/2026/cost-nunta-moldova-2026.webp",
    coverAltRo:
      "Planificare buget nuntă 2026 în Moldova cu verighete, calculator și agendă",
    coverAltRu:
      "Планирование свадебного бюджета 2026 в Молдове с кольцами, калькулятором и блокнотом",
    coverAltEn:
      "Planning a 2026 wedding budget in Moldova with rings, calculator and notebook",
    category: "Buget și planificare",
    tags: ["cost nuntă 2026", "buget nuntă Moldova", "nuntă Chișinău", "planificare nuntă"],
    seoTitleRo: "Cât Costă o Nuntă în Moldova în 2026? Buget Realist",
    seoTitleRu: "Сколько стоит свадьба в Молдове в 2026 году",
    seoTitleEn: "Wedding Cost in Moldova 2026: A Realistic Budget",
    seoDescRo:
      "Află cât costă o nuntă în Moldova în 2026. Buget orientativ pentru sală, meniu, foto-video, DJ, decor și cheltuieli neprevăzute.",
    seoDescRu:
      "Узнайте, сколько стоит свадьба в Молдове в 2026 году: зал, меню, фото и видео, DJ, декор и непредвиденные расходы.",
    seoDescEn:
      "See the realistic cost of a wedding in Moldova in 2026, including venue, menu, photo and video, DJ, decor and contingency.",
    contentRo: `
      <p>Întrebarea <strong>cât costă o nuntă în Moldova în 2026</strong> nu are un singur răspuns. Numărul de invitați, sezonul, localitatea și nivelul serviciilor schimbă radical totalul. Pentru o nuntă cu aproximativ 100 de invitați, un buget orientativ poate porni de la 150.000 MDL pentru o variantă atent controlată și poate depăși 350.000 MDL pentru un eveniment premium în Chișinău.</p>
      <p>Intervalele de mai jos sunt repere editoriale, nu oferte comerciale. Cere mereu o ofertă scrisă și verifică exact ce include fiecare pachet.</p>

      <h2>Buget orientativ pentru 100 de invitați</h2>
      <ul>
        <li><strong>Sală și meniu:</strong> aproximativ 65.000 - 120.000 MDL, în funcție de meniu, băuturi, taxă de locație și servicii incluse.</li>
        <li><strong>Foto și video:</strong> aproximativ 31.000 - 45.000 MDL pentru echipe și pachete complete publicate pentru sezonul 2026.</li>
        <li><strong>DJ sau formație:</strong> aproximativ 9.000 - 12.000 MDL pentru DJ, iar o formație live poate ridica semnificativ bugetul.</li>
        <li><strong>Decor și floristică:</strong> aproximativ 15.000 - 50.000 MDL, în funcție de flori, structură, lumini și reutilizarea elementelor.</li>
        <li><strong>Ținute, verighete și beauty:</strong> aproximativ 20.000 - 60.000 MDL.</li>
        <li><strong>Tort, invitații, transport și detalii:</strong> aproximativ 12.000 - 35.000 MDL.</li>
      </ul>

      <h2>Ce influențează cel mai mult costul nunții</h2>
      <p><strong>Numărul de invitați</strong> este multiplicatorul principal. La fiecare 10 persoane adăugate crește nu doar meniul, ci și necesarul de băuturi, tort, invitații și uneori transport. Al doilea factor este data. Sâmbetele din mai până în septembrie sunt solicitate, iar flexibilitatea pentru vineri, duminică sau extrasezon poate crea spațiu de negociere.</p>
      <p>Locația din <strong>Chișinău</strong> poate costa mai mult decât una din afara orașului, dar transportul și logistica pot anula diferența. Compară costul complet, nu doar prețul meniului per persoană.</p>

      <h2>Costuri care sunt omise frecvent</h2>
      <p>Întreabă despre taxa de servire, meniul echipei foto-video, orele suplimentare, transportul furnizorilor, montaj, demontaj, curățenie, generator, cazare și taxa pentru băuturi aduse din exterior. Aceste poziții pot adăuga ușor 10% la total.</p>

      <h2>Cum construiești un buget sănătos</h2>
      <ol>
        <li>Stabilește suma pe care o poți plăti fără credit și fără a conta pe daruri.</li>
        <li>Rezervă 50% - 55% pentru sală, meniu și băuturi.</li>
        <li>Alocă 10% - 15% pentru foto-video și 8% - 12% pentru muzică.</li>
        <li>Păstrează o <strong>rezervă de 10% - 15%</strong> pentru schimbări și cheltuieli neprevăzute.</li>
        <li>Notează separat avansul, restul de plată, moneda și termenul fiecărui contract.</li>
      </ol>
      <p>Folosește <a href="/calculatoare/nunta">calculatorul de cost al nunții</a> și <a href="/calculatoare/buget">calculatorul de buget</a> pentru a testa scenarii înainte să semnezi contractele.</p>

      <h2>Surse și metodologie</h2>
      <p>Intervalele au fost comparate cu oferte publice pentru sezonul 2026 ale furnizorilor din Moldova și cu listări locale de săli. Tarifele se pot schimba, iar o ofertă personalizată rămâne sursa finală pentru decizia ta.</p>
    `,
    contentRu: `
      <p>Вопрос <strong>сколько стоит свадьба в Молдове в 2026 году</strong> не имеет одного ответа. Количество гостей, сезон, город и уровень услуг сильно меняют итог. Для свадьбы примерно на 100 гостей ориентир может начинаться от 150 000 MDL при строгом контроле бюджета и превышать 350 000 MDL для премиального события в Кишиневе.</p>
      <p>Диапазоны ниже являются редакционными ориентирами, а не коммерческими предложениями. Всегда запрашивайте письменную смету и уточняйте состав пакета.</p>
      <h2>Ориентировочный бюджет на 100 гостей</h2>
      <ul>
        <li><strong>Зал и меню:</strong> около 65 000 - 120 000 MDL.</li>
        <li><strong>Фото и видео:</strong> около 31 000 - 45 000 MDL для полных пакетов сезона 2026.</li>
        <li><strong>DJ или живая музыка:</strong> около 9 000 - 12 000 MDL за DJ, живая группа обычно стоит дороже.</li>
        <li><strong>Декор и флористика:</strong> около 15 000 - 50 000 MDL.</li>
        <li><strong>Наряды, кольца и beauty:</strong> около 20 000 - 60 000 MDL.</li>
        <li><strong>Торт, приглашения, транспорт и детали:</strong> около 12 000 - 35 000 MDL.</li>
      </ul>
      <h2>Что сильнее всего влияет на стоимость</h2>
      <p><strong>Количество гостей</strong> является главным множителем. Каждые дополнительные 10 человек увеличивают расходы на меню, напитки, торт и логистику. Второй фактор это дата. Субботы с мая по сентябрь наиболее востребованы. Пятница, воскресенье или холодный сезон часто дают больше возможностей для выбора.</p>
      <h2>Расходы, о которых часто забывают</h2>
      <p>Проверьте сервисный сбор, питание команды, дополнительные часы, транспорт поставщиков, монтаж, уборку, генератор, проживание и плату за свои напитки. Эти позиции могут добавить 10% к бюджету.</p>
      <h2>Как составить устойчивый бюджет</h2>
      <ol>
        <li>Определите сумму без кредита и без расчета на подарки гостей.</li>
        <li>Оставьте 50% - 55% на зал, меню и напитки.</li>
        <li>Запланируйте 10% - 15% на фото и видео.</li>
        <li>Сохраните <strong>резерв 10% - 15%</strong> на изменения.</li>
        <li>Записывайте аванс, остаток, валюту и срок каждого договора.</li>
      </ol>
      <p>Проверьте сценарии в <a href="/calculatoare/nunta">калькуляторе стоимости свадьбы</a> и <a href="/calculatoare/buget">калькуляторе бюджета</a>.</p>
    `,
    contentEn: `
      <p>There is no single answer to <strong>how much a wedding costs in Moldova in 2026</strong>. Guest count, season, location and service level can change the total substantially. For roughly 100 guests, an indicative budget may start around MDL 150,000 for a carefully controlled event and exceed MDL 350,000 for a premium wedding in Chișinău.</p>
      <p>The ranges below are editorial benchmarks, not commercial offers. Always request a written quote and confirm exactly what each package includes.</p>
      <h2>Indicative budget for 100 guests</h2>
      <ul>
        <li><strong>Venue and menu:</strong> approximately MDL 65,000 - 120,000.</li>
        <li><strong>Photo and video:</strong> approximately MDL 31,000 - 45,000 for complete 2026 packages.</li>
        <li><strong>DJ or live band:</strong> approximately MDL 9,000 - 12,000 for a DJ, with live music usually costing more.</li>
        <li><strong>Decor and flowers:</strong> approximately MDL 15,000 - 50,000.</li>
        <li><strong>Attire, rings and beauty:</strong> approximately MDL 20,000 - 60,000.</li>
        <li><strong>Cake, invitations, transport and details:</strong> approximately MDL 12,000 - 35,000.</li>
      </ul>
      <h2>What changes the total most</h2>
      <p><strong>Guest count</strong> is the main multiplier. Every additional ten people affect the menu, drinks, cake and logistics. Date is the second major factor. Saturdays from May through September are in demand, while Friday, Sunday and off-season dates can offer more flexibility.</p>
      <h2>Frequently missed costs</h2>
      <p>Ask about service fees, supplier meals, overtime, transport, setup, cleaning, power backup, accommodation and corkage. Together, these items can add 10% to the final total.</p>
      <h2>How to build a healthy budget</h2>
      <ol>
        <li>Set an amount you can pay without relying on credit or guest gifts.</li>
        <li>Reserve 50% - 55% for the venue, menu and drinks.</li>
        <li>Allocate 10% - 15% to photo and video.</li>
        <li>Keep a <strong>10% - 15% contingency</strong> for changes.</li>
        <li>Track the deposit, balance, currency and due date for every contract.</li>
      </ol>
      <p>Test different scenarios with the <a href="/calculatoare/nunta">wedding cost calculator</a> and <a href="/calculatoare/buget">event budget calculator</a>.</p>
    `,
    faq: {
      ro: [
        { question: "Care este un buget realist pentru 100 de invitați?", answer: "Un interval orientativ pentru 2026 este 150.000 - 350.000 MDL, în funcție de locație, meniu și nivelul serviciilor." },
        { question: "Ce procent din buget ar trebui rezervat pentru sală și meniu?", answer: "Pentru multe nunți, sala, meniul și băuturile reprezintă aproximativ 50% - 55% din buget." },
        { question: "Este necesară o rezervă pentru cheltuieli neprevăzute?", answer: "Da. O rezervă de 10% - 15% reduce riscul ca schimbările din ultima perioadă să depășească bugetul." },
      ],
      ru: [
        { question: "Какой бюджет реалистичен для 100 гостей?", answer: "Ориентир на 2026 год составляет 150 000 - 350 000 MDL в зависимости от зала, меню и уровня услуг." },
        { question: "Сколько бюджета оставить на зал и меню?", answer: "Для многих свадеб зал, меню и напитки составляют около 50% - 55% бюджета." },
        { question: "Нужен ли резерв?", answer: "Да. Резерв 10% - 15% защищает бюджет от изменений в последние недели." },
      ],
      en: [
        { question: "What is a realistic budget for 100 guests?", answer: "An indicative 2026 range is MDL 150,000 - 350,000, depending on the venue, menu and service level." },
        { question: "How much should be reserved for the venue and menu?", answer: "For many weddings, the venue, menu and drinks represent about 50% - 55% of the budget." },
        { question: "Is a contingency necessary?", answer: "Yes. A 10% - 15% contingency helps absorb last-minute changes." },
      ],
    },
  },
  {
    slug: "cum-alegi-sala-ceremonie-chisinau-moldova-2026",
    titleRo: "Cum alegi sala pentru ceremonie în Chișinău și Moldova în 2026",
    titleRu: "Как выбрать зал для церемонии в Кишиневе и Молдове в 2026 году",
    titleEn: "How to Choose a Ceremony Venue in Chișinău and Moldova in 2026",
    excerptRo:
      "Criteriile care contează când compari săli pentru nuntă sau ceremonie: capacitate, plan B, acustică, acces, meniu și costul complet.",
    excerptRu:
      "Главные критерии выбора зала для свадьбы или церемонии: вместимость, план B, акустика, доступ, меню и полная стоимость.",
    excerptEn:
      "The criteria that matter when comparing ceremony and wedding venues: capacity, weather backup, acoustics, access, menu and total cost.",
    coverImageUrl: "/images/blog/2026/sali-ceremonii-chisinau-moldova-2026.webp",
    coverAltRo:
      "Sală elegantă pentru ceremonii și nunți în Chișinău și Moldova",
    coverAltRu:
      "Элегантный зал для церемоний и свадеб в Кишиневе и Молдове",
    coverAltEn:
      "Elegant ceremony and wedding venue in Chișinău and Moldova",
    category: "Săli și locații",
    tags: ["săli nuntă Chișinău", "sală ceremonie Moldova", "restaurant nuntă", "locație eveniment"],
    seoTitleRo: "Cum Alegi Sala de Nuntă în Chișinău și Moldova 2026",
    seoTitleRu: "Как выбрать свадебный зал в Кишиневе в 2026 году",
    seoTitleEn: "Choosing a Wedding Venue in Chișinău, Moldova 2026",
    seoDescRo:
      "Ghid 2026 pentru alegerea unei săli de nuntă în Chișinău și Moldova: capacitate, meniu, plan B, acces, contract și întrebări pentru vizionare.",
    seoDescRu:
      "Гид 2026 по выбору свадебного зала в Кишиневе и Молдове: вместимость, меню, план B, доступ и договор.",
    seoDescEn:
      "A 2026 guide to choosing a wedding venue in Chișinău and Moldova: capacity, menu, weather backup, access and contract questions.",
    contentRo: `
      <p>O <strong>sală pentru ceremonie în Chișinău</strong> trebuie să arate bine în fotografii, dar și să funcționeze fără probleme pentru invitați, furnizori și program. În 2026, alegerea corectă începe cu o listă scurtă de criterii măsurabile, nu doar cu impresia de la prima vizionare.</p>
      <h2>1. Capacitatea reală și forma spațiului</h2>
      <p>Întreabă câte persoane încap confortabil cu ring de dans, scenă, candy bar și culoare de circulație. Capacitatea maximă autorizată nu este același lucru cu numărul confortabil. Pentru 120 de invitați, o sală declarată pentru 120 poate deveni aglomerată după instalarea decorului și a formației.</p>
      <h2>2. Ceremonie în aer liber și plan B</h2>
      <p>Dacă vrei o ceremonie pe terasă sau în grădină, cere să vezi <strong>planul B pentru ploaie</strong>. Verifică dacă mutarea în interior păstrează suficiente scaune, un culoar clar și lumină potrivită. Contractul trebuie să indice cine decide mutarea și până la ce oră.</p>
      <h2>3. Meniu și cost complet</h2>
      <p>Compară meniurile după conținut, gramaj și servicii incluse. Întreabă despre băuturi, taxă de servire, meniu pentru copii și furnizori, degustare, tort, fructe, ora limită și costul orelor suplimentare. Prețul per persoană este util doar când toate aceste elemente sunt puse pe aceeași listă.</p>
      <h2>4. Locație, parcare și acces</h2>
      <p>Pentru o <strong>nuntă în Chișinău</strong>, verifică accesul la ore de trafic și numărul real de locuri de parcare. Pentru locațiile din afara orașului, calculează transportul invitaților, cazarea și timpul de deplasare al furnizorilor. Intrarea fără trepte, toaleta accesibilă și un spațiu liniștit pentru copii sau vârstnici pot conta mai mult decât un element decorativ.</p>
      <h2>5. Acustică, electricitate și program</h2>
      <p>Ascultă sala goală și întreabă cum se comportă sunetul când este plină. Confirmă puterea electrică disponibilă, locul pentru pupitrul DJ, restricțiile de volum și ora până la care poate continua muzica. O vizită în timpul altui eveniment, cu acordul locației, poate fi foarte relevantă.</p>
      <h2>Checklist pentru vizionare</h2>
      <ul>
        <li>Fotografiază sala din unghiul scenei și al meselor.</li>
        <li>Măsoară traseul ceremoniei și spațiul ringului de dans.</li>
        <li>Cere modelul de contract înainte de plata avansului.</li>
        <li>Notează ce este inclus și ce vine de la furnizori externi.</li>
        <li>Verifică politica de anulare, reprogramare și schimbare a numărului de invitați.</li>
      </ul>
      <p>Compară locațiile din <a href="/sali">catalogul de săli ePetrecere.md</a> și salvează favoritele înainte de vizionări. O selecție de trei până la cinci opțiuni este suficientă pentru o decizie bună.</p>
    `,
    contentRu: `
      <p><strong>Зал для церемонии в Кишиневе</strong> должен хорошо выглядеть на фото и удобно работать для гостей, подрядчиков и программы. В 2026 году выбор стоит начинать с измеримых критериев.</p>
      <h2>1. Реальная вместимость</h2>
      <p>Уточните комфортное количество гостей с танцполом, сценой и декором. Максимальная разрешенная вместимость не равна комфортной.</p>
      <h2>2. Церемония на улице и план B</h2>
      <p>Попросите показать <strong>план B на случай дождя</strong>. В договоре должно быть понятно, кто и когда принимает решение о переносе внутрь.</p>
      <h2>3. Меню и полная стоимость</h2>
      <p>Сравнивайте состав, вес порций и включенные услуги. Уточните напитки, сервисный сбор, детское меню, питание команды, торт и дополнительные часы.</p>
      <h2>4. Доступ и парковка</h2>
      <p>В Кишиневе проверьте маршрут в часы трафика и реальное число парковочных мест. За городом добавьте трансфер, проживание и время поставщиков.</p>
      <h2>5. Акустика и электричество</h2>
      <p>Уточните ограничения громкости, место DJ, доступную мощность и время окончания музыки.</p>
      <h2>Чеклист просмотра</h2>
      <ul>
        <li>Сфотографируйте зал со стороны сцены и столов.</li>
        <li>Проверьте размер танцпола и проход церемонии.</li>
        <li>Получите образец договора до аванса.</li>
        <li>Запишите все включенные и дополнительные услуги.</li>
        <li>Проверьте отмену, перенос и изменение числа гостей.</li>
      </ul>
      <p>Сравните варианты в <a href="/sali">каталоге залов ePetrecere.md</a> и сохраните три или пять фаворитов для просмотра.</p>
    `,
    contentEn: `
      <p>A <strong>ceremony venue in Chișinău</strong> must look good in photographs and work smoothly for guests, suppliers and the schedule. In 2026, a strong decision starts with measurable criteria.</p>
      <h2>1. Real capacity</h2>
      <p>Ask for the comfortable guest count after adding a dance floor, stage and decor. Maximum legal capacity is not the same as a comfortable layout.</p>
      <h2>2. Outdoor ceremony and weather backup</h2>
      <p>Ask to see the <strong>rain plan</strong>. The contract should explain who decides to move the ceremony indoors and when that decision is made.</p>
      <h2>3. Menu and total cost</h2>
      <p>Compare menu content, portion sizes and included services. Confirm drinks, service charge, children and supplier meals, cake, closing time and overtime.</p>
      <h2>4. Access and parking</h2>
      <p>In Chișinău, test the route during traffic hours and confirm the actual parking count. Outside the city, add guest transport, accommodation and supplier travel time.</p>
      <h2>5. Acoustics and power</h2>
      <p>Confirm volume restrictions, DJ position, available power and the time music must end.</p>
      <h2>Venue viewing checklist</h2>
      <ul>
        <li>Photograph the room from the stage and table areas.</li>
        <li>Check the ceremony aisle and dance floor dimensions.</li>
        <li>Request a contract template before paying a deposit.</li>
        <li>Write down every included and optional service.</li>
        <li>Review cancellation, rescheduling and guest count rules.</li>
      </ul>
      <p>Compare options in the <a href="/sali">ePetrecere.md venue catalog</a> and shortlist three to five locations before viewing.</p>
    `,
    faq: {
      ro: [
        { question: "Cu cât timp înainte se rezervă sala de nuntă?", answer: "Pentru o sâmbătă din sezon, este prudent să începi căutarea cu 9 - 14 luni înainte. Pentru extrasezon sau zile alternative poate fi suficient mai puțin." },
        { question: "Ce trebuie să includă contractul cu sala?", answer: "Contractul ar trebui să precizeze data, orele, spațiile, meniul, taxele, avansul, anularea, reprogramarea și responsabilitățile fiecărei părți." },
        { question: "Cum verific dacă sala este suficient de mare?", answer: "Cere o schiță cu mesele, scena, ringul și culoarele montate pentru numărul tău de invitați." },
      ],
      ru: [
        { question: "Когда бронировать свадебный зал?", answer: "Для субботы в высокий сезон разумно начинать за 9 - 14 месяцев. Для других дней и холодного сезона срок может быть короче." },
        { question: "Что должно быть в договоре?", answer: "Дата, часы, помещения, меню, сборы, аванс, отмена, перенос и обязанности сторон." },
        { question: "Как проверить размер зала?", answer: "Попросите схему со столами, сценой, танцполом и проходами для вашего числа гостей." },
      ],
      en: [
        { question: "How early should a wedding venue be booked?", answer: "For an in-season Saturday, start 9 - 14 months ahead. Alternative days and off-season dates may need less time." },
        { question: "What should the venue contract include?", answer: "It should define the date, hours, spaces, menu, fees, deposit, cancellation, rescheduling and each party's responsibilities." },
        { question: "How can I check if a venue is large enough?", answer: "Request a floor plan showing tables, stage, dance floor and circulation for your guest count." },
      ],
    },
  },
  {
    slug: "cum-te-pregatesti-de-nunta-checklist-2026",
    titleRo: "Cum te pregătești de nuntă în 2026: checklist pe 12 luni",
    titleRu: "Как подготовиться к свадьбе в 2026 году: план на 12 месяцев",
    titleEn: "How to Prepare for a Wedding in 2026: 12-Month Checklist",
    excerptRo:
      "Un calendar practic de pregătire a nunții, de la buget și sală până la invitați, contracte, programul zilei și ultima săptămână.",
    excerptRu:
      "Практический календарь подготовки свадьбы: бюджет, зал, гости, договоры, программа дня и последняя неделя.",
    excerptEn:
      "A practical wedding planning calendar covering budget, venue, guests, contracts, the event timeline and the final week.",
    coverImageUrl: "/images/blog/2026/ghid-pregatire-nunta-2026.webp",
    coverAltRo:
      "Cuplu și organizatoare pregătind checklistul unei nunți în Moldova în 2026",
    coverAltRu:
      "Пара и организатор составляют план свадьбы в Молдове на 2026 год",
    coverAltEn:
      "Couple and planner preparing a 2026 wedding checklist in Moldova",
    category: "Ghiduri de nuntă",
    tags: ["checklist nuntă 2026", "organizare nuntă Moldova", "pregătire nuntă", "planificare eveniment"],
    seoTitleRo: "Cum te Pregătești de Nuntă în 2026: Checklist 12 Luni",
    seoTitleRu: "Подготовка к свадьбе 2026: чеклист на 12 месяцев",
    seoTitleEn: "2026 Wedding Planning Checklist: 12-Month Guide",
    seoDescRo:
      "Checklist complet pentru organizarea nunții în 2026: ce faci cu 12, 6, 3 luni și o săptămână înainte, adaptat pentru Moldova.",
    seoDescRu:
      "Полный чеклист свадьбы 2026: что сделать за 12, 6, 3 месяца и одну неделю до события в Молдове.",
    seoDescEn:
      "A complete 2026 wedding checklist for Moldova: what to do 12, 6 and 3 months before, plus the final week.",
    contentRo: `
      <p>O <strong>nuntă în Moldova în 2026</strong> se organizează mai ușor când fiecare decizie are un termen și un responsabil. Checklistul de mai jos pornește de la 12 luni, dar îl poți comprima dacă ai mai puțin timp. Important este să păstrezi ordinea deciziilor care blochează alte alegeri.</p>
      <h2>Cu 12 - 10 luni înainte</h2>
      <ul>
        <li>Stabiliți bugetul maxim și rezerva de 10% - 15%.</li>
        <li>Faceți lista preliminară de invitați.</li>
        <li>Alegeți perioada și două sau trei date posibile.</li>
        <li>Vizionați și rezervați sala.</li>
        <li>Rezervați fotograful, videograful și muzica dacă aveți preferințe clare.</li>
      </ul>
      <p>În această etapă, prioritatea este disponibilitatea. Sala și furnizorii principali determină data finală și mare parte din buget.</p>
      <h2>Cu 9 - 6 luni înainte</h2>
      <ul>
        <li>Alegeți stilul vizual și paleta de culori.</li>
        <li>Comandați ținutele care necesită ajustări.</li>
        <li>Discutați decorul, florile și iluminarea.</li>
        <li>Pregătiți invitațiile și informațiile pentru oaspeți.</li>
        <li>Verificați actele și programările pentru ceremonia civilă sau religioasă.</li>
      </ul>
      <h2>Cu 5 - 3 luni înainte</h2>
      <p>Confirmați meniul, tortul, transportul și cazarea. Deschideți lista de RSVP și notați alergiile, copiii și necesitățile de acces. Dacă aveți invitați din mai multe țări, pregătiți informații în română, rusă sau engleză.</p>
      <p>Acum este momentul potrivit pentru <strong>programul zilei nunții</strong>. Includeți pregătirea, fotografiile, ceremonia, deplasarea, intrarea în sală, primul dans, tortul și finalul programului.</p>
      <h2>Cu 8 - 4 săptămâni înainte</h2>
      <ul>
        <li>Închideți confirmările și așezarea la mese.</li>
        <li>Faceți proba finală pentru ținute.</li>
        <li>Trimiteți programul tuturor furnizorilor.</li>
        <li>Confirmați plățile, orele de sosire și persoanele de contact.</li>
        <li>Pregătiți un plan alternativ pentru vreme și transport.</li>
      </ul>
      <h2>Ultima săptămână</h2>
      <p>Nu mai adăugați proiecte mari. Pregătiți documentele, verighetele, plicurile pentru plăți, medicamentele personale și o trusă de urgență. Delegați comunicarea din ziua evenimentului unei persoane de încredere, pentru ca mirii să nu răspundă la fiecare apel.</p>
      <h2>După nuntă</h2>
      <p>Verificați plățile finale, salvați contractele și confirmați termenul de livrare pentru fotografii și film. Trimiteți mulțumiri invitaților și păstrați fotografiile într-un loc cu backup.</p>
      <p>Poți gestiona sarcinile în <a href="/utilitati/checklist">checklistul de eveniment</a>, invitații în <a href="/utilitati/lista-invitati">lista digitală</a> și momentele publicate de oaspeți în <a href="/utilitati/momente-eveniment">Momente Eveniment</a>.</p>
    `,
    contentRu: `
      <p><strong>Свадьбу в Молдове в 2026 году</strong> легче организовать, если у каждого решения есть срок и ответственный. Этот план начинается за 12 месяцев, но его можно сократить.</p>
      <h2>За 12 - 10 месяцев</h2>
      <ul>
        <li>Определите максимальный бюджет и резерв 10% - 15%.</li>
        <li>Составьте предварительный список гостей.</li>
        <li>Выберите период и несколько возможных дат.</li>
        <li>Посмотрите и забронируйте зал.</li>
        <li>Забронируйте фото, видео и музыку.</li>
      </ul>
      <h2>За 9 - 6 месяцев</h2>
      <ul>
        <li>Выберите стиль и цветовую палитру.</li>
        <li>Закажите наряды, которым нужна подгонка.</li>
        <li>Обсудите декор, цветы и свет.</li>
        <li>Подготовьте приглашения.</li>
        <li>Проверьте документы для гражданской или религиозной церемонии.</li>
      </ul>
      <h2>За 5 - 3 месяца</h2>
      <p>Подтвердите меню, торт, транспорт и проживание. Соберите RSVP, аллергии и запросы доступности. Составьте <strong>программу свадебного дня</strong> от подготовки до завершения вечера.</p>
      <h2>За 8 - 4 недели</h2>
      <ul>
        <li>Закройте подтверждения и рассадку.</li>
        <li>Проведите финальную примерку.</li>
        <li>Отправьте программу всем подрядчикам.</li>
        <li>Подтвердите платежи и время прибытия.</li>
        <li>Подготовьте запасной план погоды и транспорта.</li>
      </ul>
      <h2>Последняя неделя</h2>
      <p>Не добавляйте крупные задачи. Подготовьте документы, кольца, платежи и аптечку. Передайте звонки дня свадьбы доверенному человеку.</p>
      <p>Используйте <a href="/utilitati/checklist">чеклист события</a>, <a href="/utilitati/lista-invitati">список гостей</a> и <a href="/utilitati/momente-eveniment">Momente Eveniment</a>.</p>
    `,
    contentEn: `
      <p>A <strong>2026 wedding in Moldova</strong> is easier to organize when every decision has a deadline and an owner. This checklist starts 12 months ahead, but the timeline can be compressed.</p>
      <h2>12 - 10 months before</h2>
      <ul>
        <li>Set the maximum budget and a 10% - 15% contingency.</li>
        <li>Build a preliminary guest list.</li>
        <li>Choose a season and two or three possible dates.</li>
        <li>View and book the venue.</li>
        <li>Book photo, video and music if you have clear preferences.</li>
      </ul>
      <h2>9 - 6 months before</h2>
      <ul>
        <li>Choose the visual direction and colors.</li>
        <li>Order attire that needs alterations.</li>
        <li>Discuss decor, flowers and lighting.</li>
        <li>Prepare invitations and guest information.</li>
        <li>Check civil or religious ceremony documents.</li>
      </ul>
      <h2>5 - 3 months before</h2>
      <p>Confirm the menu, cake, transport and accommodation. Track RSVPs, allergies, children and accessibility needs. Build the <strong>wedding day timeline</strong> from preparation through the end of the reception.</p>
      <h2>8 - 4 weeks before</h2>
      <ul>
        <li>Close RSVPs and complete the seating plan.</li>
        <li>Attend the final attire fitting.</li>
        <li>Send the timeline to every supplier.</li>
        <li>Confirm payments, arrival times and contacts.</li>
        <li>Prepare weather and transport backup plans.</li>
      </ul>
      <h2>The final week</h2>
      <p>Do not add major projects. Prepare documents, rings, payment envelopes and personal medication. Delegate event-day calls to someone you trust.</p>
      <p>Manage tasks in the <a href="/utilitati/checklist">event checklist</a>, guests in the <a href="/utilitati/lista-invitati">digital guest list</a> and shared photos in <a href="/utilitati/momente-eveniment">Event Moments</a>.</p>
    `,
    faq: {
      ro: [
        { question: "Se poate organiza o nuntă în mai puțin de 12 luni?", answer: "Da. Păstrează ordinea deciziilor și rezervă mai întâi sala, data și furnizorii principali." },
        { question: "Când trebuie trimise invitațiile?", answer: "Pentru majoritatea nunților, trimite invitațiile cu 3 - 5 luni înainte și cere confirmarea cu 6 - 8 săptămâni înainte." },
        { question: "Cine ar trebui să coordoneze ziua nunții?", answer: "Alege un coordonator, organizator sau o persoană de încredere care poate comunica direct cu furnizorii." },
      ],
      ru: [
        { question: "Можно ли организовать свадьбу быстрее чем за 12 месяцев?", answer: "Да. Сохраните порядок решений и сначала забронируйте зал, дату и главных подрядчиков." },
        { question: "Когда отправлять приглашения?", answer: "Обычно за 3 - 5 месяцев, с дедлайном RSVP за 6 - 8 недель." },
        { question: "Кто координирует день свадьбы?", answer: "Назначьте координатора, организатора или доверенного человека для связи с подрядчиками." },
      ],
      en: [
        { question: "Can a wedding be planned in less than 12 months?", answer: "Yes. Keep the same decision order and book the venue, date and core suppliers first." },
        { question: "When should invitations be sent?", answer: "For most weddings, send them 3 - 5 months ahead and set the RSVP deadline 6 - 8 weeks before." },
        { question: "Who should coordinate the wedding day?", answer: "Assign a coordinator, planner or trusted person who can communicate directly with suppliers." },
      ],
    },
  },
];

export function findEditorialPost2026(slug: string) {
  return EDITORIAL_POSTS_2026.find((post) => post.slug === slug);
}
