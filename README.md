# UVIX — Moliyaviy hisob-kitob tizimi (mustaqil versiya)

Bu — Claude'dan mustaqil ishlaydigan, **haqiqiy backend va SQLite bazasi**
bilan quyilgan to'liq versiya. O'zingizning serveringizga yoki istalgan
hosting xizmatiga joylab ishlata olasiz.

## Tuzilishi

```
uvix-app/
  backend/     Express server + SQLite baza (Node.js)
  frontend/    React + Vite ilova (brauzerda ishlaydigan qism)
```

Frontend backend bilan oddiy REST API orqali gaplashadi
(`GET/PUT/DELETE /api/kv/:key`). Barcha ma'lumot (`tushumlar`, `rasxodlar`,
`xodimlar`, `kategoriyalar`, `o'zgarishlar tarixi`) shu orqali
`backend/uvix.db` faylida saqlanadi.

## 1. Lokal ishga tushirish

Kerak bo'ladigan narsa: [Node.js](https://nodejs.org) 18 yoki undan yuqori versiya.

### Backend

```bash
cd backend
npm install
npm start
```

Server `http://localhost:4000` da ishga tushadi. Baza avtomatik
`backend/uvix.db` faylida yaratiladi — hech qanday qo'shimcha sozlash shart emas.

### Frontend (development rejimida)

Yangi terminalda:

```bash
cd frontend
npm install
cp .env.example .env      # kerak bo'lsa VITE_API_BASE ni o'zgartiring
npm run dev
```

Brauzerda `http://localhost:5173` ni oching. Standart admin bilan kiring:
**Administrator** / PIN **0000** (birinchi kirishdan keyin darhol PIN'ni
Sozlamalar bo'limidan o'zgartiring).

## 2. Production uchun build qilish

```bash
cd frontend
npm run build
```

Bu `frontend/dist` papkasini yaratadi. Backend server (`server.js`) shu
papkani avtomatik xizmat qiladi — ya'ni **bitta serverni** ishga tushirsangiz
kifoya:

```bash
cd backend
npm install
npm start
```

Endi `http://localhost:4000` manzilida ham API, ham tayyor ilova birga ishlaydi.

## 3. Hostingga joylash

Bir nechta yo'l bor, eng oddiyi:

### A) Bitta VPS (masalan DigitalOcean, Timeweb, Beget, Hetzner)

1. Node.js o'rnating (`nvm install 20` yoki paket menejeringiz orqali)
2. Loyihani serverga yuklang (`git clone` yoki `scp`)
3. `frontend`da `npm install && npm run build`
4. `backend`da `npm install`
5. Serverni doimiy ishlab turishi uchun `pm2` ishlating:
   ```bash
   npm install -g pm2
   cd backend
   pm2 start server.js --name uvix
   pm2 save
   pm2 startup
   ```
6. Nginx orqali 80/443 portdan `localhost:4000` ga proxy qiling, SSL uchun
   `certbot` bilan bepul HTTPS sertifikat oling.

### B) Render / Railway / Fly.io kabi PaaS xizmatlar

- Backend'ni alohida "Web Service" sifatida joylang (`backend` papkasi,
  build: `npm install`, start: `npm start`).
  - **Muhim:** bu xizmatlarning ko'pchiligida disk vaqtinchalik bo'ladi —
    SQLite fayli qayta deploy qilinganda o'chib ketishi mumkin. Doimiy
    saqlash uchun "persistent volume/disk" qo'shing, yoki pastdagi
    "boshqa bazaga o'tish" bo'limiga qarang.
- Frontend'ni Vercel/Netlify'ga joylang (build: `npm run build`,
  publish: `dist`), `VITE_API_BASE` environment variable'ini backend
  manziliga o'rnating (masalan `https://uvix-backend.onrender.com/api`).

### C) Boshqa (kuchliroq) bazaga o'tish

