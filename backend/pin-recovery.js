// pin-recovery.js — PIN unutilganda kirishni tiklash (email ishlatilmaydi).
//
//  1) Telegram orqali: kod FAQAT xodimning o'zi (ilovaga kirib) ulagan shaxsiy chatga yuboriladi.
//     Ekranda qisman ko'rsatiladi: «@ja•••ov ga yuborildi». Kod 6 xonali, 10 daqiqa, 5 urinish.
//  2) «Admindan so'rash»: adminga xabar ketadi → admin Xodimlar bo'limida vaqtinchalik PIN beradi
//     (24 soat amal qiladi) → xodim u bilan kirgach, darhol o'z PIN'ini qo'yadi.
//  Har bir tiklash jurnalga (uvix:audit) yoziladi va adminga xabar qilinadi.
//
// Ichki kalitlar: uvix:pinReset:<empId> — { code, expiresAt, attempts }, uvix:pinHelp — { [empId]: { at } }
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const CODE_TTL = 10 * 60 * 1000;
const TEMP_TTL = 24 * 3600 * 1000;
const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// «@jasur_aliyev» → «@ja•••ev»; username bo'lmasa — ism: «Jasur A.»
function maskTg(link) {
  const u = String(link?.username || "");
  if (u) return u.length <= 4 ? `@${u[0]}•••` : `@${u.slice(0, 2)}•••${u.slice(-2)}`;
  const n = String(link?.name || "").trim().split(/\s+/);
  return n[0] ? `${n[0]}${n[1] ? ` ${n[1][0]}.` : ""} (Telegram)` : "Telegram";
}

