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

Brauzerda `http://localhost:5173` ni oching. Birinchi ochilganda tizim
**birinchi administratorni yaratish**ni so'raydi — o'z ismingiz va PIN'ingizni kiriting.

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
ishlatishingiz mumkin. Birinchi ochilganda administrator hisobini o'zingiz
yaratasiz (ism + PIN).

---

## 🔒 1-bosqich: xavfsizlik yangilanishi (2026-09)

**Yopilgan teshiklar:**
- `POST /api/auth/reset-admin-pin` olib tashlandi (internetdagi har kim admin PIN'ini 0000 ga qaytara olardi). Endi faqat server konsolidan: `node backend/reset-admin-pin.js <yangiPIN>` (PIN majburiy)
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

### Bo'yoq ombori (menyu → «Bo'yoq ombori»)

UV bo'yoqlar qoldig'ini litrda yuritadi va qachon tugashini oldindan aytadi.

- **Bo'yoqlar:** Cyan, Magenta, Yellow, Black, Oq (White), Lak, Primer, Tozalash suyuqligi. Ro'yxat, rang va normani admin Sozlamalar'da o'zgartiradi.
- **Sarf (avtomatik):** buyurtmadagi m² × sarf normasi (ml/m²). Norma avval taxminiy. Ikki sanash orasidagi haqiqiy sarfdan tizim uni o'zi aniqlashtiradi: oxirgi 4 oraliq, m² bo'yicha og'irlik bilan. Shunda kartada «✓ o'rganilgan» belgisi chiqadi.
- **Kirim:** Rasxod → kategoriya «Kraska» tanlanganda «Bo'yoq omboriga kirim» bloki chiqadi. Unda qaysi bo'yoqdan necha litr olinganini kiritasiz; bitta to'lovda bir nechta bo'yoq bo'lishi mumkin. Ombor sahifasidagi «Kirim» tugmasi ham shu formani ochadi.
- **Haftalik sanash:** «Sanash» tugmasi orqali haqiqiy qoldiq kiritiladi. Hisob shu qiymatdan qayta boshlanadi, farq oylik hisobotda «Sanash tuzatishi» bo'lib ko'rinadi. Birinchi sanash — boshlang'ich qoldiq.
- **Prognoz:** oxirgi 30 kundagi o'rtacha m²/kun × norma → litr/kun → qoldiq necha kunga yetishi va taxminiy tugash sanasi. Tavsiya: «ogohlantirish muddati + 30 kun»ga yetadigan miqdor.
- **Ogohlantirish (Telegram):** bo'yoq 30 kundan kamroqqa yetadigan bo'lsa, adminning shaxsiy Telegram'iga xabar boradi. Har bo'yoq uchun bir marta yuboriladi, to'ldirilgach qayta yoqiladi. Sanash kuni (standart: dushanba 10:00) eslatma ham keladi.
  - Admin o'z Telegram'ini UVIX botiga bir marta ulaydi: Bo'yoq ombori → Sozlamalar → «Telegram'ni ulash».
  - Hech bir admin ulanmagan bo'lsa, xabar umumiy chatga ketadi.
- **Oylik hisobot:** har bo'yoq bo'yicha oy boshi, kirim, sarf, sanash tuzatishi va oy oxiri. Kunma-kun sarf grafigi, kunlik jadval va Excel ham bor.
- **Saqlash:** `uvix:paintConfig`, `uvix:paintCounts`, `uvix:paintSent` (ichki kalitlar). Kirim `uvix:transactions` dagi `paintLines` maydonida saqlanadi.
- **API:**
  - `GET /api/paint`, `GET /api/paint/month?ym=`, `GET /api/paint/counts`
  - `POST /api/paint/count`, `DELETE /api/paint/count/:id` (admin)
  - `PUT /api/paint/config` (admin), `POST /api/paint/test-alert` (admin)

### Mijozlar bazasi va qarz eslatmalari (menyu → «Mijozlar»)

**Mijozlar bazasi avtomatik yig'iladi.** Manba — buyurtmalar (mijoz nomi bo'yicha) va CRM lidlari. Har lid quyidagi tartibda mijozga bog'lanadi:
1. bog'langan buyurtma;
2. mijoz nomi;
3. telefon (oxirgi 9 raqam);
4. Telegram nik.

Nomdagi katta-kichik harf va ortiqcha bo'shliq farq qilmaydi. Hech qaysi mijozga bog'lanmagan lid faqat «Jarayonda» yoki «Yopilgan» bosqichida bo'lsa alohida mijoz sifatida qo'shiladi.

**Tahrirlash.** Mijozga telefon, Telegram va izoh qo'shish mumkin. **Birlashtirish** — bir mijoz turli nomlar bilan yozilgan bo'lsa (masalan, «Olim Mebel» va «Olim furniture»), nomlar bitta mijozga qo'shiladi va eski buyurtmalar ham shu mijozga tushadi. Ma'lumot `uvix:customers` kalitida saqlanadi (birlashtirib saqlanadigan ro'yxat — merge-sync).

**Mijoz kartasida:**
- buyurtmalar soni, aylanma, o'rtacha chek, to'langan, qarz, birinchi buyurtma sanasi;
- buyurtmalar ro'yxati (qarzi borlarida «To'lov» tugmasi);
- to'lovlar tarixi;
- CRM lidlari («Chat» tugmasi);
- qo'ng'iroq va Telegram tugmalari.

**Ro'yxat:**
- qidirish (ism, telefon yoki @nik);
- saralash (oxirgi buyurtma, aylanma, qarz, buyurtmalar soni, nom);
- filtrlar (qarzdor, telefonsiz, faqat lid);
- Excel'ga eksport.

**Buyurtma formasi:** mijoz nomini yozganda bazadagi nomlar taklif qilinadi. Tanish mijozda «Doimiy mijoz: N ta buyurtma · telefon · qarzi …» ko'rsatmasi chiqadi.

**Qarzdorlar:**
- har qanday qarz darhol ro'yxatga tushadi;
- ro'yxat qarz summasi bo'yicha tartiblanadi;
- eng eski qarzning necha kunligi rang bilan ko'rsatiladi (7 kundan oshsa — sariq, 30 kundan oshsa — qizil);
- oxirgi to'lov sanasi ko'rinadi;
- mijoz qatori ochilganda qarzli buyurtmalar chiqadi va to'lovni shu yerning o'zida qabul qilish mumkin;
- Excel'ga eksport.

**Kunlik Telegram xulosa** (`backend/debts.js`). Standart bo'yicha har ish kuni (Du–Sh) soat 10:00 da adminning shaxsiy Telegram'iga boradi. Xabarda:
- jami qarz;
- eng katta 10 qarzdor (telefoni bilan);
- kecha to'langan summa;
- kecha qo'shilgan qarz.

Qarz ham, kechagi to'lov ham bo'lmasa, xabar yuborilmaydi. Vaqt, kunlar va «Hozir yuborish» tugmasi — Mijozlar → Qarzdorlar sahifasining pastida. API: `GET/PUT /api/debts/config`, `POST /api/debts/send` (faqat admin).

### Mijozga Telegram xabarlari: hisob-faktura, to'lov kvitansiyasi, qarz eslatmasi

Xabarlar sizning Telegram akkauntingiz (userbot) orqali, mijozning shaxsiy chatiga boradi. Kod: `backend/customer-msg.js`.

Mijozning Telegrami quyidagi tartibda qidiriladi:
1. CRM lididagi chat;
2. mijozlar bazasidagi @username;
3. liddagi @username.

Telegrami topilmagan mijozga hech narsa yuborilmaydi.

