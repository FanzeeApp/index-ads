# 🚂 Railway ga joylash — bosqichma-bosqich qo'llanma

Bu hujjat loyihani noldan Railway da ishga tushirish yo'lini boshidan oxirigacha
ko'rsatadi. Har bir qadamni tartib bilan bajaring — o'tkazib yuborilgan qadam
keyingisini ishlamay qoldiradi.

**Umumiy vaqt:** ~15–20 daqiqa.

---

## ✅ Boshlashdan oldin kerak bo'ladi

| Nima | Qayerdan |
|------|----------|
| Telegram bot tokeni | [@BotFather](https://t.me/BotFather) → `/newbot` |
| Bot username i | O'sha yerda (masalan `my_ads_bot`) |
| Sizning Telegram ID ingiz | [@userinfobot](https://t.me/userinfobot) |
| GitHub akkaunti | [github.com](https://github.com) |
| Railway akkaunti | [railway.app](https://railway.app) — GitHub bilan kiring |
| Yopiq Telegram kanal | Rasmlar arxivi uchun (7-qadamda yaratamiz) |

> ⚠️ **Tokenni hech qayerga ochiq yozmang**: repozitoriy, screenshot, chat — hammasi xavf.
> U faqat Railway → Variables ichida turishi kerak.

---

## 1-qadam. Kodni GitHub ga joylash

Railway GitHub repozitoriyasidan deploy qiladi.

```bash
cd /path/to/Ads-bot

git init
git add .
git commit -m "feat: taksi reklama monitoring boti"
```

GitHub da **yangi private repozitoriy** yarating (masalan `ads-taxi-bot`), so'ng:

```bash
git remote add origin https://github.com/<foydalanuvchi>/ads-taxi-bot.git
git branch -M main
git push -u origin main
```

### 🔍 Tekshirish

GitHub sahifasini oching va ishonch hosil qiling:

- ✅ `railway.json`, `nixpacks.toml`, `package.json`, `prisma/schema.prisma` joyida
- ❌ `.env` fayli **ko'rinmasligi** kerak (u `.gitignore` da)
- ❌ `node_modules/` va `dist/` **ko'rinmasligi** kerak

> Agar `.env` tasodifan yuklangan bo'lsa: uni o'chiring, commit qiling va
> **@BotFather da tokenni darhol yangilang** (`/mybots` → API Token → Revoke).

---

## 2-qadam. Railway loyihasini yaratish

1. [railway.app](https://railway.app) ga kiring → **New Project**
2. **Deploy from GitHub repo** ni tanlang
3. Railway ga repozitoriyaga ruxsat bering (birinchi marta so'raydi)
4. Ro'yxatdan `ads-taxi-bot` ni tanlang

Railway darhol qurishni boshlaydi. **Bu birinchi build yiqiladi — bu normal**,
chunki hali `DATABASE_URL` va `BOT_TOKEN` yo'q. Davom eting.

---

## 3-qadam. PostgreSQL qo'shish

1. Loyiha ichida **+ New** (yoki **Create**) tugmasini bosing
2. **Database** → **Add PostgreSQL**
3. Bir necha soniyada `Postgres` servisi paydo bo'ladi

### DATABASE_URL ni ilovaga ulash

Railway odatda buni o'zi qiladi. Tekshiring:

1. Ilova servisini oching (bazani emas) → **Variables**
2. `DATABASE_URL` bor-yo'qligini ko'ring

Agar yo'q bo'lsa, qo'lda qo'shing:

1. **+ New Variable**
2. Nomi: `DATABASE_URL`
3. Qiymati: `${{Postgres.DATABASE_URL}}`

> Bu yozuv — Railway ning havola sintaksisi. Baza paroli o'zgarsa, qiymat
> avtomatik yangilanadi; parolni qo'lda ko'chirib yozmang.

---

## 4-qadam. Domen olish

Webhook va Mini App uchun HTTPS domen kerak.

1. Ilova servisi → **Settings** → **Networking**
2. **Generate Domain** tugmasini bosing
3. Railway domen beradi, masalan:
   ```
   ads-taxi-bot-production.up.railway.app
   ```
4. Bu manzilni **nusxalab oling** — keyingi qadamda kerak bo'ladi

> Agar **Port** so'ralsa, `3000` kiriting. Ilova Railway bergan `PORT` ni ham
> avtomatik qabul qiladi.

---

## 5-qadam. Webhook siri yaratish

Terminalda tasodifiy satr yarating:

```bash
openssl rand -hex 32
```

Natija 64 belgili satr bo'ladi. Uni saqlab qo'ying — keyingi qadamda `WEBHOOK_SECRET`
sifatida ishlatiladi.

> Windows da: PowerShell da
> `-join ((48..57)+(97..102) | Get-Random -Count 64 | % {[char]$_})`

---

## 6-qadam. Muhit o'zgaruvchilarini kiritish

Ilova servisi → **Variables** → **Raw Editor** (eng tezi) va quyidagini joylang,
burchakli qavslardagi qiymatlarni o'zingiznikiga almashtirib:

```env
BOT_TOKEN=<@BotFather bergan token>
BOT_USERNAME=<bot username, @ belgisisiz>
BOT_MODE=webhook
PUBLIC_URL=https://<4-qadamdagi domen>
WEBHOOK_SECRET=<5-qadamdagi tasodifiy satr>

DATABASE_URL=${{Postgres.DATABASE_URL}}

NODE_ENV=production
LOG_LEVEL=info
HOST=0.0.0.0

SUPER_ADMIN_IDS=<sizning Telegram ID ingiz>

CHECK_INTERVAL_DAYS=3
CHECK_DEADLINE_HOURS=24
CHECK_REMINDER_HOURS=6,18
PHOTO_VALIDATION_MODE=lenient
PHOTO_MAX_AGE_MINUTES=120
```

`ARCHIVE_CHAT_ID` ni hozircha qo'shmang — uni 7-qadamda olamiz.

### ⚠️ Tez-tez uchraydigan xatolar

| Xato | To'g'risi |
|------|-----------|
| `PUBLIC_URL=ads-bot.up.railway.app` | `https://` bilan boshlanishi shart |
| `PUBLIC_URL=https://ads-bot.up.railway.app/` | Oxirida `/` bo'lmasin |
| `BOT_USERNAME=@my_ads_bot` | `@` belgisisiz: `my_ads_bot` |
| `SUPER_ADMIN_IDS=@username` | Faqat raqamli ID |
| `WEBHOOK_SECRET=secret` | Juda qisqa — kamida 16, tavsiya 32+ belgi |

**Save** bosing — Railway avtomatik qayta deploy qiladi.

---

## 7-qadam. Rasmlar arxivi uchun kanal

Railway ning fayl tizimi vaqtinchalik: har deploy da fayllar yo'qoladi. Shuning uchun
rasmlar yopiq Telegram kanalida saqlanadi — bu bepul va cheksiz.

1. Telegramda **yangi kanal** yarating → turi: **Private**
   (nomi, masalan, `Ads-bot arxiv`)
2. Kanal → **Administrators** → **Add Admin** → botingizni qo'shing
   (`Post Messages` huquqi yetarli)
3. Kanal ID sini oling:

   **Eng oson yo'l:** kanalga istalgan xabar yozing → uni
   [@userinfobot](https://t.me/userinfobot) ga **forward** qiling → u
   `Forwarded from chat: -1001234567890` ko'rinishida ID beradi.

   **Muqobil:** kanaldagi xabarni oching → **Copy Link** →
   `t.me/c/1234567890/5` → ID = `-100` + `1234567890` = `-1001234567890`

4. Railway → **Variables** → **+ New Variable**:
   ```
   ARCHIVE_CHAT_ID = -1001234567890
   ```
5. **Save** → avtomatik qayta deploy

> ID **minus** belgisi bilan boshlanadi va odatda `-100` bilan boshlanadi. Minusni
> tushirib qoldirsangiz, rasmlar saqlanmaydi.

---

## 8-qadam. Deploy va migratsiya

Railway `railway.json` dagi buyruqni bajaradi:

```
npm run prisma:migrate && npm start
```

Ya'ni **migratsiyalar har deploy da avtomatik qo'llanadi** — qo'lda hech narsa
qilish shart emas.

### Migratsiya fayllari haqida muhim eslatma

`prisma migrate deploy` faqat **mavjud** migratsiyalarni qo'llaydi, yangisini yaratmaydi.
Agar `prisma/migrations/` papkasi bo'sh bo'lsa, birinchi migratsiyani **mahalliyda**
yarating va GitHub ga yuboring:

```bash
# Mahalliy kompyuterda, .env dagi DATABASE_URL bilan
npm run prisma:dev -- --name init

git add prisma/migrations
git commit -m "chore: boshlang'ich migratsiya"
git push
```

### 🔍 Tekshirish

Railway → **Deployments** → oxirgisini oching → **View Logs**. Quyidagilarni ko'rishingiz kerak:

```
Ma'lumotlar bazasiga ulandi
Bot yig'ildi
HTTP server ishga tushdi
Webhook o'rnatildi
Rejalashtiruvchi ishga tushdi
Bot ishga tushdi
```

Agar o'rniga xato ko'rsangiz — pastdagi [Keng tarqalgan xatolar](#-keng-tarqalgan-xatolar)
bo'limiga qarang.

---

## 9-qadam. Webhook ni tekshirish

Brauzerda oching (tokenni o'zingiznikiga almashtiring va bu manzilni hech kimga
ko'rsatmang):

```
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

Kutilgan javob:

```json
{
  "ok": true,
  "result": {
    "url": "https://ads-taxi-bot-production.up.railway.app/webhook/...",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

| Nima ko'rinsa | Ma'nosi |
|---------------|---------|
| `"url": ""` | Webhook o'rnatilmagan — `BOT_MODE=webhook` va `PUBLIC_URL` ni tekshiring |
| `last_error_message: "Wrong response from the webhook: 404"` | `PUBLIC_URL` noto'g'ri yoki server ko'tarilmagan |
| `last_error_message: "SSL error"` | Domen HTTPS emas |
| `pending_update_count` katta va o'smoqda | Server update larni qayta ishlamayapti — loglarni ko'ring |

### Health-check

Brauzerda oching:

```
https://<sizning-domeningiz>/health
```

`ok` yoki `{"status":"ok"}` ko'rinishidagi javob kelishi kerak. Railway ham aynan shu
manzilni tekshiradi (`railway.json` → `healthcheckPath`).

---

## 10-qadam. @BotFather da Menu Button (Mini App)

**Busiz kamera oqimi ishlamaydi** — bu eng ko'p unutiladigan qadam.

1. [@BotFather](https://t.me/BotFather) → `/mybots` → botingizni tanlang
2. **Bot Settings** → **Menu Button** → **Configure Menu Button**
3. URL kiriting:
   ```
   https://<sizning-domeningiz>/app
   ```
4. Tugma matnini kiriting: `📷 Kamera`

### 🔍 Tekshirish

Botni oching — kiritish maydoni yonida menyu tugmasi paydo bo'lishi kerak. Uni bossangiz
Mini App ochiladi (faol tekshiruv bo'lmagani uchun xabar chiqadi — bu normal).

---

## 11-qadam. Demo ma'lumotlar (ixtiyoriy)

Tizimni tezda sinab ko'rish uchun demo yozuvlar yaratish mumkin.

1. Railway → ilova servisi → o'ng yuqoridagi menyu → **Shell** (yoki
   [Railway CLI](https://docs.railway.app/develop/cli) bilan `railway run`)
2. Bajaring:

```bash
npm run seed
```

Yaratiladi: 1 ta SUPERADMIN, 1 ta demo reklama beruvchi, 1 ta kampaniya,
3 ta mashina (`01A123BC`, `10B456CD`, `30C789EF`) va ular uchun joylashtirishlar.

> Skript **idempotent** — bir necha marta ishga tushirsangiz ham dublikat yaratmaydi.

---

## 12-qadam. Yakuniy tekshiruv

Tartib bilan o'ting:

- [ ] Botga `/start` yubordim — **admin panel** ochildi
- [ ] **🚗 Mashinalar** bo'limi ochiladi
- [ ] Yangi mashina qo'shildi (raqam + etalon rasmlar)
- [ ] Referal havola yaratildi va ikkinchi Telegram akkaunt bilan sinovdan o'tdi
- [ ] Haydovchi mashinaga biriktirildi
- [ ] Reklama beruvchi qo'shildi, taklif havolasi ishladi
- [ ] Kampaniya yaratildi va **faollashtirildi**
- [ ] Mashinalar kampaniyaga biriktirildi
- [ ] `/health` javob beryapti
- [ ] `getWebhookInfo` da xato yo'q
- [ ] Menu Button bosilganda Mini App ochilyapti
- [ ] Loglarda `Rejalashtiruvchi ishga tushdi` bor

Hammasi ✅ bo'lsa — tizim ishlayapti. Birinchi tekshiruv `CHECK_INTERVAL_DAYS`
o'tgach avtomatik yuboriladi.

---

## 📊 Loglarni kuzatish

**Brauzerdan:** Railway → ilova servisi → **Deployments** → **View Logs**

**CLI dan:**

```bash
npm i -g @railway/cli
railway login
railway link          # loyihani tanlang
railway logs
```

### Loglarda nimani qidirish kerak

| Xabar | Ma'nosi |
|-------|---------|
| `Ishga tushirilmoqda` | Jarayon boshlandi, sozlamalar to'g'ri o'qildi |
| `Ma'lumotlar bazasiga ulandi` | Postgres ulanishi joyida |
| `Webhook o'rnatildi` | Telegram bilan bog'lanish tayyor |
| `Rejalashtiruvchi ishga tushdi` | Cron vazifalari faol |
| `Bot ishga tushdi` | ✅ Hammasi tayyor |
| `To'xtatilmoqda` | SIGTERM keldi — deploy yoki restart |
| `Xavfsiz to'xtatish cho'zildi` | Bir bosqich osilib qoldi (15 soniyadan oshdi) |

> Token va `initData` loglarda **hech qachon** ko'rinmaydi — pino ularni avtomatik
> `[maxfiy]` bilan almashtiradi.

---

## ❗ Keng tarqalgan xatolar

### `tsc: not found` yoki `prisma: not found` (build bosqichida)

**Sabab:** `NODE_ENV=production` bo'lganda `npm ci` devDependencies ni o'rnatmaydi.

**Yechim:** `nixpacks.toml` da install bosqichi ataylab `npm ci --include=dev` deb
yozilgan. Agar xato baribir chiqsa, Railway → **Settings** → **Build** da
`nixpacksConfigPath` `nixpacks.toml` ga ishora qilishini tekshiring.

---

### `Environment variable not found: DATABASE_URL`

**Sabab:** Postgres qo'shilmagan yoki o'zgaruvchi ulanmagan.

**Yechim:** 3-qadamni qayta bajaring. `DATABASE_URL` qiymati aynan
`${{Postgres.DATABASE_URL}}` bo'lishi kerak.

---

### `Muhit o'zgaruvchilari noto'g'ri sozlangan: ...`

**Sabab:** `zod` tekshiruvi biror qiymatni rad etdi. Log xabarida **qaysi o'zgaruvchi
va nima uchun** aniq yozilgan.

**Yechim:** Xabardagi o'zgaruvchini 6-qadamdagi jadval bo'yicha to'g'rilang.

---

### `BOT_MODE=webhook bo'lsa PUBLIC_URL majburiy`

**Yechim:** 4-qadamda domen oling va `PUBLIC_URL` ga `https://` bilan yozing.

---

### Healthcheck yiqilyapti (`service unavailable`)

**Sabablar va yechimlar:**

1. Ilova `PORT` ni tinglamayapti → `HOST=0.0.0.0` ekanini tekshiring
2. Migratsiya uzoq davom etyapti → `railway.json` da `healthcheckTimeout` ni oshiring
3. Ishga tushishda xato bo'lgan → loglarni oching

---

### `409 Conflict: terminated by other getUpdates request`

**Sabab:** Bir vaqtda ikki nusxa polling qilyapti (masalan, mahalliy `npm run dev`
ham ishlab turibdi).

**Yechim:** Mahalliy jarayonni to'xtating. Railway da `BOT_MODE=webhook` bo'lishi kerak.

---

### `P3009: migrate found failed migrations`

**Sabab:** Oldingi migratsiya yarim qolgan.

**Yechim:** Railway Shell da:

```bash
npx prisma migrate status
npx prisma migrate resolve --applied <migratsiya-nomi>
```

---

### Rasmlar arxivga tushmayapti

1. `ARCHIVE_CHAT_ID` minus bilan yozilganmi?
2. Bot kanalda **administrator** mi?
3. Loglarda `ARCHIVE_CHAT_ID sozlanmagan` ogohlantirishi bormi?

---

### Haydovchilarga xabar bormayapti

Ketma-ket tekshiring:

1. Kampaniya holati `ACTIVE` mi?
2. Joylashtirish (`Placement`) holati `ACTIVE` mi?
3. Mashina holati `ACTIVE` (yoki hech bo'lmasa `ARCHIVED` emas) mi?
4. Mashinaga **haydovchi biriktirilganmi**? (biriktirilmagan mashinaga tekshiruv
   yuborilmaydi)
5. Haydovchi botni bloklamaganmi?
6. `nextCheckAt` vaqti kelganmi? (`npm run prisma:studio` bilan ko'rish mumkin)

---

## 🔄 Yangilanishlarni chiqarish

```bash
git add .
git commit -m "fix: xato tuzatildi"
git push
```

Railway `main` shoxiga har push da avtomatik deploy qiladi. Deploy paytida:

1. Yangi nusxa quriladi
2. Eski nusxaga **SIGTERM** yuboriladi
3. Ilova xavfsiz to'xtaydi: jadval → update oqimi → HTTP → baza
4. Yangi nusxa ishga tushadi va migratsiyalarni qo'llaydi

> Shuning uchun deploy paytida xabarlar yo'qolmaydi va yarim ishlangan tekshiruv
> buzilmaydi.

### Orqaga qaytarish (rollback)

Railway → **Deployments** → ishlagan versiyani toping → **⋯** → **Redeploy**.

---

## 💰 Taxminiy xarajat

| Nima | Taxminiy narx |
|------|---------------|
| Railway Hobby reja | $5/oy (ishlatilganidan ayiriladi) |
| Ilova (1000+ mashina, kam yuklama) | ~$3–7/oy |
| PostgreSQL | ~$2–5/oy |
| Telegram arxiv | Bepul |

> Aniq raqamlar yuklamaga bog'liq. Railway → **Usage** bo'limida real vaqtda ko'rinadi.

---

## 🔐 Ishlab chiqarishga chiqishdan oldin

- [ ] `WEBHOOK_SECRET` — `openssl rand -hex 32` bilan yaratilgan, tasodifiy
- [ ] `NODE_ENV=production`, `LOG_LEVEL=info`
- [ ] `.env` GitHub ga tushmagan
- [ ] `SUPER_ADMIN_IDS` da faqat ishonchli odamlar
- [ ] Arxiv kanali **yopiq** (private)
- [ ] `PHOTO_VALIDATION_MODE` biznes talabiga mos (`lenient` — tavsiya etiladi)
- [ ] Railway da baza uchun **backup** yoqilgan
- [ ] Token hech qayerda ochiq yozilmagan

---

## 📚 Foydali havolalar

- [Railway hujjatlari](https://docs.railway.app)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [grammY hujjatlari](https://grammy.dev)
- [Prisma hujjatlari](https://www.prisma.io/docs)

---

Loyiha haqida umumiy ma'lumot va mahalliy ishga tushirish: **[README.md](./README.md)**
