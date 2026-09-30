// server.js — UVIX moliyaviy tizimi uchun REST API server (autentifikatsiya bilan)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const XLSX = require("xlsx");
const nodemailer = require("nodemailer");
const telegramUserbot = require("./telegram-userbot");
const multer = require("multer");
const db = require("./db");
const { registerTaskRoutes, mergeLeadTaskState } = require("./tasks");

// ==================== Rasm (foto hisobot) saqlash ====================
// Rasmlar bazaning o'zi bilan bir joyda (doimiy diskda) saqlanadi — Railway'da
// bu /data papkasi, DB_PATH orqali aniqlanadi, shuning uchun qayta ishga
// tushirilganda ham rasmlar yo'qolmaydi.
const UPLOADS_DIR = path.join(path.dirname(db.DB_PATH), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
telegramUserbot.setMediaDir(UPLOADS_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const id = crypto.randomBytes(12).toString("hex");
      const ext = (path.extname(file.originalname) || ".jpg").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".jpg";
      cb(null, `${id}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 }, // 8MB/rasm, bir so'rovda max 10 ta
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(new Error("Faqat rasm fayllari (jpg, png, webp) qabul qilinadi"));
    cb(null, true);
  },
});

const PORT = process.env.PORT || 4000;
const app = express();
// Javoblarni siqib yuborish (JSON va JS fayllar 3–5 barobar kichrayadi — telefonda sezilarli tezlik)
app.use(compression({ threshold: 1024 }));

// CORS — standart holatda o'chiq (frontend shu serverning o'zidan beriladi).
// Frontend boshqa domenda bo'lsa: CORS_ORIGIN="https://a.uz,https://b.uz"
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
if (CORS_ORIGINS.length) app.use(cors({ origin: CORS_ORIGINS }));

app.set("trust proxy", 1); // Railway/Nginx ortida haqiqiy IP'ni olish uchun (rate limit to'g'ri ishlashi uchun)
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "5mb" }));

// ---- JWT sekret kaliti — birinchi ishga tushirilganda yaratiladi va faylga saqlanadi
// (server qayta ishga tushirilganda ham eski tokenlar amal qilishda davom etishi uchun) ----
// Ustuvorlik: JWT_SECRET env o'zgaruvchisi → doimiy diskdagi fayl (DB bilan bir joyda).
const SECRET_PATH = path.join(path.dirname(db.DB_PATH), "uvix.secret");
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) try {
  JWT_SECRET = fs.readFileSync(SECRET_PATH, "utf8").trim();
  if (!JWT_SECRET) throw new Error("empty");
} catch {
  JWT_SECRET = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, JWT_SECRET, { mode: 0o600 });
}
const TOKEN_TTL = "12h";
function issueToken(employee) {
  const token = jwt.sign({ sub: employee.id, role: employee.role, name: employee.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, employee: { id: employee.id, name: employee.name, role: employee.role } };
}
let passkeyApi = null; // pastda, requireAuth'dan keyin ulanadi

app.get("/api/health", (req, res) => {
  // "persistent: false" — Railway'da Volume yo'q: deploy'da ma'lumotlar o'chadi
  res.json({ ok: true, time: new Date().toISOString(), storage: { persistent: db.STORAGE.persistent, problem: db.STORAGE.problem } });
});

// ==================== Ma'lumotlar bazasi bilan ishlash (kv_store) ====================
const getStmt = db.prepare("SELECT key, value FROM kv_store WHERE key = ?");
const upsertStmt = db.prepare(`
  INSERT INTO kv_store (key, value, updated_at, rev) VALUES (?, ?, datetime('now'), 1)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), rev = kv_store.rev + 1
`);
const revStmt = db.prepare("SELECT rev FROM kv_store WHERE key = ?");
const revOf = (key) => revStmt.get(key)?.rev || 0;
const deleteStmt = db.prepare("DELETE FROM kv_store WHERE key = ?");
const listStmt = db.prepare("SELECT key FROM kv_store WHERE key LIKE ?");

function readEmployees() {
  const row = getStmt.get("uvix:employees");
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeEmployees(list) {
  upsertStmt.run("uvix:employees", JSON.stringify(list));
}
function isHashed(pin) {
  return typeof pin === "string" && pin.startsWith("$2");
}
// PIN'larni "sekin", vaqt-hujumidan himoyalangan usulda solishtiradi
function pinMatches(inputPin, storedPin) {
  if (isHashed(storedPin)) {
    try { return bcrypt.compareSync(String(inputPin), storedPin); } catch { return false; }
  }
  // Eski (hali hash qilinmagan) yozuvlar bilan orqaga moslik
  if (typeof storedPin !== "string" || typeof inputPin !== "string") return false;
  if (storedPin.length !== inputPin.length) return false;
  return crypto.timingSafeEqual(Buffer.from(storedPin), Buffer.from(inputPin));
}

// Birinchi ishga tushirilganda — standart admin (hash qilingan PIN bilan) avtomatik yaratiladi
if (readEmployees().length === 0) {
  writeEmployees([{ id: "admin1", name: "Administrator", role: "admin", pin: bcrypt.hashSync("0000", 10) }]);
}

// ==================== Login urinishlarini cheklash (brute-force himoyasi) ====================
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 daqiqa
function clearRateLimit(key) {
  loginAttempts.delete(key);
}
function checkRateLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  rec.count += 1;
  return rec.count <= MAX_ATTEMPTS;
}

// ==================== Auth endpointlari (ochiq — token talab qilinmaydi) ====================

// Faqat ism/rolni qaytaradi (PIN hech qachon qaytarilmaydi) — Kirish ekranida ro'yxat uchun
app.get("/api/auth/employees", (req, res) => {
  const list = readEmployees();
  const withPasskey = passkeyApi ? passkeyApi.employeeIdsWithPasskey() : new Set();
  res.json({ employees: list.map((e) => ({ id: e.id, name: e.name, role: e.role, hasPasskey: withPasskey.has(e.id) })) });
});

// Birinchi administratorni yaratish — FAQAT hali birorta xodim bo'lmaganda ishlaydi
app.post("/api/auth/bootstrap", (req, res) => {
  const existing = readEmployees();
  if (existing.length > 0) {
    return res.status(409).json({ error: "already_initialized" });
  }
  const { name, pin } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name_required" });
  }
  if (!/^\d{4,6}$/.test(String(pin || ""))) {
    return res.status(400).json({ error: "invalid_pin" });
  }
  const employee = {
    id: "admin_" + crypto.randomBytes(6).toString("hex"),
    name: name.trim(),
    role: "admin",
    pin: bcrypt.hashSync(String(pin), 10),
  };
  writeEmployees([employee]);
  const token = jwt.sign({ sub: employee.id, role: employee.role, name: employee.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, employee: { id: employee.id, name: employee.name, role: employee.role } });
});

// Admin PIN'ini tiklash endi faqat server konsolidan: `node reset-admin-pin.js`
// (avval bu ochiq API edi — internetdagi har kim admin PIN'ini 0000 ga qaytara olardi).

// ==================== Email orqali PIN tiklash ====================
const pinResetAttempts = new Map(); // ip -> { count, resetAt }
function checkPinResetRateLimit(ip) {
  const now = Date.now();
  const rec = pinResetAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    pinResetAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 5;
}
async function sendResetEmail(toEmail, code, employeeName) {
  const row = getStmt.get("uvix:settings");
  if (!row) throw new Error("Email yuborish sozlanmagan");
  const settings = JSON.parse(row.value);
  const gmailUser = settings?.gmailUser;
  const gmailAppPassword = settings?.gmailAppPassword;
  if (!gmailUser || !gmailAppPassword) throw new Error("Email yuborish sozlanmagan (admin bilan bog'laning)");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  await transporter.sendMail({
    from: `"UVIX Moliya" <${gmailUser}>`,
    to: toEmail,
    subject: "UVIX — PIN tiklash kodi",
    html: `<p>Salom, ${employeeName}!</p><p>PIN kodingizni tiklash uchun tasdiqlash kodi:</p><h2 style="letter-spacing:4px">${code}</h2><p>Bu kod 10 daqiqa amal qiladi. Agar bu so'rovni siz yubormagan bo'lsangiz, e'tiborsiz qoldiring.</p>`,
  });
}

// 1-qadam: email kiritiladi, tasdiqlash kodi shu email'ga yuboriladi
app.post("/api/auth/forgot-pin", async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  if (!checkPinResetRateLimit(ip)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring." });
  }
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "missing_email" });
  const employees = readEmployees();
  const employee = employees.find((e) => (e.email || "").trim().toLowerCase() === String(email).trim().toLowerCase());
  // Xavfsizlik uchun: email topilmasa ham xuddi shunday muvaffaqiyatli javob qaytaramiz —
  // aks holda tashqi kishi qaysi emaillar ro'yxatda borligini "sinab ko'rish" imkoniga ega bo'lardi.
  if (!employee) {
    return res.json({ ok: true });
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  upsertStmt.run(`uvix:pinReset:${employee.id}`, JSON.stringify({ code, expiresAt, attempts: 0 }));
  try {
    await sendResetEmail(employee.email, code, employee.name);
    res.json({ ok: true });
  } catch (e) {
    console.error("Reset email yuborishda xato:", e.message);
    res.status(500).json({ error: "email_send_failed", message: "Email yuborilmadi — Gmail sozlamalarini tekshiring" });
  }
});

