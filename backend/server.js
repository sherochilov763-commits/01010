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

// ==================== Rasm (foto hisobot) saqlash ====================
// Rasmlar bazaning o'zi bilan bir joyda (doimiy diskda) saqlanadi — Railway'da
// bu /data papkasi, DB_PATH orqali aniqlanadi, shuning uchun qayta ishga
// tushirilganda ham rasmlar yo'qolmaydi.
const UPLOADS_DIR = path.join(path.dirname(db.DB_PATH), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ---- JWT sekret kaliti — birinchi ishga tushirilganda yaratiladi va faylga saqlanadi
// (server qayta ishga tushirilganda ham eski tokenlar amal qilishda davom etishi uchun) ----
const SECRET_PATH = path.join(__dirname, "uvix.secret");
let JWT_SECRET;
try {
  JWT_SECRET = fs.readFileSync(SECRET_PATH, "utf8").trim();
  if (!JWT_SECRET) throw new Error("empty");
} catch {
  JWT_SECRET = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, JWT_SECRET, { mode: 0o600 });
}
const TOKEN_TTL = "12h";

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
  res.json({ employees: list.map((e) => ({ id: e.id, name: e.name, role: e.role })) });
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

// Kirish imkoni yo'qolganda — birinchi (eng qadimgi) administrator PIN'ini "0000"ga qaytaradi.
// Kompyuterga jismoniy/tarmoq orqali kirish huquqi bo'lgan kishi uchun mo'ljallangan zaxira yechim.
app.post("/api/auth/reset-admin-pin", (req, res) => {
  const employees = readEmployees();
  const admin = employees.find((e) => e.role === "admin");
  if (!admin) {
    return res.status(404).json({ error: "no_admin_found" });
  }
  admin.pin = bcrypt.hashSync("0000", 10);
  writeEmployees(employees);
  res.json({ ok: true, name: admin.name, message: "PIN '0000'ga qaytarildi" });
});

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
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  upsertStmt.run(`uvix:pinReset:${employee.id}`, JSON.stringify({ code, expiresAt }));
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
  const { email, code, newPin } = req.body || {};
  if (!email || !code || !newPin) return res.status(400).json({ error: "missing_fields" });
  if (!/^\d{4,6}$/.test(String(newPin))) return res.status(400).json({ error: "invalid_pin" });
  const employees = readEmployees();
  const employee = employees.find((e) => (e.email || "").trim().toLowerCase() === String(email).trim().toLowerCase());
  if (!employee) return res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
  const row = getStmt.get(`uvix:pinReset:${employee.id}`);
  if (!row) return res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
  const record = JSON.parse(row.value);
  if (record.code !== String(code) || Date.now() > record.expiresAt) {
    return res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
  }
  employee.pin = bcrypt.hashSync(String(newPin), 10);
  writeEmployees(employees);
  deleteStmt.run(`uvix:pinReset:${employee.id}`);
  res.json({ ok: true });
});

// Kirish — PIN tekshiriladi, muvaffaqiyatli bo'lsa token beriladi
app.post("/api/auth/login", (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring." });
  }
  const { employeeId, name, pin } = req.body || {};
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
  const token = jwt.sign({ sub: employee.id, role: employee.role, name: employee.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, employee: { id: employee.id, name: employee.name, role: employee.role } });
});

// ==================== Middleware — bundan pastdagi HAMMA yo'l token talab qiladi ====================
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}
app.use("/api/kv", requireAuth);

// ==================== Foto hisobot (buyurtma rasmlari) ====================
app.post("/api/photos/upload", requireAuth, (req, res) => {
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

app.delete("/api/photos/:filename", requireAuth, (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9.]/g, "");
  const filePath = path.join(UPLOADS_DIR, filename);
  if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ ok: true });
});