function registerPinRecovery(app, { getStmt, upsertStmt, deleteStmt, readEmployees, writeEmployees, requireAuth, requireAdmin, staffBot, settingsLog = null, now = () => Date.now() }) {
  const readJson = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const tgLinks = () => readJson("uvix:staffTg", {});
  const adminIds = () => readEmployees().filter((e) => e.role === "admin").map((e) => e.id);
  const notifyAdmins = async (text, exceptId) => { for (const id of adminIds()) if (id !== exceptId) await staffBot.sendToEmployee(id, text).catch(() => false); };
  function audit(who, what) {
    const list = readJson("uvix:audit", []);
    const arr = Array.isArray(list) ? list : [];
    arr.unshift({ id: crypto.randomBytes(6).toString("hex"), who, what, when: new Date(now()).toISOString() });
    upsertStmt.run("uvix:audit", JSON.stringify(arr.slice(0, 500)));
  }

  // IP + xodim bo'yicha cheklov: 10 daqiqada 5 ta so'rov
  const hits = new Map();
  function limited(key, max = 5) {
    const t = now(), r = hits.get(key);
    if (!r || t > r.resetAt) { hits.set(key, { n: 1, resetAt: t + 10 * 60 * 1000 }); return false; }
    r.n += 1;
    return r.n > max;
  }
  const tooMany = (res) => res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring." });
  const findEmp = (id) => readEmployees().find((e) => e.id === id);

  // Qaysi yo'llar mavjud (kirish ekrani uchun)
  app.post("/api/auth/pin-recovery/options", (req, res) => {
    const emp = findEmp(String(req.body?.employeeId || ""));
    if (!emp) return res.status(404).json({ error: "not_found" });
    const l = tgLinks()[emp.id];
    const pending = !!readJson("uvix:pinHelp", {})[emp.id];
    res.json({ telegram: l?.chatId ? maskTg(l) : null, askedAdmin: pending });
  });

  // 1-yo'l: Telegram kodi
  app.post("/api/auth/pin-recovery/telegram", async (req, res) => {
    const id = String(req.body?.employeeId || "");
    if (limited(`tg:${req.ip}:${id}`, 3)) return tooMany(res);
    const emp = findEmp(id);
    if (!emp) return res.status(404).json({ error: "not_found" });
    const l = tgLinks()[emp.id];
    if (!l?.chatId) return res.status(400).json({ error: "not_linked", message: "Telegram ulanmagan — «Admindan so'rash»dan foydalaning" });
    const code = String(crypto.randomInt(100000, 1000000));
    upsertStmt.run(`uvix:pinReset:${emp.id}`, JSON.stringify({ code, expiresAt: now() + CODE_TTL, attempts: 0 }));
    const ok = await staffBot.sendToEmployee(emp.id, `🔑 <b>UVIX — PIN tiklash kodi</b>\n\n<code>${code}</code>\n\nKod 10 daqiqa amal qiladi. Uni hech kimga aytmang.\nAgar so'rovni siz yubormagan bo'lsangiz — e'tibor bermang va administratorga xabar bering.`);
    if (!ok) { deleteStmt.run(`uvix:pinReset:${emp.id}`); return res.status(502).json({ error: "send_failed", message: "Telegram'ga yuborib bo'lmadi — «Admindan so'rash»dan foydalaning" }); }
    res.json({ ok: true, sentTo: maskTg(l) });
  });

  app.post("/api/auth/pin-recovery/verify", (req, res) => {
    const { employeeId, code, newPin } = req.body || {};
    const id = String(employeeId || "");
    if (limited(`vf:${req.ip}:${id}`, 8)) return tooMany(res);
    if (!/^\d{4,6}$/.test(String(newPin || ""))) return res.status(400).json({ error: "invalid_pin", message: "PIN 4-6 xonali raqam bo'lishi kerak" });
    const bad = () => res.status(401).json({ error: "invalid_code", message: "Kod noto'g'ri yoki muddati o'tgan" });
    const key = `uvix:pinReset:${id}`;
    const rec = readJson(key, null);
    if (!rec) return bad();
    const ok = typeof rec.code === "string" && String(code || "").length === rec.code.length && crypto.timingSafeEqual(Buffer.from(String(code)), Buffer.from(rec.code));
    if (!ok || now() > rec.expiresAt) {
      rec.attempts = (rec.attempts || 0) + 1;
      if (rec.attempts >= 5 || now() > rec.expiresAt) deleteStmt.run(key); else upsertStmt.run(key, JSON.stringify(rec));
      return bad();
    }
    const list = readEmployees();
    const emp = list.find((e) => e.id === id);
    if (!emp) return bad();
    emp.pin = bcrypt.hashSync(String(newPin), 10);
    delete emp.mustChangePin; delete emp.tempPinExp;
    writeEmployees(list);
    deleteStmt.run(key);
    const help = readJson("uvix:pinHelp", {}); if (help[id]) { delete help[id]; upsertStmt.run("uvix:pinHelp", JSON.stringify(help)); }
    audit(emp.name, "PIN Telegram kodi orqali tiklandi");
    settingsLog?.add(emp.name, "Xodimlar", `${emp.name} — PIN Telegram kodi orqali tiklandi`);
    notifyAdmins(`🔑 <b>${esc(emp.name)}</b> PIN kodini Telegram orqali tikladi.`, emp.id);
    res.json({ ok: true });
  });

  // 2-yo'l: adminga so'rov
  app.post("/api/auth/pin-recovery/ask-admin", async (req, res) => {
    const id = String(req.body?.employeeId || "");
    if (limited(`ask:${req.ip}:${id}`, 3)) return tooMany(res);
    const emp = findEmp(id);
    if (!emp) return res.status(404).json({ error: "not_found" });
    const help = readJson("uvix:pinHelp", {});
    const fresh = !help[id];
    help[id] = { at: new Date(now()).toISOString() };
    upsertStmt.run("uvix:pinHelp", JSON.stringify(help));
    if (fresh) await notifyAdmins(`🔑 <b>${esc(emp.name)}</b> PIN kodini unutdi.\nUVIX → Xodimlar → «Vaqtinchalik PIN» bering.`, emp.id);
    res.json({ ok: true });
  });

  // Admin: kim yordam so'radi
  app.get("/api/pin-help", requireAuth, requireAdmin, (req, res) => res.json({ requests: readJson("uvix:pinHelp", {}) }));

  // Admin: vaqtinchalik PIN (6 xonali, 24 soat). Xodim kirgach o'zinikini qo'yishi shart.
  app.post("/api/employees/:id/temp-pin", requireAuth, requireAdmin, (req, res) => {
    const list = readEmployees();
    const emp = list.find((e) => e.id === req.params.id);
    if (!emp) return res.status(404).json({ error: "not_found" });
    if (emp.id === req.user.id) return res.status(400).json({ error: "self", message: "O'zingizga vaqtinchalik PIN berib bo'lmaydi — Sozlamalarda PIN'ni o'zgartiring" });
    const pin = String(crypto.randomInt(100000, 1000000));
    emp.pin = bcrypt.hashSync(pin, 10);
    emp.mustChangePin = true;
    emp.tempPinExp = new Date(now() + TEMP_TTL).toISOString();
    writeEmployees(list);
    const help = readJson("uvix:pinHelp", {}); if (help[emp.id]) { delete help[emp.id]; upsertStmt.run("uvix:pinHelp", JSON.stringify(help)); }
    audit(req.user.name, `${emp.name} — vaqtinchalik PIN berildi`);
    settingsLog?.add(req.user.name, "Xodimlar", `${emp.name} — vaqtinchalik PIN berildi (24 soat)`);
    res.json({ ok: true, pin, expiresAt: emp.tempPinExp });
  });

  // Xodim: o'z PIN'ini o'rnatish (vaqtinchalik PIN bilan kirgandan keyin majburiy)
  app.post("/api/me/pin", requireAuth, (req, res) => {
    const newPin = String(req.body?.newPin || "");
    if (!/^\d{4,6}$/.test(newPin)) return res.status(400).json({ error: "invalid_pin", message: "PIN 4-6 xonali raqam bo'lishi kerak" });
    const list = readEmployees();
    const emp = list.find((e) => e.id === req.user.id);
    if (!emp) return res.status(404).json({ error: "not_found" });
    let same = false; try { same = bcrypt.compareSync(newPin, emp.pin || ""); } catch { same = newPin === emp.pin; }
    if (same) return res.status(400).json({ error: "same_pin", message: "Yangi PIN vaqtinchalik PIN bilan bir xil bo'lmasin" });
    emp.pin = bcrypt.hashSync(newPin, 10);
    const wasTemp = !!emp.mustChangePin;
    delete emp.mustChangePin; delete emp.tempPinExp;
    writeEmployees(list);
    if (wasTemp) audit(emp.name, "Vaqtinchalik PIN o'z PIN'iga almashtirildi");
    res.json({ ok: true });
  });

  return { maskTg };
}

module.exports = { registerPinRecovery, maskTg };