// 2-qadam: kod va yangi PIN tasdiqlanadi
app.post("/api/auth/reset-pin-with-code", (req, res) => {
  const ip = req.ip || "unknown";
  if (!checkPinResetRateLimit(ip)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring." });
  }
  const { email, code, newPin } = req.body || {};
  if (!email || !code || !newPin) return res.status(400).json({ error: "missing_fields" });
  if (!/^\d{4,6}$/.test(String(newPin))) return res.status(400).json({ error: "invalid_pin" });
  const employees = readEmployees();
  const employee = employees.find((e) => (e.email || "").trim().toLowerCase() === String(email).trim().toLowerCase());
  if (!employee) return res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
  const row = getStmt.get(`uvix:pinReset:${employee.id}`);
  if (!row) return res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
  const record = JSON.parse(row.value);
  const codeOk = typeof record.code === "string" && String(code).length === record.code.length &&
    crypto.timingSafeEqual(Buffer.from(String(code)), Buffer.from(record.code));
  if (!codeOk || Date.now() > record.expiresAt) {
    // 5 ta noto'g'ri urinishdan keyin kod butunlay bekor qilinadi
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= 5 || Date.now() > record.expiresAt) deleteStmt.run(`uvix:pinReset:${employee.id}`);
    else upsertStmt.run(`uvix:pinReset:${employee.id}`, JSON.stringify(record));
    return res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
  }
  employee.pin = bcrypt.hashSync(String(newPin), 10);
  writeEmployees(employees);
  deleteStmt.run(`uvix:pinReset:${employee.id}`);
  res.json({ ok: true });
});

// Kirish — PIN tekshiriladi, muvaffaqiyatli bo'lsa token beriladi
app.post("/api/auth/login", (req, res) => {
  const { employeeId, name, pin } = req.body || {};
  // Cheklov IP + xodim bo'yicha: bir ofisdagi (bitta IP) xodimlar bir-birini bloklab qo'ymaydi
  const limitKey = `${req.ip || "unknown"}:${employeeId || String(name || "").toLowerCase()}`;
  if (!checkRateLimit(limitKey)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring." });
  }
  if ((!employeeId && !name) || !pin) {
    return res.status(400).json({ error: "missing_fields" });
  }
  const employees = readEmployees();
  const employee = employeeId
    ? employees.find((e) => e.id === employeeId)
    : employees.find((e) => e.name.trim().toLowerCase() === String(name).trim().toLowerCase());
  if (!employee || !pinMatches(String(pin), employee.pin)) {
    return res.status(401).json({ error: "invalid_credentials", message: "Foydalanuvchi yoki PIN noto'g'ri" });
  }
  // Agar hali hash qilinmagan (eski) PIN bo'lsa — shu yerda avtomatik hash'ga o'giramiz
  if (!isHashed(employee.pin)) {
    employee.pin = bcrypt.hashSync(String(pin), 10);
    writeEmployees(employees);
  }
  clearRateLimit(limitKey);
  res.json(issueToken(employee));
});

// ==================== Middleware — bundan pastdagi HAMMA yo'l token talab qiladi ====================
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
  // Rolni tokendan emas, bazadagi JORIY holatdan olamiz: xodim o'chirilsa yoki
  // admin huquqi olib tashlansa — bu darhol kuchga kiradi (12 soat kutmasdan).
  const employee = readEmployees().find((e) => e.id === payload.sub);
  if (!employee) return res.status(401).json({ error: "invalid_token" });
  req.user = { sub: employee.id, id: employee.id, name: employee.name, role: employee.role };
  next();
}
// Dizayner va Pechatchi — faqat o'z vazifalarini ko'radigan "ishchi" rollar (pul ma'lumotlarisiz)
const WORKER_ROLES = new Set(["designer", "printer"]);
const isWorker = (user) => WORKER_ROLES.has(user?.role);
// Ishchi rollar o'qishi/yozishi mumkin bo'lgan KV kalitlari (qolgani — 403)
const WORKER_READ_KEYS = new Set(["uvix:employees", "uvix:appearance", "uvix:settings"]);
const WORKER_WRITE_KEYS = new Set(["uvix:employees"]); // faqat o'z PIN'ini o'zgartirish uchun
function requireStaff(req, res, next) {
  if (isWorker(req.user)) return res.status(403).json({ error: "forbidden", message: "Bu bo'lim sizning rolingiz uchun yopiq" });
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden", message: "Faqat administrator uchun" });
  next();
}
app.use("/api/kv", requireAuth);

// ==================== Face ID / barmoq izi (passkey) ====================
passkeyApi = require("./passkeys")(app, {
  getStmt, upsertStmt, readEmployees, requireAuth, issueToken,
  rateLimit: (key) => checkRateLimit(`passkey:${key}`),
});

// ==================== Dizayner / Pechatchi vazifalari ====================
registerTaskRoutes(app, { getStmt, upsertStmt, readEmployees, requireAuth, isWorker });

// ==================== KV kirish huquqlari ====================
// Sozlamalardagi maxfiy maydonlar — faqat admin ko'radi/o'zgartiradi
const SECRET_SETTING_FIELDS = ["telegramBotToken", "gmailAppPassword", "telegramUserApiHash", "telegramUserSession", "telegramUserApiId", "telegramUserPhone"];
// Oddiy xodim yozishi mumkin bo'lgan kalitlar (qolganlari — faqat admin)
const USER_WRITABLE_KEYS = new Set(["uvix:orders", "uvix:transactions", "uvix:leads", "uvix:audit", "uvix:categories", "uvix:settings", "uvix:appearance", "uvix:employees"]);
// Hech kim KV orqali o'qiy/yoza olmaydigan ichki kalitlar
function isInternalKey(key) {
  return key.startsWith("uvix:pinReset:") || key === "uvix:passkeys" || key.startsWith("uvix:dash:");
}
function sanitizeEmployeesForClient(list, user) {
  // PIN (hatto hash ham) hech qachon brauzerga yuborilmaydi; boshqalarning email'ini faqat admin ko'radi
  const isAdmin = !user || user.role === "admin";
  return list.map(({ pin, ...rest }) => {
    if (!isAdmin && rest.id !== user.id) delete rest.email;
    return rest;
  });
}
function sanitizeSettingsForClient(settings, isAdmin, user) {
  if (isWorker(user) && settings && typeof settings === "object") {
    // Ishchilarga faqat ko'rinishga oid sozlamalar (kurs, summa formatlari va h.k. emas)
    return {};
  }
  if (isAdmin || !settings || typeof settings !== "object") return settings;
  const copy = { ...settings };
  SECRET_SETTING_FIELDS.forEach((f) => delete copy[f]);
  return copy;
}

// ==================== Foto hisobot (buyurtma rasmlari) ====================
app.post("/api/photos/upload", requireAuth, requireStaff, (req, res) => {
  upload.array("photos", 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: "upload_failed", message: err.message });
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: "no_files" });
    const results = files.map((f) => ({
      id: path.parse(f.filename).name,
      filename: f.filename,
      url: `/api/photos/${f.filename}`,
      uploadedBy: req.user?.name || "Noma'lum",
      uploadedAt: new Date().toISOString(),
    }));
    res.json({ ok: true, photos: results });
  });
});

// Rasmni ko'rish — auth headersiz (chunki <img> tegi Authorization header yubora olmaydi).
// Xavfsizlik — fayl nomi 24 xonali tasodifiy hex kod (taxmin qilib bo'lmaydi), shuning uchun
// bu odatiy "unguessable URL" himoyasi bilan yetarli darajada xavfsiz.
app.get("/api/photos/:filename", (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9.]/g, "");
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  // Faqat rasm/video/ovoz/PDF brauzerda ochiladi. Qolgan hamma narsa (HTML, SVG, exe, zip...) —
  // faqat yuklab olinadi: mijoz yuborgan zararli fayl sahifamiz ichida ishga tushib ketmasligi uchun.
  const ext = path.extname(filename).toLowerCase();
  const INLINE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov", ".m4a", ".ogg", ".mp3", ".pdf"]);
  const wantName = typeof req.query.name === "string" ? req.query.name.replace(/[\r\n"\\/]/g, "").slice(0, 150) : "";
  if (!INLINE.has(ext) || req.query.dl) {
    res.setHeader("Content-Type", INLINE.has(ext) ? (ext === ".pdf" ? "application/pdf" : "application/octet-stream") : "application/octet-stream");
    return res.download(filePath, wantName || filename);
  }
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(filePath);
});

app.delete("/api/photos/:filename", requireAuth, requireStaff, (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9.]/g, "");
  const filePath = path.join(UPLOADS_DIR, filename);
  if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ ok: true });
});

