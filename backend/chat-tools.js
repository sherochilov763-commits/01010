// chat-tools.js — Chatlar bo'limi uchun qo'shimcha imkoniyatlar:
//  • mas'ul menejer, mahkamlash, arxiv (har bir suhbat uchun)
//  • ichki izohlar (faqat xodimlar ko'radi, Telegram'ga yuborilmaydi)
//  • tayyor javoblar (/narx, /karta ...) va javobsiz chat sozlamasi
//  • "kim yozyapti" belgisi (xotirada, 8 soniya)
//  • xabarlar ichidan qidiruv
//  • javobsiz qolgan suhbat haqida bildirishnoma (mas'ulga yoki hammaga)
// Diqqat: bu faylda fs ishlatilmaydi (demo nusxasi uchun ESM'ga o'giriladi).

const KEY_META = "uvix:chatMeta";
const KEY_NOTES = "uvix:chatNotes";
const KEY_REPLIES = "uvix:quickReplies";
const KEY_CFG = "uvix:chatConfig";
const KEY_SLA_SENT = "uvix:chatSlaSent";

const DEFAULT_REPLIES = [
  { id: "r1", key: "narx", text: "UV bosma narxi: 1 m² — 180 000 so'm dan. Aniq narx o'lcham va materialga bog'liq. Muddati 2–3 kun." },
  { id: "r2", key: "karta", text: "To'lov uchun karta: 0000 0000 0000 0000 (ism familiya). To'lovdan so'ng chek rasmini yuboring." },
  { id: "r3", key: "manzil", text: "Manzilimiz: ... Mo'ljal: ... Xaritada: ..." },
  { id: "r4", key: "maket", text: "Maket tayyor! Ko'rib chiqing va «tasdiqlayman» deb yozing — shundan so'ng bosmaga beramiz." },
  { id: "r5", key: "vaqt", text: "Ish vaqtimiz: Dushanba–Shanba 09:00–19:00, Yakshanba — dam olish kuni." },
];
// Chat «Javob shart emas» deb belgilangandan keyin mijozdan yangi xabar kelmaganmi
function noReplyCovers(meta, lastDate) {
  return !!(meta && meta.noReply && lastDate && Date.parse(meta.noReply) >= Date.parse(lastDate));
}
const DEFAULT_CFG = { slaMinutes: 15, workFrom: "09:00", workTo: "19:00", workDays: [1, 2, 3, 4, 5, 6] };

