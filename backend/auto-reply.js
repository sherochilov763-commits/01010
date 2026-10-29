// auto-reply.js — Chatlar: avtojavoblar (AI'siz, faqat siz yozgan tayyor matn), 114/115-eskizlar.
//  • greet — Salomlashish: yangi mijozning birinchi xabariga (har mijozga 1 marta)
//  • away  — Ish vaqtidan tashqari: ish vaqti tugagach yozganlarga (har mijozga kuniga 1 marta)
//  • late  — Javob kechiksa: ish vaqtida slaMinutes ichida menejer yozmasa (har mijoz xabariga 1 marta)
// Xavfsizlik: yangi o'rnatishda hammasi O'CHIQ; narx/to'lov/smeta haqida hech narsa yozilmaydi (matnni rahbar yozadi);
// menejer yozayotgan yoki 10 daqiqa ichida yozgan bo'lsa — yuborilmaydi; guruh/kanal xabarlari bu yerga kelmaydi;
// 1 mijozga kuniga 3 tadan ko'p avtojavob ketmaydi; «Bu chatda avtojavob» o'chirilgan chatga — hech narsa.
// Avtojavob xabarda `auto: "<qoida>"` belgisi bilan saqlanadi — chat «Javob kutmoqda»da qoladi.
// Matnlar yo'nalish bo'yicha alohida: UVIXPRINT (asosiy akkaunt) va UVONYX («on:» chatlar).
// Saqlash (ichki kalitlar): uvix:autoReply (sozlama), uvix:autoReplyState ({ sent, off, log })
// fs yo'q — yuborish va saqlash tashqaridan beriladi (testlarda soxtalashtiriladi).

const KEY_CFG = "uvix:autoReply";
const KEY_STATE = "uvix:autoReplyState";
const RULES = ["greet", "away", "late"];
const LINES = ["UVIXPRINT", "UVONYX"];
const DAILY_MAX = 3;
const MANAGER_QUIET_MS = 10 * 60 * 1000;
const MAX_TEXT = 1000;
const DEFAULT_TEXTS = {
  greet: {
    UVIXPRINT: "Assalomu alaykum! UVIX'ga xush kelibsiz 🙂 Qanday mahsulot qiziqtiradi? O'lcham va rasm yuborsangiz, menejerimiz hisoblab beradi.",
    UVONYX: "Assalomu alaykum! ONYX'ga xush kelibsiz 🙂 Qanday mahsulot qiziqtiradi? O'lcham va rasm yuborsangiz, menejerimiz hisoblab beradi.",
  },
  away: {
    UVIXPRINT: "Rahmat, xabaringiz qabul qilindi! Hozir ish vaqtidan tashqari — ertalab {ish_boshi} da menejerimiz javob beradi.",
    UVONYX: "Rahmat, xabaringiz qabul qilindi! Hozir ish vaqtidan tashqari — ertalab {ish_boshi} da menejerimiz javob beradi.",
  },
  late: {
    UVIXPRINT: "Xabaringiz qabul qilindi, tez orada javob beramiz 🙏",
    UVONYX: "Xabaringiz qabul qilindi, tez orada javob beramiz 🙏",
  },
};
const RULE_LABEL = { greet: "Salomlashish", away: "Ish vaqtidan tashqari", late: "Javob kechiksa" };