app.get("/api/kv/:key", (req, res) => {
  const key = req.params.key;
  if (isInternalKey(key)) return res.status(403).json({ error: "forbidden" });
  if (isWorker(req.user) && !WORKER_READ_KEYS.has(key)) return res.status(403).json({ error: "forbidden" });
  const row = getStmt.get(key);
  if (!row) return res.status(404).json({ error: "not_found" });
  const rev = revOf(key);
  // ?rev=N — brauzerdagi nusxa hali eskirmagan bo'lsa, ma'lumotni qayta yubormaymiz
  if (req.query.rev != null && Number(req.query.rev) === rev) return res.json({ key, unchanged: true, rev });
  const isAdmin = req.user.role === "admin";
  if (key === "uvix:employees") {
    return res.json({ key, rev, value: JSON.stringify(sanitizeEmployeesForClient(readEmployees(), req.user)) });
  }
  if (key === "uvix:settings") {
    try {
      return res.json({ key, rev, value: JSON.stringify(sanitizeSettingsForClient(JSON.parse(row.value), isAdmin, req.user)) });
    } catch { /* buzilgan JSON — pastda xom holda qaytaramiz */ }
  }
  res.json({ key: row.key, rev, value: row.value });
});

// ==================== Telegram xabarnomalari ====================
function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
}
async function sendTelegramMessage(text) {
  try {
    const row = getStmt.get("uvix:settings");
    if (!row) return;
    const settings = JSON.parse(row.value);
    const token = settings?.telegramBotToken;
    const chatId = settings?.telegramChatId;
    if (!token || !chatId) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("Telegram xabar yuborishda xato:", e.message);
  }
}

function getTelegramConfig() {
  const row = getStmt.get("uvix:settings");
  if (!row) return null;
  const settings = JSON.parse(row.value);
  const token = settings?.telegramBotToken;
  const chatId = settings?.telegramChatId;
  if (!token || !chatId) return null;
  return { token, chatId };
}

// Telegram'ga fayl (hujjat) yuborish — Excel hisobot va baza zaxirasi shu orqali jo'natiladi
async function sendTelegramDocument(buffer, filename, caption) {
  const cfg = getTelegramConfig();
  if (!cfg) return;
  try {
    const form = new FormData();
    form.append("chat_id", cfg.chatId);
    if (caption) form.append("caption", caption);
    form.append("document", new Blob([buffer]), filename);
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendDocument`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Telegram fayl yuborishda xato:", res.status, body);
    }
  } catch (e) {
    console.error("Telegram fayl yuborishda xato:", e.message);
  }
}

// Joriy ma'lumotlar asosida Excel hisobot (Buyurtmalar + Rasxodlar) yaratadi
function buildDailyExcelBuffer() {
  const ordersRow = getStmt.get("uvix:orders");
  const txRow = getStmt.get("uvix:transactions");
  const orders = ordersRow ? JSON.parse(ordersRow.value) : [];
  const transactions = txRow ? JSON.parse(txRow.value) : [];

  const orderRows = orders
    .filter((o) => !o.deletedAt)
    .map((o) => {
      const paid = (o.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0);
      return {
        "Buyurtma №": o.orderNumber, Sana: o.date, Mijoz: o.customer, "Sub kategoriya": o.subcategory,
        "Umumiy summasi": o.agreementUzs || 0, "To'langan": paid, Qarzdorlik: Math.max(0, (o.agreementUzs || 0) - paid),
        "Kraska summasi": o.kraskaSum || 0, "Material summasi": o.materialSum || 0,
      };
    });
  const expenseRows = transactions
    .filter((t) => !t.deletedAt && t.type === "chiqim")
    .map((t) => ({ Sana: t.date, Kategoriya: t.category, Subkategoriya: t.subcategory, Summa: t.amount, "To'lov turi": t.paymentType, Izoh: t.note || "" }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "Buyurtmalar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), "Rasxodlar");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function runDailyBackup() {
  const cfg = getTelegramConfig();
  if (!cfg) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const excelBuffer = buildDailyExcelBuffer();
    await sendTelegramDocument(excelBuffer, `UVIX_hisobot_${today}.xlsx`, `📊 Kunlik hisobot — ${today}`);
    // serialize() — WAL jurnalidagi eng so'nggi o'zgarishlar ham kiradi (faylni to'g'ridan-to'g'ri o'qish ularni tushirib qoldirardi)
    const dbBuffer = db.serialize();
    await sendTelegramDocument(dbBuffer, `uvix_backup_${today}.db`, `🗄 Baza zaxirasi — ${today}`);
    upsertStmt.run("uvix:lastBackupDate", today);
  } catch (e) {
    console.error("Kunlik zaxira xatosi:", e.message);
  }
}

// Har 5 daqiqada tekshiradi: sozlamalardagi "backupTime" (masalan "21:00") vaqti kelganmi
// va bugun hali yuborilmaganmi — shunda avtomatik zaxira yuboradi.
setInterval(() => {
  try {
    const row = getStmt.get("uvix:settings");
    if (!row) return;
    const settings = JSON.parse(row.value);
    if (!settings?.telegramBotToken || !settings?.telegramChatId) return;
    const backupTime = settings.backupTime || "21:00";
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const nowStr = `${hh}:${mm}`;
    const today = now.toISOString().slice(0, 10);
    const lastRow = getStmt.get("uvix:lastBackupDate");
    const lastDate = lastRow ? JSON.parse(lastRow.value) : null;
    if (nowStr >= backupTime && lastDate !== today) {
      runDailyBackup();
    }
  } catch (e) {
    console.error("Zaxira tekshiruvi xatosi:", e.message);
  }
}, 5 * 60 * 1000);

function notifyOrdersDiff(oldValue, newValue) {
  try {
    const oldOrders = oldValue ? JSON.parse(oldValue) : [];
    const newOrders = JSON.parse(newValue);
    if (!Array.isArray(newOrders)) return;
    const oldById = new Map(oldOrders.map((o) => [o.id, o]));
    newOrders.forEach((o) => {
      const old = oldById.get(o.id);
      if (!old) {
        sendTelegramMessage(
          `🆕 <b>Yangi buyurtma</b>\nMijoz: ${escHtml(o.customer)}\nBuyurtma №: ${escHtml(o.orderNumber)}\nSumma: ${fmtMoney(o.agreementUzs)}`
        );
        (o.payments || []).forEach((p) => {
          sendTelegramMessage(
            `💰 <b>Yangi to'lov</b>\nMijoz: ${escHtml(o.customer)} (${escHtml(o.orderNumber)})\nSumma: ${fmtMoney(p.amount)}\nTuri: ${escHtml(p.paymentType)}`
          );
        });
      } else {
        const oldPayIds = new Set((old.payments || []).map((p) => p.id));
        (o.payments || []).forEach((p) => {
          if (!oldPayIds.has(p.id)) {
            sendTelegramMessage(
              `💰 <b>Yangi to'lov</b>\nMijoz: ${escHtml(o.customer)} (${escHtml(o.orderNumber)})\nSumma: ${fmtMoney(p.amount)}\nTuri: ${escHtml(p.paymentType)}`
            );
          }
        });
      }
    });
  } catch (e) {
    console.error("Buyurtma xabarnomasi xatosi:", e.message);
  }
}
function notifyExpensesDiff(oldValue, newValue) {
  try {
    const oldTx = oldValue ? JSON.parse(oldValue) : [];
    const newTx = JSON.parse(newValue);
    if (!Array.isArray(newTx)) return;
    const oldIds = new Set(oldTx.map((t) => t.id));
    newTx.forEach((t) => {
      if (!oldIds.has(t.id) && t.type === "chiqim") {
        sendTelegramMessage(
          `💸 <b>Yangi rasxod</b>\nKategoriya: ${escHtml(t.category)}${t.subcategory ? " / " + escHtml(t.subcategory) : ""}\nSumma: ${fmtMoney(t.amount)}${t.note ? `\nIzoh: ${escHtml(t.note)}` : ""}`
        );
      }
    });
  } catch (e) {
    console.error("Rasxod xabarnomasi xatosi:", e.message);
  }
}

// Xodimlar ro'yxatini saqlash — server tomonda qat'iy tekshiruv bilan.
// Admin: qo'shish/o'chirish/rol/PIN o'zgartirishi mumkin (lekin oxirgi adminni o'chira olmaydi).
// Oddiy xodim: faqat O'ZINING PIN'ini o'zgartira oladi, qolgan hamma narsa e'tiborsiz qoldiriladi.
function mergeEmployees(incoming, user) {
  const existing = readEmployees();
  const byId = new Map(existing.map((e) => [e.id, e]));
  const isAdmin = user.role === "admin";
  const validPin = (p) => typeof p === "string" && /^\d{4,6}$/.test(p);

  if (!isAdmin) {
    const mine = incoming.find((e) => e && e.id === user.id);
    const result = existing.map((e) => {
      if (e.id === user.id && mine && validPin(mine.pin) && !pinMatches(mine.pin, e.pin)) {
        return { ...e, pin: bcrypt.hashSync(mine.pin, 10) };
      }
      return e;
    });
    return { list: result };
  }

  const result = [];
  const seen = new Set();
  for (const e of incoming) {
    if (!e || typeof e.id !== "string" || seen.has(e.id)) continue;
    seen.add(e.id);
    const old = byId.get(e.id);
    const name = String(e.name || old?.name || "").trim();
    if (!name) continue;
    const role = e.role === "admin" ? "admin" : (typeof e.role === "string" ? e.role : old?.role || "operator");
    let pin = old?.pin;
    if (validPin(e.pin) && !(old && pinMatches(e.pin, old.pin))) pin = bcrypt.hashSync(e.pin, 10);
    if (!pin) return { error: "Yangi xodim uchun 4-6 xonali PIN kerak" };
    // Yuborilmagan maydonlar (masalan email) eskisidan saqlanadi — tasodifan o'chib ketmasligi uchun
    const { pin: _ignored, hasPasskey: _hp, ...rest } = e;
    const { pin: _oldPin, ...oldRest } = old || {};
    result.push({ ...oldRest, ...rest, name, role, pin });
  }
  if (!result.some((e) => e.role === "admin")) return { error: "Kamida bitta administrator qolishi shart" };
  return { list: result };
}

