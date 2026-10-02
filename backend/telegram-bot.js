// telegram-bot.js — UVIX boti bilan xodimlarni bog'lash va ularga shaxsan xabar yuborish.
// Telegram qoidasi: bot odamga birinchi bo'lib yoza olmaydi. Shuning uchun xodim UVIX'da
// "Telegram'ni ulash"ni bosadi → t.me/<bot>?start=<bir martalik kod> → "Start" → bot uni taniydi.
// Bot yangilanishlari long polling (getUpdates) orqali olinadi — webhook sozlash shart emas.
//
// Saqlash (ichki kalitlar): uvix:staffTg — { [employeeId]: { chatId, username, name, linkedAt } }
//                           uvix:tgLinkTokens — { [code]: { empId, exp } }

const crypto = require("crypto");

const TG_API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

module.exports = function registerStaffBot(app, { getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin }) {
  const readJson = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const token = () => readJson("uvix:settings", {})?.telegramBotToken || "";
  const links = () => readJson("uvix:staffTg", {});
  const saveLinks = (v) => upsertStmt.run("uvix:staffTg", JSON.stringify(v));

  async function api(method, body, tk = token(), signal) {
    if (!tk) throw new Error("no_token");
    const r = await fetch(`${TG_API}/bot${tk}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw Object.assign(new Error(j.description || `Telegram ${r.status}`), { code: j.error_code || r.status });
    return j.result;
  }

  let botInfo = { token: null, username: null };
  async function botUsername() {
    const tk = token();
    if (!tk) return null;
    if (botInfo.token === tk && botInfo.username) return botInfo.username;
    try { const me = await api("getMe", {}, tk); botInfo = { token: tk, username: me.username }; return me.username; } catch { return null; }
  }

  // Xodimga shaxsan yozish. Xodim botni bloklagan bo'lsa — bog'lanish olib tashlanadi.
  async function sendToEmployee(empId, text) {
    const l = links()[empId];
    if (!l?.chatId) return false;
    try {
      await api("sendMessage", { chat_id: l.chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
      return true;
    } catch (e) {
      if (e.code === 403) { const all = links(); delete all[empId]; saveLinks(all); }
      return false;
    }
  }

  // ---- bot xabarlarini qabul qilish (long polling) ----
  let offset = 0, polling = false, stopped = false, lastToken = null;
  async function handleUpdate(u) {
    const msg = u.message;
    if (!msg?.chat?.id || msg.chat.type !== "private") return;
    const text = String(msg.text || "").trim();
    const chatId = String(msg.chat.id);
    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] || "";
      const tokens = readJson("uvix:tgLinkTokens", {});
      const t = tokens[code];
      if (!t || t.exp < Date.now()) {
        await api("sendMessage", { chat_id: chatId, text: "Salom! Bu UVIX boti. Ulanish uchun UVIX ilovasida <b>«Telegram'ni ulash»</b> tugmasini bosing.", parse_mode: "HTML" }).catch(() => {});
        return;
      }
      delete tokens[code];
      upsertStmt.run("uvix:tgLinkTokens", JSON.stringify(tokens));
      const emp = readEmployees().find((e) => e.id === t.empId);
      if (!emp) return;
      const all = links();
      // bitta Telegram — bitta xodim
      Object.keys(all).forEach((k) => { if (all[k].chatId === chatId && k !== emp.id) delete all[k]; });
      all[emp.id] = { chatId, username: msg.from?.username || "", name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" "), linkedAt: new Date().toISOString() };
      saveLinks(all);
      await api("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `✅ Ulandingiz, <b>${escapeHtml(emp.name)}</b>!\nEndi ish vaqti eslatmalari va haftalik xulosangiz shu yerga keladi.\n\nO'chirish uchun: /stop` }).catch(() => {});
    } else if (text === "/stop") {
      const all = links();
      const id = Object.keys(all).find((k) => all[k].chatId === chatId);
      if (id) { delete all[id]; saveLinks(all); }
      await api("sendMessage", { chat_id: chatId, text: "Eslatmalar o'chirildi. Qayta ulash uchun UVIX'da «Telegram'ni ulash»ni bosing." }).catch(() => {});
    }
  }
  async function pollLoop() {
    if (polling) return;
    polling = true;
    while (!stopped) {
      const tk = token();
      if (!tk) { await sleep(15000); continue; }
      if (tk !== lastToken) { lastToken = tk; offset = 0; }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 35000);
      try {
        const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, tk, ac.signal);
        for (const u of updates) { offset = u.update_id + 1; await handleUpdate(u).catch((e) => console.error("Bot xabari:", e.message)); }
      } catch (e) {
        // 409 — boshqa joyda webhook/polling ishlayapti; 401 — token noto'g'ri
        await sleep(e.code === 409 || e.code === 401 ? 60000 : 10000);
      } finally { clearTimeout(timer); }
    }
    polling = false;
  }
  if (process.env.UVIX_NO_BOT_POLL !== "1") pollLoop();

  // ---- API ----
  app.get("/api/me/telegram", requireAuth, async (req, res) => {
    const l = links()[req.user.id];
    res.json({ linked: !!l, username: l?.username || "", botConfigured: !!token(), bot: await botUsername() });
  });
  app.post("/api/me/telegram/link", requireAuth, async (req, res) => {
    const bot = await botUsername();
    if (!bot) return res.status(400).json({ error: "no_bot", message: "Administrator hali Telegram botni sozlamagan" });
    const code = crypto.randomBytes(12).toString("hex");
    const tokens = readJson("uvix:tgLinkTokens", {});
    const now = Date.now();
    Object.keys(tokens).forEach((k) => { if (tokens[k].exp < now || tokens[k].empId === req.user.id) delete tokens[k]; });
    tokens[code] = { empId: req.user.id, exp: now + 30 * 60 * 1000 };
    upsertStmt.run("uvix:tgLinkTokens", JSON.stringify(tokens));
    res.json({ url: `https://t.me/${bot}?start=${code}`, bot });
  });
  app.delete("/api/me/telegram", requireAuth, (req, res) => {
    const all = links(); delete all[req.user.id]; saveLinks(all);
    res.json({ ok: true });
  });
  app.get("/api/staff-telegram", requireAuth, requireAdmin, (req, res) => {
    const all = links();
    res.json({ linked: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { username: v.username, linkedAt: v.linkedAt }])) });
  });

  async function sendDocumentToEmployee(empId, buffer, filename, caption) {
    const l = links()[empId];
    const tk = token();
    if (!l?.chatId || !tk) return false;
    try {
      const form = new FormData();
      form.append("chat_id", l.chatId);
      if (caption) form.append("caption", caption);
      form.append("document", new Blob([buffer]), filename);
      const r = await fetch(`${TG_API}/bot${tk}/sendDocument`, { method: "POST", body: form });
      if (r.status === 403) { const all = links(); delete all[empId]; saveLinks(all); }
      return r.ok;
    } catch { return false; }
  }
  return { sendToEmployee, sendDocumentToEmployee, isLinked: (empId) => !!links()[empId], stop: () => { stopped = true; } };
};

function sleep(ms) { return new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); }); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
module.exports.TG_API = TG_API;