function defaultConfig() {
  return { on: false, rules: Object.fromEntries(RULES.map((r) => [r, { on: false, texts: { ...DEFAULT_TEXTS[r] } }])) };
}
function cleanConfig(c) {
  const out = defaultConfig();
  if (!c || typeof c !== "object") return out;
  out.on = c.on === true;
  for (const r of RULES) {
    const src = c.rules?.[r];
    if (!src || typeof src !== "object") continue;
    out.rules[r].on = src.on === true;
    for (const l of LINES) {
      const t = typeof src.texts?.[l] === "string" ? src.texts[l].trim().slice(0, MAX_TEXT) : "";
      if (t) out.rules[r].texts[l] = t;
    }
  }
  return out;
}
const lineOf = (chatId) => (String(chatId).startsWith("on:") ? "UVONYX" : "UVIXPRINT");
function tashkentDay(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
// Avtojavobni hisobga olmagan holda oxirgi haqiqiy xabar
function lastReal(list) {
  for (let i = (list || []).length - 1; i >= 0; i--) if (!list[i].auto) return list[i];
  return null;
}

/**
 * deps: { read(k, def), write(k, v), now(), chatTools: { isWorkTime(cfg), config(), typingActive(chatId) },
 *         send(chatId, text) → Promise<{ tgId }>, store(chatId, msg) → msg, historyCount(chatId) → Promise<number|null> }
 */
function createAutoReply(deps) {
  const { read, write, now = () => new Date(), chatTools, send, store, historyCount, recentOut } = deps;
  const config = () => cleanConfig(read(KEY_CFG, null));
  const state = () => {
    const s = read(KEY_STATE, null) || {};
    return { sent: s.sent && typeof s.sent === "object" ? s.sent : {}, off: s.off && typeof s.off === "object" ? s.off : {}, log: Array.isArray(s.log) ? s.log : [] };
  };
  const saveState = (s) => {
    const keys = Object.keys(s.sent);
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete s.sent[k];
    s.log = s.log.slice(-300);
    write(KEY_STATE, s);
  };
  function textFor(cfg, rule, chatId) {
    const t = cfg.rules[rule].texts[lineOf(chatId)] || cfg.rules[rule].texts.UVIXPRINT || "";
    const chat = chatTools.config();
    return t.replace(/\{ish_boshi\}/g, chat.workFrom || "09:00").replace(/\{ish_oxiri\}/g, chat.workTo || "19:00");
  }
  // Menejer yaqinda (10 daqiqa ichida) shu chatda yozganmi yoki hozir yozyaptimi
  function managerActive(chatId) {
    if (chatTools.typingActive?.(chatId)) return true;
    const t = now().getTime();
    if (recentOut) return recentOut(chatId, new Date(t - MANAGER_QUIET_MS).toISOString());
    const list = read("uvix:telegramMessages", {})?.[chatId] || [];
    return list.some((m) => m.out && !m.auto && t - new Date(m.date).getTime() < MANAGER_QUIET_MS);
  }
  function countToday(st, chatId) {
    const day = tashkentDay(now());
    return st.log.filter((e) => e.chatId === chatId && tashkentDay(new Date(e.at)) === day).length;
  }
  // Qaysi qoida ishlashi kerak (yubormaydi). Kiruvchi xabar uchun: away > greet
  async function decideIncoming(chatId) {
    const cfg = config();
    if (!cfg.on) return null;
    const st = state();
    if (st.off[chatId]) return null;
    if (countToday(st, chatId) >= DAILY_MAX) return null;
    if (managerActive(chatId)) return null;
    const sent = st.sent[chatId] || {};
    const chatCfg = chatTools.config();
    if (!chatTools.isWorkTime(chatCfg)) {
      if (cfg.rules.away.on && sent.away !== tashkentDay(now())) return "away";
      return null;
    }
    if (cfg.rules.greet.on && !sent.greet) {
      // Yangi mijozmi — Telegram tarixida faqat shu xabar bo'lsa. Aniqlab bo'lmasa — yubormaymiz (eski mijozga «xush kelibsiz» ketmasin)
      const n = historyCount ? await historyCount(chatId).catch(() => null) : null;
      if (n !== null && n <= 1) return "greet";
    }
    return null;
  }
  async function fire(chatId, rule, reason) {
    const cfg = config();
    if (!cfg.on || !cfg.rules[rule]?.on) return null;
    const st = state();
    if (st.off[chatId] || countToday(st, chatId) >= DAILY_MAX || managerActive(chatId)) return null;
    const text = textFor(cfg, rule, chatId);
    if (!text) return null;
    const { tgId } = await send(chatId, text);
    const msg = store(chatId, { text, tgId: tgId ?? null, auto: rule });
    const st2 = state();
    const sent = st2.sent[chatId] || {};
    if (rule === "greet") sent.greet = now().toISOString();
    if (rule === "away") { sent.away = tashkentDay(now()); sent.greet = sent.greet || now().toISOString(); }
    if (rule === "late") sent.late = reason || now().toISOString();
    st2.sent[chatId] = sent;
    st2.log.push({ at: now().toISOString(), chatId, rule });
    saveState(st2);
    return msg;
  }
  // Kiruvchi xabardan keyin: biroz kutib (menejer javob berib ulgursin) qayta tekshiradi
  async function onIncoming(chatId) {
    const rule = await decideIncoming(String(chatId));
    if (!rule) return null;
    return fire(String(chatId), rule);
  }
  // Har daqiqada: ish vaqtida slaMinutes dan beri javobsiz chatlarga «Javob kechiksa»
  async function tick() {
    const cfg = config();
    if (!cfg.on || !cfg.rules.late.on) return 0;
    const chatCfg = chatTools.config();
    if (!chatCfg.slaMinutes || !chatTools.isWorkTime(chatCfg)) return 0;
    const st = state();
    let n = 0;
    for (const w of chatTools.waitingChats()) {
      const mark = String(w.lastId);
      if ((st.sent[w.chatId] || {}).late === mark) continue;
      try { if (await fire(w.chatId, "late", mark)) n++; } catch (e) { console.error("Avtojavob (kechikish):", e.message); }
    }
    return n;
  }
  function setChatOff(chatId, off) {
    const st = state();
    if (off) st.off[chatId] = new Date(now()).toISOString(); else delete st.off[chatId];
    saveState(st);
    return !!off;
  }
  function summary() {
    const cfg = config();
    const st = state();
    const day = tashkentDay(now());
    const today = { greet: 0, away: 0, late: 0 };
    for (const e of st.log) if (tashkentDay(new Date(e.at)) === day && today[e.rule] !== undefined) today[e.rule]++;
    return { config: cfg, today, night: !chatTools.isWorkTime(chatTools.config()), work: { from: chatTools.config().workFrom, to: chatTools.config().workTo, days: chatTools.config().workDays, slaMinutes: chatTools.config().slaMinutes } };
  }
  return { config, cleanConfig, onIncoming, decideIncoming, fire, tick, setChatOff, isOff: (chatId) => !!state().off[chatId], summary, textFor };
}

function registerAutoReply(app, { requireAuth, requireStaff, requireEdit, upsertStmt, autoReply, chatAllowed, sendTest }) {
  const staffOnly = requireStaff || ((req, res, next) => next());
  const canEdit = (req) => !req.can || req.can("chats.templates") || req.user?.role === "admin";
  app.get("/api/auto-reply", requireAuth, staffOnly, (req, res) => {
    res.json({ ...autoReply.summary(), canEdit: canEdit(req) });
  });
  app.get("/api/auto-reply/chat/:chatId", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.params.chatId || "");
    if (chatAllowed && !chatAllowed(req, chatId)) return res.status(404).json({ error: "not_found" });
    res.json({ off: autoReply.isOff(chatId) });
  });
  app.put("/api/auto-reply", requireAuth, requireEdit, (req, res) => {
    const clean = autoReply.cleanConfig(req.body?.config);
    upsertStmt.run(KEY_CFG, JSON.stringify(clean));
    res.json({ ...autoReply.summary(), canEdit: true });
  });
  app.put("/api/auto-reply/chat/:chatId", requireAuth, staffOnly, (req, res) => {
    const chatId = String(req.params.chatId || "");
    if (!/^(on:)?-?\d{1,20}$/.test(chatId)) return res.status(400).json({ error: "bad_chat" });
    if (chatAllowed && !chatAllowed(req, chatId)) return res.status(404).json({ error: "not_found" });
    res.json({ off: autoReply.setChatOff(chatId, req.body?.off === true) });
  });
  // «Sinab ko'rish» — matn rahbarning o'z Telegramiga («Saqlangan xabarlar») ketadi, mijozga emas
  app.post("/api/auto-reply/test", requireAuth, requireEdit, async (req, res) => {
    const rule = RULES.includes(req.body?.rule) ? req.body.rule : null;
    const line = LINES.includes(req.body?.line) ? req.body.line : "UVIXPRINT";
    if (!rule) return res.status(400).json({ error: "bad_rule" });
    const text = typeof req.body?.text === "string" && req.body.text.trim() ? req.body.text.trim().slice(0, MAX_TEXT) : autoReply.textFor(autoReply.config(), rule, line === "UVONYX" ? "on:0" : "0");
    try { await sendTest(line, `🤖 Avtojavob sinovi · ${RULE_LABEL[rule]}\n\n${text}`); res.json({ ok: true }); }
    catch (e) { res.status(502).json({ error: "send_failed", message: e.message }); }
  });
}

module.exports = { createAutoReply, registerAutoReply, cleanConfig, defaultConfig, lastReal, RULES, LINES, DEFAULT_TEXTS, RULE_LABEL, KEY_CFG, KEY_STATE };