// ---- Har bir xodimning o'z dashboard ko'rinishi (tartib, o'lcham, ranglar) ----
// Umumiy ko'rinishni administrator belgilaydi (settings.dashboardLayout), xodim uni o'zi uchun moslashtirsa — shu yerda saqlanadi.
app.get("/api/me/dashboard", requireAuth, (req, res) => {
  const row = getStmt.get(`uvix:dash:${req.user.id}`);
  let prefs = null;
  try { prefs = row ? JSON.parse(row.value) : null; } catch { prefs = null; }
  res.json({ prefs });
});
app.put("/api/me/dashboard", requireAuth, (req, res) => {
  const prefs = req.body?.prefs;
  const key = `uvix:dash:${req.user.id}`;
  if (prefs === null) { deleteStmt.run(key); return res.json({ prefs: null }); }
  if (!prefs || typeof prefs !== "object" || !Array.isArray(prefs.layout)) return res.status(400).json({ error: "invalid_prefs" });
  const layout = prefs.layout.slice(0, 100).filter((w) => w && typeof w.id === "string").map((w) => ({ id: w.id.slice(0, 60), visible: !!w.visible, size: ["sm", "md", "lg", "full"].includes(w.size) ? w.size : "md" }));
  const cardStyles = {};
  Object.entries(prefs.cardStyles || {}).slice(0, 100).forEach(([id, st]) => {
    if (st && typeof st === "object" && (!st.color || /^#[0-9A-Fa-f]{6}$/.test(st.color))) cardStyles[id.slice(0, 60)] = { filled: !!st.filled, color: st.color || null };
  });
  const clean = { layout, cardStyles };
  upsertStmt.run(key, JSON.stringify(clean));
  res.json({ prefs: clean });
});

// ---- Birlashtirib saqlash: faqat o'zgargan yozuvlar yuboriladi ----
// Ikki xodim bir vaqtda ishlasa ham bir-birining o'zgarishini o'chirib yubormaydi:
// server hozirgi ro'yxatga faqat shu xodim qo'shgan/o'zgartirgan/o'chirgan yozuvlarni qo'llaydi.
const MERGE_KEYS = new Set(["uvix:orders", "uvix:transactions", "uvix:leads", "uvix:audit"]);
const MAX_ITEMS = { "uvix:audit": 500 };
app.post("/api/kv/:key/merge", (req, res) => {
  const key = req.params.key;
  if (!MERGE_KEYS.has(key)) return res.status(400).json({ error: "merge_not_supported" });
  if (isWorker(req.user)) return res.status(403).json({ error: "forbidden" });
  const { upserts = [], deletes = [] } = req.body || {};
  if (!Array.isArray(upserts) || !Array.isArray(deletes) || upserts.length > 20000 || deletes.length > 20000) {
    return res.status(400).json({ error: "invalid_patch" });
  }
  if (upserts.some((u) => !u || typeof u.item !== "object" || u.item === null || typeof u.item.id !== "string" && typeof u.item.id !== "number")) {
    return res.status(400).json({ error: "invalid_item", message: "Har bir yozuvda id bo'lishi kerak" });
  }
  const tx = db.transaction(() => {
    const oldRow = getStmt.get(key);
    const oldValue = oldRow ? oldRow.value : null;
    let list = [];
    try { list = oldValue ? JSON.parse(oldValue) : []; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    const del = new Set(deletes.map(String));
    list = list.filter((x) => !del.has(String(x?.id)));
    const pos = new Map(list.map((x, i) => [String(x?.id), i]));
    const toStart = [];
    const toEnd = [];
    for (const u of upserts) {
      const id = String(u.item.id);
      if (pos.has(id)) list[pos.get(id)] = u.item;
      else (u.at === "start" ? toStart : toEnd).push(u.item);
    }
    let next = [...toStart, ...list, ...toEnd];
    if (key === "uvix:leads") next = mergeLeadTaskState(next, oldValue ? JSON.parse(oldValue) : []);
    if (MAX_ITEMS[key] && next.length > MAX_ITEMS[key]) next = next.slice(0, MAX_ITEMS[key]);
    const value = JSON.stringify(next);
    upsertStmt.run(key, value);
    return { oldValue, value };
  });
  let result;
  try {
    result = tx();
  } catch (e) {
    console.error("Birlashtirib saqlashda xato:", e.message);
    return res.status(500).json({ error: "merge_failed" });
  }
  res.json({ key, rev: revOf(key), value: result.value });
  if (key === "uvix:orders") notifyOrdersDiff(result.oldValue, result.value);
  else if (key === "uvix:transactions") notifyExpensesDiff(result.oldValue, result.value);
});

app.put("/api/kv/:key", (req, res) => {
  const key = req.params.key;
  const { value } = req.body || {};
  if (typeof value !== "string") {
    return res.status(400).json({ error: "value_must_be_string" });
  }
  if (key.length > 200) {
    return res.status(400).json({ error: "key_too_long" });
  }
  if (isInternalKey(key)) return res.status(403).json({ error: "forbidden" });
  const isAdmin = req.user.role === "admin";
  if (isWorker(req.user) && !WORKER_WRITE_KEYS.has(key)) return res.status(403).json({ error: "forbidden" });
  if (!isAdmin && !USER_WRITABLE_KEYS.has(key)) {
    return res.status(403).json({ error: "forbidden", message: "Faqat administrator uchun" });
  }
  const oldRow = getStmt.get(key);
  const oldValue = oldRow ? oldRow.value : null;

  if (key === "uvix:employees") {
    let list;
    try { list = JSON.parse(value); } catch { return res.status(400).json({ error: "invalid_json" }); }
    if (!Array.isArray(list)) return res.status(400).json({ error: "must_be_array" });
    const merged = mergeEmployees(list, req.user);
    if (merged.error) return res.status(400).json({ error: "invalid_employees", message: merged.error });
    writeEmployees(merged.list);
    passkeyApi.removeForMissingEmployees(new Set(merged.list.map((e) => e.id)));
    return res.json({ key, rev: revOf(key), value: JSON.stringify(sanitizeEmployeesForClient(merged.list, req.user)) });
  }

  if (key === "uvix:settings" && !isAdmin) {
    // Oddiy xodim maxfiy maydonlarni ko'rmaydi va o'zgartira olmaydi — eskisini saqlab qolamiz
    let next;
    try { next = JSON.parse(value); } catch { return res.status(400).json({ error: "invalid_json" }); }
    const prev = oldValue ? JSON.parse(oldValue) : {};
    SECRET_SETTING_FIELDS.forEach((f) => {
      if (f in prev) next[f] = prev[f]; else delete next[f];
    });
    upsertStmt.run(key, JSON.stringify(next));
    return res.json({ key, rev: revOf(key), value: JSON.stringify(sanitizeSettingsForClient(next, false)) });
  }

  if (key === "uvix:leads") {
    // Dizayner/pechatchi vazifa holatini o'zgartirgan bo'lsa, menejerning eskirgan nusxasi uni bosib ketmasin
    try {
      const merged = mergeLeadTaskState(JSON.parse(value), oldValue ? JSON.parse(oldValue) : []);
      upsertStmt.run(key, JSON.stringify(merged));
      return res.json({ key, rev: revOf(key), value: JSON.stringify(merged) });
    } catch { /* JSON emas — pastda oddiy saqlanadi */ }
  }
  upsertStmt.run(req.params.key, value);
  res.json({ key: req.params.key, rev: revOf(req.params.key), value });

  // Telegram xabarnomalari — javob yuborilgandan keyin, orqa fonda (foydalanuvchini kutdirmasdan)
  if (req.params.key === "uvix:orders") {
    notifyOrdersDiff(oldValue, value);
  } else if (req.params.key === "uvix:transactions") {
    notifyExpensesDiff(oldValue, value);
  }
});


app.delete("/api/kv/:key", requireAdmin, (req, res) => {
  if (isInternalKey(req.params.key) || req.params.key === "uvix:employees") return res.status(403).json({ error: "forbidden" });
  deleteStmt.run(req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

app.get("/api/kv", (req, res) => {
  const prefix = req.query.prefix || "";
  const rows = listStmt.all(`${prefix}%`);
  const keys = rows.map((r) => r.key).filter((k) => !isInternalKey(k) && (!isWorker(req.user) || WORKER_READ_KEYS.has(k)));
  res.json({ keys });
});

// Qo'lda "Hoziroq yubor" — Sozlamalar sahifasidagi tugma shu yerni chaqiradi (faqat tizimga kirgan foydalanuvchi uchun)
app.post("/api/backup/send-now", requireAuth, requireAdmin, (req, res) => {
  const cfg = getTelegramConfig();
  if (!cfg) return res.status(400).json({ error: "telegram_not_configured" });
  runDailyBackup()
    .then(() => res.json({ ok: true }))
    .catch((e) => res.status(500).json({ error: "send_failed", message: e.message }));
});

// ---- Tizim holati (faqat admin): baza qayerda, doimiy diskdami, nechta yozuv bor ----
function countKey(key) {
  try {
    const v = JSON.parse(getStmt.get(key)?.value || "[]");
    return Array.isArray(v) ? v.filter((x) => !x?.deletedAt).length : 0;
  } catch { return 0; }
}
function dataCounts() {
  return { orders: countKey("uvix:orders"), transactions: countKey("uvix:transactions"), leads: countKey("uvix:leads"), employees: countKey("uvix:employees") };
}
app.get("/api/system/status", requireAuth, requireAdmin, (req, res) => {
  const lastBackup = (() => { try { return JSON.parse(getStmt.get("uvix:lastBackupDate")?.value || "null"); } catch { return null; } })();
  res.json({ storage: db.STORAGE, dbPath: db.DB_PATH, counts: dataCounts(), lastBackup, backupConfigured: !!getTelegramConfig() });
});

// ---- Zaxiradan tiklash: Telegram'ga kelgan uvix_backup_YYYY-MM-DD.db faylini yuklash ----
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, require("os").tmpdir()),
    filename: (req, file, cb) => cb(null, `uvix-restore-${crypto.randomBytes(8).toString("hex")}.db`),
  }),
  limits: { fileSize: 300 * 1024 * 1024, files: 1 },
});
function readBackupFile(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head.toString("latin1") !== "SQLite format 3\u0000") throw new Error("Bu fayl UVIX zaxirasi emas (SQLite bazasi emas)");
  const Database = require("better-sqlite3");
  const src = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const hasTable = src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'").get();
    if (!hasTable) throw new Error("Faylda UVIX ma'lumotlari topilmadi");
    const rows = src.prepare("SELECT key, value, updated_at FROM kv_store").all();
    if (!rows.some((r) => r.key === "uvix:employees")) throw new Error("Zaxirada xodimlar ro'yxati yo'q — bu to'liq UVIX zaxirasi emas");
    return rows;
  } finally {
    src.close();
  }
}
function countsOf(rows) {
  const get = (k) => { try { const v = JSON.parse(rows.find((r) => r.key === k)?.value || "[]"); return Array.isArray(v) ? v.filter((x) => !x?.deletedAt).length : 0; } catch { return 0; } };
  return { orders: get("uvix:orders"), transactions: get("uvix:transactions"), leads: get("uvix:leads"), employees: get("uvix:employees") };
}
// 1-qadam: tekshirish (hech narsa o'zgarmaydi) · 2-qadam: ?apply=1 bilan haqiqiy tiklash
app.post("/api/backup/restore", requireAuth, requireAdmin, restoreUpload.single("file"), (req, res) => {
  const file = req.file?.path;
  if (!file) return res.status(400).json({ error: "no_file", message: "Zaxira fayli tanlanmadi" });
  try {
    const rows = readBackupFile(file);
    const incoming = countsOf(rows);
    if (req.query.apply !== "1") return res.json({ ok: true, preview: true, incoming, current: dataCounts() });
    // Hozirgi holatni ham saqlab qo'yamiz — xato fayl tanlansa, orqaga qaytish mumkin bo'lsin
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safety = path.join(path.dirname(db.DB_PATH), `uvix.before-restore-${stamp}.db`);
    fs.writeFileSync(safety, db.serialize());
    const insert = db.prepare("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)");
    db.transaction(() => {
      // Versiya raqamlari oldingilaridan katta bo'lsin — ochiq brauzerlar o'zgarishni sezsin
      const maxRev = db.prepare("SELECT COALESCE(MAX(rev), 0) AS m FROM kv_store").get().m;
      db.prepare("DELETE FROM kv_store").run();
      for (const r of rows) insert.run(r.key, r.value, r.updated_at || new Date().toISOString());
      db.prepare("UPDATE kv_store SET rev = ?").run(maxRev + 1);
    })();
    dialogsCache = { at: 0, list: [] };
    historySyncedAt.clear();
    const auditRow = getStmt.get("uvix:audit");
    try {
      const audit = auditRow ? JSON.parse(auditRow.value) : [];
      audit.unshift({ id: crypto.randomBytes(6).toString("hex"), who: req.user?.name || "Admin", what: `Baza zaxiradan tiklandi (${req.file.originalname || "fayl"})`, when: new Date().toISOString() });
      upsertStmt.run("uvix:audit", JSON.stringify(audit.slice(0, 500)));
    } catch { /* jurnal ixtiyoriy */ }
    console.log(`Baza zaxiradan tiklandi: ${req.file.originalname}. Oldingi holat: ${safety}`);
    res.json({ ok: true, restored: true, counts: dataCounts() });
  } catch (e) {
    res.status(400).json({ error: "restore_failed", message: e.message });
  } finally {
    fs.unlink(file, () => {});
  }
});

