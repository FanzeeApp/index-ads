# 🚕 Taksi Reklama Monitoring Boti

Taksoparkdagi mashinalarga yopishtirilgan reklamaning **haqiqatan ham joyida turganini**
davriy foto-hisobot orqali isbotlaydigan Telegram boti.

Muammo oddiy: reklama beruvchi 1000+ mashinaga pul to'laydi, lekin haydovchi yopishtirmani
olib tashlaganini yoki u ko'chib ketganini hech kim bilmaydi. Bu bot shu ishonchsizlikni
yo'qotadi — har bir mashina bo'yicha muntazam, vaqti va manbasi tekshirilgan rasm keladi.

---

## 📋 Mundarija

1. [Loyiha nima qiladi](#-loyiha-nima-qiladi)
2. [Imkoniyatlar](#-imkoniyatlar)
3. [Nega Mini App?](#-nega-mini-app)
4. [Texnologiyalar](#-texnologiyalar)
5. [Loyiha tuzilmasi](#-loyiha-tuzilmasi)
6. [Mahalliy ishga tushirish](#-mahalliy-ishga-tushirish)
7. [Muhit o'zgaruvchilari](#-muhit-ozgaruvchilari)
8. [Botni sozlash (@BotFather)](#-botni-sozlash-botfather)
9. [Foydalanish](#-foydalanish)
10. [Xavfsizlik](#-xavfsizlik)
11. [Muammolarni bartaraf etish](#-muammolarni-bartaraf-etish)

---

## 🎯 Loyiha nima qiladi

Uch xil foydalanuvchi bitta botda ishlaydi:

| Rol | Nima qiladi |
|-----|-------------|
| **Admin / Operator** | Mashina qo'shadi, haydovchi biriktiradi, kampaniya ochadi, statistikani ko'radi |
| **Haydovchi** | Har 3 kunda xabar oladi va mashinasining 3 ta rasmini kameradan oladi |
| **Reklama beruvchi** | Har bir tasdiqlangan tekshiruvni rasmlari bilan avtomatik oladi |

### Asosiy oqim

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. ADMIN TAYYORLAYDI                                                     │
│    Mashina qo'shadi (01A123BC) → etalon rasm → haydovchi biriktiradi     │
│    Biriktirish: @username / telefon / Telegram ID / referal havola       │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. HAYDOVCHI BOTGA ULANADI                                               │
│    Referal havola (t.me/bot?start=ref_XXXX) → /start → mashina biriktir. │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. REJALASHTIRUVCHI (har 10 daqiqada tekshiradi)                         │
│    Muddati kelgan joylashtirish topiladi → CheckRequest yaratiladi       │
│    → haydovchiga xabar + «📷 Kamerani ochish» tugmasi                    │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │  ⏱ 24 soat muddat
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. HAYDOVCHI RASM OLADI (Mini App, faqat kamera)                         │
│    ① Orqa tomon  ② Chap chet  ③ O'ng chet                                │
│    Har rasm: EXIF vaqti + GPS tekshiriladi → arxiv kanalga saqlanadi     │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
                 ▼                                ▼
┌────────────────────────────────┐  ┌──────────────────────────────────────┐
│ 5a. 3 ta rasm keldi            │  │ 5b. Muddat o'tdi                     │
│  → status: SUBMITTED           │  │  → status: EXPIRED                   │
│  → reklama beruvchiga albom    │  │  → adminga jamlangan ogohlantirish   │
│    + «✅ REKLAMA FAOL»          │  │  → reklama beruvchiga «javobsiz»     │
└────────────────────────────────┘  └──────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. KEYINGI TSIKL                                                         │
│    nextCheckAt = hozir + 3 kun → 3-qadamga qaytadi (cheksiz aylanma)     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Rejalashtiruvchi tsikllari

| Vazifa | Davriylik | Nima qiladi |
|--------|-----------|-------------|
| `dispatchChecks` | har 10 daqiqa | Muddati kelgan mashinalarga tekshiruv yuboradi |
| `remindPending` | har 15 daqiqa | 6 va 18 soatdan keyin eslatma beradi |
| `expireChecks` | har 20 daqiqa | 24 soatda javob kelmasa — `EXPIRED` + ogohlantirish |
| `dailyDigest` | har kuni 09:00 | Adminlarga kunlik statistika |
| `cleanup` | har soat | Eskirgan sessiya va referallarni tozalaydi |

> Barcha vaqtlar **Asia/Tashkent** mintaqasida — haydovchilar kechasi bezovta qilinmaydi.

---

## ✨ Imkoniyatlar

### Admin panel (Telegram ichida, alohida sayt kerak emas)
- 🚗 **Mashinalar**: qo'shish, ro'yxat, qidiruv, holat (`Faol / Bo'sh / Ta'mirda / Arxiv`), etalon rasmlar
- 👤 **Haydovchilar**: username / telefon / ID bo'yicha biriktirish, hali botga kirmagan haydovchini oldindan kiritish
- 🔗 **Referal havolalar**: har bir mashina uchun bir martalik havola — haydovchi `/start` bossa avtomatik ulanadi
- 🏢 **Reklama beruvchilar**: taklif kodi bilan Telegram akkauntiga bog'lash
- 📣 **Kampaniyalar**: mashinalarni ommaviy biriktirish, `DRAFT → ACTIVE → PAUSED → FINISHED`
- 📋 **Tekshiruvlar**: qo'lda tasdiqlash / rad etish (sabab bilan)
- 📊 **Statistika**: bajarilish foizi, javobsizlar, kunlik hisobot
- 📢 **Ommaviy xabar**: 1000+ haydovchiga Telegram limitiga rioya qilgan holda (22 xabar/sek)
- 👮 **Adminlar** (faqat superadmin): bot ichidan ADMIN / OPERATOR qo'shish va huquqni olib tashlash

### Haydovchi uchun
- 📷 **Faqat kamera** — jonli kamera oqimi, sahifada fayl tanlash elementi umuman yo'q,
  shuning uchun galereyadan tanlash **tuzilmaviy jihatdan imkonsiz**
- 🔢 Qadamma-qadam: orqa → chap chet → o'ng chet
- ⏰ Avtomatik eslatmalar, aniq muddat ko'rsatilgan
- 🇺🇿 Butun interfeys o'zbek tilida

### Reklama beruvchi uchun
- 🖼 Har bir tasdiqlangan tekshiruv — rasm albomi + mashina raqami + vaqt
- 🟢 «REKLAMA FAOL» statusi
- ⚠️ Javobsiz mashinalar ro'yxati
- 📈 Kampaniya bo'yicha bajarilish foizi

### Rasmning haqiqiyligini tekshirish
| Tekshiruv | Natija |
|-----------|--------|
| EXIF vaqti belgilangan muddatdan eski | `SUSPECT_OLD` |
| EXIF umuman yo'q (galereya/skrinshot alomati) | `SUSPECT_NO_EXIF`¹ |
| GPS koordinatalari yo'q | `SUSPECT_GEO` |
| Bir xil fayl (SHA-256 / `file_unique_id`) qayta yuborilgan | takroriy deb belgilanadi |

¹ Jonli kamera kadri (`captureMode=live`) `canvas` orqali yaratilgani uchun unda EXIF
bo'lmasligi **kutilgan holat** — u `OK` deb belgilanadi, mijoz vaqti esa alohida
tekshiriladi. Batafsil: [Nega Mini App?](#-nega-mini-app)

Qat'iylik `PHOTO_VALIDATION_MODE` bilan boshqariladi: `strict` (rad etadi) · `lenient`
(qabul qiladi, ogohlantirish qo'yadi) · `off` (tekshirmaydi).

---

## 📱 Nega Mini App?

**Bu loyihaning eng muhim texnik qarori — uni tushunib olish kerak.**

Talab shunday edi: haydovchi rasmni **ayni damda kameradan** olsin, galereyadagi eski
rasmni yuborolmasin.

### Telegram Bot API buni qila olmaydi

Oddiy botda haydovchi rasm yuborganda Telegram **rasmning qayerdan kelganini aytmaydi**:

- Bot API da "faqat kameradan yubor" degan parametr **yo'q**;
- rasm skrepka orqali galereyadan tanlanganmi yoki kameradan olinganmi — update da bu
  ma'lumot **umuman bo'lmaydi**;
- Telegram bot ga yuborilgan rasmni siqadi va **EXIF metama'lumotlarini olib tashlaydi**,
  ya'ni vaqt va GPS bo'yicha tekshirish ham ishlamaydi.

Ya'ni faqat bot chati bilan "galereyadan olinmasin" talabini bajarish **texnik jihatdan
imkonsiz**.

### Yechim: Telegram Mini App + jonli kamera oqimi (`getUserMedia`)

Mini App — bot ichida ochiladigan veb-sahifa. U brauzer imkoniyatlariga ega.

**Nega `<input capture="environment">` emas?** Bu birinchi navbatda ko'rinadigan yechim,
lekin u **ishonchli emas**: Android WebView fayl tanlagichi `capture` atributini
e'tiborsiz qoldirib, galereyani ochishi mumkin. Ya'ni talab buzilardi.

Shuning uchun asosiy yo'l — **jonli kamera oqimi**:

```js
// Fayl tanlash oynasi UMUMAN mavjud emas — kadr shu yerda va shu daqiqada olinadi.
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: 'environment' } },   // orqa kamera
});
video.srcObject = stream;
// ... tugma bosilganda:
canvas.getContext('2d').drawImage(video, 0, 0);
canvas.toBlob(blob => upload(blob), 'image/jpeg', 0.92);
```

Bu yondashuvning kuchi — **tuzilmaviy kafolat**: sahifada fayl tanlash elementi yo'q,
shuning uchun galereyadan rasm tanlash texnik jihatdan imkonsiz, atribut qanday
talqin qilinishidan qat'i nazar.

### Ishonch darajalari

| Rasm manbai | `captureMode` | Ishonch |
|---|---|---|
| Mini App jonli kamera oqimi | `live` | ✅ Yuqori — kadr ayni damda olingan |
| Mini App fayl tanlagichi (zaxira) | `fallback` | ⚠️ Past — galereya ehtimoli, izohga yoziladi |
| Bot chatiga yuborilgan rasm | — (`origin: TELEGRAM`) | ⚠️ Past — Telegram EXIF ni o'chiradi |

**Muhim nozik nuqta:** jonli kadr `canvas` orqali yaratiladi va unda **EXIF umuman
bo'lmaydi**. Shuning uchun oddiy "EXIF yo'q → shubhali" qoidasi eng ishonchli yo'lni
noto'g'ri belgilardi. `src/web/routes/upload.ts` dagi `resolveVerdict()` shu teskarilikni
tuzatadi: `live` uchun mijoz vaqti hujjatli manba bo'ladi (15 daqiqadan eski bo'lsa —
`SUSPECT_OLD`), `fallback` uchun esa galereya ehtimoli izohga qo'shiladi.

Har qanday holatda Mini App `initData` ni Telegram imzolaydi → rasmni **kim**
yuborganini kriptografik isbotlash mumkin, va bir martalik token **egasi**
tekshiriladi (begona foydalanuvchi `403` oladi).

### Zaxira yo'l

Kamera ruxsati rad etilsa yoki eski WebView `getUserMedia` ni qo'llab-quvvatlamasa,
Mini App tizim kamerasini fayl tanlagich orqali ochadi (`captureMode=fallback`).
Mini App umuman ochilmasa, haydovchi rasmni bot chatiga yuborishi mumkin — bunday
rasm `origin: TELEGRAM` va `SUSPECT_NO_EXIF` belgisi bilan saqlanadi, admin uni ko'radi
va o'zi qaror qabul qiladi. `strict` rejimda esa bunday rasm umuman qabul qilinmaydi.

---

## 🛠 Texnologiyalar

| Qatlam | Tanlov | Nega |
|--------|--------|------|
| Ishga tushirish muhiti | **Node.js 20+** (ESM) | LTS, zamonaviy `fetch` va `AbortSignal` |
| Til | **TypeScript** (`strict`) | Ish vaqtidagi xatolarni kompilyatsiyada tutadi |
| Telegram | **grammY** + `@grammyjs/runner`, `auto-retry`, `conversations` | Telegraf dan yengilroq, tiplari aniq |
| Baza | **PostgreSQL** + **Prisma** | Railway da bir bosishda, migratsiyalar versiyalanadi |
| HTTP | **Fastify** (+ `helmet`, `rate-limit`, `multipart`, `static`) | Mini App, `/health` va webhook uchun |
| Loglar | **pino** | Tuzilmali JSON, maxfiy maydonlar avtomatik yashiriladi |
| Validatsiya | **zod** | Har bir tashqi ma'lumot chegarada tekshiriladi |
| Jadval | **node-cron** | Tashqi navbat xizmatisiz, ortiqcha murakkablik yo'q |
| Navbat | **p-queue** | Telegram limitiga rioya (22 xabar/sek) |
| EXIF | **exifr** | Rasm vaqti va GPS koordinatalari |
| Testlar | **Vitest** + v8 coverage | 80% qamrov chegarasi |

---

## 📂 Loyiha tuzilmasi

```
Ads-bot/
├── prisma/
│   ├── schema.prisma          # Ma'lumotlar modeli — yagona haqiqat manbai
│   ├── migrations/            # Versiyalangan migratsiyalar
│   └── seed.ts                # Demo ma'lumotlar (idempotent)
│
├── src/
│   ├── index.ts               # Kirish nuqtasi: ulanish, ishga tushirish, graceful shutdown
│   │
│   ├── config/
│   │   ├── env.ts             # Muhit o'zgaruvchilari — zod bilan tekshiriladi
│   │   └── constants.ts       # Biznes chegaralari (sehrli sonlar shu yerda)
│   │
│   ├── core/
│   │   ├── logger.ts          # pino — maxfiy maydonlar yashiriladi
│   │   ├── errors.ts          # AppError, ValidationError, NotFoundError ...
│   │   └── result.ts          # Result<T, E> — xatoni qiymat sifatida qaytarish
│   │
│   ├── db/client.ts           # Prisma singleton + connect/disconnect
│   │
│   ├── i18n/
│   │   ├── uz.ts              # BARCHA o'zbekcha matnlar
│   │   └── index.ts           # `t` lug'ati
│   │
│   ├── utils/                 # Sof funksiyalar (tashqi bog'liqliksiz)
│   │   ├── plate.ts           # Davlat raqami: normalizatsiya va tekshirish
│   │   ├── phone.ts           # +998 formati
│   │   ├── time.ts            # Sana/vaqt hisob-kitoblari
│   │   ├── geo.ts             # Haversine masofasi
│   │   ├── exif.ts            # EXIF o'qish + rasm "yangiligi" hukmi
│   │   ├── html.ts            # HTML escape, uzunlik chegaralari
│   │   └── pagination.ts      # Sahifalash
│   │
│   ├── services/              # Biznes mantiq (Telegram va HTTP dan mustaqil)
│   │   ├── carService.ts          # Mashinalar
│   │   ├── driverService.ts       # Haydovchilar, Telegram akkauntga ulash
│   │   ├── advertiserService.ts   # Reklama beruvchilar, taklif kodi
│   │   ├── campaignService.ts     # Kampaniyalar va joylashtirishlar
│   │   ├── referralService.ts     # Referal havolalar
│   │   ├── checkService.ts        # ⭐️ Tekshiruvlar — tizimning yadrosi
│   │   ├── uploadSessionService.ts# Mini App uchun bir martalik token
│   │   ├── storageService.ts      # Rasmlarni arxiv kanalga saqlash
│   │   ├── notifyService.ts       # Telegramga yuborishning yagona darvozasi
│   │   ├── reportService.ts       # Reklama beruvchiga hisobot
│   │   └── auditService.ts        # Amallar jurnali
│   │
│   ├── bot/
│   │   ├── bot.ts             # Bot yig'ilishi: middleware + handlerlar
│   │   ├── middlewares/       # auth, session, rateLimit, errorBoundary
│   │   ├── keyboards/         # Tugmalar (admin / driver / advertiser)
│   │   └── handlers/
│   │       ├── start.ts       # /start va referal payload
│   │       ├── admin/         # Admin panel
│   │       ├── driver/        # Haydovchi oqimi
│   │       └── advertiser/    # Reklama beruvchi oqimi
│   │
│   ├── web/                   # Fastify: /health, /app (Mini App), /api/upload, webhook
│   │   └── security/initData.ts   # Telegram initData imzosini tekshirish
│   │
│   └── scheduler/
│       ├── index.ts           # Cron jadvallari
│       ├── runJob.ts          # Vazifani xavfsiz bajarish (log + xato ushlash)
│       └── jobs/              # dispatchChecks, remindPending, expireChecks, ...
│
├── tests/                     # Vitest
├── railway.json               # Railway deploy sozlamasi
├── nixpacks.toml              # Qurish bosqichlari
├── Dockerfile                 # Zaxira variant (Nixpacks o'rniga)
├── vitest.config.ts
└── .env.example               # Namuna sozlamalar
```

---

## 🚀 Mahalliy ishga tushirish

### Talablar

- **Node.js 20+** — `node -v`
- **PostgreSQL 14+** — mahalliy yoki Docker
- **Telegram bot** — [@BotFather](https://t.me/BotFather) da yaratilgan

### 1-qadam. Kodni olish va paketlarni o'rnatish

```bash
git clone <repo-manzili> Ads-bot
cd Ads-bot
npm install
```

### 2-qadam. PostgreSQL ni ko'tarish

Docker bilan eng tezi:

```bash
docker run --name adsbot-db \
  -e POSTGRES_PASSWORD=adsbot \
  -e POSTGRES_USER=adsbot \
  -e POSTGRES_DB=adsbot \
  -p 5432:5432 -d postgres:16
```

### 3-qadam. `.env` faylini tayyorlash

```bash
cp .env.example .env
```

So'ng `.env` ni oching va to'ldiring:

```env
BOT_TOKEN=<@BotFather bergan token>
BOT_USERNAME=<bot username, @ siz>
BOT_MODE=polling          # mahalliyda polling — domen kerak emas
DATABASE_URL=postgresql://adsbot:adsbot@localhost:5432/adsbot
SUPER_ADMIN_IDS=5606183694   # superadmin(lar) — vergul bilan
NODE_ENV=development
LOG_LEVEL=debug
```

> Telegram ID ingizni [@userinfobot](https://t.me/userinfobot) dan oling.
> `.env` fayli `.gitignore` da — u **hech qachon** repozitoriyga tushmaydi.

### 4-qadam. Migratsiya va demo ma'lumotlar

```bash
npm run prisma:generate   # Prisma mijozini yaratish
npm run prisma:dev        # Migratsiyalarni qo'llash (dev rejimi)
npm run seed              # Demo: 1 admin, 1 reklama beruvchi, 1 kampaniya, 3 mashina
```

### 5-qadam. Ishga tushirish

```bash
npm run dev               # tsx watch — kod o'zgarsa avtomatik qayta yuklanadi
```

Telegramda botingizga `/start` yuboring — admin panel ochilishi kerak.

> **Eslatma:** `BOT_MODE=polling` da Mini App ishlamaydi, chunki u HTTPS domen talab qiladi.
> Mahalliyda Mini App ni sinash uchun [ngrok](https://ngrok.com) dan foydalaning:
> `ngrok http 3000` → olingan HTTPS manzilni `PUBLIC_URL` ga yozing.

### Foydali buyruqlar

| Buyruq | Vazifasi |
|--------|----------|
| `npm run dev` | Ishlab chiqish rejimi (avtoqayta yuklash) |
| `npm run build` | TypeScript → `dist/` |
| `npm start` | Yig'ilgan ilovani ishga tushirish |
| `npm run typecheck` | Faqat tiplarni tekshirish |
| `npm run lint` | ESLint |
| `npm test` | Testlar |
| `npm run test:cov` | Testlar + qamrov hisoboti |
| `npm run prisma:studio` | Bazani brauzerda ko'rish |
| `npm run prisma:migrate` | Migratsiyalarni qo'llash (ishlab chiqarish) |
| `npm run seed` | Demo ma'lumotlar |

---

## ⚙️ Muhit o'zgaruvchilari

| Nomi | Majburiy | Tavsif | Namuna |
|------|:--------:|--------|--------|
| `BOT_TOKEN` | ✅ | @BotFather bergan token. **Hech qachon kodga yozilmaydi.** | `123456789:AA...` |
| `BOT_USERNAME` | ✅ | Bot username i, `@` belgisisiz. Referal havolalar shundan quriladi | `my_ads_bot` |
| `BOT_MODE` | ➖ | `polling` (mahalliy) yoki `webhook` (ishlab chiqarish). Standart: `polling` | `webhook` |
| `PUBLIC_URL` | ⚠️ | Ilovaning HTTPS manzili. `BOT_MODE=webhook` bo'lsa **majburiy** | `https://ads-bot.up.railway.app` |
| `WEBHOOK_SECRET` | ⚠️ | Webhook yo'lini himoyalaydigan tasodifiy satr (32+ belgi). `webhook` da **majburiy** | `openssl rand -hex 32` natijasi |
| `DATABASE_URL` | ✅ | PostgreSQL ulanish satri. Railway da avtomatik beriladi | `postgresql://user:pass@host:5432/db` |
| `PORT` | ➖ | HTTP port. Railway o'zi beradi. Standart: `3000` | `3000` |
| `HOST` | ➖ | Tinglash manzili. Standart: `0.0.0.0` | `0.0.0.0` |
| `SUPER_ADMIN_IDS` | ✅ | Vergul bilan ajratilgan Telegram ID lar. **Birinchisi — SUPERADMIN** | `123456789,987654321` |
| `ARCHIVE_CHAT_ID` | ➖ | Rasmlar saqlanadigan yopiq kanal ID si. Bo'lmasa rasmlar qayta yuborilmaydi | `-1001234567890` |
| `CHECK_INTERVAL_DAYS` | ➖ | Tekshiruvlar orasidagi kunlar. Standart: `3` | `3` |
| `CHECK_DEADLINE_HOURS` | ➖ | Haydovchiga beriladigan muddat (soat). Standart: `24` | `24` |
| `CHECK_REMINDER_HOURS` | ➖ | Eslatma soatlari (muddat boshidan). Standart: `6,18` | `6,18` |
| `PHOTO_VALIDATION_MODE` | ➖ | `strict` / `lenient` / `off`. Standart: `lenient` | `lenient` |
| `PHOTO_MAX_AGE_MINUTES` | ➖ | Rasm shu daqiqadan eski bo'lsa shubhali. Standart: `120` | `120` |
| `NODE_ENV` | ➖ | `production` / `development` / `test` | `production` |
| `LOG_LEVEL` | ➖ | `fatal`…`trace`. Standart: `info` | `info` |

> ⚠️ — shartli majburiy. Ilova ishga tushganda barcha o'zgaruvchilar `zod` bilan
> tekshiriladi: biror qiymat noto'g'ri bo'lsa, jarayon **darhol va aniq xabar bilan**
> to'xtaydi — yarim ishlaydigan holat bo'lmaydi.

---

## 🤖 Botni sozlash (@BotFather)

### 1. Botni yaratish

1. [@BotFather](https://t.me/BotFather) ga yozing → `/newbot`
2. Nom va username bering (username `bot` bilan tugashi shart)
3. Berilgan tokenni **faqat** `.env` yoki Railway Variables ga joylang

### 2. Mini App (Menu Button) ni ulash — **eng muhim qadam**

Kamera oqimi shusiz ishlamaydi:

1. @BotFather → `/mybots` → botingizni tanlang
2. **Bot Settings** → **Menu Button** → **Configure Menu Button**
3. URL sifatida kiriting:
   ```
   https://<sizning-domeningiz>/app
   ```
   Masalan: `https://ads-bot-production.up.railway.app/app`
4. Tugma matnini kiriting: `📷 Kamera`

> Domen **HTTPS** bo'lishi shart. Railway generatsiya qiladigan domen tayyor HTTPS.

### 3. Arxiv kanal yaratish

Railway ning diski vaqtinchalik — deploy da fayllar yo'qoladi. Shuning uchun rasmlar
yopiq Telegram kanalida saqlanadi (bepul va cheksiz):

1. Telegramda **yopiq kanal** yarating (masalan: `Ads-bot arxiv`)
2. Botingizni kanalga **administrator** qilib qo'shing
   (`Post Messages` huquqi yetarli)
3. Kanal ID sini oling — uchta usuldan biri:

   **a)** Kanalga istalgan xabar yuboring → uni **@userinfobot** ga forward qiling →
   u `Forwarded from chat: -100...` ko'rinishida ID beradi.

   **b)** Kanaldagi xabarni oching → "Copy Link" → havola `t.me/c/1234567890/5` ko'rinishida
   bo'ladi → ID = `-100` + `1234567890` = `-1001234567890`

   **c)** Brauzerda oching (tokenni hech kimga ko'rsatmang):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Javobdagi `"chat":{"id":-100...}` qiymatini oling.

4. Olingan ID ni `ARCHIVE_CHAT_ID` ga yozing (minus belgisi bilan birga).

### 4. Tavsiya etiladigan sozlamalar

@BotFather da:
- `/setdescription` — botning qisqa tavsifi
- `/setabouttext` — profil matni
- `/setuserpic` — avatar
- `/setprivacy` → **Enable** (bot guruhlarda ortiqcha xabar o'qimaydi)

---

## 📖 Foydalanish

### Admin: birinchi ishga tushirish

1. Botga `/start` yuboring. `SUPER_ADMIN_IDS` da ID ingiz bo'lsa, admin panel ochiladi.
2. **🚗 Mashinalar → ➕ Mashina qo'shish**
   - Davlat raqami: `01A123BC`
   - Model: `Cobalt` · Rang: `Oq`
   - **Etalon rasmlar**: 3 ta rasm (orqa, chap chet, o'ng chet) — keyinchalik haydovchi
     yuborgan rasmlar shular bilan solishtiriladi
3. **Haydovchi biriktirish** — ikki yo'l:

   | Yo'l | Qachon qulay |
   |------|--------------|
   | `@username` / telefon / Telegram ID yuborish | Haydovchi allaqachon botda bo'lsa |
   | **🔗 Havola yaratish** | Haydovchi hali botga kirmagan bo'lsa |

   Referal havola `https://t.me/<bot>?start=ref_XXXXXXXX` ko'rinishida bo'ladi. Uni
   haydovchiga yuboring — u `/start` bosishi bilan **aynan shu mashinaga** biriktiriladi.

4. **🏢 Reklama beruvchilar → ➕ qo'shish** → kompaniya nomi va aloqa ma'lumotlari.
   Yaratilgandan keyin **🔗 Taklif havolasi** oling va reklama beruvchiga yuboring —
   u `/start` bossa, o'z kabinetini ko'radi.

5. **📣 Kampaniyalar → ➕ yaratish** → reklama beruvchini tanlang → **🚗 Mashina biriktirish**
   → **▶️ Faollashtirish**.

   ✅ Shu daqiqadan boshlab rejalashtiruvchi avtomatik ishlaydi.

### Superadmin: admin qo'shish va olib tashlash

Bot ichida: **/admin → 👮 Adminlar**. Bu tugma **faqat superadminga** ko'rinadi va
har bir amal alohida tekshiriladi — tugmani yashirish o'zi himoya hisoblanmaydi.

| Amal | Qanday |
|------|--------|
| **Admin qo'shish** | ➕ Admin qo'shish → `@username`, Telegram ID yoki telefon yuboring. Eng qulayi: o'sha odamning xabarini **forward** qiling |
| **Rolni tanlash** | 🛠 Admin (to'liq panel) yoki 👁 Operator |
| **Rolni o'zgartirish** | Admin kartochkasi → 🔁 Rolni o'zgartirish |
| **Huquqni olib tashlash** | Admin kartochkasi → ❌ Huquqni olib tashlash → tasdiqlash |

**Qoidalar (kodda majburlanadi):**

- 🔒 **SUPERADMIN bot orqali berilmaydi va olinmaydi** — u faqat `SUPER_ADMIN_IDS`
  (Railway → Variables) bilan boshqariladi. Aks holda kimdir o'zini to'liq nazoratga
  ko'tarib, sizni qulflab qo'yishi mumkin edi.
- 👤 Huquq beriladigan odam **avval botga `/start` bosgan bo'lishi shart**. Botda yo'q
  `@username` uchun yozuv yaratilmaydi (username egallab olish hujumining oldi olinadi).
- 🙅 O'zingizdan huquqni olib tashlay olmaysiz.
- 🏢 Reklama beruvchiga admin huquqi berilmaydi — rollar aralashmasligi uchun.
- 📝 Har bir berish/olish audit jurnaliga yoziladi (kim, kimga, qaysi rol).

Huquq olingan foydalanuvchi oddiy haydovchi (`DRIVER`) roliga qaytadi va panelga
kira olmaydi. Yangi adminga esa bot avtomatik xabar yuboradi.

### Haydovchi: kundalik oqim

1. Botdan xabar keladi: «📸 Reklama holatini tasdiqlash — 01A123BC, muddat: 24 soat»
2. **📷 Kamerani ochish** tugmasini bosadi → Mini App ochiladi
3. Ketma-ket 3 ta rasm oladi: orqa → chap chet → o'ng chet (**faqat kamera**)
4. «✅ Rahmat! Rasmlar qabul qilindi» xabarini oladi
5. Reklama beruvchi o'sha zahoti albom + «REKLAMA FAOL» statusini oladi

### Reklama beruvchi

- `/start` (taklif havolasi orqali) → kabinet ochiladi
- Har bir tasdiqlangan tekshiruv avtomatik keladi
- Kampaniya bo'yicha statistika va javobsiz mashinalar ro'yxati mavjud

---

## 🔒 Xavfsizlik

| Chora | Qanday amalga oshirilgan |
|-------|--------------------------|
| **Sirlar kodda yo'q** | Token va parollar faqat muhit o'zgaruvchilarida. `.env` — `.gitignore` da |
| **Loglar tozaligi** | pino `redact` — `token`, `initData`, `WEBHOOK_SECRET` avtomatik `[maxfiy]` bilan almashtiriladi |
| **Mini App autentifikatsiyasi** | `initData` HMAC-SHA256 imzosi bot tokeni bilan tekshiriladi (`src/web/security/initData.ts`) |
| **Webhook himoyasi** | Sir yo'lning bir qismida **va** Telegram `X-Telegram-Bot-Api-Secret-Token` sarlavhasi tekshiriladi |
| **Bir martalik token** | Har bir yuklash sessiyasi cheklangan muddatga amal qiladi va ishlatilgach bekor bo'ladi |
| **Rollar** | Har bir handler `auth` middleware dan o'tadi; admin amallari `SUPERADMIN`/`ADMIN` bilan cheklangan |
| **Rate limiting** | Botda ham, HTTP qatlamida ham (`@fastify/rate-limit`) |
| **SQL inyeksiya** | Prisma barcha so'rovlarni parametrlaydi — xom SQL ishlatilmaydi |
| **XSS** | Foydalanuvchi matni Telegramga chiqishdan oldin `escapeHtml` dan o'tadi |
| **HTTP sarlavhalari** | `@fastify/helmet` |
| **Fayl chegaralari** | Hajm, MIME turi va minimal o'lcham tekshiriladi |

### Nima qilmaslik kerak

- ❌ Tokenni chatga, screenshotga yoki repozitoriyga joylash
- ❌ `WEBHOOK_SECRET` ni oddiy so'z qilib qo'yish (`openssl rand -hex 32` ishlating)
- ❌ `SUPER_ADMIN_IDS` ga ishonchsiz odamlarni qo'shish
- ❌ Bazani internetga ochiq qoldirish

> Token tasodifan oshkor bo'lsa: @BotFather → `/mybots` → **API Token** → **Revoke** →
> yangi tokenni Railway Variables ga yozing.

---

## 🔧 Muammolarni bartaraf etish

<details>
<summary><b>Bot javob bermayapti</b></summary>

1. Loglarni ko'ring: Railway → **Deployments** → **View Logs**
2. `BOT_TOKEN` to'g'riligini tekshiring
3. Webhook holatini ko'ring:
   `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
   — `last_error_message` bo'sh bo'lishi kerak
4. `PUBLIC_URL` haqiqiy domenga to'g'ri kelishini tekshiring (oxirida `/` bo'lmasin)
</details>

<details>
<summary><b>Kamera ochilmayapti / Mini App bo'sh</b></summary>

1. @BotFather → Menu Button URL `https://<domen>/app` ekanini tekshiring
2. Domen **HTTPS** bo'lishi shart. Bu ikki sababga ko'ra majburiy: Telegram Mini App
   HTTPS talab qiladi **va** `getUserMedia` faqat xavfsiz kontekstda ishlaydi —
   HTTP da kamera umuman ochilmaydi.
3. Telegram ilovasini yangilang — eski versiyalar Mini App ni qo'llamaydi
4. Brauzerda `https://<domen>/app` ni oching: sahifa yuklanishi kerak
   (token bo'lmagani uchun xato xabari chiqadi — bu normal)
</details>

<details>
<summary><b>«Kameraga ruxsat berilmadi» xabari chiqyapti</b></summary>

Mini App kameraga kirish uchun **ikki bosqichli** ruxsat talab qiladi:

1. **Telegram ilovasiga** — telefon sozlamalarida:
   - iOS: Sozlamalar → Telegram → Kamera
   - Android: Sozlamalar → Ilovalar → Telegram → Ruxsatlar → Kamera
2. **Mini App sahifasiga** — kamera birinchi marta yoqilganda Telegram so'raydi.
   Rad etilgan bo'lsa, oynani yopib qaytadan oching.

Ruxsat baribir berilmasa, Mini App avtomatik ravishda **zaxira yo'lga** o'tadi:
tizim kamerasini fayl tanlagich orqali ochadi. Bunday rasm `captureMode=fallback`
bilan belgilanadi va admin panelida ogohlantirish izohi bilan ko'rinadi — chunki bu
holatda galereyadan tanlash ehtimolini istisno qilib bo'lmaydi.
</details>

<details>
<summary><b>`Environment variable not found: DATABASE_URL`</b></summary>

Railway da PostgreSQL plagini qo'shilmagan yoki bog'lanmagan.
**New → Database → PostgreSQL** qo'shing, so'ng ilova servisida
`DATABASE_URL = ${{Postgres.DATABASE_URL}}` ekanini tekshiring.
</details>

<details>
<summary><b>`P3009` yoki migratsiya xatosi</b></summary>

Migratsiya yarim qolgan. Railway shell da:
```bash
npx prisma migrate status
npx prisma migrate resolve --applied <migratsiya-nomi>
```
</details>

<details>
<summary><b>Rasmlar arxivga saqlanmayapti</b></summary>

1. `ARCHIVE_CHAT_ID` kiritilganmi (minus bilan: `-100...`)?
2. Bot o'sha kanalda **administrator** mi?
3. Loglarda `Bot instansiyasi berilmagan` yoki `ARCHIVE_CHAT_ID sozlanmagan`
   ogohlantirishini qidiring.
</details>

<details>
<summary><b>Haydovchilar xabar olmayapti</b></summary>

1. Mashina holati `ACTIVE` mi?
2. Mashinaga haydovchi biriktirilganmi?
3. Kampaniya holati `ACTIVE` mi?
4. Haydovchi botni bloklamaganmi? (`User.isBlocked` maydoni)
5. Joylashtirishning `nextCheckAt` vaqti kelganmi?
</details>

<details>
<summary><b>Build yiqilyapti: <code>tsc: not found</code></b></summary>

`NODE_ENV=production` bo'lganda `npm ci` devDependencies ni o'rnatmaydi.
`nixpacks.toml` da install bosqichi ataylab `npm ci --include=dev` bilan yozilgan —
uni o'zgartirmang.
</details>

---

## 📄 Litsenziya

Xususiy loyiha. Barcha huquqlar himoyalangan.

---

## 🔗 Qo'shimcha

Railway ga joylash bo'yicha bosqichma-bosqich qo'llanma: **[DEPLOY.md](./DEPLOY.md)**
