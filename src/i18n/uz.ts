/** Botning barcha matnlari — o'zbek tilida. Kodda qattiq matn yozilmaydi. */

export const uz = {
  common: {
    back: '⬅️ Orqaga',
    cancel: '❌ Bekor qilish',
    confirm: '✅ Tasdiqlash',
    skip: '⏭ O\'tkazib yuborish',
    done: '✅ Tayyor',
    yes: 'Ha',
    no: 'Yo\'q',
    next: 'Keyingi ▶️',
    prev: '◀️ Oldingi',
    menu: '🏠 Bosh menyu',
    cancelled: 'Bekor qilindi.',
    unknownCommand: 'Buyruq tushunarsiz. /start ni bosing.',
    error: '⚠️ Xatolik yuz berdi. Birozdan so\'ng qayta urinib ko\'ring.',
    forbidden: '⛔️ Sizda bu amal uchun ruxsat yo\'q.',
    notFound: '🔍 Topilmadi.',
    loading: '⏳ Yuklanmoqda...',
    page: (current: number, total: number) => `Sahifa ${current}/${total}`,
    empty: 'Ro\'yxat bo\'sh.',
    rateLimited: '⏱ Juda tez. Bir necha soniyadan keyin urinib ko\'ring.',
  },

  start: {
    welcomeUnknown:
      '👋 Assalomu alaykum!\n\nBu — taksi reklama nazorati boti.\n\n' +
      'Agar siz haydovchi bo\'lsangiz, administratordan olingan havola orqali kiring ' +
      'yoki telefon raqamingizni yuboring.',
    welcomeDriver: (name: string) => `👋 Assalomu alaykum, ${name}!\n\nSiz haydovchi sifatida ro'yxatdan o'tgansiz.`,
    welcomeAdmin: '🛠 Admin panelga xush kelibsiz.',
    welcomeAdvertiser: (company: string) => `📊 Xush kelibsiz, ${company}!\n\nBu yerda reklamangiz holatini kuzatasiz.`,
    sharePhonePrompt: '📱 Davom etish uchun telefon raqamingizni yuboring:',
    sharePhoneButton: '📱 Raqamni yuborish',
    phoneSaved: '✅ Raqam saqlandi.',
    notLinked:
      'ℹ️ Siz hali hech qaysi mashinaga biriktirilmagansiz.\n\n' +
      'Administrator sizni tizimga qo\'shgach, avtomatik xabar olasiz.',
    phoneNotOwn: '⚠️ Iltimos, pastdagi tugma orqali faqat o\'z raqamingizni yuboring.',
    phoneInvalid: '⚠️ Raqam formati noto\'g\'ri. Pastdagi tugmadan foydalaning.',
    payloadInvalid: '⚠️ Havola noto\'g\'ri. Administratordan yangi havola so\'rang.',
  },

  referral: {
    invalid: '⚠️ Havola yaroqsiz yoki muddati tugagan. Administratorga murojaat qiling.',
    alreadyUsed: '⚠️ Bu havoladan allaqachon foydalanilgan.',
    carTaken: (plate: string) => `⚠️ ${plate} raqamli mashinaga boshqa haydovchi biriktirilgan.`,
    linked: (plate: string) =>
      `✅ Siz ${plate} raqamli mashinaga biriktirildingiz.\n\n` +
      'Endi har 3 kunda reklama holatini tasdiqlash uchun xabar olasiz.',
    created: (link: string, plate: string) =>
      `🔗 ${plate} uchun havola tayyor:\n\n<code>${link}</code>\n\n` +
      'Havolani haydovchiga yuboring. U /start bosgach avtomatik biriktiriladi.\n' +
      'Muddati: 30 kun.',
    revoked: '✅ Havola bekor qilindi.',
  },

  driver: {
    menuTitle: '🚕 Haydovchi menyusi',
    myCar: '🚗 Mening mashinam',
    myChecks: '📋 Tekshiruvlarim',
    help: 'ℹ️ Yordam',
    noCar: 'Sizga mashina biriktirilmagan.',
    carInfo: (plate: string, model: string, campaigns: string) =>
      `🚗 <b>${plate}</b>\n` + `Model: ${model}\n` + `Faol reklama: ${campaigns}`,

    checkPrompt: (plate: string, deadline: string) =>
      `📸 <b>Reklama holatini tasdiqlash</b>\n\n` +
      `Mashina: <b>${plate}</b>\n` +
      `Muddat: <b>${deadline}</b> gacha\n\n` +
      'Quyidagi tugmani bosing va mashinangizning <b>3 ta rasmini</b> oling:\n' +
      '1️⃣ Orqa tomon\n2️⃣ Chap chet\n3️⃣ O\'ng chet\n\n' +
      '⚠️ Rasmlar faqat kamera orqali olinadi — galereyadan tanlab bo\'lmaydi.',
    openCamera: '📷 Kamerani ochish',
    checkAlreadyDone: '✅ Bu tekshiruv allaqachon bajarilgan.',
    checkExpired: '⌛️ Bu tekshiruv muddati tugagan. Administratorga murojaat qiling.',
    submitted:
      '✅ <b>Rahmat!</b>\n\nRasmlar qabul qilindi va reklama beruvchiga yuborildi.\n' +
      'Keyingi tekshiruv 3 kundan so\'ng bo\'ladi.',
    approved: (plate: string) => `✅ ${plate} bo'yicha hisobotingiz tasdiqlandi. Rahmat!`,
    rejected: (plate: string, reason: string) =>
      `❌ ${plate} bo'yicha hisobotingiz rad etildi.\n\nSabab: ${reason}\n\n` +
      'Iltimos, qaytadan rasm yuboring.',
    reminder: (plate: string, hoursLeft: number) =>
      `⏰ <b>Eslatma</b>\n\n${plate} bo'yicha rasmlar hali yuborilmadi.\n` +
      `Muddat tugashiga <b>${hoursLeft} soat</b> qoldi.`,
    expired: (plate: string) =>
      `⌛️ ${plate} bo'yicha tekshiruv muddati tugadi.\n` + 'Bu holat administratorga xabar qilindi.',
    noPendingChecks: 'Hozircha kutilayotgan tekshiruv yo\'q. ✅',
    fallbackHint:
      'Agar tugma ishlamasa, Telegram ilovasini yangilang.\n' +
      'Muammo davom etsa, administratorga yozing.',

    helpText:
      'ℹ️ <b>Yordam</b>\n\n' +
      '• Har 3 kunda botdan tekshiruv xabari keladi.\n' +
      '• «📷 Kamerani ochish» tugmasini bosing va 3 ta rasm oling: orqa, chap chet, o\'ng chet.\n' +
      '• Rasmlar faqat kamera orqali olinadi — galereyadan tanlab bo\'lmaydi.\n' +
      '• Muddat 24 soat. Vaqtida yubormasangiz, administrator xabardor qilinadi.\n\n' +
      'Savollar bo\'lsa administratorga murojaat qiling.',
    checksTitle: '📋 <b>Oxirgi tekshiruvlar</b>',
    checksEmpty: 'Hozircha tekshiruvlar yo\'q.',
    checkListItem: (plate: string, status: string, when: string) => `• <b>${plate}</b> — ${status} · ${when}`,
    noCampaigns: 'faol reklama yo\'q',
    refreshLink: '🔄 Havolani yangilash',
    linkRefreshed: '✅ Havola yangilandi.',
    linkFailed: '⚠️ Yuklash havolasini yaratib bo\'lmadi. Administratorga murojaat qiling.',
    checkNotYours: '⛔️ Bu tekshiruv sizga tegishli emas.',
    photoSaved: (side: string, left: number) => `✅ «${side}» rasmi saqlandi. Yana ${left} ta rasm kerak.`,
    photoAllSaved: '✅ Barcha 3 ta rasm qabul qilindi.',
    photoRejectedStrict:
      '⚠️ Chatga yuborilgan rasm qabul qilinmaydi.\n\n' +
      'Iltimos, quyidagi tugma orqali kameradan foydalaning.',
    photoNoteFallback: 'Bot chatiga yuborilgan — EXIF mavjud emas',
  },

  miniapp: {
    title: 'Reklama tasdiqlash',
    stepRear: 'Orqa tomon',
    stepLeft: 'Chap chet',
    stepRight: 'O\'ng chet',
    hintRear: 'Mashinaning orqasiga o\'ting. Reklama va davlat raqami to\'liq ko\'rinsin.',
    hintLeft: 'Chap tomondan suratga oling. Reklama to\'liq kadrga tushsin.',
    hintRight: 'O\'ng tomondan suratga oling. Reklama to\'liq kadrga tushsin.',
    takePhoto: '📷 Suratga olish',
    retake: '🔄 Qayta olish',
    submit: 'Yuborish',
    uploading: 'Yuborilmoqda...',
    success: 'Muvaffaqiyatli yuborildi!',
    geoRequired: 'Joylashuvga ruxsat bering — bu tasdiqlash uchun zarur.',
    errorGeneric: 'Xatolik. Qayta urinib ko\'ring.',
    errorSession: 'Sessiya muddati tugagan. Botga qaytib, tugmani qaytadan bosing.',
    errorPhotoEmpty: 'Rasm bo\'sh yoki buzilgan. Qayta suratga oling.',
    errorPhotoTooLarge: 'Rasm hajmi juda katta. Qayta suratga oling.',
    errorPhotoType: 'Faqat rasm fayli qabul qilinadi. Qayta suratga oling.',
    errorPhotoSmall: 'Rasm sifati past. Mashinaga yaqinroq turib qayta suratga oling.',
    errorNetwork: 'Aloqa yo\'q. Internetni tekshirib, qayta urinib ko\'ring.',
    errorNoTelegram: 'Bu sahifani Telegram ilovasi orqali oching.',
    errorFieldsInvalid: 'So\'rov maʼlumotlari yaroqsiz. Botga qaytib, tugmani qayta bosing.',
    stepCounter: (current: number, total: number) => `${current}/${total}-qadam`,
    continueNext: 'Davom etish ▶️',
    retry: '🔄 Qayta urinish',
    photoReady: 'Rasm tayyor. Ko\'rinishini tekshiring.',
    successHint: 'Reklama beruvchiga yuborildi. Oyna avtomatik yopiladi.',
  },

  admin: {
    menuTitle: '🛠 <b>Admin panel</b>',
    cars: '🚗 Mashinalar',
    drivers: '👤 Haydovchilar',
    advertisers: '🏢 Reklama beruvchilar',
    campaigns: '📣 Kampaniyalar',
    checks: '📋 Tekshiruvlar',
    stats: '📊 Statistika',
    broadcast: '📢 Xabar yuborish',
    settings: '⚙️ Sozlamalar',

    carAdd: '➕ Mashina qo\'shish',
    carPlatePrompt: '🚗 Davlat raqamini kiriting (masalan: 01A123BC):',
    carPlateInvalid: '⚠️ Raqam formati noto\'g\'ri. Masalan: 01A123BC',
    carPlateExists: (plate: string) => `⚠️ ${plate} allaqachon mavjud.`,
    carModelPrompt: '🚘 Mashina modelini kiriting (masalan: Cobalt):',
    carColorPrompt: '🎨 Rangini kiriting:',
    carPhotosPrompt:
      '📸 Endi mashinaning <b>etalon rasmlarini</b> yuboring.\n\n' +
      'Ketma-ket 3 ta rasm: <b>orqa</b>, <b>chap chet</b>, <b>o\'ng chet</b>.\n' +
      'Bu rasmlar keyinchalik haydovchi yuborgan rasmlar bilan solishtiriladi.',
    carPhotoReceived: (index: number, total: number) => `✅ ${index}/${total} rasm qabul qilindi.`,
    carCreated: (plate: string) => `✅ <b>${plate}</b> qo'shildi.`,
    carDriverPrompt:
      '👤 Haydovchini biriktirasizmi?\n\n' +
      'Telegram username (@user), telefon raqam yoki ID yuboring.\n' +
      'Yoki "Havola yaratish" tugmasini bosing.',
    carCreateReferral: '🔗 Havola yaratish',
    carLinkExisting: '🔎 Mavjud haydovchini tanlash',
    carList: (plate: string, status: string, driver: string) => `🚗 ${plate} · ${status} · ${driver}`,
    carDeleteConfirm: (plate: string) => `⚠️ ${plate} ni arxivga o'tkazishni tasdiqlaysizmi?`,
    carArchived: (plate: string) => `✅ ${plate} arxivga o'tkazildi.`,

    driverNotFound: '🔍 Bunday haydovchi topilmadi. Havola yaratishni tavsiya qilamiz.',
    driverLinked: (name: string, plate: string) => `✅ ${name} → ${plate} biriktirildi.`,
    driverUnlinked: (plate: string) => `✅ ${plate} dan haydovchi ajratildi.`,
    driverPhoneInvalid: '⚠️ Telefon raqami noto\'g\'ri. Masalan: +998901234567',
    driverIdentifierRequired: '⚠️ Haydovchini aniqlash uchun username yoki telefon raqam kerak.',

    advertiserAdd: '➕ Reklama beruvchi qo\'shish',
    advertiserNamePrompt: '🏢 Kompaniya nomini kiriting:',
    advertiserContactPrompt: '👤 Mas\'ul shaxs ismi:',
    advertiserPhonePrompt: '📞 Telefon raqami:',
    advertiserCreated: (name: string, code: string, link: string) =>
      `✅ <b>${name}</b> qo'shildi.\n\n` +
      `Taklif kodi: <code>${code}</code>\n` +
      `Havola:\n<code>${link}</code>\n\n` +
      'Havolani reklama beruvchiga yuboring — u hisobotlarni shu yerda ko\'radi.',

    campaignAdd: '➕ Kampaniya qo\'shish',
    campaignAdvertiserPrompt: '🏢 Reklama beruvchini tanlang:',
    campaignTitlePrompt: '📣 Kampaniya nomini kiriting:',
    campaignDescPrompt: '📝 Qisqacha tavsif (yoki "-" yozing):',
    campaignIntervalInvalid: '⚠️ Tekshiruv davriyligi 1 dan 60 kungacha bo\'lishi kerak.',
    campaignCarsPrompt:
      '🚗 Qaysi mashinalarga joylanadi?\n\n' +
      'Davlat raqamlarini vergul bilan yozing (01A123BC, 01B456CD)\n' +
      'yoki <code>HAMMASI</code> deb yozing.',
    campaignCreated: (title: string, count: number) => `✅ <b>${title}</b> yaratildi. ${count} ta mashinaga biriktirildi.`,
    campaignStarted: (title: string) => `▶️ <b>${title}</b> faollashtirildi. Tekshiruvlar boshlanadi.`,
    campaignPaused: (title: string) => `⏸ <b>${title}</b> to'xtatildi.`,

    checkReview: (plate: string, campaign: string, driver: string, when: string) =>
      `📋 <b>Tekshiruv</b>\n\n` +
      `🚗 Mashina: <b>${plate}</b>\n` +
      `📣 Kampaniya: ${campaign}\n` +
      `👤 Haydovchi: ${driver}\n` +
      `🕐 Yuborilgan: ${when}`,
    checkApprove: '✅ Tasdiqlash',
    checkReject: '❌ Rad etish',
    checkRejectReason: '📝 Rad etish sababini yozing:',
    checkApproved: '✅ Tasdiqlandi.',
    checkRejected: '❌ Rad etildi, haydovchiga xabar berildi.',
    checkMissedNotice: (plate: string, campaign: string, driver: string) =>
      `⚠️ <b>Javobsiz tekshiruv</b>\n\n` +
      `🚗 Mashina: <b>${plate}</b>\n` +
      `📣 Kampaniya: ${campaign}\n` +
      `👤 Haydovchi: ${driver}\n\n` +
      'Haydovchi muddat ichida rasm yubormadi. Reklama beruvchi xabardor qilindi.',
    checkForceRun: '🔄 Hozir tekshiruv yuborish',
    checkSentManual: (count: number) => `✅ ${count} ta haydovchiga tekshiruv yuborildi.`,

    broadcastPrompt: '📢 Yuboriladigan xabar matnini kiriting:',
    broadcastAudience: 'Kimga yuboriladi?',
    broadcastAll: '👥 Hammaga',
    broadcastDrivers: '🚕 Haydovchilarga',
    broadcastAdvertisers: '🏢 Reklama beruvchilarga',
    broadcastConfirm: (count: number) => `⚠️ ${count} ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`,
    broadcastStarted: (count: number) => `📤 Yuborish boshlandi: ${count} ta qabul qiluvchi.`,
    broadcastDone: (sent: number, failed: number) => `✅ Yuborildi: ${sent}\n❌ Yuborilmadi: ${failed}`,

    statsTitle: '📊 <b>Umumiy statistika</b>',
    statsBody: (s: {
      cars: number;
      activeCars: number;
      drivers: number;
      linkedDrivers: number;
      campaigns: number;
      pending: number;
      submitted: number;
      expired: number;
      complianceRate: number;
    }) =>
      `🚗 Mashinalar: <b>${s.cars}</b> (faol: ${s.activeCars})\n` +
      `👤 Haydovchilar: <b>${s.drivers}</b> (ulangan: ${s.linkedDrivers})\n` +
      `📣 Faol kampaniyalar: <b>${s.campaigns}</b>\n\n` +
      `<b>Oxirgi 30 kun:</b>\n` +
      `⏳ Kutilmoqda: ${s.pending}\n` +
      `✅ Bajarildi: ${s.submitted}\n` +
      `⌛️ Muddati o'tgan: ${s.expired}\n` +
      `📈 Bajarilish darajasi: <b>${s.complianceRate}%</b>`,

    // ─── Panel boshqaruvi ───
    // Tugma yorliqlari uchun `t.kb.*` ishlatiladi — bu yerda faqat panel matnlari.
    search: '🔍 Qidirish',
    actionDone: '✅ Bajarildi.',
    searchPrompt: '🔍 Qidiruv so\'zini kiriting (ism, @username yoki telefon):',
    tooManyAttempts: '⚠️ Urinishlar soni tugadi. Amal bekor qilindi.',
    expectedText: '⌨️ Iltimos, javobni matn ko\'rinishida yuboring.',
    expectedPhoto: '📷 Iltimos, rasm yuboring (fayl yoki hujjat emas).',
    expectedChoice: '👆 Quyidagi tugmalardan birini tanlang.',
    phoneInvalid: '⚠️ Telefon raqami noto\'g\'ri. Masalan: +998901234567 (yoki "-").',
    settingsBody: (s: {
      intervalDays: number;
      deadlineHours: number;
      reminderHours: string;
      validationMode: string;
      photoMaxAgeMinutes: number;
    }) =>
      `⚙️ <b>Sozlamalar</b>\n\n` +
      `🔁 Tekshiruv davriyligi: <b>${s.intervalDays}</b> kun\n` +
      `⏳ Javob muddati: <b>${s.deadlineHours}</b> soat\n` +
      `⏰ Eslatmalar: ${s.reminderHours} soatda\n` +
      `🔍 Rasm tekshiruvi: <b>${s.validationMode}</b>\n` +
      `🕐 Rasmning eng katta yoshi: ${s.photoMaxAgeMinutes} daqiqa\n\n` +
      'Qiymatlar muhit o\'zgaruvchilaridan olinadi (Railway → Variables).',

    // ─── Mashinalar ───
    carsTitle: (total: number) => `🚗 <b>Mashinalar</b> — jami ${total} ta`,
    carsSearchTitle: (query: string, total: number) => `🔍 <b>${query}</b> — ${total} ta natija`,
    carSearchPrompt: '🔍 Davlat raqami yoki model bo\'yicha qidiring:',
    carNoDriver: '— biriktirilmagan —',
    carSkipDriver: '⏭ Keyinroq biriktiraman',
    carDriverSkipped: 'ℹ️ Haydovchi keyinroq biriktiriladi — mashina kartochkasidan qo\'shasiz.',
    carDriverIdentifierPrompt:
      '👤 Haydovchi ma\'lumotini yuboring:\n\n' +
      '• Telegram username — <code>@haydovchi</code>\n' +
      '• Telefon — <code>+998901234567</code>\n' +
      '• Telegram ID — <code>123456789</code>',
    carDriverPending: (target: string) =>
      `ℹ️ ${target} hali botga kirmagan.\n\nU /start bosgach mashinaga avtomatik bog'lanadi.`,
    carPhotoSidePrompt: (side: string, index: number, total: number) =>
      `📷 <b>${index}/${total}</b> — <b>${side}</b> rasmini yuboring.`,
    carCreatedPartial: (plate: string) =>
      `⚠️ <b>${plate}</b> qo'shildi, lekin etalon rasmlar to'liq emas.\n` +
      'Kartochkadan davom ettirishingiz mumkin.',
    carStatusPrompt: (plate: string) => `🔁 <b>${plate}</b> uchun yangi holatni tanlang:`,
    carStatusUpdated: (plate: string, status: string) => `✅ ${plate} → ${status}`,
    carDetail: (c: {
      plate: string;
      model: string;
      color: string;
      status: string;
      driver: string;
      phone: string;
      campaigns: number;
      photos: number;
      created: string;
    }) =>
      `🚗 <b>${c.plate}</b>\n\n` +
      `Model: ${c.model}\n` +
      `Rang: ${c.color}\n` +
      `Holat: ${c.status}\n\n` +
      `👤 Haydovchi: ${c.driver}\n` +
      `📞 Telefon: ${c.phone}\n\n` +
      `📣 Faol kampaniyalar: <b>${c.campaigns}</b>\n` +
      `📸 Etalon rasmlar: ${c.photos}\n` +
      `🗓 Qo'shilgan: ${c.created}`,

    // ─── Haydovchilar ───
    driversTitle: (total: number) => `👤 <b>Haydovchilar</b> — jami ${total} ta`,
    driversSearchTitle: (query: string, total: number) => `🔍 <b>${query}</b> — ${total} ta natija`,
    driverList: (name: string, contact: string, cars: string) => `👤 ${name} · ${contact} · ${cars}`,
    driverCheckLine: (plate: string, status: string, when: string) =>
      `• ${plate} — ${status} · ${when}`,
    driverBlock: '🚫 Bloklash',
    driverUnblock: '✅ Blokdan chiqarish',
    driverBlocked: (name: string) => `🚫 ${name} bloklandi.`,
    driverUnblocked: (name: string) => `✅ ${name} blokdan chiqarildi.`,
    driverDetail: (d: {
      name: string;
      username: string;
      phone: string;
      linked: string;
      blocked: string;
      cars: string;
      approved: number;
      expired: number;
      pending: number;
      rate: number;
      history: string;
    }) =>
      `👤 <b>${d.name}</b>\n\n` +
      `Username: ${d.username}\n` +
      `📞 Telefon: ${d.phone}\n` +
      `🔗 Botga ulangan: ${d.linked}\n` +
      `🚫 Bloklangan: ${d.blocked}\n` +
      `🚗 Mashinalar: ${d.cars}\n\n` +
      `✅ Tasdiqlangan: ${d.approved}\n` +
      `⌛️ Muddati o'tgan: ${d.expired}\n` +
      `⏳ Kutilmoqda: ${d.pending}\n` +
      `📈 Bajarilish darajasi: <b>${d.rate}%</b>\n\n` +
      `<b>Oxirgi tekshiruvlar:</b>\n${d.history}`,

    // ─── Reklama beruvchilar ───
    advertisersTitle: (total: number) => `🏢 <b>Reklama beruvchilar</b> — jami ${total} ta`,
    advertiserList: (company: string, contact: string) =>
      contact ? `🏢 ${company} · ${contact}` : `🏢 ${company}`,
    advertiserNoInvite: (company: string) =>
      `ℹ️ <b>${company}</b> uchun taklif kodi yo'q. Kodsiz u hisobotlarni ko'ra olmaydi.`,
    advertiserDetail: (a: {
      company: string;
      contact: string;
      phone: string;
      linked: string;
      campaigns: number;
      activeCampaigns: number;
      cars: number;
    }) =>
      `🏢 <b>${a.company}</b>\n\n` +
      `👤 Mas'ul: ${a.contact}\n` +
      `📞 Telefon: ${a.phone}\n` +
      `🔗 Botga ulangan: ${a.linked}\n\n` +
      `📣 Kampaniyalar: ${a.campaigns} (faol: ${a.activeCampaigns})\n` +
      `🚗 Faol mashinalar: ${a.cars}`,

    // ─── Kampaniyalar ───
    campaignsTitle: (total: number) => `📣 <b>Kampaniyalar</b> — jami ${total} ta`,
    campaignList: (title: string, status: string, cars: number) =>
      `📣 ${title} · ${status} · ${cars} 🚗`,
    campaignNoAdvertisers: '⚠️ Avval reklama beruvchi qo\'shing.',
    campaignNoCars: '⚠️ Birorta faol mashina topilmadi.',
    campaignMissingPlates: (plates: string) => `⚠️ Topilmadi va o'tkazib yuborildi: ${plates}`,
    campaignCarsAttached: (count: number) => `✅ ${count} ta mashina biriktirildi.`,
    campaignDetail: (c: {
      title: string;
      advertiser: string;
      description: string;
      status: string;
      cars: number;
      approved: number;
      pending: number;
      expired: number;
      rate: number;
    }) =>
      `📣 <b>${c.title}</b>\n\n` +
      `🏢 Reklama beruvchi: ${c.advertiser}\n` +
      `📝 Tavsif: ${c.description}\n` +
      `Holat: ${c.status}\n\n` +
      `🚗 Mashinalar: <b>${c.cars}</b>\n` +
      `✅ Tasdiqlangan: ${c.approved}\n` +
      `⏳ Kutilmoqda: ${c.pending}\n` +
      `⌛️ Muddati o'tgan: ${c.expired}\n` +
      `📈 Faollik: <b>${c.rate}%</b>`,

    // ─── Tekshiruvlar ───
    checksTitle: (status: string, total: number) => `📋 <b>Tekshiruvlar</b> — ${status} (${total})`,
    checkList: (plate: string, campaign: string, status: string) =>
      `${status} · ${plate} · ${campaign}`,
    checkNoPhotos: '⚠️ Bu tekshiruvda rasm yo\'q.',
    checkForceCampaignPrompt: '📣 Qaysi kampaniya bo\'yicha tekshiruv yuborilsin?',
    checkForceNoCampaigns: '⚠️ Faol kampaniya yo\'q.',
    checkForceConfirm: (count: number) =>
      `⚠️ ${count} ta haydovchiga darhol tekshiruv yuboriladi. Tasdiqlaysizmi?`,
    checkForceStarted: '📤 Yuborilmoqda...',

    // ─── Xabar yuborish ───
    broadcastTooLong: (limit: number) => `⚠️ Matn juda uzun. Chegara: ${limit} belgi.`,
    broadcastNoAudience: '⚠️ Bu guruhda birorta qabul qiluvchi yo\'q.',
    broadcastPreview: (text: string, count: number) =>
      `📢 <b>Ko'rib chiqing</b>\n\n${text}\n\n👥 Qabul qiluvchilar: <b>${count}</b>`,

    // ─── Adminlar (faqat superadmin uchun) ───
    adminsButton: '👮 Adminlar',
    adminsTitle: (total: number) => `👮 <b>Adminlar</b> — jami ${total} ta`,
    adminStats: (s: { superadmins: number; admins: number; operators: number }) =>
      `👑 Superadmin: ${s.superadmins} · 🛠 Admin: ${s.admins} · 👁 Operator: ${s.operators}`,
    adminListRow: (who: string, role: string, locked: boolean) =>
      locked ? `🔒 ${role} · ${who}` : `${role} · ${who}`,
    adminAdd: '➕ Admin qo\'shish',
    adminAddPrompt:
      '👤 Kimga huquq beramiz?\n\n' +
      '• Telegram username — <code>@foydalanuvchi</code>\n' +
      '• Telegram ID — <code>123456789</code>\n' +
      '• Telefon — <code>+998901234567</code>\n\n' +
      'Eng qulayi: o\'sha odamning istalgan xabarini shu yerga <b>forward</b> qiling.',
    adminNotFound: '🔍 Bunday foydalanuvchi topilmadi.',
    adminNotStarted:
      'ℹ️ Huquq berish uchun odam avval botga kirgan bo\'lishi shart. ' +
      'Unga ayting: botga /start bossin, keyin qayta urinib ko\'ring.',
    adminAlreadyHasRole: 'ℹ️ Bu foydalanuvchida allaqachon shu huquq bor.',
    adminSelfRevoke: '⛔️ O\'zingizdan huquqni olib tashlay olmaysiz.',
    adminEnvLocked:
      '🔒 Bu superadmin Railway sozlamalarida (SUPER_ADMIN_IDS) belgilangan — ' +
      'bot orqali o\'zgartirib bo\'lmaydi. O\'zgartirish uchun Railway → Variables ni tahrirlang.',
    adminCannotGrantAdvertiser:
      '⛔️ Reklama beruvchiga admin huquqi berilmaydi — rollar aralashib ketmasligi kerak.',
    adminPickRole: (who: string) => `👤 <b>${who}</b>\n\nQaysi huquq beriladi?`,
    adminRoleSuperadmin: '👑 Superadmin',
    adminRoleAdmin: '🛠 Admin',
    adminRoleOperator: '👁 Operator',
    adminChangeRole: '🔁 Rolni o\'zgartirish',
    adminRevoke: '❌ Huquqni olib tashlash',
    adminGrantConfirm: (who: string, role: string) =>
      `⚠️ <b>${who}</b> ga <b>${role}</b> huquqi beriladi. Tasdiqlaysizmi?`,
    adminGranted: (who: string, role: string) => `✅ ${who} — endi ${role}.`,
    adminGrantedNotice: (role: string) =>
      `🎉 Sizga <b>${role}</b> huquqi berildi.\n\nPanelga kirish: /admin`,
    adminRevokeConfirm: (who: string) =>
      `⚠️ <b>${who}</b> dan admin huquqi olib tashlanadi. Tasdiqlaysizmi?`,
    adminRevoked: (who: string) => `✅ ${who} dan huquq olib tashlandi.`,
    adminRevokedNotice:
      '🔕 Sizdan admin huquqi olib tashlandi.\n\n' +
      'Botdan oddiy foydalanuvchi sifatida foydalanish uchun /start bosing.',
    adminDetail: (a: {
      name: string;
      username: string;
      telegramId: string;
      role: string;
      created: string;
    }) =>
      `👮 <b>${a.name}</b>\n\n` +
      `Username: ${a.username}\n` +
      `🆔 Telegram ID: <code>${a.telegramId}</code>\n` +
      `🎖 Rol: ${a.role}\n` +
      `🗓 Qo'shilgan: ${a.created}`,
  },

  advertiser: {
    menuTitle: '📊 <b>Reklama beruvchi kabineti</b>',
    myCampaigns: '📣 Kampaniyalarim',
    liveFeed: '🔴 Jonli hisobot',
    report: '📈 Hisobot',
    inviteInvalid: '⚠️ Taklif kodi yaroqsiz.',
    linked: (company: string) => `✅ Siz <b>${company}</b> hisobiga ulandingiz.`,
    campaignCard: (title: string, cars: number, active: number, rate: number) =>
      `📣 <b>${title}</b>\n` +
      `🚗 Mashinalar: ${cars}\n` +
      `✅ Tasdiqlangan: ${active}\n` +
      `📈 Faollik: <b>${rate}%</b>`,
    checkReport: (plate: string, campaign: string, when: string) =>
      `✅ <b>REKLAMA FAOL</b>\n\n` +
      `🚗 Mashina: <b>${plate}</b>\n` +
      `📣 Kampaniya: ${campaign}\n` +
      `🕐 Tasdiqlandi: ${when}\n\n` +
      'Quyida joriy holat rasmlari 👇',
    checkMissing: (plate: string, campaign: string) =>
      `⚠️ <b>DIQQAT</b>\n\n` +
      `🚗 Mashina: <b>${plate}</b>\n` +
      `📣 Kampaniya: ${campaign}\n\n` +
      'Haydovchi belgilangan muddatda rasm yubormadi. Administrator xabardor qilindi.',
    dailyDigest: (title: string, ok: number, missing: number, total: number) =>
      `📅 <b>Kunlik hisobot — ${title}</b>\n\n` +
      `🚗 Jami mashina: ${total}\n` +
      `✅ Tasdiqlangan: ${ok}\n` +
      `⚠️ Javobsiz: ${missing}`,
    photoCaption: (plate: string, side: string, when: string) => `🚗 ${plate} · ${side} · ${when}`,

    notLinked:
      'ℹ️ Telegram hisobingiz reklama beruvchi kabinetiga ulanmagan.\n\n' +
      'Administratordan taklif havolasini so\'rang.',
    pickCampaign: '📣 Kampaniyani tanlang:',
    noCampaigns: 'Hozircha sizda kampaniya yo\'q.',
    campaignsTitle: '📣 <b>Kampaniyalarim</b>',
    feedTitle: (title: string) => `🔴 <b>Jonli hisobot — ${title}</b>`,
    feedHint: 'Oxirgi tasdiqlangan tekshiruvlar. Rasmlarni ko\'rish uchun tugmani bosing.',
    feedEmpty: 'Bu kampaniya bo\'yicha hali tasdiqlangan tekshiruv yo\'q.',
    feedItem: (plate: string, when: string) => `✅ <b>${plate}</b> · ${when}`,
    feedPhotoButton: (plate: string, when: string) => `📷 ${plate} · ${when}`,
    photosEmpty: 'Bu tekshiruvda rasm topilmadi.',
    photosFailed: '⚠️ Rasmlarni yuborib bo\'lmadi. Birozdan so\'ng qayta urinib ko\'ring.',
    reportPickPeriod: '📈 Hisobot davrini tanlang:',
    reportPeriodButton: (days: number) => `${days} kun`,
    reportTitle: (days: number) => `📈 <b>Hisobot — oxirgi ${days} kun</b>`,
    reportBody: (s: { cars: number; approved: number; missed: number; rate: number }) =>
      `🚗 Jami mashina: <b>${s.cars}</b>\n` +
      `✅ Tasdiqlangan: <b>${s.approved}</b>\n` +
      `⚠️ Javobsiz: <b>${s.missed}</b>\n` +
      `📈 Bajarilish: <b>${s.rate}%</b>`,
    reportMissedHeader: '⚠️ <b>Javobsiz mashinalar:</b>',
    reportMissedNone: '✅ Javobsiz mashina yo\'q.',
    reportMissedMore: (count: number) => `… va yana ${count} ta.`,
  },

  side: {
    REAR: 'Orqa tomon',
    LEFT: 'Chap chet',
    RIGHT: 'O\'ng chet',
  },

  status: {
    car: { ACTIVE: '🟢 Faol', IDLE: '⚪️ Bo\'sh', MAINTENANCE: '🔧 Ta\'mirda', ARCHIVED: '📦 Arxiv' },
    check: {
      PENDING: '⏳ Kutilmoqda',
      SUBMITTED: '📤 Yuborilgan',
      APPROVED: '✅ Tasdiqlangan',
      REJECTED: '❌ Rad etilgan',
      EXPIRED: '⌛️ Muddati o\'tgan',
      CANCELLED: '🚫 Bekor qilingan',
    },
    campaign: { DRAFT: '📝 Qoralama', ACTIVE: '🟢 Faol', PAUSED: '⏸ To\'xtatilgan', FINISHED: '🏁 Tugagan' },
  },

  validation: {
    OK: '✅ Tekshiruvdan o\'tdi',
    SUSPECT_OLD: '⚠️ Rasm eski (EXIF vaqti mos emas)',
    SUSPECT_NO_EXIF: '⚠️ EXIF yo\'q — galereyadan olingan bo\'lishi mumkin',
    SUSPECT_GEO: '⚠️ Joylashuv ma\'lumoti yo\'q',
    SKIPPED: 'ℹ️ Tekshirilmadi',
  },

  /** Rasm tekshiruvi izohlari — admin ko'radigan qisqa ogohlantirishlar. */
  note: {
    noExifStrict: 'EXIF yo\'q — rasm galereyadan yuborilgan bo\'lishi mumkin',
    noExifLenient: 'EXIF yo\'q — ogohlantirish, rasm qabul qilindi',
    clientTimeFallback: 'Vaqt Mini App dan olindi (EXIF vaqti yo\'q)',
    tooOld: (minutes: number) => `Rasm ${minutes} daqiqa oldin olingan — juda eski`,
    futureTime: 'Rasm vaqti kelajakda — qurilma soati noto\'g\'ri bo\'lishi mumkin',
    noGeo: 'GPS koordinatalari yo\'q',
    duplicatePhoto: 'Bir xil rasm avval yuborilgan (takroriy fayl)',
    exifUnreadable: 'EXIF o\'qilmadi',
  },

  /** Rejalashtiruvchi adminlarga yuboradigan jamlangan xabarlar (spam bo'lmasligi uchun bitta xabar). */
  scheduler: {
    expiredDigestTitle: (count: number) =>
      `⌛️ <b>Javobsiz tekshiruvlar: ${count} ta</b>\n\n` +
      'Quyidagi mashinalar belgilangan muddatda rasm yubormadi:',
    expiredDigestItem: (plate: string, campaign: string, driver: string) =>
      `• <b>${plate}</b> — ${campaign} · ${driver}`,
    expiredDigestMore: (count: number) => `\n… va yana ${count} ta mashina.`,
    driverUnknown: 'haydovchi biriktirilmagan',
  },

  /** Klaviatura tugmalari — faqat qisqa yorliqlar (matnlar yuqoridagi bo'limlarda). */
  kb: {
    close: '✖️ Yopish',
    refresh: '🔄 Yangilash',
    details: '🔎 Batafsil',
    filterAll: '🔁 Hammasi',

    carAssignDriver: '👤 Haydovchi biriktirish',
    carUnassignDriver: '🚫 Haydovchini ajratish',
    carChangeStatus: '🔄 Holatni o\'zgartirish',
    carArchive: '📦 Arxivlash',

    campaignStart: '▶️ Faollashtirish',
    campaignPause: '⏸ To\'xtatish',
    campaignFinish: '🏁 Yakunlash',
    campaignAttachCars: '🚗 Mashina biriktirish',

    driverUnlink: '🚫 Ajratish',

    advertiserCampaigns: '📣 Kampaniyalari',
    advertiserInviteLink: '🔗 Taklif havolasi',
  },

  /** Telegram buyruqlar menyusi (setMyCommands) — qisqa tavsiflar. */
  commands: {
    start: 'Botni ishga tushirish',
    menu: 'Bosh menyu',
    help: 'Yordam va ko\'rsatmalar',
  },
} as const;

export type Dictionary = typeof uz;