// ---- (ixtiyoriy) frontend build'ini shu serverdan ham berish uchun ----
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");
// /assets/ ichidagi fayllar nomida xesh bor (index-AbC123.js) — ular hech qachon o'zgarmaydi,
// shuning uchun brauzer ularni 1 yil keshda saqlaydi. index.html esa har doim yangisi olinadi.
app.use("/assets", express.static(path.join(FRONTEND_DIST, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
app.use(express.static(FRONTEND_DIST, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  },
}));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(FRONTEND_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("Frontend build topilmadi. Avval `npm run build` qiling.");
  });
});

// ==================== Telegram shaxsiy akkaunt (CRM chat) ====================
// ---- Telegram xabarlarini saqlash (takrorlanishsiz) ----
function normalizeTgMessage(m, out) {
  return {
    id: crypto.randomUUID(),
    text: m.text || "", mediaUrl: m.mediaUrl || null, mediaUrlAlt: m.mediaUrlAlt || null, mediaType: m.mediaType || null,
    fileName: m.fileName || null, fileSize: m.fileSize || null,
    lat: m.lat ?? null, lng: m.lng ?? null,
    tgId: m.tgId ?? null, replyToTgId: m.replyToTgId ?? null,
    out: !!out, date: m.date || new Date().toISOString(),
  };
}
// Mavjud xabarni topadi: avval Telegram ID bo'yicha, bo'lmasa (ID'siz eski yozuvlar) — matn + yo'nalish + vaqt (±3 daqiqa)
function findSameMessage(list, m) {
  if (m.tgId != null) {
    const byId = list.find((x) => x.tgId === m.tgId);
    if (byId) return byId;
  }
  const t = new Date(m.date).getTime();
  return list.find((x) => x.tgId == null && !!x.out === !!m.out && (x.text || "") === (m.text || "") && (x.mediaType || null) === (m.mediaType || null)
    && Math.abs(new Date(x.date).getTime() - t) < 3 * 60 * 1000);
}
// Xabarlarni suhbatga qo'shadi; qaytaradi: qo'shilganlar soni
function mergeTgMessages(chatId, incoming) {
  const row = getStmt.get("uvix:telegramMessages");
  const all = row ? JSON.parse(row.value) : {};
  const list = all[chatId] || (all[chatId] = []);
  let added = 0;
  for (const m of incoming) {
    const same = findSameMessage(list, m);
    if (same) {
      if (same.tgId == null && m.tgId != null) same.tgId = m.tgId; // eski yozuvga ID biriktiramiz
      if (same.replyToTgId == null && m.replyToTgId != null) same.replyToTgId = m.replyToTgId;
      continue;
    }
    list.push(normalizeTgMessage(m, m.out));
    added++;
  }
  list.sort((a, b) => new Date(a.date) - new Date(b.date));
  upsertStmt.run("uvix:telegramMessages", JSON.stringify(all));
  return added;
}

// Lidi yo'q suhbatlar uchun ism/username/telefon (Chatlar ro'yxatida ko'rsatish uchun)
function rememberTgContact(chatId, { name, username, phone }) {
  if (!name || String(name).startsWith("Noma'lum")) return;
  const all = JSON.parse(getStmt.get("uvix:telegramContacts")?.value || "{}");
  const prev = all[chatId] || {};
  const next = { name, username: username || prev.username || "", phone: phone || prev.phone || "" };
  if (prev.name === next.name && prev.username === next.username && prev.phone === next.phone) return;
  all[chatId] = next;
  upsertStmt.run("uvix:telegramContacts", JSON.stringify(all));
}