module.exports = function registerChatTools(app, { getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin, requireStaff, notify, now = () => new Date() }) {
  const read = (k, def) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : def; } catch { return def; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const okChat = (id) => /^(on:)?-?\d{1,20}$/.test(String(id || ""));
  // Yo'nalish: «on:» — UVONYX akkaunti chati. Xodim faqat o'z yo'nalishi chatlarini ko'radi
  const chatOk = (req, id) => !req.lineScope || (String(id).startsWith("on:") ? "UVONYX" : "UVIXPRINT") === req.lineScope;
  const deny = (res) => res.status(404).json({ error: "not_found", message: "Suhbat topilmadi" });
  const staffOnly = requireStaff || ((req, res, next) => next());
  const adminOnly = requireAdmin || ((req, res, next) => (req.user?.role === "admin" ? next() : res.status(403).json({ error: "forbidden" })));

  const config = () => ({ ...DEFAULT_CFG, ...read(KEY_CFG, {}) });
  const replies = () => { const r = read(KEY_REPLIES, null); return Array.isArray(r) ? r : DEFAULT_REPLIES; };

  // ---------- "kim yozyapti" (xotirada) ----------
  const typing = new Map(); // chatId -> Map(userId -> {name, at})
  function typingFor(chatId, exceptUserId) {
    const m = typing.get(String(chatId));
    if (!m) return [];
    const t = Date.now();
    const out = [];
    for (const [uidKey, v] of m) {
      if (t - v.at > 8000) { m.delete(uidKey); continue; }
      if (uidKey !== exceptUserId) out.push({ userId: uidKey, name: v.name });
    }
    return out;
  }

  // ---------- Ish vaqti (Toshkent) ----------
  function tashkentParts(d = now()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
    const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    return { dow, hm: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}` };
  }
  function isWorkTime(cfg, d = now()) {
    const { dow, hm } = tashkentParts(d);
    if (Array.isArray(cfg.workDays) && cfg.workDays.length && !cfg.workDays.includes(dow)) return false;
    return hm >= (cfg.workFrom || "00:00") && hm < (cfg.workTo || "24:00");
  }

  // ---------- Javobsiz suhbatlar ----------
  // Oxirgi xabar mijozdan va slaMinutes dan ko'p vaqt o'tgan suhbatlar (arxivdagilar hisobga olinmaydi)
  function waitingChats() {
    const cfg = config();
    const meta = read(KEY_META, {});
    const msgs = read("uvix:telegramMessages", {});
    const contacts = read("uvix:telegramContacts", {});
    const t = now().getTime();
    const out = [];
    for (const [chatId, list] of Object.entries(msgs)) {
      if (!Array.isArray(list) || !list.length || meta[chatId]?.archived) continue;
      // Avtojavob «javob berildi» deb hisoblanmaydi — oxirgi haqiqiy xabarga qaraymiz
      let last = null;
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].auto) { last = list[i]; break; }
      if (!last || last.out) continue;
      if (noReplyCovers(meta[chatId], last.date)) continue; // «Javob shart emas» deb belgilangan
      const mins = Math.floor((t - new Date(last.date).getTime()) / 60000);
      if (mins >= (cfg.slaMinutes || 15) && mins < 60 * 24 * 3) out.push({ chatId, mins, lastId: last.id || last.tgId || last.date, name: contacts[chatId]?.name || "", assignee: meta[chatId]?.assignee || null });
    }
    return out;
  }
  function slaTick() {
    const cfg = config();
    if (!cfg.slaMinutes || !isWorkTime(cfg)) return 0;
    const sent = read(KEY_SLA_SENT, {});
    const leads = read("uvix:leads", []);
    let n = 0;
    for (const w of waitingChats()) {
      const mark = String(w.lastId);
      if (sent[w.chatId] === mark) continue;
      sent[w.chatId] = mark;
      const lead = (Array.isArray(leads) ? leads : []).find((l) => String(l.telegramChatId) === w.chatId);
      const name = lead?.customer || w.name || "Mijoz";
      notify?.({ chatId: w.chatId, name, mins: w.mins, to: w.assignee });
      n++;
    }
    // eski belgilarni tozalaymiz (300 tadan ko'p bo'lmasin)
    const keys = Object.keys(sent);
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete sent[k];
    if (n) write(KEY_SLA_SENT, sent);
    return n;
  }

  // ---------- API ----------
  app.get("/api/chat-tools/state", requireAuth, staffOnly, (req, res) => {
    const keep = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => chatOk(req, k)));
    const meta = keep(read(KEY_META, {}));
    const notes = keep(read(KEY_NOTES, {}));
    const noteCount = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
    const typingNow = {};
    for (const chatId of typing.keys()) { const t = typingFor(chatId, req.user.id); if (t.length) typingNow[chatId] = t; }
    res.json({ meta, noteCount, replies: replies(), config: config(), typing: typingNow, me: req.user.id });
  });

  app.put("/api/chat-tools/meta/:chatId", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.params.chatId);
    if (!chatOk(req, chatId)) return deny(res);
    if (!okChat(chatId)) return res.status(400).json({ error: "bad_chat" });
    const b = req.body || {};
    const all = read(KEY_META, {});
    const cur = { ...(all[chatId] || {}) };
    if ("assignee" in b) {
      if (b.assignee === null || b.assignee === "") delete cur.assignee;
      else if (readEmployees().some((e) => e.id === b.assignee)) cur.assignee = b.assignee;
      else return res.status(400).json({ error: "bad_assignee" });
    }
    if ("pinned" in b) { if (b.pinned) cur.pinned = now().toISOString(); else delete cur.pinned; }
    if ("archived" in b) { if (b.archived) { cur.archived = now().toISOString(); delete cur.pinned; } else delete cur.archived; }
    // «Javob shart emas»: shu vaqtgacha kelgan xabarlar javobsiz hisoblanmaydi; mijoz yana yozsa — qayta «Javob kutmoqda»
    if ("noReply" in b) { if (b.noReply) cur.noReply = now().toISOString(); else delete cur.noReply; }
    if (Object.keys(cur).length) all[chatId] = cur; else delete all[chatId];
    write(KEY_META, all);
    res.json({ ok: true, meta: all[chatId] || {} });
  });

  app.get("/api/chat-tools/notes/:chatId", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.params.chatId);
    if (!chatOk(req, chatId)) return deny(res);
    res.json({ notes: (read(KEY_NOTES, {})[chatId] || []) });
  });
  app.post("/api/chat-tools/notes/:chatId", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.params.chatId);
    if (!chatOk(req, chatId)) return deny(res);
    const text = String(req.body?.text || "").trim().slice(0, 2000);
    if (!okChat(chatId) || !text) return res.status(400).json({ error: "empty", message: "Izoh matnini yozing" });
    const all = read(KEY_NOTES, {});
    const note = { id: uid(), text, by: req.user.name, byId: req.user.id, date: now().toISOString() };
    all[chatId] = [...(all[chatId] || []), note].slice(-200);
    write(KEY_NOTES, all);
    res.json({ ok: true, note });
  });
  app.delete("/api/chat-tools/notes/:chatId/:noteId", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.params.chatId);
    if (!chatOk(req, chatId)) return deny(res);
    const all = read(KEY_NOTES, {});
    const list = all[chatId] || [];
    const n = list.find((x) => x.id === req.params.noteId);
    if (!n) return res.status(404).json({ error: "not_found" });
    if (n.byId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "forbidden", message: "Faqat o'z izohingizni o'chira olasiz" });
    all[chatId] = list.filter((x) => x.id !== n.id);
    write(KEY_NOTES, all);
    res.json({ ok: true });
  });

  app.post("/api/chat-tools/typing", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.body?.chatId || "");
    if (!okChat(chatId)) return res.status(400).json({ error: "bad_chat" });
    if (!chatOk(req, chatId)) return deny(res);
    let m = typing.get(chatId);
    if (!m) { m = new Map(); typing.set(chatId, m); }
    if (req.body?.stop) m.delete(req.user.id); else m.set(req.user.id, { name: req.user.name, at: Date.now() });
    res.json({ ok: true, others: typingFor(chatId, req.user.id) });
  });

  // Xabarlar ichidan qidiruv: { results: [{chatId, text, date, out}] }
  app.get("/api/chat-tools/search", requireAuth, staffOnly, (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json({ results: [] });
    const msgs = read("uvix:telegramMessages", {});
    const results = [];
    for (const [chatId, list] of Object.entries(msgs)) {
      if (!Array.isArray(list) || !chatOk(req, chatId)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        const txt = String(m.text || m.fileName || "");
        if (txt.toLowerCase().includes(q)) { results.push({ chatId, text: txt.slice(0, 160), date: m.date, out: !!m.out }); break; }
      }
      if (results.length >= 50) break;
    }
    results.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json({ results });
  });

  app.put("/api/chat-tools/replies", requireAuth, adminOnly, (req, res) => {
    const list = Array.isArray(req.body?.replies) ? req.body.replies : null;
    if (!list) return res.status(400).json({ error: "bad_request" });
    const seen = new Set();
    const clean = [];
    for (const r of list.slice(0, 60)) {
      const key = String(r?.key || "").trim().toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_Ѐ-ӿ'-]/gi, "").slice(0, 24);
      const text = String(r?.text || "").trim().slice(0, 1500);
      if (!key || !text || seen.has(key)) continue;
      seen.add(key);
      clean.push({ id: String(r.id || uid()).slice(0, 40), key, text });
    }
    write(KEY_REPLIES, clean);
    res.json({ ok: true, replies: clean });
  });
  app.put("/api/chat-tools/config", requireAuth, adminOnly, (req, res) => {
    const b = req.body || {};
    const hm = (x, d) => (/^\d{2}:\d{2}$/.test(String(x || "")) ? x : d);
    const cfg = {
      slaMinutes: Math.max(0, Math.min(240, Math.round(Number(b.slaMinutes) || 0))),
      workFrom: hm(b.workFrom, DEFAULT_CFG.workFrom), workTo: hm(b.workTo, DEFAULT_CFG.workTo),
      workDays: Array.isArray(b.workDays) ? b.workDays.map(Number).filter((x) => x >= 0 && x <= 6) : DEFAULT_CFG.workDays,
    };
    write(KEY_CFG, cfg);
    res.json({ ok: true, config: cfg });
  });

  const typingActive = (chatId) => typingFor(chatId, null).length > 0;
  return { slaTick, waitingChats, isWorkTime, config, typingActive, DEFAULT_REPLIES };
};
module.exports.DEFAULT_CFG = DEFAULT_CFG;
module.exports.noReplyCovers = noReplyCovers;
