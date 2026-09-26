// server.js — UVIX moliyaviy tizimi uchun REST API server (autentifikatsiya bilan)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
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
  res.json({ ok: true, time: new Date().toISOString() });
});

// ==================== Ma'lumotlar bazasi bilan ishlash (kv_store) ====================
const getStmt = db.prepare("SELECT key, value FROM kv_store WHERE key = ?");
const upsertStmt = db.prepare(`
  INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);
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
  return key.startsWith("uvix:pinReset:") || key === "uvix:passkeys";
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
  const isAdmin = req.user.role === "admin";
  if (key === "uvix:employees") {
    return res.json({ key, value: JSON.stringify(sanitizeEmployeesForClient(readEmployees(), req.user)) });
  }
  if (key === "uvix:settings") {
    try {
      return res.json({ key, value: JSON.stringify(sanitizeSettingsForClient(JSON.parse(row.value), isAdmin, req.user)) });
    } catch { /* buzilgan JSON — pastda xom holda qaytaramiz */ }
  }
  res.json({ key: row.key, value: row.value });
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
    const dbBuffer = fs.readFileSync(db.DB_PATH);
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
    return res.json({ key, value: JSON.stringify(sanitizeEmployeesForClient(merged.list, req.user)) });
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
    return res.json({ key, value: JSON.stringify(sanitizeSettingsForClient(next, false)) });
  }

  if (key === "uvix:leads") {
    // Dizayner/pechatchi vazifa holatini o'zgartirgan bo'lsa, menejerning eskirgan nusxasi uni bosib ketmasin
    try {
      const merged = mergeLeadTaskState(JSON.parse(value), oldValue ? JSON.parse(oldValue) : []);
      upsertStmt.run(key, JSON.stringify(merged));
      return res.json({ key, value: JSON.stringify(merged) });
    } catch { /* JSON emas — pastda oddiy saqlanadi */ }
  }
  upsertStmt.run(req.params.key, value);
  res.json({ key: req.params.key, value });

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

// ---- (ixtiyoriy) frontend build'ini shu serverdan ham berish uchun ----
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(FRONTEND_DIST));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(FRONTEND_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("Frontend build topilmadi. Avval `npm run build` qiling.");
  });
});

// ==================== Telegram shaxsiy akkaunt (CRM chat) ====================
function handleIncomingTelegramMessage({ chatId, fromName, username, phone, text, mediaUrl, mediaType, date }) {
  try {
    // Xabarni saqlaymiz
    const row = getStmt.get("uvix:telegramMessages");
    const allMessages = row ? JSON.parse(row.value) : {};
    if (!allMessages[chatId]) allMessages[chatId] = [];
    allMessages[chatId].push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text, mediaUrl: mediaUrl || null, mediaType: mediaType || null, out: false, date });
    upsertStmt.run("uvix:telegramMessages", JSON.stringify(allMessages));

    // Agar shu chatId'ga bog'langan lid bo'lmasa — avtomatik yangi lid yaratamiz.
    // Mavjud bo'lsa ham, agar ism hali "Noma'lum" bo'lsa yoki telefon/username hali
    // bo'sh bo'lsa — endi kelgan yaxshiroq ma'lumot bilan to'ldiramiz (masalan birinchi
    // xabarda ism aniqlanmagan, keyingi xabarda aniqlangan bo'lishi mumkin).
    const leadsRow = getStmt.get("uvix:leads");
    const leads = leadsRow ? JSON.parse(leadsRow.value) : [];
    const existing = leads.find((l) => l.telegramChatId === String(chatId));
    if (!existing) {
      leads.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        customer: fromName,
        phone: phone ? `+${phone}` : "",
        source: "Telegram",
        estimatedValue: 0,
        manager: "",
        notes: username ? `Telegram: @${username}` : "",
        stage: "new",
        orderId: null,
        telegramChatId: String(chatId),
        telegramUsername: username || "",
        createdBy: "Telegram (avtomatik)",
        createdAt: new Date().toISOString(),
      });
      upsertStmt.run("uvix:leads", JSON.stringify(leads));
    } else {
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
async function repairUnknownTelegramNames() {
  if (!telegramUserbot.isConnected()) return { fixed: 0 };
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

app.get("/api/telegram-user/chats", requireAuth, requireStaff, (req, res) => {
  const row = getStmt.get("uvix:telegramMessages");
  const allMessages = row ? JSON.parse(row.value) : {};
  const seenRow = getStmt.get("uvix:telegramLastSeen");
  const lastSeen = seenRow ? JSON.parse(seenRow.value) : {};
  const chats = Object.entries(allMessages).map(([chatId, msgs]) => {
    const last = msgs[msgs.length - 1];
    const lastIncoming = [...msgs].reverse().find((m) => !m.out);
    const unread = !!(lastIncoming && (!lastSeen[chatId] || new Date(lastIncoming.date) > new Date(lastSeen[chatId])));
    return { chatId, lastText: last?.text || "", lastDate: last?.date || null, unread };
  });
  chats.sort((a, b) => new Date(b.lastDate || 0) - new Date(a.lastDate || 0));
  res.json({ chats });
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

app.get("/api/telegram-user/messages/:chatId", requireAuth, requireStaff, (req, res) => {
  const row = getStmt.get("uvix:telegramMessages");
  const allMessages = row ? JSON.parse(row.value) : {};
  res.json({ messages: allMessages[req.params.chatId] || [] });
});

app.post("/api/telegram-user/send", requireAuth, requireStaff, async (req, res) => {
  const { chatId, text } = req.body || {};
  if (!chatId || !text) return res.status(400).json({ error: "missing_fields" });
  try {
    await telegramUserbot.sendMessage(chatId, text);
    const row = getStmt.get("uvix:telegramMessages");
    const allMessages = row ? JSON.parse(row.value) : {};
    if (!allMessages[chatId]) allMessages[chatId] = [];
    allMessages[chatId].push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text, out: true, date: new Date().toISOString() });
    upsertStmt.run("uvix:telegramMessages", JSON.stringify(allMessages));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "send_failed", message: e.message });
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