function handleIncomingTelegramMessage(data) {
  const { chatId, out, fromName, username, phone } = data;
  if (out) {
    // Telefondagi Telegram'dan o'zingiz yozgan xabar. CRM'dan yuborilganlar ham shu yerga keladi —
    // ular avval saqlanib ulgurishi uchun biroz kutamiz, keyin Telegram ID bo'yicha takrorini tashlaymiz.
    setTimeout(() => {
      try {
        // Chatlar bo'limi barcha shaxsiy suhbatlarni ko'rsatadi — telefondan yozganingiz ham saqlanadi
        mergeTgMessages(String(chatId), [{ ...data, out: true }]);
      } catch (e) {
        console.error("Chiquvchi Telegram xabarini saqlashda xato:", e.message);
      }
    }, 2500);
    return;
  }
  try {
    mergeTgMessages(String(chatId), [{ ...data, out: false }]);

    rememberTgContact(String(chatId), { name: fromName, username, phone });
    // Lid bor bo'lsa — ism hali "Noma'lum" yoki telefon/username bo'sh bo'lsa, yangi ma'lumot bilan to'ldiramiz.
    const leadsRow = getStmt.get("uvix:leads");
    const leads = leadsRow ? JSON.parse(leadsRow.value) : [];
    const existing = leads.find((l) => l.telegramChatId === String(chatId));
    // Yangi odam yozsa lid AVTOMATIK ochilmaydi — suhbat Chatlar bo'limida ko'rinadi,
    // kerak bo'lsa xodim "CRM'ga qo'shish" tugmasi bilan qo'shadi.
    if (!existing) return;
    {
      let changed = false;
      if ((!existing.customer || existing.customer.startsWith("Noma'lum")) && fromName && !fromName.startsWith("Noma'lum")) {
        existing.customer = fromName;
        changed = true;
      }
      if (!existing.phone && phone) {
        existing.phone = `+${phone}`;
        changed = true;
      }
      if (!existing.telegramUsername && username) {
        existing.telegramUsername = username;
        if (!existing.notes) existing.notes = `Telegram: @${username}`;
        changed = true;
      }
      if (changed) upsertStmt.run("uvix:leads", JSON.stringify(leads));
    }
  } catch (e) {
    console.error("Kiruvchi Telegram xabarini saqlashda xato:", e.message);
  }
}

// "Noma'lum (ID)" bo'lib qolgan lidlarga Telegram'dan haqiqiy ism, username va telefonni yozadi
// Botlar (CardXabar kabi), kanallar va Telegram xizmati bilan yozishmalarni CRM'dan olib tashlaydi.
// Lid faqat avtomatik ochilgan va hech kim tegmagan bo'lsa o'chiriladi.
async function removeBotChats() {
  if (!telegramUserbot.isConnected()) return { removedChats: 0, removedLeads: 0 };
  const msgs = JSON.parse(getStmt.get("uvix:telegramMessages")?.value || "{}");
  const leads = JSON.parse(getStmt.get("uvix:leads")?.value || "[]");
  const ids = new Set([...Object.keys(msgs), ...leads.filter((l) => l.telegramChatId).map((l) => String(l.telegramChatId))]);
  const bots = new Set();
  for (const id of ids) {
    try { if ((await telegramUserbot.isBotChat(id)) === true) bots.add(id); } catch { /* aniqlab bo'lmadi — tegmaymiz */ }
  }
  if (!bots.size) return { removedChats: 0, removedLeads: 0 };
  const freshMsgs = JSON.parse(getStmt.get("uvix:telegramMessages")?.value || "{}");
  let removedChats = 0;
  for (const id of bots) if (freshMsgs[id]) { delete freshMsgs[id]; removedChats++; }
  upsertStmt.run("uvix:telegramMessages", JSON.stringify(freshMsgs));
  const freshLeads = JSON.parse(getStmt.get("uvix:leads")?.value || "[]");
  const untouched = (l) => l.createdBy === "Telegram (avtomatik)" && (l.stage || "new") === "new" && !l.orderId && !l.design && !l.print
    && !Number(l.estimatedValue) && !l.manager;
  const kept = freshLeads.filter((l) => !(l.telegramChatId && bots.has(String(l.telegramChatId)) && untouched(l)));
  const removedLeads = freshLeads.length - kept.length;
  if (removedLeads) upsertStmt.run("uvix:leads", JSON.stringify(kept));
  return { removedChats, removedLeads };
}

async function repairUnknownTelegramNames() {
  if (!telegramUserbot.isConnected()) return { fixed: 0 };
  const cleaned = await removeBotChats().catch((e) => { console.error("Botlarni tozalashda xato:", e.message); return {}; });
  if (cleaned.removedChats || cleaned.removedLeads) console.log(`Telegram: ${cleaned.removedChats} ta bot suhbati va ${cleaned.removedLeads} ta avtomatik lid olib tashlandi`);
  const leadsRow = getStmt.get("uvix:leads");
  const leads = leadsRow ? JSON.parse(leadsRow.value) : [];
  const targets = leads.filter((l) => l.telegramChatId && (!l.customer || l.customer.startsWith("Noma'lum") || !l.telegramUsername || !l.phone));
  if (!targets.length) return { fixed: 0 };
  const names = await telegramUserbot.resolveChatNames([...new Set(targets.map((l) => String(l.telegramChatId)))]);
  // Oraliqda boshqa o'zgarish bo'lgan bo'lishi mumkin — yangidan o'qib, faqat kerakli maydonlarni yozamiz
  const freshRow = getStmt.get("uvix:leads");
  const fresh = freshRow ? JSON.parse(freshRow.value) : [];
  let fixed = 0;
  for (const l of fresh) {
    const info = l.telegramChatId && names[String(l.telegramChatId)];
    if (!info) continue;
    let changed = false;
    if (!l.customer || l.customer.startsWith("Noma'lum")) { l.customer = info.name; changed = true; }
    if (!l.telegramUsername && info.username) {
      l.telegramUsername = info.username;
      if (!l.notes) l.notes = `Telegram: @${info.username}`;
      changed = true;
    }
    if (!l.phone && info.phone) { l.phone = `+${info.phone}`; changed = true; }
    if (changed) fixed++;
  }
  if (fixed) upsertStmt.run("uvix:leads", JSON.stringify(fresh));
  return { fixed };
}

app.post("/api/telegram-user/refresh-names", requireAuth, requireStaff, async (req, res) => {
  try {
    res.json({ ok: true, ...(await repairUnknownTelegramNames()) });
  } catch (e) {
    res.status(500).json({ error: "refresh_failed", message: e.message });
  }
});

app.get("/api/telegram-user/status", requireAuth, requireStaff, (req, res) => {
  res.json(telegramUserbot.getStatus());
});

// Telegram'dagi shaxsiy suhbatlar ro'yxati — daqiqasiga bir marta yangilanadi (Telegram cheklovlari)
let dialogsCache = { at: 0, list: [] };
async function getPrivateDialogs() {
  if (!telegramUserbot.isConnected()) return [];
  if (Date.now() - dialogsCache.at < 60 * 1000) return dialogsCache.list;
  dialogsCache.at = Date.now();
  try {
    dialogsCache.list = await telegramUserbot.listPrivateDialogs(300);
    // Ismlarni eslab qolamiz — Telegram uzilib qolsa ham ro'yxatda ism turadi
    const contacts = JSON.parse(getStmt.get("uvix:telegramContacts")?.value || "{}");
    let changed = false;
    for (const d of dialogsCache.list) {
      if (!d.name || d.name.startsWith("Noma'lum")) continue;
      const c = contacts[d.chatId];
      if (!c || c.name !== d.name || c.username !== d.username || c.phone !== d.phone) {
        contacts[d.chatId] = { name: d.name, username: d.username, phone: d.phone };
        changed = true;
      }
    }
    if (changed) upsertStmt.run("uvix:telegramContacts", JSON.stringify(contacts));
  } catch (e) {
    console.error("Telegram suhbatlar ro'yxatini olishda xato:", e.message);
    dialogsCache.at = Date.now() - 45 * 1000; // 15 soniyadan keyin qayta urinamiz
  }
  return dialogsCache.list;
}

app.get("/api/telegram-user/chats", requireAuth, requireStaff, async (req, res) => {
  let dialogs = [];
  try {
    dialogs = await Promise.race([getPrivateDialogs(), new Promise((r) => setTimeout(() => r(dialogsCache.list), 8000))]);
  } catch { /* saqlangan xabarlar bilan davom etamiz */ }
  const allMessages = JSON.parse(getStmt.get("uvix:telegramMessages")?.value || "{}");
  const lastSeen = JSON.parse(getStmt.get("uvix:telegramLastSeen")?.value || "{}");
  const contacts = JSON.parse(getStmt.get("uvix:telegramContacts")?.value || "{}");
  const byId = new Map();
  for (const [chatId, msgs] of Object.entries(allMessages)) {
    if (!msgs.length) continue;
    const last = msgs[msgs.length - 1];
    const lastIncoming = [...msgs].reverse().find((m) => !m.out);
    const unread = !!(lastIncoming && (!lastSeen[chatId] || new Date(lastIncoming.date) > new Date(lastSeen[chatId])));
    byId.set(chatId, { chatId, lastText: previewText(last), lastOut: !!last?.out, lastDate: last?.date || null, unread });
  }
  for (const d of dialogs) {
    const cur = byId.get(d.chatId);
    const dialogNewer = !cur || new Date(d.lastDate || 0) > new Date(cur.lastDate || 0);
    const seen = lastSeen[d.chatId];
    const dialogUnread = d.unreadCount > 0 && !d.lastOut && (!seen || new Date(d.lastDate || 0) > new Date(seen));
    byId.set(d.chatId, {
      chatId: d.chatId,
      lastText: dialogNewer ? d.lastText : cur.lastText,
      lastOut: dialogNewer ? d.lastOut : cur.lastOut,
      lastDate: dialogNewer ? d.lastDate : cur.lastDate,
      unread: cur ? cur.unread || dialogUnread : dialogUnread,
    });
  }
  const chats = [...byId.values()].map((c) => {
    const info = contacts[c.chatId];
    return info ? { ...c, name: info.name, username: info.username || "", phone: info.phone || "" } : c;
  });
  chats.sort((a, b) => new Date(b.lastDate || 0) - new Date(a.lastDate || 0));
  res.json({ chats });
});