app.get("/api/kv/:key", (req, res) => {
  const row = getStmt.get(req.params.key);
  if (!row) return res.status(404).json({ error: "not_found" });
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

app.put("/api/kv/:key", (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== "string") {
    return res.status(400).json({ error: "value_must_be_string" });
  }
  if (req.params.key.length > 200) {
    return res.status(400).json({ error: "key_too_long" });
  }
  const oldRow = getStmt.get(req.params.key);
  const oldValue = oldRow ? oldRow.value : null;
  // Xodimlar ro'yxati yozilganda — hali hash qilinmagan PIN'larni shaffof ravishda hash qilamiz
  if (req.params.key === "uvix:employees") {
    try {
      const list = JSON.parse(value);
      if (Array.isArray(list)) {
        list.forEach((e) => {
          if (e && typeof e.pin === "string" && !isHashed(e.pin) && /^\d{4,6}$/.test(e.pin)) {
            e.pin = bcrypt.hashSync(e.pin, 10);
          }
        });
        upsertStmt.run(req.params.key, JSON.stringify(list));
        return res.json({ key: req.params.key, value: JSON.stringify(list) });
      }
    } catch {
      // JSON emas yoki massiv emas — oddiy holatda davom etamiz
    }
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


app.delete("/api/kv/:key", (req, res) => {
  deleteStmt.run(req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

app.get("/api/kv", (req, res) => {
  const prefix = req.query.prefix || "";
  const rows = listStmt.all(`${prefix}%`);
  res.json({ keys: rows.map((r) => r.key) });
});

// Qo'lda "Hoziroq yubor" — Sozlamalar sahifasidagi tugma shu yerni chaqiradi (faqat tizimga kirgan foydalanuvchi uchun)
app.post("/api/backup/send-now", requireAuth, (req, res) => {
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
function handleIncomingTelegramMessage({ chatId, fromName, username, phone, text, date }) {
  try {
    // Xabarni saqlaymiz
    const row = getStmt.get("uvix:telegramMessages");
    const allMessages = row ? JSON.parse(row.value) : {};
    if (!allMessages[chatId]) allMessages[chatId] = [];
    allMessages[chatId].push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text, out: false, date });
    upsertStmt.run("uvix:telegramMessages", JSON.stringify(allMessages));

    // Agar shu chatId'ga bog'langan lid bo'lmasa — avtomatik yangi lid yaratamiz.
    // Mavjud bo'lsa ham, agar telefon/username hali bo'sh bo'lsa — endi kelgan
    // ma'lumot bilan to'ldiramiz (masalan birinchi xabarda faqat ism, keyin telefon aniqlanishi mumkin).
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
    }
  } catch (e) {
    console.error("Kiruvchi Telegram xabarini saqlashda xato:", e.message);
  }
}

app.get("/api/telegram-user/status", requireAuth, (req, res) => {
  res.json(telegramUserbot.getStatus());
});

app.post("/api/telegram-user/connect", requireAuth, async (req, res) => {
  const row = getStmt.get("uvix:settings");
  const settings = row ? JSON.parse(row.value) : {};
  const result = await telegramUserbot.connectFromSettings(settings, handleIncomingTelegramMessage);
  if (result.ok) res.json({ ok: true });
  else res.status(400).json({ error: "connect_failed", message: result.error });
});

app.post("/api/telegram-user/disconnect", requireAuth, async (req, res) => {
  await telegramUserbot.disconnect();
  res.json({ ok: true });
});

app.get("/api/telegram-user/messages/:chatId", requireAuth, (req, res) => {
  const row = getStmt.get("uvix:telegramMessages");
  const allMessages = row ? JSON.parse(row.value) : {};
  res.json({ messages: allMessages[req.params.chatId] || [] });
});

app.post("/api/telegram-user/send", requireAuth, async (req, res) => {
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
  console.log(`Baza fayli: ${path.join(__dirname, "uvix.db")}`);
  console.log(`Autentifikatsiya: YOQILGAN (barcha /api/kv/* yo'llari token talab qiladi)`);

  // Agar Telegram shaxsiy akkaunt sozlamalari saqlangan bo'lsa, server ishga tushganda
  // avtomatik ulanishga harakat qilamiz (qo'lda qayta ulash shart bo'lmasligi uchun)
  try {
    const row = getStmt.get("uvix:settings");
    const settings = row ? JSON.parse(row.value) : {};
    if (settings?.telegramUserApiId && settings?.telegramUserApiHash && settings?.telegramUserSession) {
      telegramUserbot.connectFromSettings(settings, handleIncomingTelegramMessage).then((r) => {
        if (r.ok) console.log("Telegram shaxsiy akkaunt: ulandi");
        else console.log("Telegram shaxsiy akkaunt: ulanmadi —", r.error);
      });
    }
  } catch (e) {
    console.error("Telegram avto-ulanish xatosi:", e.message);
  }
});
