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

---

## 💬 Chat: telefondan yozilganlar, botlar filtri, panellar (2026-09)

- **Telefondagi Telegram'dan yozganlaringiz** endi CRM'ga ham tushadi (faqat CRM'dagi mijozlar bilan yozishmalar — shaxsiy suhbatlaringiz tushmaydi). CRM'dan yuborilganlar ikki marta chiqmaydi (Telegram ID bo'yicha).
- **Tarix:** suhbat ochilganda so'nggi 50 ta xabar Telegram'dan tortib olinadi (bir suhbat uchun daqiqasiga 1 marta).
- **Faqat odamlar:** botlar (CardXabar kabi), kanallar, guruhlar va Telegram xizmat xabarlari CRM'ga tushmaydi. Ulanishda eski bot suhbatlari va **tegilmagan** avtomatik lidlar tozalanadi (qo'lda tahrirlangan yoki buyurtmaga bog'langan lidlarga tegilmaydi).
- **Panellar (kompyuterda):** chegarani surib kenglikni o'zgartirish (ikki marta bosish — standart), ro'yxat va mijoz panelini yashirish, to'liq ekran (Esc — chiqish). Sozlamalar shu brauzerda eslab qolinadi.
- Kun ajratgichlari: "Bugun", "Kecha", "25-sentabr".

## 🛟 Ma'lumotlar himoyasi va zaxiradan tiklash (2026-09)

**Nega ma'lumotlar yo'qolishi mumkin:** Railway'da Volume ulanmagan yoki `DB_PATH` noto'g'ri bo'lsa,
baza fayli konteyner ichida yaratiladi va **har bir deploy'da bo'sh holatga qaytadi**.

**Endi dastur buni o'zi sezadi:**
- Server ishga tushganda Railway o'zgaruvchilarini tekshiradi (`RAILWAY_VOLUME_MOUNT_PATH`).
  Baza Volume ichida bo'lmasa — logda katta ogohlantirish, adminga esa har sahifada qizil banner chiqadi.
- `DB_PATH` papkasi yo'q bo'lsa, avtomatik yaratiladi.
- Kunlik Telegram zaxirasi endi `db.serialize()` orqali olinadi — WAL jurnalidagi eng so'nggi o'zgarishlar ham kiradi
  (avval faylni to'g'ridan-to'g'ri o'qish oxirgi yozuvlarni tushirib qoldirishi mumkin edi).

**Tekshirish:** Sozlamalar → "Baza holati va zaxiradan tiklash" — baza qayerda, doimiy diskdami,
nechta buyurtma/rasxod/lid bor, oxirgi zaxira qachon yuborilgan.

**Zaxiradan tiklash:**
1. Telegram'dagi `uvix_backup_YYYY-MM-DD.db` faylini yuklab oling.
2. Sozlamalar → "Zaxira faylini tanlash" → fayl tarkibi (nechta buyurtma, lid...) ko'rsatiladi.
3. "Shu zaxiradan tiklash" → tasdiqlang. Hozirgi holat `uvix.before-restore-<vaqt>.db` nomi bilan
   Volume'da saqlab qo'yiladi. PIN kodlar zaxiradagi holatiga qaytadi.
- Eslatma: buyurtma rasmlari (uploads papkasi) zaxira faylida yo'q — faqat baza ma'lumotlari tiklanadi.

API: `GET /api/health` (storage.persistent), `GET /api/system/status` (admin), `POST /api/backup/restore` (admin; `?apply=1` — haqiqiy tiklash, busiz — faqat tekshirish).

## 💬 Chatlar: barcha shaxsiy suhbatlar va eski tarix (2026-09)

- **Barcha shaxsiy suhbatlar** — Telegram ilovasidagi kabi, hali yozmagan odamlar ham ro'yxatda
  (`getDialogs`, daqiqasiga 1 marta yangilanadi). Botlar, kanallar, guruhlar, "Telegram" xizmati va
  "Saqlangan xabarlar" chiqarilmaydi. Lidi bor suhbatlarda **CRM** belgisi turadi; oxirgi xabar o'zingizniki bo'lsa "Siz:" deb ko'rsatiladi.
  Ro'yxatdagi vaqt: bugun — soat, shu hafta — hafta kuni, eskiroq — sana.
- **Lid faqat qo'lda** — yangi odam yozsa CRM'ga avtomatik lid ochilmaydi. Suhbat sarlavhasida va o'ng panelda
  **"CRM'ga qo'shish"** tugmasi bor (ism, username, telefon Telegram'dan olinadi). Mavjud lidlarning ismi/telefoni avvalgidek avtomatik to'ldiriladi.
- **Eski tarix** — suhbatni yuqoriga aylantirsangiz, Telegram'dan 40 tadan eskiroq xabarlar avtomatik yuklanadi
  (ekran joyi siljimaydi). Boshigacha yetganda "Suhbat boshi" yoziladi.
- Ismlar `uvix:telegramContacts`da eslab qolinadi — Telegram vaqtincha uzilsa ham ro'yxatda ism turadi.

API: `GET /api/telegram-user/messages/:chatId/older?before=<tgId>`, `POST /api/telegram-user/create-lead`.

## 🛡️ Ishonchli saqlash (2026-09, 1-bosqich)

**Muammo edi:** buyurtma/rasxod/lid ro'yxatlari serverga butunligicha yozilardi. Ikki xodim bir vaqtda
ishlasa, keyin saqlagan birinchisining o'zgarishini o'chirib yuborardi. Saqlash xatosi esa ko'rinmasdi.

**Endi:**
- **Faqat o'zgargan yozuvlar yuboriladi** (`POST /api/kv/:key/merge` — `upserts` va `deletes`).
  Server ularni hozirgi ro'yxatga qo'llaydi, shuning uchun bir vaqtda ishlagan xodimlar bir-birini o'chirmaydi.
  Buyurtmalar, rasxodlar, lidlar va o'zgarishlar tarixi uchun ishlaydi. Bir yozuvni ikki kishi bir paytda
  tahrirlasa — oxirgisi qoladi.
- **Versiya raqami (`rev`)**: har kalit yozilganda +1. Brauzer har 20 soniyada (va oynaga qaytganda)
  `GET /api/kv/:key?rev=N` so'raydi — o'zgarmagan bo'lsa ma'lumot qayta yuklanmaydi. Boshqa xodimlar
  kiritganlari o'zi ko'rinadi.
- **Saqlash holati** ekranning pastki chap burchagida: "Saqlanmoqda…", "Saqlandi", "Saqlanmadi — qayta
  urinilmoqda" (+ "Qayta urinish" tugmasi).
- **Internet uzilsa** — o'zgarish navbatda turadi, o'zi qayta yuboriladi (1.5 s → 30 s oraliqda), internet
  qaytishi bilan darhol. Sahifa yopilib qolsa ham brauzerda saqlanadi va keyingi kirishda yuboriladi.
  Saqlanmagan o'zgarish bor paytda sahifani yopmoqchi bo'lsangiz, brauzer ogohlantiradi.
- Tizimdan chiqishda brauzerdagi saqlanmagan nusxalar tozalanadi (umumiy kompyuter uchun).

## CRM: bosqichlar summasi va qorong'i mavzu tuzatishlari (2026-09)
- CRM doskasida har bir bosqich sarlavhasi o'z rangidagi kartochka: lidlar soni va **summasi**.
  Tepada: "Voronkada" (yopilmagan bosqichlar jami) va "Yopilgan" summa.
- "Tungi" mavzuda jadval qatoriga sichqoncha olib borilganda qator oppoq bo'lib, matn ko'rinmay qolardi —
  tuzatildi. Xuddi shu muammo tugmalar (Excel, xavfli tugmalar), kartochka chegaralari va aylantirish
  chizig'ida ham bor edi — hammasi endi mavzuga mos.

## Dashboard: kartochka rangini sozlash (2026-09)
- Har bir ko'rsatkich kartochkasining pastki o'ng burchagida shesterenka (faqat administratorga).
  Bosilganda: "Oddiy" yoki "To'liq rang" ko'rinishi, 9 ta tayyor rang yoki istalgan boshqa rang, "Asl holiga qaytarish".
- Tanlov `settings.cardStyles` da saqlanadi — barcha xodimlarda bir xil ko'rinadi.
- To'liq rangli kartochkada yozuv rangi avtomatik tanlanadi: och rangda (sariq kabi) — qora, to'q rangda — oq.

## Dashboard: kartaning o'zida sozlash (konstruktor o'rniga) (2026-09)
Eski "Dashboard konstruktori" ro'yxati olib tashlandi (`DashboardConstructorSection.jsx` o'chirildi). Endi:
- **"Dashboardni sozlash"** tugmasi → tahrirlash rejimi: kartalar ramkaga olinadi, mazmuni sekin tebranadi,
  pastda suzuvchi panel chiqadi ("Tayyor", "Ko'rsatkich qo'shish", "⋯").
- **Tutqich** (kartaning tepa o'rtasi) — sichqoncha yoki barmoq bilan sudrab joyini almashtirish (faqat o'z bo'limi ichida).
- **Shesterenka** (pastki o'ng burchak) — o'lcham (Kichik/O'rta/Katta/To'liq), rang (raqamli kartalarda),
  joyi (Oldinga/Keyinga), "Yashirish". Grafiklar, qarzdorlar ro'yxati va asosiy kartaga ham ishlaydi.
- **"Ko'rsatkich qo'shish"** — yashirilgan kartalar galereyasi, bosilsa o'z bo'limining oxiriga qaytadi.
- O'zgarishlar **darhol saqlanadi** — alohida "Saqlash" tugmasi yo'q.
- **Kim uchun:** administrator — "Hamma uchun" (umumiy ko'rinish, `settings.dashboardLayout` + `settings.cardStyles`)
  yoki "Faqat men uchun". Boshqa xodimlar faqat o'zi uchun moslashtiradi. Shaxsiy ko'rinish serverda
  `GET/PUT /api/me/dashboard` orqali (`uvix:dash:<xodimId>`) saqlanadi; "⋯ → Umumiy ko'rinishga qaytish".
- **Telefonda:** karta ustida uzoq bosib turilsa — tahrirlash rejimi va shu kartaning menyusi ochiladi.

## Tezlik (2-bosqich)

Sekin mobil internetda o'lchangan (200 KB/s, 150 ms kechikish, 4× sekin protsessor, 3000 buyurtma + 600 lid):

| | Oldin | Hozir |
|---|---|---|
| Kirish ekrani ochilishi | 8,0 s | 1,3 s |
| Birinchi yuklanadigan JS (siqilgan) | 392 KB | 92 KB |
| Kirgandan so'ng ma'lumot tayyor | 12,3 s | 4,2 s |
| Jami yuklangan hajm | 3,2 MB | 0,23 MB |

Nima qilindi:
- **Sahifalar bo'laklarga ajratildi** (`React.lazy`): har bir bo'lim faqat ochilganda yuklanadi. Kirgandan so'ng brauzer bo'sh turganda qolganlari oldindan yuklab qo'yiladi — menyudan o'tish kutishsiz.
- **Og'ir kutubxonalar alohida**: Excel (`xlsx`, ~430 KB) faqat eksport/import bosilganda, grafiklar (`recharts`) dashboard raqamlaridan keyin yuklanadi. React va ikonkalar alohida bo'lakda — ilova yangilanganda brauzer ularni qayta yuklamaydi.
- **Server javoblarni siqadi** (`compression`, brotli/gzip): 3000 ta buyurtma 1,37 MB → 99 KB.
- **Keshlash**: `/assets/*` fayllar 1 yil keshda (`immutable`), `index.html` har doim yangisi.
- **Deploydan keyingi himoya**: eski ochiq sahifa endi yo'q bo'lakni so'rasa, sahifa o'zi bir marta yangilanadi (saqlanmagan o'zgarish bo'lsa — avval saqlanishini kutadi).
- **Uzun ro'yxatlar** (CRM ustunlari, lidlar ro'yxati, chatlar): avval 25–40 ta chiziladi, pastga aylantirganda qo'shib boriladi (`Incremental` komponenti, `components/ui.jsx`).
- CRM ustun sarlavhalarida summa qisqa ko'rinishda ("211,5 mln so'm"), to'liq qiymat — kursor olib borilganda.

Yangi bog'liqlik: backend `compression` — Railway `npm install` paytida o'zi o'rnatadi.

## Telegram akkaunt: barqaror ulanish va ilova ichidan kirish

`AUTH_KEY_UNREGISTERED` ("The specified authorization key is not registered…") — Telegram sessiya kalitini bekor qilganini bildiradi
(telefondagi «Qurilmalar»dan o'chirilgan, bitta sessiya ikki joyda ishlatilgan yoki muddati tugagan). Endi:

- **Ulanishda kalit darhol tekshiriladi** (`getMe`). O'lgan bo'lsa — holat `expired`, bekorga qayta urinilmaydi,
  o'lik sessiya qayta ishlatilmaydi (server qayta ishga tushsa ham), adminga bot orqali xabar boradi.
- **Har 4 daqiqada tekshiruv** (`updates.GetState`): sessiya o'lsa — chat ochilmasa ham darhol bilinadi; internet uzilsa — qayta ulanadi.
- **Ilova ichidan kirish** (Sozlamalar → Telegram akkaunt): QR kod (telefon Telegram → Qurilmalar → «Qurilma ulash»)
  yoki telefon raqam + kod, 2FA parol bilan. Terminal va `setup-telegram.js` endi shart emas (zaxira usul sifatida qoldi).
  Backend: `telegram-login.js`, yo'llar `/api/telegram-user/login[/qr|/phone|/code|/password|/cancel]` (faqat admin).
- **Sessiya alohida ichki kalitda** (`uvix:tgSession`, KV orqali o'qib/yozib bo'lmaydi) — brauzerdagi eski sozlamalar uni ustidan yozib yubora olmaydi.
- Telegram «Qurilmalar» ro'yxatida **«UVIX CRM (server)»** nomi bilan ko'rinadi.
- Server to'xtatilganda (`SIGTERM`, deploy) Telegram'dan to'g'ri uziladi — ikki nusxa bir sessiyada o'tirib qolmaydi.
- Xatolar o'zbekcha (sessiya tugagan, FLOOD_WAIT cheklovi, bloklangan suhbat va h.k.); Chatlar sahifasida «Qayta ulash» ogohlantirishi.

Muhim: bitta sessiyani bir vaqtda faqat bitta serverda ishlating (kompyuterda lokal ishga tushirganda boshqa akkaunt yoki alohida sessiya ulang).
Yangi bog'liqlik: backend `qrcode`.

## Face ID / barmoq izi bilan kirish (qayta ishlandi)

Oldingi muammolar: so'rov (challenge) oldindan olinib, xotirada 5 daqiqa turardi — sahifa uzoq ochiq tursa yoki
deploy bo'lsa "So'rov muddati o'tgan" chiqardi; har bir tayyorlangan so'rov urinishlar limitiga sanalardi;
umumiy kompyuterda Windows Hello xodimni emas, kompyuter egasini taniydi (xavfsizlik teshigi).

Endi (bank ilovalaridagi usul):
- **Faqat shaxsiy telefon/planshetda.** Kompyuterda ko'rsatilmaydi, server ham kompyuterdan yangi qurilma qo'shishni rad etadi.
  Eski kompyuter yozuvlari Sozlamalarda "endi ishlatilmaydi" deb ko'rinadi — o'chirib qo'yish mumkin.
- **Taklif PIN bilan kirgandan keyin** (bir marta, "Hozir emas" bilan). Server tayyor bo'lmasa taklif ko'rsatilmaydi.
- **Bir bosishda kirish:** shu telefonda oldin biometrik bilan kirgan xodim bo'lsa, ilova ochilishi bilan ro'yxat va PIN'siz
  Face ID so'raladi (Android'da o'zi, iPhone'da bitta tugma). "PIN bilan kirish" va "Boshqa xodim" har doim bor.
- **Imzolangan challenge** (HMAC, 10 daqiqa, serverda saqlanmaydi, bir martalik) — deploy/qayta ishga tushishdan keyin ham ishlaydi;
  brauzerda 4 daqiqada va ilovaga qaytilganda o'zi yangilanadi.
- **Limit faqat muvaffaqiyatsiz tekshiruvlarga** (10 daqiqada 8 ta), tayyorlash so'rovlari sanalmaydi.

## Menyuni moslashtirish (joylashuv, tartib, yashirish, telefon paneli)

Menyu pastidagi **«Menyuni sozlash»** (ixcham va tepa panelda — ⚙ belgisi) bosilganda menyuning o'zida tahrirlash ochiladi:
- **Joylashuv:** Chap panel · Ixcham (faqat ikonlar, ustiga kelganda nomi) · Tepa (gorizontal; sig'maganlari «Yana ▾» ichida).
  Telefonda har doim pastki panel + chiquvchi menyu.
- **Tartib:** sudrab (sichqoncha yoki barmoq bilan) yoki ↑/↓ tugmalari (klaviatura uchun ham).
- **Yashirish:** ko'z belgisi. «Sozlamalar»ni yashirib bo'lmaydi.
- **Telefon pastki paneli:** 4 ta bo'lim tanlanadi (o'rtada «+» va oxirida «Yana»).
- **Kimga:** har xodim o'zi uchun (`/api/me/nav`, ichki kalit `uvix:nav:<id>`); admin «Hamma uchun» rejimida standartni
  belgilaydi (`settings.navDefaults`) — o'z menyusini o'zgartirmagan xodimlarga qo'llanadi. «Standart» tugmasi shaxsiy sozlamani o'chiradi.
- Kod: `frontend/src/components/Nav.jsx` (useNavPrefs, NavEditor, RailNav, TopNav, NAV_CSS).
- Tepa panel sahifa aylantirilganda ham ko'rinib turadi (`html, body { overflow-x: clip }`).
- **PIN klaviaturasida Face ID tugmasi** (pastki chap katak, telefonda doim): yoqilgan bo'lsa — bosib kiriladi;
  yoqilmagan bo'lsa — "PIN'ni kiriting, kirgach yoqamiz" deb belgilanadi va PIN'dan keyin (oldin "Hozir emas" deyilgan bo'lsa ham) yoqish taklif qilinadi.

## CRM: yopilgan lidlar arxivi va eskirgan lidlar

- **Davr tanlagich** (Joriy oy · O'tgan oy · Chorak · Yil · Oraliq; tanlov qurilmada eslab qolinadi) — faqat natijalarga ta'sir qiladi:
  «Yopilgan»/«Yo'qotilgan» ustunlari, tepadagi ko'rsatkichlar va Arxiv. **Faol bosqichlar doim to'liq** (eski faol lid yashirinib qolmasin).
  Standart — joriy oy: 1-sanada yopilgan ustunlar o'zi bo'shaydi, eskilari **Arxiv**da (hech narsa o'chmaydi).
- **Ko'rsatkichlar** — davr tanlagichi bilan bitta ixcham qatorda (kartalar emas, ~50px): Voronkada (faol, davrga bog'liq emas) ·
  Yangi lidlar (davrda kelgan) · O'rtacha yopilish (kun). Yopilganlar summasi takrorlanmaydi — u «Yopilgan» ustuni sarlavhasida.
  Telefonda qator gorizontal suriladi, «Yangi lid» tugmasi Voronka/Arxiv qatorida.
- **Yopilish sanasi:** lid «Yopilgan»/«Yo'qotilgan»ga o'tganda `closedAt`, har bosqich o'zgarishida `stageAt` yoziladi
  (pechatchi ishni tugatib avtomatik yopilganda ham — `backend/tasks.js`). Eski lidlarda sana bog'langan buyurtmadan
  yoki yaratilgan kundan olinadi.
- **Arxiv** (CRM → «Arxiv»): o'sha davr tanlagichi (+ «Barchasi»), Hammasi/Yopilgan/Yo'qotilgan, qidiruv (mijoz, telefon, menejer), yillik jami
  (soni, summa, konversiya %), oylar bo'yicha guruhlar va har oy statistikasi, **«Qayta ochish»** (lid «Yangi lid»ga qaytadi), **Excel**.
- **Eskirgan lid belgisi:** faol bosqichda 14+ kun harakatsiz — sariq, 30+ kun — qizil («⏱ N kun harakatsiz»).
  Harakat = bosqich o'zgarishi, tahrir, dizayn/pechat vazifasi holati.
- **Tuzatildi:** lidni tahrirlash endi Telegram bog'lanishi, dizayn/pechat vazifalari va sanalarni o'chirib yubormaydi.
- Kod: `frontend/src/lib/leads.js`, `frontend/src/views/crm/LeadArchive.jsx`.
- **Lid manbasi ikonka bilan** (`components/LeadSource.jsx`): Telegram, Instagram, Facebook, WhatsApp, Qo'ng'iroq, Sayt, YouTube,
  Tavsiya, Ofisga keldi, Reklama — erkin matndan kalit so'z bo'yicha aniqlanadi (masalan "Instagram reklama" → Instagram);
  tanilmagan manba kulrang teg bilan. Lid formasida bir bosishda tanlash tugmalari.
- **Telegram nikneymi** Telegram ko'k rangida (@username, bosilsa Telegram'da ochiladi); avtomatik "Telegram: @user" izohi takrorlanmaydi.

## Davomat (keldi-ketdi)

- **Belgilash:** yuqori panelda (dizayner/pechatchida — o'z ekranida) **«Keldim» / «Ketdim»** tugmasi. Bosilganda telefon joylashuvi
  **bir marta** olinadi va sex nuqtasidan radius ichida (standart 150 m, GPS aniqligi hisobga olinadi) ekani serverda tekshiriladi.
  Kun bo'yi kuzatilmaydi. Vaqt serverniki (telefon soatini o'zgartirib bo'lmaydi). Ish tugashidan oldin «Ketdim» — tasdiq so'raladi.
- **Hisob:** kechikish (imtiyozdan keyin, ish boshlanishidan hisoblanadi; standart imtiyoz 15 daq), erta ketish, kech ketish
  (qo'shimcha vaqt), kelmagan kunlar, «Ketdim» belgilanmagan kunlar, ishlangan soat. Dam kuni kelgani alohida.
  Hisob davomat yoqilgan kundan boshlanadi (`since`). Toshkent vaqti.
- **Davomat sahifasi** (admin): Bugun · Hafta · Oy (kunlik rangli xarita, jami ko'rsatkichlar, qatorni bosib kunlar, Excel) ·
  Sozlamalar (sex joylashuvi — «Hozirgi joylashuvim», radius, umumiy jadval va ish kunlari, imtiyoz, xodimga alohida jadval /
  kuzatilmasin, Telegram hisobotlari va sinab yuborish). Xodim — «Mening davomatim» (oylik tarix).
- **Qo'lda to'g'rilash:** faqat admin, sababi majburiy; kim va nima sababdan o'zgartirgani saqlanadi.
- **Telegram:** har ish kuni (standart 09:30) — kim keldi / kechikdi / hali belgilamadi; har dushanba 09:00 — o'tgan hafta;
  har oyning 1-sanasi — o'tgan oy. Bot orqali; «Chat ID» yozilsa — faqat o'sha chatga. Server qayta ishga tushsa ham takrorlanmaydi.
- Kod: `backend/attendance.js` (API: `/api/attendance/me|check|config|report|manual|send-report`),
  `frontend/src/components/CheckInButton.jsx`, `frontend/src/views/attendance/AttendanceView.jsx`.
  Ma'lumot: ichki kalitlar `uvix:attConfig`, `uvix:att:YYYY-MM`, `uvix:attSent`.
- Demo'da serverning shu hisoblash kodi brauzerda ishlaydi, joylashuv sex nuqtasi deb olinadi, 35 kunlik namunaviy ma'lumot bor.

### Davomat: selfi, ish vaqti taymeri, ilova yopiq ekrani
- **Selfi** (standart yoqilgan, Davomat → Sozlamalar): «Keldim»da avval joylashuv tekshiriladi (`dryRun`), keyin old kameradan
  **jonli** selfi olinadi (galereyadan emas), 480px JPEG, ustiga «UVIX · sana vaqt» yoziladi. Faqat admin ko'radi
  (Bugun ro'yxatida miniatyura, kunlik tafsilotda «selfi»). `photoDays` (standart 60) kundan keyin o'zi o'chadi.
  Saqlash: `<DB papkasi>/attendance-photos/YYYY-MM/<xodim>_<sana>_in.jpg` (server.js → `attPhotoStore`).
- **Taymer:** kelgandan keyin yuqori paneldagi tugmada jonli `HH:MM:SS`, «18:00 gacha», pastida kun chizig'i
  (kechikkan bo'lsa sariq, ish vaqti tugagach yashil) va «Ketdim».
- **Ilova yopiq ekrani** (`AttendanceGate`): kuzatiladigan xodim ish kunida «Keldim» bosmaguncha boshqa bo'limlar ochilmaydi —
  katta soat, salomlashuv, kechikish daqiqalari, katta «Keldim» tugmasi. Faqat ish boshlanishidan 2 soat oldin — ish tugaguncha;
  ish tugagach, dam kunlari va admin uchun ilova ochiq. GPS ishlamasa — admin qo'lda belgilaydi.

### Davomat: xodimning o'ziga Telegram xabarlari (UVIX boti)
- Telegram qoidasi: bot odamga birinchi yoza olmaydi. Xodim **bir marta** UVIX'da «Telegram'ni ulash» (Davomat → Mening davomatim,
  «Keldim» ekrani, dizayner/pechatchida — Sozlamalar) → `t.me/<bot>?start=<kod>` → «Start». Kod 30 daqiqa amal qiladi, bir martalik.
  `/stop` — o'chirish. Xodim botni bloklasa — bog'lanish o'zi olib tashlanadi.
- Bot xabarlari **long polling** (`getUpdates`) orqali olinadi — webhook kerak emas (`backend/telegram-bot.js`).
  Shu bot boshqa joyda webhook bilan ishlatilsa, polling 409 bilan to'xtab turadi.
- Xabarlar (Davomat → Sozlamalar → «Xodimning o'ziga», har biri o'chirib-yoqiladi, har kuni bir martadan):
  ish boshlanishidan 15 daqiqa oldin · imtiyozdan keyin hali «Keldim» bosmagan · kech kelganda («Bugun N daqiqa, bu oy: …») ·
  ish tugab 30 daqiqa o'tib «Ketdim» bosilmagan · dushanba — shaxsiy haftalik xulosa.
  **Adminga:** ish boshlanib 30 daqiqa o'tsa — kim hali kelmagani (bot chati yoki Davomat «Chat ID»).
- Admin «Xodimlar» ro'yxatida kim ulaganini ko'radi: «TG ✓» / «TG yo'q».
- Ichki kalitlar: `uvix:staffTg`, `uvix:tgLinkTokens`. Sinov uchun `TELEGRAM_API_BASE` (soxta Bot API), `UVIX_NO_BOT_POLL=1`.