// Suhbatni CRM'ga lid sifatida qo'lda qo'shish
app.post("/api/telegram-user/create-lead", requireAuth, requireStaff, async (req, res) => {
  const chatId = String(req.body?.chatId || "").slice(0, 64);
  if (!/^-?\d+$/.test(chatId)) return res.status(400).json({ error: "missing_chatId" });
  const leads = JSON.parse(getStmt.get("uvix:leads")?.value || "[]");
  const existing = leads.find((l) => String(l.telegramChatId) === chatId);
  if (existing) return res.json({ ok: true, lead: existing, existed: true });
  let info = JSON.parse(getStmt.get("uvix:telegramContacts")?.value || "{}")[chatId] || null;
  try {
    const live = await telegramUserbot.describeChat(chatId);
    if (live?.bot) return res.status(400).json({ error: "is_bot", message: "Botni CRM'ga qo'shib bo'lmaydi" });
    if (live?.known) info = { name: live.name, username: live.username, phone: live.phone };
  } catch { /* saqlangan ma'lumot bilan davom etamiz */ }
  const username = info?.username || "";
  const lead = {
    id: crypto.randomUUID(),
    customer: info?.name || `Noma'lum (${chatId})`,
    phone: info?.phone ? `+${String(info.phone).replace(/^\+/, "")}` : "",
    source: "Telegram",
    estimatedValue: 0,
    manager: "",
    notes: username ? `Telegram: @${username}` : "",
    stage: "new",
    orderId: null,
    telegramChatId: chatId,
    telegramUsername: username,
    createdBy: req.user?.name || "Xodim",
    createdAt: new Date().toISOString(),
  };
  const fresh = JSON.parse(getStmt.get("uvix:leads")?.value || "[]");
  if (fresh.some((l) => String(l.telegramChatId) === chatId)) return res.json({ ok: true, lead: fresh.find((l) => String(l.telegramChatId) === chatId), existed: true });
  fresh.unshift(lead);
  upsertStmt.run("uvix:leads", JSON.stringify(fresh));
  res.json({ ok: true, lead });
});

app.post("/api/telegram-user/mark-read", requireAuth, requireStaff, (req, res) => {
  const { chatId } = req.body || {};
  if (!chatId) return res.status(400).json({ error: "missing_chatId" });
  const seenRow = getStmt.get("uvix:telegramLastSeen");
  const lastSeen = seenRow ? JSON.parse(seenRow.value) : {};
  lastSeen[chatId] = new Date().toISOString();
  upsertStmt.run("uvix:telegramLastSeen", JSON.stringify(lastSeen));
  res.json({ ok: true });
});

app.post("/api/telegram-user/connect", requireAuth, requireAdmin, async (req, res) => {
  const row = getStmt.get("uvix:settings");
  const settings = row ? JSON.parse(row.value) : {};
  const result = await telegramUserbot.connectFromSettings(settings, handleIncomingTelegramMessage);
  if (result.ok) repairUnknownTelegramNames().catch((e) => console.error("Ismlarni tiklashda xato:", e.message));
  if (result.ok) res.json({ ok: true });
  else res.status(400).json({ error: "connect_failed", message: result.error });
});

app.post("/api/telegram-user/disconnect", requireAuth, requireAdmin, async (req, res) => {
  await telegramUserbot.disconnect();
  res.json({ ok: true });
});

// Suhbat ochilganda Telegram'dan so'nggi xabarlar tortib olinadi (telefondan yozganlaringiz ham).
// Bir suhbat uchun daqiqasiga ko'pi bilan bir marta — Telegram cheklovlariga rioya qilish uchun.
const historySyncedAt = new Map();
async function syncChatHistory(chatId) {
  if (!telegramUserbot.isConnected()) return;
  const row = getStmt.get("uvix:telegramMessages");
  const stored = (row ? JSON.parse(row.value) : {})[chatId] || [];
  const last = historySyncedAt.get(chatId) || 0;
  // Saqlangan xabar yo'q bo'lsa (yangi suhbat) — kutmasdan darhol olamiz
  if (stored.length && Date.now() - last < 60 * 1000) return;
  historySyncedAt.set(chatId, Date.now());
  const known = new Set(stored.map((m) => m.tgId).filter((x) => x != null));
  const { messages } = await telegramUserbot.fetchHistory(chatId, { limit: 50, knownTgIds: known });
  if (messages.length) mergeTgMessages(chatId, messages);
}
app.get("/api/telegram-user/messages/:chatId", requireAuth, requireStaff, async (req, res) => {
  const chatId = String(req.params.chatId).slice(0, 64);
  try {
    await Promise.race([syncChatHistory(chatId), new Promise((r) => setTimeout(r, 8000))]);
  } catch (e) {
    console.error("Suhbat tarixini olishda xato:", e.message);
  }
  const row = getStmt.get("uvix:telegramMessages");
  const allMessages = row ? JSON.parse(row.value) : {};
  const list = allMessages[chatId] || [];
  // Eski tarixni yuklash mumkinmi: Telegram ulangan va eng eski xabar 1-xabar emas
  const hasOlder = telegramUserbot.isConnected() && !noOlder.has(chatId) && list.some((m) => Number.isInteger(m.tgId) && m.tgId > 1);
  res.json({ messages: list, hasOlder });
});

// Yuqoriga aylantirganda — eskiroq xabarlar (Telegram'dan sahifama-sahifa)
const olderInFlight = new Map();
const noOlder = new Set(); // boshigacha yuklangan suhbatlar
app.get("/api/telegram-user/messages/:chatId/older", requireAuth, requireStaff, async (req, res) => {
  const chatId = String(req.params.chatId).slice(0, 64);
  const limit = Math.min(60, Math.max(10, parseInt(req.query.limit, 10) || 40));
  if (!telegramUserbot.isConnected()) return res.status(409).json({ error: "not_connected", message: "Telegram akkauntga ulanmagan" });
  const stored = JSON.parse(getStmt.get("uvix:telegramMessages")?.value || "{}")[chatId] || [];
  // Eng eski ma'lum xabar ID'sidan boshlab eskiroqlarini so'raymiz
  const ids = stored.map((m) => m.tgId).filter((x) => Number.isInteger(x) && x > 0);
  const before = parseInt(req.query.before, 10) || (ids.length ? Math.min(...ids) : 0);
  if (!before) return res.json({ messages: stored, hasMore: false, added: 0 });
  const key = `${chatId}:${before}`;
  try {
    if (!olderInFlight.has(key)) {
      olderInFlight.set(key, telegramUserbot.fetchHistory(chatId, { limit, offsetId: before, knownTgIds: new Set(ids) }).finally(() => olderInFlight.delete(key)));
    }
    const { messages, hasMore } = await olderInFlight.get(key);
    const added = messages.length ? mergeTgMessages(chatId, messages) : 0;
    if (!hasMore) noOlder.add(chatId);
    const all = JSON.parse(getStmt.get("uvix:telegramMessages")?.value || "{}")[chatId] || [];
    res.json({ messages: all, hasMore, added });
  } catch (e) {
    res.status(500).json({ error: "history_failed", message: e.message });
  }
});

// ---- Chatdan yuborish: matn, rasm, ovozli xabar, joylashuv, reaksiya ----
const tgAudio = require("./audio");
function previewText(m) {
  if (!m) return "";
  if (m.mediaType === "photo") return m.text ? `📷 ${m.text}` : "📷 Rasm";
  if (m.mediaType === "voice") return "🎤 Ovozli xabar";
  if (m.mediaType === "location") return "📍 Joylashuv";
  if (m.mediaType === "video") return m.text ? `🎥 ${m.text}` : "🎥 Video";
  if (m.mediaType === "document") return `📎 ${m.fileName || "Hujjat"}`;
  return m.text || "";
}
function storeOutgoing(chatId, msg) {
  const row = getStmt.get("uvix:telegramMessages");
  const all = row ? JSON.parse(row.value) : {};
  if (!all[chatId]) all[chatId] = [];
  // Telegram shu xabarni "yangi xabar" sifatida ham yuborgan bo'lishi mumkin — takrorlamaymiz
  const existing = msg.tgId != null ? all[chatId].find((x) => x.tgId === msg.tgId) : null;
  if (existing) {
    Object.assign(existing, msg, { out: true });
    upsertStmt.run("uvix:telegramMessages", JSON.stringify(all));
    return existing;
  }
  const full = { id: crypto.randomUUID(), out: true, date: new Date().toISOString(), text: "", mediaUrl: null, mediaType: null, ...msg };
  all[chatId].push(full);
  upsertStmt.run("uvix:telegramMessages", JSON.stringify(all));
  return full;
}
const validChatId = (v) => typeof v === "string" || typeof v === "number" ? String(v).length > 0 && String(v).length < 64 : false;
const replyOpt = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