**Hisob-faktura (faqat qo'lda).** Yuborish uchun quyidagi joylardan birida 📄 tugmasini bosasiz:
- Buyurtmalar ro'yxati;
- mijoz kartasi;
- Qarzdorlar ro'yxati.

So'ng ko'rinishi va xabar matni ochiladi, ularni tekshirib «Telegram'ga yuborish»ni bosasiz. Rasm brauzerda chiziladi (`frontend/src/lib/invoiceCanvas.js`, kengligi 1080px), shuning uchun serverga brauzer o'rnatish shart emas.
- **Rasmda:** buyurtma raqami, mijoz va telefoni, ish/material va m², jami summa, to'langan qism, «To'lash kerak» bloki, karta rekvizitlari va menejer telefoni.
- **Ko'rsatilmaydi:** buyurtmadagi $ narxlar — ular kraska hisob-kitobi uchun.
- Rasmni «Rasmni saqlash» tugmasi bilan yuklab olish ham mumkin.

**To'lov qabul qilindi (avtomatik).** Buyurtmaga yangi to'lov kiritilganda mijozga summa, to'lov turi va qolgan qarz boradi. Qarz qolmagan bo'lsa, «to'liq to'landi» deb yoziladi. Faqat oxirgi 15 daqiqada kiritilgan to'lovlar uchun yuboriladi: import yoki zaxiradan tiklashda mijozga xabar ketmaydi.

**Qarz eslatmasi (avtomatik, standart bo'yicha o'chiq).**
- Qarz N kundan oshsa (standart 7), belgilangan vaqtda (standart 11:00, Du–Sh) mijozga yumshoq eslatma boradi: qaysi buyurtmalar, qancha qolgan va karta raqami.
- Har mijozga ko'pi bilan har 7 kunda bir marta.
- Kuniga ko'pi bilan 20 ta xabar, ular orasida 3 soniya pauza — Telegram cheklamasligi uchun.

**Sozlash:** Mijozlar → Xabarlar (faqat admin):
- rekvizitlar (karta raqami, karta egasi, menejer telefoni va ismi, logotip ostidagi yozuv);
- avtomatik xabarlarni yoqish/o'chirish;
- navbatdagi eslatma kimlarga borishi va xabar namunasi;
- yuborilgan xabarlar jurnali.

**API:**
- `GET/PUT /api/customer-msg/config`
- `POST /api/customer-msg/recipient`
- `POST /api/customer-msg/invoice`
- `GET /api/customer-msg/log` (admin)
- `GET /api/customer-msg/preview-remind` (admin)

### Telegram xabarlari: xodimlar guruhi va adminning shaxsiy chati

Har bir xabar turi uchun qayerga borishi alohida tanlanadi: **Guruh**, **Menga** (adminning shaxsiy Telegrami, UVIX boti orqali), **Ikkalasi** yoki **O'chiq**. Sozlash joyi: Sozlamalar → Telegram xabarnomalari → «Qaysi xabar qayerga borsin».
- **Guruh** — Sozlamalardagi «Xodimlar guruhi Chat ID».
- **Menga** — UVIX botiga ulangan adminlar. Ulanish: «Telegram'ni ulash» tugmasi → botda Start.

**Tavsiya etilgan sozlama (standart):**

| Xabar | Qayerga |
|---|---|
| Yangi buyurtma | Guruh |
| Yangi to'lov, yangi rasxod | Menga |
| Kunlik Excel hisobot, baza zaxirasi | Menga |
| Davomat: kunlik «kim keldi/kelmadi» | Guruh |
| Davomat: «Hali kelmadi», haftalik/oylik hisobot | Menga |
| Bo'yoq zahirasi, qarz xulosasi, tizim ogohlantirishlari | Menga |

**Muhim:**
- Admin hali shaxsiy Telegramini ulamagan bo'lsa, «Menga» xabarlari guruhga ketadi, shunda hech narsa yo'qolmaydi. Sozlamalarda bu haqda ogohlantirish ko'rinadi.
- Davomat sozlamalarida alohida «hisobot chat ID» kiritilgan bo'lsa, davomat hisobotlari shu chatga ketadi.
- Kod: `notify(kategoriya, matn)` va `notifyDoc(...)` (server.js); kategoriyalar `TG_ROUTE_DEFAULTS` da; holat API'si `GET /api/telegram-routes` (admin).

**Shu bosqichda tuzatilgan xatolar:**
- Kunlik zaxira vaqti server soati (UTC) bo'yicha tekshirilardi. Endi Toshkent vaqti bo'yicha.
- Oxirgi zaxira sanasi noto'g'ri formatda saqlanardi va zaxira tekshiruvi xatoga uchrardi. Endi ikkala format ham to'g'ri o'qiladi.

### 4-bosqich: Hisobot va tahlil (menyu → «Hisobot», faqat admin)

**Davr tanlash:**
- Oy, chorak yoki yil — strelkalar bilan oldinga-orqaga suriladi.
- Ixtiyoriy oraliq.
- Oyning dastlabki 5 kunida sahifa o'tgan oy hisoboti bilan ochiladi.

**Taqqoslash:**
- «Oldingi davr bilan»: oy oldingi oy bilan, chorak oldingi chorak bilan, yil boshidan bugungacha esa o'tgan yilning xuddi shu kunlari bilan solishtiriladi. Oy hali tugamagan bo'lsa, oldingi oyning xuddi shu kunlari olinadi.
- «O'tgan yil bilan»: o'tgan yilning shu davri bilan.

**Bloklar:**
- **Asosiy ko'rsatkichlar:** tushum, qo'shilgan qiymat, sof foyda va marja, davr oxiridagi qarzdorlik. Har biri o'zgarish foizi bilan.
- **Xulosalar** (avtomatik): foyda va kassa o'rtasidagi farq, eng ko'p o'sgan rasxod, marja o'zgarishi, materialning tushumdagi ulushi, eng yaxshi menejer.
- **Foyda va zarar** (hisoblangan usul, buyurtma sanasi bo'yicha):
  1. Tushumdan kraska, material va brak ayiriladi — qo'shilgan qiymat chiqadi.
  2. Undan kategoriyalar bo'yicha operatsion rasxodlar ayiriladi — sof foyda qoladi.
  3. «Shaxsiy» rasxodlar foydadan tashqari, alohida ko'rsatiladi.
- **Oyma-oy:** oxirgi 12 oy grafigi (tushum, rasxod, sof foyda). Ustunga olib borganda shu oy tafsiloti chiqadi.
- **Pul oqimi:** haqiqatda kelgan to'lovlar va to'langan barcha rasxodlar.
- **Menejerlar reytingi:**
  - menejer buyurtmadagi «Mas'ul menejer» maydonidan olinadi, bo'sh bo'lsa — buyurtmani kiritgan xodim;
  - ustunlar: buyurtmalar, aylanma, yig'ilgan to'lov, o'rtacha chek, lid → buyurtma konversiyasi, qarz ulushi, oldingi davrga nisbatan o'zgarish.

**Fayllar:**
- **Excel** — davrdagi buyurtmalar va rasxodlar.
- **PDF** — A4 hisobot, serverda yaratiladi (`backend/analytics-pdf.js`, pdfkit va `backend/fonts`).
- **«Telegram'ga»** — PDF'ni hoziroq yuboradi.
- **Har oyning 1-kuni 09:00 da** o'tgan oy PDF hisoboti avtomatik yuboriladi. Qayerga — Sozlamalar → Telegram → «Oylik PDF hisobot» qatori (standart: shaxsiy chatga).

**Kod va API:**
- Hisoblash: `backend/analytics.js`. Unda fs yo'q, demo ham shu kod bilan ishlaydi.
- `GET /api/analytics?from&to&cmp=prev|yoy`
- `GET /api/analytics/pdf`
- `POST /api/analytics/send-pdf`
- Yangi bog'liqlik: `pdfkit` — deploydan oldin `npm install`.

## 🎨 Professional dizayn v2 (2026-10)

Faqat ko'rinish yangilandi — hisob-kitob, ma'lumotlar va mavjud funksiyalar o'zgarmadi.

**Ranglar va uslub**
- Standart: yorug' neytral fon (`#F7F7F8`) + bitta ko'k urg'u (`#1F5FD6`). Qorong'i rejim — **Grafit** (`#0C0C0E`) + ko'k.
- Siyohrang gradientlar, porloq soyalar va og'ir shriftlar olib tashlandi. Butun ilovada bitta shrift — **Onest** (endi serverning o'zidan yuklanadi, Google Fonts'ga bog'liq emas).
- Sidebar qora blok emas: oq panel + ingichka chegara. Ikonlar sokin, faqat faol bo'lim ko'k.
- Sozlamalar → Ko'rinish: rejim (Yorug' / Kulrang / Grafit), urg'u rangi (Ko'k, Grafit, Indigo, Yashil, To'q sariq yoki o'zingiz), zichlik, burchak, sidebar uslubi.
- Eski (siyohrang) sozlama saqlangan bo'lsa — bir marta avtomatik yangi dizaynga o'tadi (zichlik va sidebar tanlovi saqlanadi).
- Ilova ikonasi, kirish ekrani, telefon yuqori panel rangi ham yangilandi.

