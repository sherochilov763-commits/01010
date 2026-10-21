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
  async function sendToEmployee(empId, text, extra) {
    const l = links()[empId];
    if (!l?.chatId) return false;
    try {
      await api("sendMessage", { chat_id: l.chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(extra && typeof extra === "object" ? extra : {}) });
      return true;
    } catch (e) {
      if (e.code === 403) { const all = links(); delete all[empId]; saveLinks(all); }
      return false;
    }
  }

  // ---- bot xabarlarini qabul qilish (long polling) ----
  let offset = 0, polling = false, stopped = false, lastToken = null;
  let health = { ok: null, problem: "", at: 0 }; // bot xabarlarni qabul qila olyaptimi (/start ishlashi uchun)
  let locHandler = null; // jonli lokatsiya (geo.js) — ish vaqtidagi kuzatuv
  let msgHandler = null; // ovozli ish jurnali (voice-log.js): ovoz, matn va tugmalar
  const empOfChat = (chatId) => { const all = links(); return Object.keys(all).find((k) => all[k].chatId === String(chatId)) || null; };
  async function handleUpdate(u) {
    if (u.callback_query) {
      const cq = u.callback_query;
      const chatId = String(cq.message?.chat?.id || cq.from?.id || "");
      if (msgHandler && chatId && (await msgHandler({ empId: empOfChat(chatId), chatId, callback: cq }))) return;
      await api("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
      return;
    }
    const msg = u.message || u.edited_message;
    if (!msg?.chat?.id || msg.chat.type !== "private") return;
    if (msg.location && locHandler) {
      const empId = Object.keys(links()).find((k) => links()[k].chatId === String(msg.chat.id));
      if (empId) {
        const r = locHandler(empId, { lat: Number(msg.location.latitude), lng: Number(msg.location.longitude), acc: msg.location.horizontal_accuracy ?? null, at: new Date(((msg.edit_date || msg.date) || 0) * 1000 || Date.now()).toISOString(), live: !!msg.location.live_period });
        // Birinchi (yangi) xabarga qisqa javob — nima bo'lganini xodim bilsin
        if (u.message && r && !r.skipped) {
          const txt = r.ok ? (msg.location.live_period ? "✅ Jonli joylashuv qabul qilindi — ish vaqtida rahbarga ko'rinadi." : "✅ Joylashuv qabul qilindi. Kun bo'yi uchun «Jonli joylashuv»ni ulashing.")
            : r.reason === "off_shift" ? "ℹ️ Hozir ish vaqti emas («Keldim» bosilmagan yoki «Ketdim» bosilgan) — joylashuv saqlanmadi."
            : r.reason === "consent" ? "ℹ️ Avval UVIX ilovasida kuzatuvga rozilik bering." : r.reason === "disabled" ? "ℹ️ Kuzatuv o'chirilgan." : "";
          if (txt) await api("sendMessage", { chat_id: String(msg.chat.id), text: txt }).catch(() => {});
        }
      }
      return;
    }
    if (!u.message) return;
    const text = String(msg.text || "").trim();
    const chatId = String(msg.chat.id);
    if (msgHandler && !/^\/(start|stop)\b/.test(text) && (await msgHandler({ empId: empOfChat(chatId), chatId, message: msg }))) return;
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
      // Akkaunt almashtirilsa — eski Telegram'ga va adminlarga xabar (PIN tiklash kodi endi yangi chatga boradi)
      const prev = all[emp.id];
      if (prev?.chatId && prev.chatId !== chatId) {
        const who = msg.from?.username ? `@${msg.from.username}` : [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "boshqa akkaunt";
        await api("sendMessage", { chat_id: prev.chatId, parse_mode: "HTML", text: `⚠️ UVIX: <b>${escapeHtml(emp.name)}</b> hisobi boshqa Telegram'ga (${escapeHtml(who)}) ulandi.
Bu siz bo'lmasangiz — darhol administratorga xabar bering.` }).catch(() => {});
        for (const a of readEmployees().filter((e) => e.role === "admin" && e.id !== emp.id)) {
          const al = all[a.id];
          if (al?.chatId && al.chatId !== chatId) await api("sendMessage", { chat_id: al.chatId, parse_mode: "HTML", text: `⚠️ <b>${escapeHtml(emp.name)}</b>ning Telegram akkaunti o'zgartirildi: endi ${escapeHtml(who)}.` }).catch(() => {});
        }
      }
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
      if (tk !== lastToken) { lastToken = tk; offset = 0; health = { ok: null, problem: "", at: 0 }; }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 35000);
      try {
        const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "edited_message", "callback_query"] }, tk, ac.signal);
        for (const u of updates) { offset = u.update_id + 1; await handleUpdate(u).catch((e) => console.error("Bot xabari:", e.message)); }
        health = { ok: true, problem: "", at: Date.now() };
      } catch (e) {
        if (stopped) break;
        const m = String(e.message || "");
        if (e.code === 409 && /webhook/i.test(m)) {
          // Botda webhook o'rnatilgan (boshqa xizmat/eski sozlama) — getUpdates ishlamaydi, /start javobsiz qoladi.
          // Webhook'ni o'chiramiz va darhol qayta urinamiz.
          health = { ok: false, problem: "webhook", at: Date.now() };
          try { await api("deleteWebhook", { drop_pending_updates: false }, tk); console.log("Telegram bot: eski webhook o'chirildi"); continue; } catch { /* quyida kutamiz */ }
        } else if (e.code === 409) {
          health = { ok: false, problem: "conflict", at: Date.now() }; // shu token boshqa serverda ham ishlayapti
        } else if (e.code === 401 || e.code === 404) {
          health = { ok: false, problem: "token", at: Date.now() };
        } else if (e.name !== "AbortError") {
          health = { ok: false, problem: "network", at: Date.now() };
        }
        if (health.problem) console.error("Telegram bot:", health.problem, m);
        await sleep(e.code === 409 || e.code === 401 ? 30000 : 10000);
      } finally { clearTimeout(timer); }
    }
    polling = false;
  }
  if (process.env.UVIX_NO_BOT_POLL !== "1") pollLoop();

  // ---- API ----
  app.get("/api/me/telegram", requireAuth, async (req, res) => {
    const l = links()[req.user.id];
    const bot = await botUsername();
    const emp = readEmployees().find((e) => e.id === req.user.id) || { id: req.user.id, role: req.user.role };
    res.json({ linked: !!l, username: l?.username || "", botConfigured: !!token(), bot,
      onboard: onboardState({ settings: readJson("uvix:settings", {}), bot, linked: !!l, emp, rec: readJson(ONBOARD_KEY, {})[req.user.id] }) });
  });
  // «Keyinroq» — 1 kundan keyin yana so'raladi (3 martagacha). Majburiy bo'lsa — rad etiladi.
  app.post("/api/me/telegram/skip", requireAuth, async (req, res) => {
    const emp = readEmployees().find((e) => e.id === req.user.id) || { id: req.user.id, role: req.user.role };
    const all = readJson(ONBOARD_KEY, {});
    const st = onboardState({ settings: readJson("uvix:settings", {}), bot: await botUsername(), linked: !!links()[req.user.id], emp, rec: all[req.user.id] });
    if (st.required) return res.status(400).json({ error: "required", message: "Administrator Telegram ulashni majburiy qilgan" });
    const prev = all[req.user.id] || {};
    all[req.user.id] = { skips: (prev.skips || 0) + 1, lastSkip: Date.now() };
    upsertStmt.run(ONBOARD_KEY, JSON.stringify(all));
    res.json({ ok: true, skips: all[req.user.id].skips });
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
  // Admin token kiritganda — saqlashdan oldin Telegram'da tekshiramiz (getMe)
  app.post("/api/telegram/check-token", requireAuth, requireAdmin, async (req, res) => {
    const tk = String(req.body?.token || "").trim();
    if (!/^\d{5,}:[\w-]{20,}$/.test(tk)) return res.status(400).json({ error: "format", message: "Token ko'rinishi noto'g'ri. @BotFather bergan to'liq tokenni nusxalang (masalan 123456789:AAE…)" });
    try {
      const me = await api("getMe", {}, tk);
      res.json({ ok: true, username: me.username, name: me.first_name || "" });
    } catch (e) {
      if (e.code === 401 || e.code === 404) return res.status(400).json({ error: "token", message: "Telegram bu tokenni tanimadi — u noto'g'ri yoki bekor qilingan. @BotFather → /mybots → API Token'dan qayta nusxalang" });
      res.status(502).json({ error: "network", message: "Telegram serveriga ulanib bo'lmadi — server internetini tekshirib, qayta urinib ko'ring" });
    }
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
  // Telegram'dagi faylni yuklab olish (ovozli xabar uchun; 20 MB gacha)
  async function downloadFile(fileId) {
    const tk = token();
    const f = await api("getFile", { file_id: fileId }, tk);
    const r = await fetch(`${TG_API}/file/bot${tk}/${f.file_path}`);
    if (!r.ok) throw new Error(`Telegram fayl ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return { onLocation: (fn) => { locHandler = fn; }, onMessage: (fn) => { msgHandler = fn; }, api: (method, body) => api(method, body), downloadFile, sendToEmployee, sendDocumentToEmployee, isLinked: (empId) => !!links()[empId], health: () => (token() ? health : { ok: null, problem: "", at: 0 }), stop: () => { stopped = true; } };
};

// Birinchi kirishda «Telegram'ni ulang» oynasi ko'rsatilsinmi.
// settings.tgOnboardOffer (standart: yoqilgan), settings.tgOnboardRequired (standart: o'chiq; admin uchun hech qachon majburiy emas).
const ONBOARD_KEY = "uvix:tgOnboard";
const ONBOARD_MAX_SKIPS = 3;
const ONBOARD_GAP = 24 * 60 * 60 * 1000;
function onboardState({ settings = {}, bot, linked, emp = {}, rec, now = Date.now() }) {
  const offerOn = settings?.tgOnboardOffer !== false;
  const required = !!settings?.tgOnboardRequired && emp.role !== "admin";
  if (!bot || linked || !emp.id) return { show: false, required: false };
  if (required) return { show: true, required: true };
  if (!offerOn) return { show: false, required: false };
  const skips = rec?.skips || 0;
  if (skips >= ONBOARD_MAX_SKIPS) return { show: false, required: false };
  if (rec?.lastSkip && now - rec.lastSkip < ONBOARD_GAP) return { show: false, required: false };
  return { show: true, required: false, skips, last: skips === ONBOARD_MAX_SKIPS - 1 };
}

function sleep(ms) { return new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); }); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
module.exports.TG_API = TG_API;
module.exports.onboardState = onboardState;
module.exports.ONBOARD_KEY = ONBOARD_KEY;