app.post("/api/telegram-user/send", requireAuth, requireStaff, async (req, res) => {
  const { chatId, text, replyToTgId } = req.body || {};
  if (!validChatId(chatId) || !text || typeof text !== "string") return res.status(400).json({ error: "missing_fields" });
  try {
    const { tgId } = await telegramUserbot.sendMessage(chatId, text, { replyTo: replyOpt(replyToTgId) });
    const message = storeOutgoing(String(chatId), { text, tgId, replyToTgId: replyOpt(replyToTgId) || null });
    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ error: "send_failed", message: e.message });
  }
});

// Rasm yoki ovozli xabar (multipart: file, chatId, kind=photo|voice, caption, replyToTgId)
const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
      cb(null, `${crypto.randomBytes(12).toString("hex")}${ext || ".bin"}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }, // video/hujjat 50 MB gacha (rasm va ovoz — 15 MB, pastda tekshiriladi)
});
app.post("/api/telegram-user/send-media", requireAuth, requireStaff, (req, res) => {
  chatUpload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "upload_failed", message: err.message });
    const f = req.file;
    const { chatId, kind, caption, replyToTgId } = req.body || {};
    if (!f || !validChatId(chatId) || !["photo", "video", "document", "voice"].includes(kind)) {
      if (f) fs.unlink(f.path, () => {});
      return res.status(400).json({ error: "missing_fields" });
    }
    const cleanup = [];
    try {
      const replyTo = replyOpt(replyToTgId);
      // Brauzer fayl nomini latin1 qilib yuboradi — o'zbekcha/ruscha nomlar buzilmasligi uchun tiklaymiz
      const originalName = Buffer.from(f.originalname || "fayl", "latin1").toString("utf8").replace(/[\r\n\\/]/g, "_").slice(0, 150);
      if ((kind === "photo" || kind === "voice") && f.size > 15 * 1024 * 1024) throw new Error("Fayl 15 MB dan katta");
      if (kind === "video") {
        if (!f.mimetype.startsWith("video/")) throw new Error("Video fayli kutilgan edi");
        const { tgId } = await telegramUserbot.sendVideo(chatId, f.path, { caption, replyTo });
        const message = storeOutgoing(String(chatId), { text: caption || "", mediaType: "video", mediaUrl: `/api/photos/${f.filename}`, fileName: originalName, fileSize: f.size, tgId, replyToTgId: replyTo || null });
        return res.json({ ok: true, message });
      }
      if (kind === "document") {
        const { tgId } = await telegramUserbot.sendDocument(chatId, f.path, { fileName: originalName, caption, replyTo });
        const message = storeOutgoing(String(chatId), { text: caption || "", mediaType: "document", mediaUrl: `/api/photos/${f.filename}`, fileName: originalName, fileSize: f.size, tgId, replyToTgId: replyTo || null });
        return res.json({ ok: true, message });
      }
      if (kind === "photo") {
        if (!f.mimetype.startsWith("image/")) throw new Error("Rasm fayli kutilgan edi");
        const { tgId } = await telegramUserbot.sendPhoto(chatId, f.path, { caption, replyTo });
        const message = storeOutgoing(String(chatId), { text: caption || "", mediaType: "photo", mediaUrl: `/api/photos/${f.filename}`, tgId, replyToTgId: replyTo || null });
        return res.json({ ok: true, message });
      }
      // Ovoz: Telegram uchun OGG/Opus, CRM'da ijro uchun M4A
      const base = path.join(UPLOADS_DIR, path.parse(f.filename).name);
      let sendPath = f.path;
      const ogg = await tgAudio.toTelegramVoice(f.path, `${base}.ogg`).catch((e) => { console.error("Ovozni o'girishda xato:", e.message); return null; });
      if (ogg) sendPath = ogg; // OGG'ni o'chirmaymiz — CRM'da ham ijro uchun ishlatiladi
      const duration = tgAudio.probeDuration(sendPath);
      const { tgId } = await telegramUserbot.sendVoice(chatId, sendPath, { replyTo, duration });
      // Ikki format: M4A (iPhone Safari) + OGG/asl yozuv (qolgan brauzerlar)
      const m4a = await tgAudio.toPlayableM4a(f.path, `${base}.m4a`).catch(() => null);
      const altName = ogg ? path.basename(ogg) : f.filename;
      if (ogg) cleanup.push(f.path);
      const message = storeOutgoing(String(chatId), {
        mediaType: "voice",
        mediaUrl: `/api/photos/${m4a ? path.basename(m4a) : altName}`,
        mediaUrlAlt: m4a ? `/api/photos/${altName}` : null,
        duration, tgId, replyToTgId: replyTo || null,
      });
      res.json({ ok: true, message });
    } catch (e) {
      fs.unlink(f.path, () => {});
      res.status(500).json({ error: "send_failed", message: e.message });
    } finally {
      cleanup.forEach((p) => fs.unlink(p, () => {}));
    }
  });
});

app.post("/api/telegram-user/send-location", requireAuth, requireStaff, async (req, res) => {
  const { chatId, lat, lng, replyToTgId } = req.body || {};
  const la = Number(lat), lo = Number(lng);
  if (!validChatId(chatId) || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    return res.status(400).json({ error: "bad_location", message: "Joylashuv noto'g'ri" });
  }
  try {
    const { tgId } = await telegramUserbot.sendLocation(chatId, la, lo, { replyTo: replyOpt(replyToTgId) });
    const message = storeOutgoing(String(chatId), { mediaType: "location", lat: la, lng: lo, tgId, replyToTgId: replyOpt(replyToTgId) || null });
    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ error: "send_failed", message: e.message });
  }
});

// Reaksiya: emoji — qo'yish, null — olib tashlash
const ALLOWED_REACTIONS = new Set(["👍", "❤", "🔥", "😁", "😢", "🙏", "👌"]);
app.post("/api/telegram-user/react", requireAuth, requireStaff, async (req, res) => {
  const { chatId, messageId, emoji } = req.body || {};
  if (!validChatId(chatId) || !messageId || (emoji && !ALLOWED_REACTIONS.has(emoji))) return res.status(400).json({ error: "bad_request" });
  const row = getStmt.get("uvix:telegramMessages");
  const all = row ? JSON.parse(row.value) : {};
  const msg = (all[chatId] || []).find((m) => m.id === messageId);
  if (!msg) return res.status(404).json({ error: "not_found" });
  if (!msg.tgId) return res.status(409).json({ error: "no_tg_id", message: "Bu eski xabarga reaksiya qo'yib bo'lmaydi" });
  try {
    await telegramUserbot.sendReaction(chatId, msg.tgId, emoji || null);
    // Yangidan o'qib yozamiz (oraliqda yangi xabar kelgan bo'lishi mumkin)
    const fresh = JSON.parse(getStmt.get("uvix:telegramMessages").value);
    const target = (fresh[chatId] || []).find((m) => m.id === messageId);
    if (target) target.myReaction = emoji || null;
    upsertStmt.run("uvix:telegramMessages", JSON.stringify(fresh));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "react_failed", message: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`UVIX backend http://localhost:${PORT} da ishga tushdi`);
  console.log(`Baza fayli: ${db.DB_PATH}`);
  console.log(`Autentifikatsiya: YOQILGAN (barcha /api/kv/* yo'llari token talab qiladi)`);

  // Agar Telegram shaxsiy akkaunt sozlamalari saqlangan bo'lsa, server ishga tushganda
  // avtomatik ulanishga harakat qilamiz (qo'lda qayta ulash shart bo'lmasligi uchun)
  try {
    const row = getStmt.get("uvix:settings");
    const settings = row ? JSON.parse(row.value) : {};
    if (settings?.telegramUserApiId && settings?.telegramUserApiHash && settings?.telegramUserSession) {
      telegramUserbot.connectFromSettings(settings, handleIncomingTelegramMessage).then((r) => {
        if (r.ok) {
          console.log("Telegram shaxsiy akkaunt: ulandi");
          repairUnknownTelegramNames()
            .then((x) => x.fixed && console.log(`Telegram: ${x.fixed} ta "Noma'lum" mijozning ismi tiklandi`))
            .catch((e) => console.error("Ismlarni tiklashda xato:", e.message));
        }
        else console.log("Telegram shaxsiy akkaunt: ulanmadi —", r.error);
      });
    }
  } catch (e) {
    console.error("Telegram avto-ulanish xatosi:", e.message);
  }
});