**Buyurtmalar: jadval + o'ng panel**
- Qatorni bossangiz o'ngda tafsilot paneli ochiladi: summa / to'langan / qarz, menejer, kraska, material, qo'shilgan qiymat, to'lovlar tarixi. Pastida: «To'lov qabul qilish», «Faktura», tahrirlash, o'chirish.
- Filtr chiplari: Hammasi / Qarzdorlar / To'langan (soni bilan) va UVIXPRINT / UVONYX. Tepada: nechta buyurtma va jami summa.
- Qatordagi amal tugmalari sichqoncha olib borilganda chiqadi (telefonda doim ko'rinadi). Tor ekranda panel o'ngdan suriladigan oyna bo'lib ochiladi.

**CRM: ixcham kartalar**
- Karta: mijoz, summa, izoh (1 qator), vazifalar, manba, menejer bosh harflari. Harakatsiz turgan lid — chap chetida sariq/qizil chiziq va «N kun turibdi».
- Tugmalar (chat/qo'ng'iroq, ← →, tahrirlash, o'chirish) karta ustiga kelganda chiqadi. Ikki marta bosish — tahrirlash. «Yangi lid» ustunida «+ Lid qo'shish».

**Ctrl+K (Mac: ⌘K) — tezkor qidiruv**
- Buyurtma raqami, mijoz, lid yoki bo'lim nomini yozing → Enter. «Yangi buyurtma / rasxod / lid» ham shu yerdan.
- Sidebar tepasidagi «Qidirish» tugmasi yoki telefonda sarlavha yonidagi lupa.

**Bekor qilish (undo)**
- Buyurtma, rasxod yoki to'lov o'chirilganda pastda 6 soniya «Bekor qilish» tugmasi chiqadi (chiqindi qutisidan qaytaradi).
- Bo'lim yuklanayotganda jadval skeleti ko'rinadi.

**Bildirishnomalar markazi va push**
- Sarlavhadagi qo'ng'iroqcha: yangi buyurtma, to'lov, Telegram xabari, rasxod, qarz eslatmasi, bo'yoq, davomat, hisobot, tizim. Bosilsa — tegishli bo'limga o'tadi.
- Manba — mavjud Telegram xabarnomalari (yangi hodisa qo'shilmadi). Operator: buyurtma, to'lov, chat; admin: hammasi.
- **Push** — ilova yopiq bo'lsa ham telefon/kompyuter ekranida chiqadi (Sozlamalar → Bildirishnomalar → «Yoqish»). VAPID kalitlari birinchi ishga tushishda avtomatik yaratiladi va bazada saqlanadi — qo'shimcha sozlash shart emas. iPhone'da: avval «Ulashish → Bosh ekranga qo'shish».
- Har xodim o'zi tanlaydi: har bir turkum uchun Ilovada / Push / Ovoz, sokin soatlar (masalan 22:00–08:00), ovoz balandligi. «Muhim» xabarlar (bo'yoq tugadi, Telegram uzildi) ilovada doim ko'rinadi va sokin soatlarda ham keladi.
- Ovozlar (UVIX uchun maxsus yaratilgan): Marimba (standart), Chime up (buyurtma), Pul tushdi (to'lov), Tink (kichik xabarlar), Muhim. Ovoz ilova ochiq bo'lganda chalinadi; ilova yopiq bo'lsa push telefonning o'z ovozi bilan keladi (brauzer cheklovi).
- Yangi API: `GET /api/notifications`, `POST /api/notifications/read`, `PUT /api/notifications/prefs`, `POST /api/notifications/test`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`. Backend'ga `web-push` paketi qo'shildi.

**Fon va shisha rejimi (faqat kompyuterda)**
- Sozlamalar → Fon va shisha rejimi: Fonsiz, Yumshoq gradient, Tog' manzarasi, **Kun vaqti bo'yicha** (tong / kun / oqshom / tun — Toshkent vaqti bilan o'zi almashadi), **O'z rasmim** (1920 px gacha kichraytirib saqlanadi).
- **Shisha rejimi** (Bitrix24 kabi): panellar shaffof, fon ko'rinadi, yozuvlar oq. «Oqshom va tunda qorong'i rejim» — kun vaqti fonida.
- Har xodimning o'zi uchun (`GET/PUT /api/me/background`). Telefonda tezlik uchun fon ko'rsatilmaydi. Video fon yo'q.

## 💬 Chatlar: menejer uchun qulayliklar (2026-10)

Mavjud chat funksiyalari (reaksiya, javob, rasm, ovozli xabar va h.k.) o'zgarmadi — ustiga quyidagilar qo'shildi.

**Tayyor javoblar**
- Yozish maydonida «/» yozing (masalan `/narx`) yoki ⚡ tugmasini bosing → ro'yxatdan tanlang (↑ ↓, Enter yoki Tab). Matn maydonga qo'yiladi, yuborishdan oldin tahrirlash mumkin.
- Ro'yxatni admin boshqaradi: Sozlamalar → «Chat: tayyor javoblar». Standart: /narx, /karta, /manzil, /maket, /vaqt.

**Filtrlar va javobsiz ogohlantirish**
- Ro'yxat tepasida: Hammasi / **Javobsiz** / O'qilmagan / Meniki / CRM'siz / Arxiv (har birining soni bilan).
- Mijoz yozib, belgilangan vaqt (standart 15 daqiqa) ichida javob berilmasa — qator qizil chiziq bilan belgilanadi, «N daq javobsiz» yoziladi va mas'ul menejerga (tayinlanmagan bo'lsa — hammaga) bildirishnoma keladi. Bitta xabar uchun bir marta, faqat ish vaqtida (standart Du–Sh, 09:00–19:00). Sozlamalar → «Chat: tayyor javoblar» pastida o'zgartiriladi.

**Mas'ul menejer va «kim yozyapti»**
- Chat sarlavhasida yoki o'ng panelda menejer tayinlanadi; ro'yxatda uning bosh harflari ko'rinadi, «Meniki» filtri shunga ishlaydi.
- Boshqa xodim shu mijozga yozayotgan bo'lsa — «✎ Aziza yozyapti...» ko'rinadi (ikki kishi bir vaqtda javob bermasligi uchun).

**Ichki izoh**
- Yozish maydonida «🔒 Ichki izoh» tabi: yozilgan matn mijozga **yuborilmaydi**, faqat xodimlar ko'radi (sariq fon, qulf belgisi). O'z izohini muallif yoki admin o'chiradi.

**O'ng panel: mijoz, buyurtma, faktura, qarz**
- Chat mijozi bazadagi mijoz bilan avtomatik bog'lanadi: jami buyurtmalar, qarz, oxirgi 3 buyurtma.
- Tugmalar: «Buyurtma» (forma mijoz ismi bilan ochiladi), «Faktura», «To'lov», «Dizaynerga». CRM'da lid bo'lmasa — avtomatik yaratiladi.
- **Narx kalkulyatori**: eni × bo'yi × soni × m² narxi → jami; «Javobga qo'shish» bosilsa hisob matni yozish maydoniga tushadi. Oxirgi narx eslab qolinadi.

**Rasm → dizayner vazifasi**
- Mijoz yuborgan rasm/fayl ustidagi 🎨 tugma yoki menyudagi «Dizaynerga yuborish» → vazifa oynasi rasm bilan ochiladi. Dizayner o'z ilovasida vazifa ichida shu rasmni ko'radi.

**Mahkamlash, arxiv, qidiruv**
- Qatorni o'ng tugma bilan bosing (telefonda — uzoq bosing) yoki «⋯»: Mahkamlash / Arxivga. Mahkamlanganlar tepada alohida bo'limda turadi; arxivdagilar faqat «Arxiv» filtrida.
- Qidiruv endi xabarlar matnidan ham izlaydi — topilgan joy 🔍 bilan ko'rsatiladi.

**Texnik**
- Yangi fayl: `backend/chat-tools.js`. API: `GET /api/chat-tools/state`, `PUT /api/chat-tools/meta/:chatId`, `GET/POST /api/chat-tools/notes/:chatId`, `DELETE /api/chat-tools/notes/:chatId/:noteId`, `POST /api/chat-tools/typing`, `GET /api/chat-tools/search?q=`, `PUT /api/chat-tools/replies` (admin), `PUT /api/chat-tools/config` (admin).
- Ma'lumotlar mavjud kalit-qiymat jadvalida saqlanadi (`uvix:chatMeta`, `uvix:chatNotes`, `uvix:quickReplies`, `uvix:chatConfig`) — bazaga migratsiya kerak emas. Dizayner vazifasiga `refs` (biriktirilgan rasmlar) maydoni qo'shildi.

## 🧮 Smeta → to'lov → buyurtmalar, ishlab chiqarish holati (2026-10)

Buyurtma endi **bitta yo'l** bilan yaratiladi: smeta (bir yoki bir nechta pozitsiya) → avans to'lovi → buyurtmalar. Chatdan kelgan mijoz ham, ustaxonaga o'zi kelgan mijoz ham shu yo'ldan o'tadi.

**Narxlar va smeta (Sozlamalar → «Narxlar va smeta», admin)**
- Material, birlik (m² yoki dona), narx, minimal maydon, kraska $/m² (ixtiyoriy — buyurtmadagi kraska summasi kursdan avtomatik hisoblanadi).
- Avans foizi (standart 50%). Kam to'lansa buyurtma yaratilmaydi; admin «Avanssiz yaratish» bilan istisno qila oladi — tarixda yoziladi.

**Kalkulyator — ish quroli (chat o'ng panelida va «Yangi buyurtma» oynasida)**
- «Nima uchun» (masalan: oshxona fartugi), material ro'yxatdan → narx o'zi tushadi (qo'lda o'zgartirsa bo'ladi), eni × bo'yi × dona.
- Minimal maydondan kichik ish minimal maydon bo'yicha hisoblanadi (masalan, 0,2 m² shisha → 1 m²).
- «Smetaga qo'shish» → pozitsiyalar yig'iladi (tahrirlash / nusxa / o'chirish). Hisob mijozga avtomatik ketmaydi; «Mijozga yuborish (matn)» — ixtiyoriy.
- Chatdagi smeta mijozning CRM lidiga saqlanadi (boshqa menejer ham ko'radi). Ustaxonadagi mijoz «o'ylab ko'raman» desa — «Smetani saqlash»: CRM'da lid bo'lib turadi, buyurtmalar ro'yxatiga tushmaydi.

**«To'lov va buyurtma» (aylantirish)**
- To'lov (bir nechta usulda bo'lishi mumkin), «Avans 50%» / «To'liq» tugmalari, avans holati darhol ko'rinadi.
- Har pozitsiya → **alohida buyurtma**, raqamlar ketma-ket, hammasi bitta guruhda (`G-014`, smeta `S-014`).
- To'lov buyurtmalar orasida taqsimlanadi (summaga mutanosib yoki ketma-ket) — har buyurtmaning qarzi alohida to'g'ri.
- Har pozitsiya uchun vazifa: dizayner / «Maket tayyor → pechatga» / vazifasiz; pechatchini oldindan tanlash mumkin (dizayn tugagach o'zi faollashadi).
- Hammasi serverda **bitta amalda** yoziladi: raqamlar takrorlanmaydi, yarim-yorti saqlanib qolmaydi. Telegram'ga bitta «Yangi buyurtmalar (3 ta)» xabari, mijozga bitta kvitansiya.
- Smeta buyurtmaga aylangan chatda yangi pozitsiya qo'shilsa — shu mijoz uchun **yangi bitim** (yangi lid) ochiladi.

**Buyurtmalar bo'limi**
- «Holat» ustuni: Navbatda / Dizaynda / Pechatda / Tayyor / Topshirildi + kim ishlayapti va qancha vaqtdan beri. Holat bo'yicha filtr chiplari.
- O'ng panelda «Ishlab chiqarish»: holatni o'zgartirish, dizayner/pechatchi tayinlash, «Mijozga topshirildi», guruhdagi boshqa buyurtmalar.
- **«Ro'yxat | Mijoz bo'yicha»**: mijoz qatori (buyurtmalar soni, summa, qarz, ish holati chizig'i) → ochilsa buyurtmalar smeta guruhlari bo'yicha. Tanlov har xodimga eslab qolinadi.
- **Umumiy to'lov**: mijoz bir marta to'laydi — summa qarzdor buyurtmalariga bo'linadi (eng eski qarzdan yoki mutanosib), oldindan ko'rsatiladi. Mijozga bitta kvitansiya.
- Mijoz bir xil odam turli nomda yozilgan bo'lsa — Mijozlar bo'limidagi «Birlashtirish» bilan bitta mijoz bo'ladi (guruhlash shunga tayanadi).
- Tahrirlash formasi avvalgidek (kraska, material xarajati, rasmlar); smeta guruhi, holat va vazifalar tahrirlashda saqlanib qoladi.

**Dizayner / pechatchi**
- Smetadan yaratilgan buyurtmalarda vazifa har buyurtmaning o'zida: ishchi ilovasida «UV-261002-004 · 1/3» ko'rinishida chiqadi. Dizayn tugasa → pechatga, pechat tugasa → **Tayyor**.

**CRM**
- Yangi bosqich: **«Tayyor (olib ketish)»**. Smetadan yaratilgan bitimda lid bosqichi buyurtmalardan o'zi hisoblanadi: birortasi dizaynda → «Jarayonda (Dizayn)», hammasi pechatda → «Jarayonda (Pechatchi)», hammasi tayyor → «Tayyor», hammasi topshirildi → «Yopilgan».
- Kartada holat chizig'i: «2 dizaynda · 1/3 tayyor»; ochiq smetada — «Smeta S-014 · summa — to'lov».

**Mijozga «Buyurtmangiz tayyor» xabari** (Mijozlar → sozlamalar, standart o'chiq): pechat tugaganda yoki «Tayyor» belgilanganda. Bitta smetadagi buyurtmalar — hammasi tayyor bo'lganda bitta xabar, qolgan to'lov bilan.

**Texnik**
- Yangi fayllar: `backend/quotes.js` (smeta, aylantirish, umumiy to'lov, holat, tayinlash), `backend/production.js` (holat qoidalari, taqsimot, eskirgan nusxadan himoya), `frontend/src/views/quotes/*`, `frontend/src/lib/production.js`, `views/orders/BatchPayModal.jsx`, `views/settings/PriceListSection.jsx`.
- API: `GET/PUT /api/sales/config`, `PUT /api/quotes/:leadId`, `POST /api/quotes`, `POST /api/quotes/convert`, `POST /api/orders/pay-batch`, `POST /api/orders/:id/stage`, `POST /api/orders/:id/task`.
- Buyurtmaga qo'shilgan maydonlar: `title, leadId, groupId, groupIdx, groupSize, quoteNo, prodStage, prodAt, readyAt, deliveredAt, design, print`; to'lovda `batchId`. Lidda: `quote, orderIds`. Bazaga migratsiya kerak emas — eski buyurtmalar holati bog'langan lid bosqichidan ko'rsatiladi (yoki qo'lda belgilanadi).
- Eskirgan nusxadan himoya: menejer eski ma'lumot bilan saqlasa ham ishchi o'zgartirgan holat, server kiritgan to'lovlar va smeta yo'qolmaydi.

## 💵 Kalkulyatorda dollar narx va kurs (2026-10)

- Kalkulyatorda «1 m²» narxi yonida **so'm | $** almashtirgichi bor. $ tanlansa, narx dollarda yoziladi va kurs bo'yicha darhol so'mga o'giriladi: `3,2 m² × 32,8 $ = 104,96 $ → 1 348 245 so'm`.
- **Kurs** avtomatik qo'yiladi (pastda manbasi yoziladi: «Markaziy bank · 12.10» yoki «Sozlamalardagi kurs»). Menejer shu smeta uchun kursni qo'lda o'zgartira oladi — «… ga qaytarish» bilan asl kursga qaytadi.
- Valyuta almashtirilganda kiritilgan narx o'giriladi; qiymatga tegmay qaytarilsa — asl narx tiklanadi.
- **Kurs pozitsiyada saqlanadi** (`cur: "usd"`, `priceUsd`, `rate`, `totalUsd`). Keyin kurs o'zgarsa ham eski smeta va buyurtmalar summasi o'zgarmaydi. Buyurtma izohida: «32,8 $/m² (kurs 12 900)», buyurtmaning `exchangeRate` — shu kurs.
- To'lov, qarzdorlik, hisobotlar — **faqat so'mda**. Mijozga yuboriladigan smeta matni ham faqat so'mda.
- **Sozlamalar → Valyuta kursi:** «Markaziy bank kursi (avtomatik)» yoki «Qo'lda kiritilgan kurs». Markaziy bank kursi `cbu.uz` dan 3 soatda bir marta olinadi va `uvix:fx` da saqlanadi; internet bo'lmasa oxirgi ma'lum kurs, umuman olinmagan bo'lsa — qo'lda kurs ishlatiladi. Tushum bo'limidagi eski $ hisob-kitob qo'lda kursdan foydalanishda davom etadi.
- **Sozlamalar → Narxlar va smeta:** har materialga narx valyutasi (so'm yoki $) tanlanadi. Masalan «Oniks — 52 $/m²» — kalkulyatorda avtomatik so'mga o'giriladi.
- Server summani o'zi qayta hisoblaydi: `total = maydon × priceUsd × kurs` (kurs 1 000 – 1 000 000 oralig'ida bo'lishi shart).
- Fayllar: `backend/fx.js` (yangi), `backend/quotes.js`, `frontend/src/views/quotes/QuoteBuilder.jsx`, `frontend/src/lib/production.js`, `frontend/src/views/settings/PriceListSection.jsx`, `SettingsView.jsx`.

## 🔐 Kirish, PIN tiklash, davomat, sozlamalar (2026-10, 9 ta tahrir)

**1. Kalkulyatorda o'lcham — mm.** Standart birlik mm (2000 × 1600), kerak bo'lsa sm yoki m (tanlov shu brauzerda eslab qolinadi). Ichkarida doim metrda saqlanadi (mm aniqligida); smeta, buyurtma izohi va dizayner vazifasida o'lcham pozitsiya birligida yoziladi: «2000×1600 mm». Eski pozitsiyalar — m. Juda kichik qiymat (mm da 50 dan kam) yozilsa — «metrda yozgan bo'lsangiz, m ni tanlang» ogohlantirishi.

**2. PIN unutilganda (email olib tashlandi).** `backend/pin-recovery.js`
- *Telegram kodi* — faqat xodim o'zi (ilovaga kirib) ulagan shaxsiy chatga; ekranda «Kod @az•••_k ga yuborildi». 6 xonali, 10 daqiqa, 5 urinish; tiklangach adminga xabar va jurnalga yoziladi.
- *Admindan so'rash* — adminga Telegram xabari, Xodimlar ro'yxatida «PIN'ni unutdi» belgisi. Admin «Vaqtinchalik PIN» beradi (6 xonali, 24 soat); xodim u bilan kirgach, darhol o'z PIN'ini qo'yadi (`mustChangePin`, `POST /api/me/pin`). Muddati o'tgan vaqtinchalik PIN bilan kirib bo'lmaydi.
- Xodim Telegram akkauntini almashtirsa — eski akkauntga va adminga ogohlantirish.
- Gmail sozlamasi, email maydonlari va `/api/auth/forgot-pin` olib tashlandi. Admin o'z PIN'ini unutsa: Telegram kodi yoki serverda `node reset-admin-pin.js`.

**3. Davomat — xodimga xabarlar** (Davomat → Sozlamalar'da har biri yoqiladi/o'chiriladi): «✅ Keldingiz: 08:57» / «👋 Ketdingiz: 18:05, ishladingiz: 9 soat 5 daq»; admin qo'lda to'g'rilasa — nima o'zgargani va sababi; oylik shaxsiy xulosa (har oyning 1-sanasi). Xodimlar ro'yxatida «Telegram ulanmagan» belgisi.

**4. Kechikish / erta ketish / qo'shimcha vaqt — «1 kun 2 soat 15 daq».** 1 kun = xodimning ish kuni (jadval bo'yicha, masalan 09:00–18:00 = 9 soat). Kun faqat yig'indilarda (hafta/oy, Excel «JAMI» qatori); bitta kun uchun — soat va daqiqa.

**5. Selfi bir bosishda.** «Keldim» → kamera ~1 soniyada o'zi suratga oladi → darhol yuboriladi. Birinchi marta bir martalik ogohlantirish («Keldim bosilganda rasm olinadi»).

**6. «Ketdim» osonlashtirildi.**
- (a) Unutilsa — ish tugaganidan 3 soat keyin jadval bo'yicha tugash vaqti yoziladi, «avto» belgisi, qo'shimcha vaqt hisoblanmaydi (xodimga xabar).
- (b) Sexdan tashqarida ham bosish mumkin — adminga «sexdan tashqarida · 1,3 km» bilan ko'rinadi (Excel izohida ham).
- (c) «Ketdim bosishni unutmang» Telegram xabarida «👋 Ketdim» tugmasi → ilova `?checkout=1` bilan ochiladi.
- (d) Ish vaqti tugagach ilova ochilsa — katta «Ketdim» oynasi («Hali ishlayapman» — 1 soatga yashiriladi).

**7. «Keldim»dan oldin Face ID** — Davomat sozlamalarida yoqiladi (standart: o'chiq). Face ID yoqilgan telefonlarda «Keldim» bosilganda avval Face ID so'raladi; server buni `bio_required` bilan tekshiradi (`POST /api/auth/passkey/confirm`).

**8. Sozlamalar qayta tuzildi.** Guruhlar: Profil · Ko'rinish · Bildirishnomalar | Admin: Savdo · Integratsiyalar · Bo'limlar · Ma'lumotlar · O'zgarishlar jurnali. Kompyuterda chap menyu, telefonda ro'yxat → ichiga kirish.
- «Tizim holati» (`GET /api/system-status`): Telegram bot, zaxira, sex joylashuvi, xodimlar Telegrami, PIN so'rovlari, dollar kursi — e'tibor talab qiladiganlari sariq va bir bosishda tegishli joyga olib boradi.
- Matnli o'zgarishlar pastdagi bitta «Saqlanmagan o'zgarish · Bekor · Saqlash» paneli orqali saqlanadi; saqlamay boshqa bo'limga o'tilsa — ogohlantirish.
- Ctrl K: sozlamalar ham qidiriladi («kurs» → Dollar kursi). «Bo'limlar»: Davomat, Bo'yoq, Mijozlarga xabarlar, Chatlar, Xodimlar sozlamalariga yorliqlar.
- O'zgarishlar jurnali (`backend/settings-log.js`, `uvix:settingsLog`): narx, avans, kurs, davomat qoidalari, Telegram, zaxira vaqti, vaqtinchalik PIN — kim, qachon, eski → yangi.
- «Valyuta formati» va Gmail kartalari olib tashlandi.

**9. Kompyuterdan kirish — yangi ekran + telefon orqali.** Kompyuterda (≥1000 px, sichqoncha) chapda fon (kun vaqtiga qarab) + soat, o'ngda «PIN bilan | Telefon bilan». PIN: ro'yxat (↑↓), 4–6 katak, klaviatura, Enter. Telefon: QR (`backend/qr-login.js`) — 60 s, bir martalik; QR ichida faqat id, token olish kaliti faqat kompyuterda. Telefonda: «Yana» menyusi → «Kompyuterga kirish» (kamera skaneri) yoki telefon kamerasi bilan to'g'ridan-to'g'ri → «Kompyuterga kirasizmi? Chrome · Windows» → Face ID (Face ID yo'q telefonda — PIN) → kompyuter ochiladi. Kirish jurnalga yoziladi. Telefon va planshetda avvalgi PIN klaviatura ekrani qoladi.

## 📨 Telegram — guruhsiz, har bir xodimga shaxsan (2026-10)

- **Guruh Chat ID butunlay olib tashlandi.** Botni sozlash uchun faqat **bot token** kerak; har bir xodim UVIX'da bir marta «Telegram'ni ulash»ni bosadi. Barcha xabarlar UVIX boti orqali shaxsan boradi.
- **Yo'nalishlar** (Sozlamalar → Integratsiyalar → «Qaysi xabar kimga borsin»): «Faqat menga» (admin(lar)), «Xodimlarga» (admin + operatorlar, har biriga o'zining Telegramiga), «O'chiq». «Xodimlarga» faqat **Yangi buyurtma** va **Bo'yoq zahirasi** uchun; pul, hisobot va zaxira (baza fayli) faqat adminga boradi. Standart: Yangi buyurtma → admin + operatorlar, qolgani → faqat admin. Eski «Guruh»/«Ikkalasi» sozlamalari avtomatik standartga o'tadi.
- **Dizayner/pechatchiga yangi vazifa** — o'zining Telegramiga («🎨 Dizayn — yangi vazifa · Banner · UV-261012-001 · O'lcham…»). Vazifa qayerdan berilgani muhim emas: smeta, buyurtma paneli, CRM yoki dizayn tugab pechatga o'tishi (`backend/task-notify.js`, 20 soniyada bir tekshiradi, bir vazifa uchun bir marta).
- **Har xodim o'zi tanlaydi:** Sozlamalar → Bildirishnomalar → «Telegram'imga keladigan xabarlar» (ishchi ilovasida — Sozlamalar). Ro'yxatda faqat unga haqiqatan keladigan turlar (`GET/PUT /api/me/tg-prefs`, `uvix:tgPrefs`).
- Davomat hisobotidagi «Chat ID (ixtiyoriy)» maydoni ham olib tashlandi. Sex joylashuvi belgilanmaguncha davomat hisobot va eslatmalari yuborilmaydi.

## 📲 Birinchi kirishda Telegram'ni ulash (2026-10)

Xodim ilovaga kirgach (Face ID taklifidan keyin) «Telegram'ni ulang» oynasi chiqadi:

1. **«Telegram'ni ulash»** → Telegram'da UVIX boti ochiladi.
2. Xodim **«Start»**ni bosadi. Ilova o'zi tekshirib turadi, Telegram'dan qaytganda darhol yangilanadi.
3. **«Ulandi!»** → @username ko'rsatiladi → «Davom etish».

- **«Keyinroq»** — 1 kundan keyin yana so'raydi; 3 marta qoldirilsa, boshqa chiqmaydi (Sozlamalar → Bildirishnomalar'dan ulash mumkin).
- Bot sozlanmagan bo'lsa yoki xodim allaqachon ulangan bo'lsa — oyna chiqmaydi.
- **Admin sozlamasi** (Sozlamalar → Integratsiyalar → Telegram → «Xodimlar Telegrami»): kim ulangani / ulanmaganlar ro'yxati; «Birinchi kirishda ulashni taklif qilish» (standart: yoqilgan); «Majburiy qilish» (standart: o'chiq) — yoqilsa «Keyinroq» bo'lmaydi, faqat «Chiqish». Adminlarning o'ziga hech qachon majburiy emas.
- Ikkala sozlama o'zgarishi Jurnalga yoziladi. Saqlash: `uvix:settings.tgOnboardOffer`, `uvix:settings.tgOnboardRequired`, `uvix:tgOnboard` (har xodim: nechta «Keyinroq», oxirgisi qachon).
- API: `GET /api/me/telegram` → `onboard: { show, required }`; `POST /api/me/telegram/skip`.

### Bot `/start`ga javob bermasa
Bot xabarlarni long polling (getUpdates) orqali oladi. Endi muammo bo'lsa server o'zi aniqlaydi va **Sozlamalar → Tizim holati**da ko'rsatadi:
- **Botda boshqa webhook o'rnatilgan** (bot avval boshqa xizmatda ishlatilgan) — server webhook'ni **avtomatik o'chiradi**, bir daqiqada `/start` ishlay boshlaydi.
- **Shu token boshqa serverda ham ishlayapti** (masalan, kompyuterdagi nusxa + Railway, yoki 2 ta replika) — faqat bittasi xabar oladi. Ortiqchasini o'chiring yoki har biriga alohida bot oching.
- **Token noto'g'ri / bekor qilingan** — @BotFather'dan yangi token olib kiriting.
- Railway'da server uxlab qolsa (Serverless/Sleep yoqilgan) bot ham javob bermaydi — doimiy ishlaydigan rejim kerak.

## 🖥 Kompyuterdan kirish — yig'iladigan xodim tanlash (2026-10)
- Uzun xodimlar ro'yxati o'rniga bitta ixcham qator: oxirgi kirgan xodim tanlangan turadi → faqat PIN.
- «Almashtirish» bosilsa ro'yxat ustiga ochiladi (5 tadan ko'p bo'lsa — qidiruv); tanlansa yoki tashqariga bosilsa yopiladi. Klaviatura: ↑ ↓, Enter, Esc.
- Yangi kompyuterda hech kim tanlanmagan («Xodimni tanlang»), PIN maydoni xira — tanlagach faollashadi.

## 🧮 Smeta: dona, umumiy narx, yig'iladigan kalkulyator; 💬 Telegram papkalari (2026-10)
- **Kalkulyator turlari:** «m² | Dona | Umumiy». *Dona* — nomi + soni + 1 dona narxi (narxlar ro'yxatidagi «dona» mahsulotlar). *Umumiy* — o'lchamsiz erkin summa (Montaj, dizayn xizmati…), so'm yoki $.
- **Summani qo'lda o'zgartirish:** hisoblangan summa yonida «✎ o'zgartirish» (yaxlitlash/chegirma); qatorda «summa qo'lda», hisoblangan summa ham saqlanadi (`manualTotal`, `calcTotal`).
- **Yig'ish:** kalkulyator sarlavhasida «Yashirish ⌃» → bitta qator «Kalkulyator · Ochish». Holat brauzerda eslab qolinadi; tahrirlashda o'zi ochiladi.
- **Mijozga yuborish:** tugma smeta sarlavhasiga ko'chdi («↗ Yuborish»); bosilganda avval ko'rib chiqish oynasi — kimga, matn (tahrirlash mumkin), «Bekor qilish» / «Tahrirlash uchun» / «Yuborish».
- **Telegram papkalari:** ulangan Telegram akkauntidagi papkalar (`messages.getDialogFilters`) — nomi, belgisi, tartibi, ichidagi chatlar (aniq qo'shilganlar, kontakt/kontakt emas, ovozsiz/o'qilgan/arxiv filtrlari), o'qilmaganlar soni. Kompyuterda chap ustun, telefonda tepada yorliqlar. Daqiqasiga bir marta yangilanadi. API: `GET /api/telegram-user/folders`. UVIX faqat shaxsiy chatlarni ko'rsatadi — guruh/kanal papkalari bo'sh ko'rinishi mumkin.

## 🎨 Mavzular: 9 ta mavzu, avtomatik tun, shaxsiy tanlov; kontrast tuzatishlari (2026-10)
- **Mavzular galereyasi** (Sozlamalar → Ko'rinish): Yorug', Kulrang, **Qog'oz** (iliq kunduzgi), **Yuqori kontrast** (AAA, sex/quyosh nuri), **CMYK** (bosmaxona brendi, grafiklar CMYK ranglarida), Grafit, **Tun ko'k**, **Iliq tun** (ko'k nur kam), **OLED qora** (telefon, batareya). Har bir mavzu o'z urg'u rangi bilan keladi; «Asosiy rang»dan almashtirish mumkin.
- **Tanlov shaxsiy:** har bir xodimning ko'rinishi alohida saqlanadi (`GET/PUT /api/me/appearance`, ichki kalit `uvix:apr:<id>`). Tanlamagan xodim kompaniya standartida ishlaydi. «Kompaniya standartiga qaytish» — shaxsiy tanlovni o'chiradi.
- **Kompaniya standarti (admin):** «Mening ko'rinishimni standart qilish» va **rol bo'yicha mavzu** (masalan Dizayner → OLED qora, Pechatchi → Yuqori kontrast). `uvix:appearance` endi faqat admin yozadi; `roleDefaults` serverda tozalanadi.
- **Tungi mavzuga avtomatik o'tish:** «O'chiq | Qurilmaga mos | Jadval bo'yicha» (masalan 19:00–07:00), tungi mavzu: Grafit / Tun ko'k / Iliq tun / OLED qora.
- **Shisha rejimi xatosi tuzatildi:** fon + «Shisha» yoqilganda matnlar yorug' mavzu rangida qolib, deyarli ko'rinmasdi. Endi mavzu har doim yakuniy holatdan (shisha fon, tungi fon, avtomatik tun) hisoblanadi. Yorug' oboilarda (Yumshoq gradient, Tong, Kun) shisha pardasi to'qroq — oq matn o'qiladi.
- **Kontrast tuzatishlari:** chatdagi «Bosqich» tanlovi (oq matn och fonda), Davomat / CRM vazifalari / ishchi ilovasi / Bo'yoq ombori holat yorliqlari (mavzu ranglariga o'tkazildi), Grafitda «Naqd» yorlig'i, Telegram papka hisoblagichi, oq matnli tugmalar (`greenSolid`, `roseSolid`, `amberSolid`, `blueSolid`), urg'u ustidagi matn kontrast bo'yicha tanlanadi. Xira kulrang matn barcha mavzularda ≥ 4.5 : 1.
- Tekshiruv: 9 mavzu × 9 urg'u rangi bo'yicha 2617 ta kontrast sharti (unit), haqiqiy backend E2E (30 ta), demo ilovada 11 mavzu × 35 ekran bo'yicha avtomatik kontrast auditi (3:1 dan past matn — 0).

## 📱 Telefon: 1-bosqich — buyurtmalar, pastki varaq, rolga mos menyu (2026-10)
Faqat telefon ko'rinishi (ekran ≤ 720 px; «Yana» va pastki menyu ≤ 860 px). Kompyuter ko'rinishi o'zgarmadi — eski va yangi build 18 ta ekranda piksel bo'yicha bir xil.
- **Buyurtmalar — ixcham qator:** mijoz, buyurtma raqami va ish nomi, summa, qarz yoki «to'langan», holat yorlig'i va to'lov chizig'i. Ekranga avvalgi 3 ta o'rniga 6 ta buyurtma sig'adi. Qatordagi mayda ikonkalar (Faktura, Tahrirlash, O'chirish) tafsilotga ko'chdi — adashib bosilmaydi.
- **Surish (swipe):** o'ngga — **«To'lov»**; chapga — **«Topshirildi»** (tayyor bo'lsa), **«Telegram»** (ilovadagi chat, bo'lmasa @username), **«Qo'ng'iroq»** (`tel:`). Bir vaqtda faqat bitta qator ochiq; ochiq turganda boshqa qatorni bosish — faqat yopadi; vertikal aylantirish surishni boshlamaydi. Telefoni ham, Telegrami ham yo'q mijozda chap amallar chiqmaydi.
- **Holat filtrlari** aylantirganda tepada yopishib turadi (telefonda `.uvix-shell` uchun `overflow-x: clip`).
- **Buyurtma tafsiloti — pastki varaq:** qator (yoki «Mijoz bo'yicha»dagi buyurtma) bosilganda ro'yxatdan chiqmasdan ochiladi. Summa / to'langan / qarz, **ishlab chiqarish bosqichlari** (Dizayn → Pechat → Tayyor → Topshirildi: kim, qancha vaqtdan beri), holat va ijrochini o'zgartirish, to'lovlar tarixi. Pastda doim: **«To'lov qabul qilish»**, Telegram va «⋯» (Hisob-faktura, Tahrirlash, Qo'ng'iroq, O'chirish). Yopish: tutqichdan pastga tortish, fonni bosish, telefonning «orqaga» harakati yoki ×.
- **Rolga mos pastki menyu:** operator — Asosiy · **Chatlar** · + · Buyurtma · CRM; admin — Asosiy · Buyurtma · + · **Operatsiya** · CRM. Faqat xodim (yoki admin «Hamma uchun») pastki menyuni qo'lda tanlamagan bo'lsa qo'llanadi; eski standart saqlangan bo'lsa ham rol standarti ishlaydi. Qo'lda tanlov `barSet` bayrog'i bilan saqlanadi (`/api/me/nav`).
- **«Chatlar» ustida raqam** — oxirgi marta Chatlar ochilgandan keyin kelgan Telegram xabarlari (bildirishnomalardan). «Chatlar» pastki menyuda bo'lmasa — raqam «Yana» ustida.
- **«Yana» — plitkalar varag'i:** barcha bo'limlar rangli plitkalarda, qidiruv (nomi va «pul», «telegram», «xodim» kabi so'zlar bo'yicha), Mijozlarda qarzdorlar soni. **Plitkani ushlab turish** — bo'limni pastki menyuga qo'shadi yoki olib tashlaydi (to'lgan bo'lsa eng eskisi o'rniga); nuqta — pastki menyudagilar. Pastda: xodim, «Menyuni sozlash» (to'liq tahrirlovchi), «Chiqish».
- Yangi fayllar: `views/orders/MobileOrderRow.jsx`, `components/MoreSheet.jsx`, `lib/sheetDrag.js`; `OrderPanel` — `variant="sheet"`.
- Tekshiruv: haqiqiy backend E2E — 61 ta (sichqoncha va sensorli surish, varaq, menyu, rollar, saqlash), sensorli imo-ishoralar alohida, demo — 9 ta, menyu standartlari unit — 10 ta, avvalgi mavzu E2E — 30/30.
- Keyingi bosqichlar: 01 «Bugun» bosh ekrani, 05 Chat + smeta; 3-bosqich — QR skaner. Pastga tortib yangilash sessiyani tiklash (A2) bilan birga qilinadi: hozir brauzerning o'z «tortib yangilash»i sahifani qayta yuklab, tizimdan chiqarib yuboradi.

## 🛡️ Muhim tuzatishlar A1–A4: pul himoyasi, sessiya va qulf, xatolar, avtomatik testlar (2026-10)
**A1 — pul ma'lumotlari serverda himoyalangan** (`backend/money-guard.js`)
- Operator to'lov **qo'sha oladi**. Mavjud to'lovni o'zgartirish yoki o'chirish, buyurtmani o'chirish va buyurtma summasini **kamaytirish** — faqat **admin tasdig'i bilan**: operator sabab yozib «Tasdiqlashga yuborish»ni bosadi, to'lov qatorida «tasdiq kutmoqda» turadi.
- Admin Dashboard va Buyurtmalar tepasida **«Tasdiqlash so'rovlari»** kartasini ko'radi (eski → yangi summa, sabab), bir bosishda tasdiqlaydi yoki rad etadi. Adminga Telegram'da va ilovada xabar, xodimga — qaror. Admin to'lov summasini o'zi to'g'ridan-to'g'ri o'zgartira oladi (qatorda «avval …» ko'rinadi).
- Qoidalarni **server tekshiradi** (`/api/kv/uvix:orders` — PUT va merge): ilovani chetlab yuborilgan o'zgarish qabul qilinmaydi, serverdagi holat qaytariladi, urinish jurnalga «Rad etildi (server)» bo'lib yoziladi va adminga xabar boradi. Eskirgan nusxa (boshqa xodim keyinroq o'zgartirgan) urinish deb hisoblanmaydi — `editedAt` / `totalAt` belgilari solishtiriladi.
- **Jurnal faqat qo'shiladi**: kim, qachon va qaysi qurilmadan — server yozadi; eski yozuvni hech kim (admin ham) o'zgartira yoki o'chira olmaydi. Xodimlar → Tarix: qulf belgisi va qurilma ustuni.
- API: `GET/POST /api/approvals`, `DELETE /api/approvals/:id` (o'z so'rovini bekor qilish), `POST /api/approvals/:id/approve|reject` (admin). Ichki kalit `uvix:approvals`.

**A2 — sessiya tiklanadi, ekran qulflanadi** (`backend/sessions.js`, `frontend/src/lib/lock.js`)
- Kirish qurilmada 12 soat saqlanadi: **F5** yoki ilovani qayta ochishda PIN qayta so'ralmaydi, xodim qaysi bo'limda bo'lsa o'sha yerda qoladi (`GET /api/auth/me`).
- Harakatsiz qolsa (standart **15 daqiqa**, Sozlamalar → Profil → Xavfsizlik: 5/15/30/60/o'chiq, shu qurilma uchun) — **qulf ekrani**: PIN yoki Face ID bilan ochiladi, ochiq oynalar va kiritilayotgan ma'lumot joyida qoladi. Bir nechta oyna bir-biri bilan sinxron qulflanadi/ochiladi. «Hozir qulflash» tugmasi bor.
- **Ochiq qurilmalar**: har bir kirish o'z seans raqamiga ega (`jti`); ro'yxatda qurilma, oxirgi faollik va **«Chiqarish»** (yo'qolgan telefon). Admin barcha xodimlarnikini ko'radi. «Chiqish» tokenni serverda ham bekor qiladi. Chiqarilgan qurilma keyingi so'rovda kirish ekraniga qaytadi.

**A3 — xatolar ushlanadi va adminga yetadi** (`backend/error-reports.js`, `components/ErrorBoundary.jsx`)
- Oq ekran o'rniga **«Nimadir xato ketdi»** oynasi: «Qayta yuklash» (avval saqlanmagan o'zgarishlar yuboriladi), «Bosh sahifaga», **xato kodi**. Bo'limdagi xato menyuni yiqitmaydi.
- Xato (brauzer va server) **«Sozlamalar → Ma'lumotlar → So'nggi xatolar»**ga yoziladi: kod, bo'lim, xodim, qurilma, necha marta. Adminga Telegram va ilovada xabar — **bir xil xato takrorlansa bitta xabar** (24 soatda bir). «Tizim holati»da «Xatolar (24 soat)».
- **Serverni tashqaridan kuzatish (bir martalik sozlash):** UptimeRobot (bepul) yoki shunga o'xshash xizmatda HTTP monitor: `https://<sizning-domen>/api/health`, har 5 daqiqa — server to'xtasa SMS/email/Telegram keladi.

**A4 — avtomatik testlar loyihada** (`tests/`, `.github/workflows/tests.yml`)
- `npm run test:unit` (node:test) va `npm run test:e2e` (haqiqiy server + Playwright, har to'plam toza bazada): mavzular, pul himoyasi, sessiya va qulf, xatolar, telefon ekranlari — 22 ta unit test (ichida 2 617 ta mavzu sharti) va 162 ta E2E tekshiruv. Tafsilot — `tests/README.md`.
- GitHub **har yangilanishda o'zi ishga tushiradi**. **Bir martalik sozlash:** Railway → servis → Settings → **«Wait for CI»**ni yoqing (GitHub ruxsatini tasdiqlash so'ralishi mumkin) — shunda biror test yiqilsa yangi versiya ishga chiqmaydi, eski versiya ishlashda davom etadi.
- Kompyuter ko'rinishi: oldingi versiya bilan 18 ta ekranda piksel bo'yicha solishtirildi — farq faqat Sozlamalar → Profil'dagi yangi «Xavfsizlik» kartasida.

---

## 📱 Telefon: 2–3-bosqich — «Bugun», chat + smeta, QR yorliq va skaner (2026-10)

**1. «Bugun» bosh ekrani** (telefonda Dashboard o'rniga; kompyuterda o'zgarmagan)
- Tepada surib ko'riladigan kartalar: **bugungi tushum** (kecha bilan farq, 7 kunlik chiziq), **qarzdorlik** (necha mijoz), **bugungi buyurtmalar**.
- **«Diqqat talab qiladi»** — har biri bir bosishda: javobsiz chatlar (mijoz oxirgi yozgan, eng uzoq kutgani birinchi) → «Javob»; tayyor, olib ketilmagan buyurtma → «Topshirish» (pastki varaq ochiladi); 7 kundan oshgan qarzlar → «Ko'rish»; dizaynda 3 soatdan uzoq turgan ish (dizayner ismi bilan); vazifa berilmagan buyurtmalar → «Berish».
- Tezkor amallar: Buyurtma · To'lov · Rasxod · Skaner. To'liq hisobot — pastdagi «Batafsil hisobot» (holat eslab qolinadi). Pastki menyuda bo'lim nomi — «Bugun».

**5. Chat va smeta bir ekranda** (telefon)
- Chat sarlavhasidagi 🧮 tugmasi smetani **chat ostidagi varaqda** ochadi — mijoz xabarlari ko'rinib turadi. Varaqni kattalashtirish, ✕ yoki telefonning «orqaga»si bilan yopiladi. «Mijoz ma'lumotlari»dagi smeta ham shu varaqqa o'tdi.
- Klaviatura ustida **tayyor javob tugmalari** (Narx, Karta, Manzil…): bosilsa matn maydonga tushadi, yuborishdan oldin tahrirlash mumkin. Ro'yxat — avvalgi «Tayyor javoblar» sozlamasidan.

**6. QR yorliq va sex skaneri**
- Buyurtma panelida (kompyuter: sarlavhadagi QR belgisi; telefon: «⋯» → «QR yorliq chop etish») — yorliq: QR, buyurtma raqami (smetada «2/3»), ish nomi, material/o'lcham/m², mijoz, sana va muddat. **Summa yo'q.** O'lcham: 58×40 mm (termoprinter) yoki 100×70 mm; nusxa soni; smetaning hamma buyurtmalari bir yo'la.
- **Pechatchi/dizayner telefonida** pastki menyu: Vazifalar · **Skaner** · Profil. Yorliq skanerlansa — o'sha buyurtmadagi **o'z vazifasi** katta tugmalar bilan ochiladi: «Boshlash», «Pauza», «Tayyor» (adashmaslik uchun ikki bosishda). Dizayn tugasa ish o'zi pechatchiga o'tadi, pechat tugasa buyurtma «Tayyor». Boshqaning ishi bo'lsa — «sizga vazifa yo'q» (server ham ruxsat bermaydi).
- **Xodim** (admin/operator) skanerlasa — buyurtmaning o'zi ochiladi. Yorliqni oddiy telefon kamerasi bilan o'qisa ham bo'ladi: UVIX ochiladi va kirgandan keyin shu buyurtma (yoki vazifa) ko'rsatiladi.

**Sinovlar:** yangi `tests/unit/mobile2.test.mjs` (5) va `tests/e2e/test_mobile2.py` (36 tekshiruv; skaner Chromium'ning soxta kamerasiga QR video berib, haqiqiy o'qish bilan sinaladi). Jami: 27 unit, 198 E2E. Kompyuter ko'rinishi 18 ta ekranda solishtirildi — farq faqat buyurtma panelining sarlavhasidagi kichik QR belgisi.

### 💬 «Javob shart emas» (2026-10)
«Javob kutmoqda» chatni ochish bilan o'chmaydi — mijozga javob yozilgandagina o'chadi (aks holda ochib ko'rib, javob unutilardi). Javob kerak bo'lmagan chatlar uchun («Rahmat», «Xo'p»): ochiq chatdagi «Mijoz … javob kutmoqda» qatoridagi yoki ro'yxatda chatni bosib turganda (kompyuterda — o'ng tugma) chiqadigan **«Javob shart emas»**. Shundan keyin chat «Javob kutmoqda», «Bugun» ekrani va kechikish haqidagi Telegram eslatmalaridan chiqadi; mijoz yana yozsa — avtomatik qaytadi.

## 🔀 Ikki yo'nalish: UVIXPRINT / UVONYX — 1-qadam (2026-10)
- **Yo'nalish kartasi** chap menyu tepasida (telefonda va ixcham menyuda — tepa paneldagi yorliq, bosilsa pastdan varaq). Tanlov har xodimga shu qurilmada eslab qolinadi. Tezkor tugmalar: **Ctrl 1** — UVIXPRINT, **Ctrl 2** — UVONYX, **Ctrl 3** — ikkalasi (faqat rahbar).
- Tanlangan yo'nalishda **Bugun, Dashboard, Buyurtmalar, Rasxod, Operatsiyalar, Mijozlar va Hisobot** faqat shu yo'nalish ma'lumotlarini ko'rsatadi; ekran tepasida yo'nalish rangidagi ingichka chiziq.
- **Rasxod**: «Faqat UVONYX / Umumiy (ikkalasi)». Umumiy rasxod ro'yxatda to'liq summasi bilan, qoldiq/foyda hisobida esa shu oydagi tushum ulushiga qarab bo'linadi (tushum bo'lmasa — teng). Eski rasxodlar: buyurtmaga bog'langan bo'lsa — o'sha buyurtma yo'nalishi, aks holda «Umumiy».
- **Raqamlash**: UVONYX buyurtmalari `ON-YYMMDD-NNN`, UVIXPRINT — `UV-…` (serverdagi smeta → buyurtma ham).
- **Bo'yoq ombori** faqat UVIXPRINT yo'nalishida. Rahbar standart holatda «Ikkalasi»ni ko'radi (avvalgidek), boshqa xodimlar — UVIXPRINT. Ishchi ilovasi, Chatlar va CRM o'zgarmadi.
- Fayllar: `frontend/src/lib/lines.js`, `frontend/src/components/LineSwitcher.jsx`; testlar: `tests/unit/lines.test.mjs`, `tests/e2e/test_lines.py`.

## 👥 Yo'nalishlar — 1-etap: xodim o'z yo'nalishida (2026-10)
- **Xodimlar** bo'limida «Yo'nalish» ustuni (faqat rahbar o'zgartiradi): **UVIXPRINT**, **UVONYX** yoki **Umumiy** (pechatnik, dizayner — ikkala yo'nalishdagi o'z vazifalari, pulsiz). Belgilanmagan eski xodim — UVIXPRINT.
- Xodim faqat o'z yo'nalishini ko'radi: buyurtmalar, rasxodlar (o'zi + umumiy, umumiy rasxod ulushi bilan), Dashboard, Hisob. Bo'yoq ombori — faqat UVIXPRINT xodimlarida.
- **Server himoyasi** (`backend/lines.js`): `/api/kv/uvix:orders` va `uvix:transactions` xodimga yo'nalish bo'yicha filtrlangan holda beriladi; boshqa yo'nalish yozuvini o'zgartirish/o'chirish, umumiy rasxodni tahrirlash e'tiborsiz qoladi; xodim yozgan yangi buyurtma/rasxod uning yo'nalishiga yoziladi; smeta→buyurtma, holat, to'lov, hisob-faktura — faqat o'z yo'nalishi buyurtmalari.
- Yo'nalishni almashtirish kartasi, telefondagi yorliq va rangli chiziq **olib tashlandi**. Rahbar hammasini ko'radi; Dashboard'da «Barchasi / UVIXPRINT / UVONYX» tugmalari buyurtma va rasxodni birga ajratadi.
- Testlar: `tests/unit/lines-server.test.mjs`, `tests/e2e/test_lines.py`.

## 📊 Yo'nalishlar — 2-etap: «Foyda va zarar» (2026-10)
- Rahbar Dashboard'i tepasida jadval: **UVIXPRINT | UVONYX | Jami** — tushum (shu oydagi to'lovlar), to'g'ridan-to'g'ri rasxod, umumiy rasxod ulushi (tushum nisbatida), sof foyda, marja, o'tgan oyga nisbatan o'zgarish, hozirgi qarzdorlik va tushum ulushi chizig'i. Oy — Dashboard'dagi «Oy» tanlovi (aks holda joriy oy). Hisob: `frontend/src/lib/pnl.js`.
- Rasxod ro'yxatida rahbar uchun filtr: Barchasi / UVIXPRINT / UVONYX / Umumiy (shu qurilmada eslab qolinadi).

## ✅ Yo'nalishlar — 3-etap: «Vazifalar» (2026-10)
- Menyuda **Vazifalar** (Ishlab chiqarish guruhi): o'lchov, montaj, yetkazish, boshqa. Har vazifada: turi, buyurtma (ixtiyoriy), nomi, sana, vaqt, manzil, mijoz telefoni, bir yoki bir nechta mas'ul, izoh, holat (Yangi / Jarayonda / Bajarildi / Bekor).
- Ko'rinish: **Ro'yxat** (Kechikkan, Bugun, Ertaga, Keyinroq, Sanasiz, Bajarilgan) va **hafta kalendari**; turi bo'yicha filtr, «Faqat menga». Dizayn/pechat vazifalari ham shu yerda (faqat ko'rish).
- **Zanjir**: buyurtma «Tayyor» → avtomatik «Yetkazish» (UVIXPRINT) yoki «Montaj» (UVONYX), mas'ulsiz — menejer tayinlaydi. Buyurtmaga bog'langan montaj/yetkazish «Bajarildi» → buyurtma «Topshirildi» (lid ham yangilanadi).
- **Ishchi telefoni**: «Joydagi ishlar» — Bugun / Ertaga / Keyin / Kechikkan, «Yo'l» (xarita), «Qo'ng'iroq», «Bajarildi». Yangi rol **Montajchi** (faqat o'z vazifalari, pulsiz).
- **Huquqlar**: rahbar — hammasi; yo'nalish xodimi — o'z yo'nalishi; ishchi — faqat o'ziga berilgani (faqat holat va izoh). Vazifani menejer/rahbar qo'shadi.
- **Telegram**: tayinlanganda mas'ulga xabar; sana va vaqt bo'lsa — 1 soat oldin eslatma.
- Server: `backend/jobs.js` (`/api/jobs`), ma'lumot `uvix:jobs` (KV orqali yopiq). Test: `tests/e2e/test_jobs.py`.

## 👷 Yo'nalishlar — 4-etap: umumiy xodim oyligi (2026-10)
- Rasxod → «Xodimlar» kategoriyasi → **Xodim** tanlanadi (rahbar). Xodim UVIXPRINT/UVONYX bo'lsa — rasxod shu yo'nalishga; **Umumiy** bo'lsa — oylik shu oyda bajargan vazifalari nisbatida bo'linadi (masalan 84 UV / 36 ON → 70% / 30%). Vazifa bo'lmagan oyda — tushum ulushi.
- Hisoblanadigan ishlar: buyurtmadagi dizayn/pechat (bajarilgan) va «Vazifalar»dagi o'lchov/montaj/yetkazish (bajarilgan, har mas'ulga). Server: `GET /api/work-stats` (faqat rahbar); yo'nalish xodimiga umumiy oylik o'z ulushi bilan yuboriladi.
- «Foyda va zarar»da alohida qator — «Umumiy xodimlar oyligi (bajargan ishi bo'yicha)»; Xodimlar ro'yxatida umumiy xodim yonida «Shu oy: 84 UV · 36 ON → 70% / 30%».

## 💬 Yo'nalishlar — 5-etap: har yo'nalishning o'z Telegram akkaunti (2026-10)
- Sozlamalar → Integratsiyalar: **UVIXPRINT Telegram** (hozirgi akkaunt) va **UVONYX Telegram** — har biri alohida ulanadi (QR / telefon kodi; hozircha rahbar ulaydi). Sessiyalar: `uvix:tgSession` va `uvix:tgSession:UVONYX`.
- UVONYX akkaunti chatlari `on:<id>` ko'rinishida saqlanadi (xabarlar, kontaktlar, lidlar, chat sozlamalari) — birinchi akkaunt bilan aralashmaydi; xabar yuborish/tarix avtomatik to'g'ri akkaunt orqali.
- **Ajratish (server)**: Chatlar ro'yxati, xabarlar, yuborish, izoh, «yozyapti», qidiruv, papkalar — xodimga faqat o'z yo'nalishi. Lidlar (`lead.line`; chatdan — akkaunt bo'yicha), mijozlar (o'z yo'nalishida yaratilgan yoki shu yo'nalishda buyurtmasi bor), smeta va lid vazifalari ham. Bildirishnoma (yangi xabar) — faqat shu yo'nalish xodimlariga.
- Rahbar hammasini ko'radi: Chatlarda UVONYX chatida «ON» belgisi, yangi lidda yo'nalish tanlovi.
- Test: `tests/e2e/test_tg_lines.py`.

## 🧱 Yo'nalishlar — 6-etap: UVONYX bosqichlari (2026-10)
- **CRM (UVONYX):** Murojaat → O'lchov → Smeta → Dizayn → Ishlab chiqarish → Tayyor/o'rnatish. Lid kartasidagi 📏 tugma — o'lchov vazifasi (lid bilan bog'lanadi): qo'shilsa lid «O'lchov»ga, bajarilsa «Smeta»ga o'tadi. Kartada eng yaqin ochiq ish ko'rinadi.
- **Buyurtma (UVONYX):** Navbatda → Dizayn → Material → Ishlab chiqarish → Tayyor → O'rnatish → Topshirildi. Montaj vazifasi boshlansa — «O'rnatish», bajarilsa — «Topshirildi» (lid yopiladi). UVIXPRINT bosqichlari avvalgidek.
- Test: `tests/e2e/test_stages.py`.

## 🧑‍💼 Yo'nalishlar — 7-etap: rollar va huquqlar (2026-10)
- **Rahbar → Katta menejer → Operator (sotuv menejeri).** Katta menejer o'z yo'nalishining hammasini ko'radi, «Hisobot» ochiq; tasdiqlash so'rovlarini (to'lovni o'zgartirish/o'chirish, summani kamaytirish, buyurtmani o'chirish) o'z chegarasigacha tasdiqlaydi — server tekshiradi (`backend/money-guard.js`: `canDecide`, `requestAmount`).
- Xodimlar → ✏️ «Rol va huquqlar»: rol, kassa qoldig'i (Dashboard qoldiqlari, «Jami pul», to'lov turlari), foyda (qo'shilgan qiymat, kraska), tasdiqlash chegarasi. `employee.perm = { cash, profit, approveLimit }`.
- Mijozlar: «Mas'ul menejer» — operator boshqa menejerga biriktirilgan mijozni ko'rmaydi; mas'ulni faqat rahbar yoki katta menejer o'zgartiradi (server ham).
- Test: `tests/e2e/test_roles.py`.

## 💰 Yo'nalishlar — 8-etap: kategoriyalar va yirik rasxodlar (2026-10)
- Kategoriyalar (rahbar): har kategoriyaga standart yo'nalish (`settings.categoryLines`) — yangi rasxodda o'zi qo'yiladi, cheklamaydi.
- «Yirik rasxod chegarasi» (`settings.bigExpenseLimit`): «Yirik» belgisi, rahbarga Telegram (yo'nalish sozlamasidan qat'i nazar) va ilova bildirishnomasi, Dashboard'da «Yirik rasxodlar» kartasi (oxirgi 30 kun, «Ko'rildi» → `tx.bigSeenAt`), Rasxod'da «Faqat yiriklar».
- Test: `tests/e2e/test_bigexp.py`.

## 🏦 Yo'nalishlar — 9-etap: alohida kassalar (2026-10)
- «Kassalar» (rahbar; katta menejer — kassa huquqi bilan, o'z yo'nalishi): UVIXPRINT / UVONYX × naqd / karta / bank — kirim (to'lovlar), chiqim (rasxodlar), o'tkazma, qoldiq. Hisob: `frontend/src/lib/kassa.js`.
- Umumiy rasxod: `tx.paidFrom` — qaysi kassadan to'langan (belgilanmagan eski umumiy rasxod — UVIXPRINT). Foyda/zarar hisobida umumiy rasxod avvalgidek ulush bo'yicha.
- Ichki o'tkazma: `uvix:transfers` (faqat rahbar yozadi; xodimga faqat o'z yo'nalishiga tegishlisi beriladi). O'chirish — belgilanadi (`deletedAt`), tarix saqlanadi.
- Test: `tests/e2e/test_kassa.py`.