Hozirgi baza — SQLite, kichik-o'rta biznes uchun yetarli va tez. Agar
kelajakda PostgreSQL yoki MySQL'ga o'tmoqchi bo'lsangiz, faqat
`backend/db.js` va `backend/server.js` dagi so'rovlarni almashtirish kifoya —
API shakli (`/api/kv/:key`) o'zgarishsiz qoladi, frontend'ga tegish shart emas.

## 4. Xavfsizlik bo'yicha MUHIM eslatmalar

Bu versiya kichik jamoa ichida ishlatish uchun mo'ljallangan oddiy tizim.
Real biznes ma'lumotlari (pul summalari) bilan ishlatishdan oldin quyidagilarni
qo'shishni tavsiya qilamiz:

- **HTTPS** — ma'lumotlar shifrlanmagan holda yuborilmasligi uchun backend'ni
  albatta SSL bilan joylang (Nginx + certbot yoki hosting'ning o'z SSL'i).
- **Haqiqiy autentifikatsiya** — hozirgi PIN tizimi backend'da hech qanday
  himoyasiz saqlanadi va tekshiriladi (frontend orqali). Production uchun:
  - PIN/parolni backend'da **hash** qilib saqlang (masalan `bcrypt`)
  - Login endpoint'ini backend'ga ko'chiring (`POST /api/login`), frontend
    faqat token oladi
  - So'rovlarni JWT yoki session cookie bilan himoyalang
- **Backup** — `backend/uvix.db` faylini muntazam zaxira nusxalang
  (masalan kunlik `cron` job orqali boshqa joyga nusxalash).
- **CORS** — `server.js`da hozir barcha domenlarga ruxsat berilgan
  (`cors()`), production'da faqat o'z frontend domeningizga cheklang:
  ```js
  app.use(cors({ origin: "https://sizning-domeningiz.uz" }));
  ```

## 5. Excel eksport va PDF

Excel eksport (`xlsx` kutubxonasi) va PDF hisobot (brauzer print) to'liq
frontend'da ishlaydi — internetga yoki qo'shimcha serverga bog'liq emas.

## Savol tug'ilsa

Kod tuzilishi asosiy Claude artifact versiyasi bilan bir xil (bir xil
komponentlar, bir xil kategoriyalar, bir xil dashboard mantiqi) — faqat
ma'lumotlar endi `window.storage` o'rniga `backend/uvix.db`da saqlanadi
(`frontend/src/storage.js` shu ulanishni ta'minlaydi).

---

## 🚀 Railway'ga joylashtirish (deploy) — bepul, doimiy internet manzili bilan

Bu loyiha Railway'ga bir necha bosqichda joylashtiriladi. Backend endi
**haqiqiy autentifikatsiya** (JWT token, bcrypt bilan hash qilingan PIN)
bilan himoyalangan — quyida yozilgan eski xavfsizlik eslatmalari endi
qo'llanilmaydi, faqat deploy bosqichlariga e'tibor bering.

### 1. GitHub'ga yuklang
Shu `uvix-app` papkasidagi barcha fayllarni GitHub repository'ga yuklang
(Android APK loyihasida qilganingizga o'xshab — "uploading an existing
file" orqali).

### 2. Railway'da loyiha yarating
1. https://railway.app ga kiring, GitHub orqali ro'yxatdan o'ting
2. **"New Project"** → **"Deploy from GitHub repo"** → repongizni tanlang
3. Railway avtomatik `package.json` va `railway.json`ni topib, build/start
   jarayonini o'zi boshlaydi (qo'shimcha sozlash shart emas)

### 3. Doimiy disk (Volume) qo'shing — bu qadam SHART!
Aks holda ma'lumotlaringiz har safar server qayta ishga tushganda o'chib
ketadi:
1. Loyiha sahifasida **"Settings"** → **"Volumes"** → **"New Volume"**
2. Mount path: `/data`
3. **"Variables"** bo'limiga o'ting, yangi o'zgaruvchi qo'shing:
   - Nomi: `DB_PATH`
   - Qiymati: `/data/uvix.db`

### 4. Doimiy domenni oling
**"Settings"** → **"Networking"** → **"Generate Domain"** — sizga
`https://uvix-production.up.railway.app` kabi doimiy HTTPS manzil beriladi.

### 5. Tayyor!
Shu manzilni istalgan qurilmada (kompyuter, iPhone, Android) ochib
ishlatishingiz mumkin — standart **Administrator / 0000** bilan kirasiz,
so'ng PIN'ni albatta o'zgartiring (Sozlamalar → Profil).

---

## 🔒 1-bosqich: xavfsizlik yangilanishi (2026-09)

**Yopilgan teshiklar:**
- `POST /api/auth/reset-admin-pin` olib tashlandi (internetdagi har kim admin PIN'ini 0000 ga qaytara olardi). Endi faqat server konsolidan: `node backend/reset-admin-pin.js [yangiPIN]`
- Oddiy xodim endi o'zini admin qila olmaydi, boshqalarning PIN'ini o'zgartira olmaydi — faqat o'z PIN'ini
- PIN hash'lari brauzerga umuman yuborilmaydi
- Telegram token, Gmail parol, Telegram sessiya — faqat admin ko'radi
- Backup yuborish, Telegram ulash/uzish, KV o'chirish — faqat admin
- Xodim o'chirilsa yoki roli o'zgarsa — darhol kuchga kiradi (token 12 soat kutmaydi)
- Oxirgi administratorni o'chirib bo'lmaydi
- PIN tiklash kodi: kriptografik tasodifiy, 5 ta xato urinishdan keyin bekor bo'ladi
- JWT kaliti doimiy diskda (`/data/uvix.secret`) — deploy'dan keyin hamma chiqib ketmaydi
- CORS standart holatda yopiq, xavfsizlik header'lari qo'shildi

**Yangi (ixtiyoriy) environment o'zgaruvchilari:**
- `JWT_SECRET` — o'zingiz bergan kalit (bo'lmasa avtomatik yaratiladi)
- `CORS_ORIGIN` — frontend boshqa domenda bo'lsa, masalan `https://uvix.uz`

---

## 🔑 Yangi kirish tizimi (2026-09)

- **Xodim kartochkalari** — ism yozish o'rniga avatar bosiladi (6 tadan ko'p xodim bo'lsa qidiruv chiqadi)
- **PIN klaviatura** — ekrandagi katta tugmalar, jismoniy klaviatura ham ishlaydi, xato bo'lsa silkinish + tebranish
- **Face ID / Touch ID / barmoq izi** (WebAuthn passkey) — PIN bilan birinchi kirishdan keyin taklif qilinadi, Sozlamalar → "Face ID bilan kirish" bo'limidan ham boshqariladi
- Login cheklovi endi IP + xodim bo'yicha — bir ofisdagi xodimlar bir-birini bloklamaydi

**Talablar:** Face ID faqat **HTTPS** orqali ishlaydi (Railway domeni HTTPS — muammo yo'q) yoki `localhost`da.

**Ixtiyoriy env:** agar domen almashsa yoki bir nechta domen bo'lsa:
- `WEBAUTHN_RP_ID` — masalan `uvix.uz`
- `WEBAUTHN_ORIGIN` — masalan `https://uvix.uz`

⚠️ Face ID kalitlari domenga bog'langan: `*.up.railway.app` dan o'z domeningizga o'tsangiz, xodimlar Face ID'ni qaytadan yoqishi kerak bo'ladi.

---

## 🗂️ Frontend tuzilishi (2-bosqich: App.jsx bo'lindi)

Oldin hamma narsa bitta 5 300+ qatorli `App.jsx` faylida edi. Endi:

```
frontend/src/
  App.jsx                  asosiy holat (state) va sahifalar orasida o'tish (~640 qator)
  main.jsx                 kirish nuqtasi
  storage.js               backend API bilan ishlash
  theme.js                 ranglar, mavzu (THEME, setTheme, buildTheme)
  constants.js             menyu, kategoriyalar, to'lov turlari, dashboard vidjetlari
  lib/
    format.js              summa, sana formatlash, uid
    finance.js             buyurtma qarzi, moliyaviy hisob-kitoblar, davrlar
    excel.js               Excel eksport
    kv.js                  storageGet / storageSet
  components/
    ui.jsx                 Card, Button, Modal, Field, Badge, Pagination...
    Layout.jsx             Sidebar, Topbar
  auth/                    kirish ekrani, Face ID
  views/
    Dashboard.jsx
    orders/                OrdersView, OrderForm, PaymentsModal
    crm/                   CRMView (lidlar), ChatsView (Telegram)
    expenses/              ExpenseView, TransactionForm
    OperationsView.jsx, ReportView.jsx, CategoriesView.jsx, EmployeesView.jsx
    settings/              SettingsView, AppearanceSection, TrashSection, DashboardConstructorSection
```

**Mavzu (THEME) haqida:** rangni o'zgartirish uchun `THEME = ...` emas, `setTheme(buildTheme(...))` ishlating —
ES modullarda import qilingan o'zgaruvchini to'g'ridan-to'g'ri qayta yozib bo'lmaydi.

---

## 🎨 Yangi dizayn (2026-09)

- **Tungi** (standart) — qorong'i premium uslub, kirish ekrani bilan bir xil. **Tiniq** — yorug', sokin uslub. Almashtirish: Sozlamalar → Ko'rinish → Rejim
- **Pastki menyu (telefonda):** Asosiy · Buyurtma · **+** · Rasxod · Yana. "+" tugmasi yangi buyurtma yoki rasxod formasini to'g'ridan-to'g'ri ochadi, "Yana" esa to'liq menyuni
- **Buyurtmalar (telefonda):** qidiruv, filtr tugmasi (Excel amallari shu yerda) va "Hammasi / Qarzdorlar / To'langan" tanlovi
- Shriftlar: Onest (matn), Unbounded (Tungi rejimda katta raqamlar)
- Qattiq yozilgan oq/och ranglar (20+ joy) mavzu ranglariga o'tkazildi — ikkala rejimda ham to'g'ri ko'rinadi

Eslatma: agar kimdir oldin Sozlamalarda "Light" rejimni saqlagan bo'lsa, ilova Tiniq rejimda ochiladi — Tungi'ga o'tish uchun Sozlamalardan tanlang.

---

## 🎨🖨️ Dizayner va Pechatchi (2026-09)

**Yangi rollar:** Xodimlar → Xodim qo'shish → Rol: *Dizayner* yoki *Pechatchi*.

**Jarayon:**
1. Menejer CRM'da lidni **Jarayonda (Dizayn)** ga o'tkazadi → oyna ochiladi: mas'ul dizayner, ish nomi, format, fayl turi, muddat, izoh (va ixtiyoriy — pechatchini oldindan tayinlash)
2. Dizayner tizimga kirib **Mening vazifalarim** doskasini ko'radi (Yangi → Jarayonda → Tugallangan) va "Boshlash" / "Tugallandi" bosadi
3. Dizayn tugagach ish **avtomatik** "Jarayonda (Pechatchi)"ga o'tadi va pechatchiga tushadi (oldindan tayinlanmagan bo'lsa — CRM kartochkasida qizil "Pechatchi tayinlang" chiqadi)
4. Pechatchi "Tugallandi" bosganda lid **Yopilgan**ga o'tadi
5. Har bir qadam o'zgarishlar tarixiga yoziladi; CRM ochiq bo'lsa holat har 20 soniyada yangilanadi

**Xavfsizlik (server darajasida):** dizayner/pechatchi faqat `/api/tasks` orqali o'z vazifalarini oladi — summa, to'lov, qarz, telefon raqami ularga yuborilmaydi. Buyurtmalar, tranzaksiyalar, lidlar, Telegram va tarixga kirish 403 bilan yopiq. Menejerning eskirgan nusxasi ishchilar kiritgan holatni bosib keta olmaydi.

Fayllar: `backend/tasks.js`, `frontend/src/views/tasks/WorkerApp.jsx`, `frontend/src/views/crm/TaskAssignModal.jsx`

---

## ← Orqaga navigatsiya (2026-09)

- Har bir bo'lim sarlavhasi yonida **← strelka** — oldingi ochilgan bo'limga qaytaradi (asosiy sahifada ko'rinmaydi)
- Telefonning o'z "orqaga" harakati (iPhone'da chetdan surish, Android'da orqaga tugmasi) ham xuddi shunday ishlaydi
- Ochiq oyna bo'lsa (modal, "+" menyusi, yon menyu, telefondagi chat) — "orqaga" avval shuni yopadi
- Asosiy sahifada "orqaga" ilovani yopmaydi
- Dizayner/Pechatchi ekranida ham: Sozlamalar → orqaga → Vazifalar

Fayl: `frontend/src/lib/history.js` (`useHistoryView`, `useBackToClose`)

---

## Telegram: "Noma'lum" ism muammosi tuzatildi (2026-09)

**Sabab:** Telegram yangi xabarda ko'pincha faqat foydalanuvchi ID'sini yuboradi. Ism kutubxonaning xotirasidan olinardi, u esa har deploy/qayta ishga tushishda bo'shab qolardi → "Noma'lum (ID)".

**Yechim** (`backend/telegram-userbot.js`):
- Ism topilmasa — so'nggi suhbatlar ro'yxati yuklanib (getDialogs), ism qayta so'raladi
- Ulanishda xotira darhol to'ldiriladi
- Ulanganda (va Chatlar sahifasi ochilganda) eski "Noma'lum" lidlarga ism, username, telefon avtomatik yoziladi
- Qo'lda: `POST /api/telegram-user/refresh-names`
- Telegram cheklovlariga rioya: bir xil ID uchun daqiqasiga ko'pi bilan 1 qayta urinish

---

## 💬 Chat: reaksiya, javob, rasm, ovozli xabar, joylashuv (2026-09)

**Xabar ustiga bosish** (telefonda — tegish) → menyu: 👍 ❤ 🔥 😁 😢 🙏 👌 reaksiyalar, "Javob berish", "Nusxa olish" (rasmda — "Rasmni ko'rish"). Kompyuterda kursor olib borilganda ↩ va 😊 tezkor tugmalari ham chiqadi.

**Yozish paneli:** 📎 → "Foto yoki video" (oldindan ko'rish + izoh), "Hujjat" (istalgan fayl, asl nomi bilan, siqilmasdan) yoki "Joylashuvim" (GPS). Matn bo'sh bo'lsa — 🎤 ovozli xabar (5 daqiqagacha).
Cheklovlar: rasm — 15 MB, video va hujjat — 50 MB. Mijozdan kelgan 50 MB dan katta fayllar faqat nomi/hajmi bilan ko'rsatiladi.
**Xavfsizlik:** faqat rasm, video, ovoz va PDF brauzerda ochiladi; boshqa fayllar (HTML, SVG, EXE, ZIP...) faqat yuklab olinadi.

**Telegram tomonida:** reaksiya — haqiqiy Telegram reaksiyasi; javob — haqiqiy "reply"; ovoz — OGG/Opus "voice" (to'lqinli); joylashuv — Telegram geo-nuqta.

**Kiruvchi:** mijozning rasmlari, ovozli xabarlari (CRM'da tinglanadi), joylashuvi ("Xaritada ochish") va javoblari (iqtibos bilan) ko'rinadi. Ochiq suhbat har 5 soniyada yangilanadi.

**Talablar:**
- `ffmpeg` — ovoz formatlarini o'girish uchun (`nixpacks.toml`da qo'shilgan; Railway o'zi o'rnatadi). Bo'lmasa ovoz audio-fayl sifatida ketadi.
- Mikrofon va joylashuv faqat **HTTPS**da ishlaydi (Railway domeni — HTTPS).
- Reaksiya va javob faqat shu yangilanishdan keyin kelgan xabarlarga ishlaydi (eski xabarlarda Telegram ID saqlanmagan).

Fayllar: `backend/audio.js`, `backend/telegram-userbot.js`, `backend/server.js` (send-media, send-location, react), `frontend/src/views/crm/ChatConversation.jsx`
