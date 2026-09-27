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
