// chat-history.js — chat tarixi muddati va uzilgan akkaunt ma'lumotlari (118-eskiz).
//
//  • Serverda oxirgi N kun (30/60/90, standart 30) saqlanadi; eskisi har kecha (03:00–06:00, Toshkent) o'chadi.
//    Birinchi tozalashni admin Sozlamalarda o'zi ko'rib bosishi mumkin — deploy'dan keyin kunduzi o'zi o'chirmaydi.
//    Telegram'dagi asl yozishmaga tegilmaydi — chatda «↑ Eskisini ko'rish» bilan ko'rsatiladi, serverga yozilmaydi.
//  • Buyurtma, smeta yoki bitim bog'langan mijoz chati muddatdan qat'i nazar TO'LIQ saqlanadi («keepLinked»).
//  • Telegram akkaunt (yo'nalish) uzilgan bo'lsa — uning chatlari: admin tasdig'i bilan darhol yoki 7 kundan keyin
//    o'zi tozalanadi (6-kuni ogohlantirish). Buyurtmali chatlar va buyurtmaga biriktirilgan fayllar qoladi.
//  • O'chirilgan xabarlarning fayllari ham o'chadi — boshqa joyda ishlatilmasa (chat-files.dropFiles).
// Kalitlar: uvix:chatHistory (sozlama), uvix:chatHistoryState (oxirgi tozalash), uvix:chatHistoryLog, uvix:tgLineDown.

const { lineOfChat } = require("./chat-store");

const KEY_CFG = "uvix:chatHistory";
const KEY_STATE = "uvix:chatHistoryState";
const KEY_LOG = "uvix:chatHistoryLog";
const KEY_DOWN = "uvix:tgLineDown";
const DEFAULTS = { keepDays: 30, keepLinked: true, autoPrune: true };
const KEEP_CHOICES = [30, 60, 90];
const LINES = ["UVIXPRINT", "UVONYX"];
const DAY = 24 * 60 * 60 * 1000;
const DOWN_DAYS = 7, WARN_DAYS = 6, PRUNE_HOUR = 3;

function cleanConfig(c) {
  const out = { ...DEFAULTS };
  if (c && typeof c === "object") {
    if (KEEP_CHOICES.includes(Number(c.keepDays))) out.keepDays = Number(c.keepDays);
    if (typeof c.keepLinked === "boolean") out.keepLinked = c.keepLinked;
    if (typeof c.autoPrune === "boolean") out.autoPrune = c.autoPrune;
  }
  return out;
}

/** Qaysi chatlar to'liq saqlanadi: chatId → sabab («Buyurtma #1042», «Smeta S-12», «Bitim») — sof funksiya */
function linkedChats(leads, orders) {
  const out = new Map();
  const ordersById = new Map();
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || o.deletedAt) continue;
    ordersById.set(String(o.id), o);
    if (o.telegramChatId) out.set(String(o.telegramChatId), `Buyurtma${o.orderNumber ? ` #${o.orderNumber}` : ""}`);
  }
  for (const l of Array.isArray(leads) ? leads : []) {
    if (!l || l.deletedAt || !l.telegramChatId) continue;
    const id = String(l.telegramChatId);
    if (out.has(id) && out.get(id).startsWith("Buyurtma")) continue;
    if (l.orderId) {
      const o = ordersById.get(String(l.orderId));
      out.set(id, `Buyurtma${o?.orderNumber ? ` #${o.orderNumber}` : ""}`);
    } else if (l.quote) out.set(id, `Smeta${l.quote.no ? ` ${l.quote.no}` : ""}`);
    else if (l.design || l.print || Number(l.estimatedValue) > 0) out.set(id, out.get(id) || "Bitim");
  }
  return out;
}

const tashkent = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
};

function createChatHistory({ store, getStmt, upsertStmt, chatFiles, isConnected, notify, now = () => Date.now() }) {
  const read = (k, d) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : d; } catch { return d; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const config = () => cleanConfig(read(KEY_CFG, null));
  const linked = () => linkedChats(read("uvix:leads", []), read("uvix:orders", []));
  const cutoffIso = (cfg = config()) => new Date(now() - cfg.keepDays * DAY).toISOString();
  const keepSet = (cfg = config()) => (cfg.keepLinked ? linked() : new Map());
  function log(entry) {
    const l = read(KEY_LOG, []);
    write(KEY_LOG, [...(Array.isArray(l) ? l : []), { at: new Date(now()).toISOString(), ...entry }].slice(-50));
  }

  /** Chat ochilganda: shu chat to'liq saqlanadimi va nega */
  function keepInfo(chatId) {
    const cfg = config();
    const reason = cfg.keepLinked ? linked().get(String(chatId)) : null;
    return { keepDays: cfg.keepDays, linked: !!reason, reason: reason || null, cutoff: cutoffIso(cfg) };
  }

  /** Hozirgi holat: jami, muddatdan eski, shundan saqlanadigan (bog'langan), o'chadigan */
  function preview() {
    const cfg = config();
    const keep = keepSet(cfg);
    let old = 0, oldLinked = 0;
    for (const [id, n] of store.oldPerChat(cutoffIso(cfg))) { old += n; if (keep.has(id)) oldLinked += n; }
    return { total: store.count(), old, oldLinked, willDelete: old - oldLinked, linkedChats: keep.size };
  }

  function prune({ who } = {}) {
    const cfg = config();
    const keep = keepSet(cfg);
    const r = store.pruneBefore(cutoffIso(cfg), (id) => keep.has(id));
    const files = chatFiles ? chatFiles.dropFiles(r.media, { reason: `chat tarixi ${cfg.keepDays} kundan eski`, who }) : { count: 0, size: 0 };
    if (r.count) log({ kind: "prune", who: who || "Tizim", count: r.count, files: files.count, size: files.size, keepDays: cfg.keepDays });
    write(KEY_STATE, { ...read(KEY_STATE, {}), lastPrune: new Date(now()).toISOString(), lastDay: tashkent(now()).day });
    return { count: r.count, files };
  }

  // ---------- Uzilgan akkaunt (yo'nalish) ----------
  const lineChats = (line, keep) => store.chatIds().filter((id) => lineOfChat(id) === line && !keep.has(id));
  // Ulanmagan va ma'lumoti bor yo'nalish uchun «qachondan beri uzilgan» belgisini qo'yadi; ulanganini tozalaydi
  function observe(line) {
    const down = read(KEY_DOWN, {}) || {};
    const keep = linked();
    const has = lineChats(line, keep).length > 0;
    let changed = false;
    if (isConnected(line) || !has) { if (down[line]) { delete down[line]; changed = true; } }
    else if (!down[line]) { down[line] = { since: new Date(now()).toISOString() }; changed = true; }
    if (changed) write(KEY_DOWN, down);
    return down[line] || null;
  }
  function lineInfo(line) {
    const mark = observe(line);
    const keep = linked();
    const ids = new Set(lineChats(line, keep));
    const per = store.perChat();
    let messages = 0;
    for (const id of ids) messages += per.get(id) || 0;
    const names = new Set();
    store.eachMedia((chatId, m) => { if (ids.has(chatId)) for (const n of store.mediaOf(m)) names.add(n); });
    const linkedHere = [...keep.keys()].filter((id) => lineOfChat(id) === line && per.has(id)).length;
    const since = mark?.since || null;
    return {
      line, connected: !!isConnected(line), since,
      days: since ? Math.floor((now() - Date.parse(since)) / DAY) : 0,
      autoAt: since ? new Date(Date.parse(since) + DOWN_DAYS * DAY).toISOString() : null,
      chats: ids.size, messages, files: chatFiles ? chatFiles.sizeOf(names) : { count: names.size, size: 0 }, linkedChats: linkedHere,
    };
  }
  function purgeLine(line, { who } = {}) {
    if (!LINES.includes(line)) { const e = new Error("Noma'lum yo'nalish"); e.status = 400; throw e; }
    if (isConnected(line)) { const e = new Error("Akkaunt ulangan — tozalash faqat uzilgan akkaunt uchun"); e.status = 409; throw e; }
    const keep = linked();
    const r = store.removeChats((id) => lineOfChat(id) === line && !keep.has(id));
    const files = chatFiles ? chatFiles.dropFiles(r.media, { reason: `${line} akkaunti uzilgan`, who }) : { count: 0, size: 0 };
    // Ism/ko'rilgan vaqti — o'chirilgan chatlar uchun kerak emas
    const gone = new Set(r.ids);
    for (const k of ["uvix:telegramContacts", "uvix:telegramLastSeen"]) {
      const v = read(k, null);
      if (v && typeof v === "object" && Object.keys(v).some((id) => gone.has(id))) { for (const id of gone) delete v[id]; write(k, v); }
    }
    const down = read(KEY_DOWN, {}) || {};
    if (down[line]) { delete down[line]; write(KEY_DOWN, down); }
    log({ kind: "line", line, who: who || "Tizim", chats: r.chats, count: r.count, files: files.count, size: files.size });
    return { chats: r.chats, count: r.count, files };
  }

  // Har soatda: kechasi 03:00 — muddati o'tgan xabarlar; uzilgan akkaunt — 6-kuni ogohlantirish, 7-kuni tozalash
  function hourly() {
    const out = { pruned: 0, lines: [] };
    const cfg = config();
    const t = tashkent(now());
    const st = read(KEY_STATE, {}) || {};
    if (cfg.autoPrune && t.hour >= PRUNE_HOUR && t.hour < PRUNE_HOUR + 3 && st.lastDay !== t.day) out.pruned = prune({ who: "Tizim (har kecha)" }).count;
    for (const line of LINES) {
      const mark = observe(line);
      if (!mark) continue;
      const days = (now() - Date.parse(mark.since)) / DAY;
      if (days >= DOWN_DAYS) {
        out.lines.push({ line, ...purgeLine(line, { who: "Tizim (7 kun uzilgan)" }) });
        notify?.({ title: `${line}: uzilgan akkaunt ma'lumotlari tozalandi`, body: "Akkaunt 7 kun ulanmadi. Buyurtmali chatlar va biriktirilgan fayllar saqlandi." });
      } else if (days >= WARN_DAYS && !mark.warned) {
        const down = read(KEY_DOWN, {}) || {};
        if (down[line]) { down[line].warned = true; write(KEY_DOWN, down); }
        notify?.({ title: `${line} Telegram 6 kundan beri uzilgan`, body: "Ertaga uning chat tarixi serverdan tozalanadi. Saqlash uchun: Sozlamalar → Telegram akkaunt → «Qayta ulash»." });
      }
    }
    store.dropBackup?.(7);
    return out;
  }
  return { config, keepInfo, preview, prune, lineInfo, purgeLine, hourly, linked };
}

function registerChatHistory(app, { requireAuth, requireAdmin, upsertStmt, getStmt, history }) {
  const lastLog = () => { try { return (JSON.parse(getStmt.get(KEY_LOG)?.value || "[]") || []).slice(-5).reverse(); } catch { return []; } };
  const summary = () => ({ config: history.config(), ...history.preview(), log: lastLog() });
  app.get("/api/system/chat-history", requireAuth, requireAdmin, (req, res) => res.json(summary()));
  app.put("/api/system/chat-history/config", requireAuth, requireAdmin, (req, res) => {
    upsertStmt.run(KEY_CFG, JSON.stringify(cleanConfig({ ...history.config(), ...(req.body?.config || {}) })));
    res.json(summary());
  });
  app.post("/api/system/chat-history/prune", requireAuth, requireAdmin, (req, res) => {
    const r = history.prune({ who: req.user?.name });
    res.json({ ...r, ...summary() });
  });
  const lineOf = (req) => (req.query.line === "UVONYX" ? "UVONYX" : "UVIXPRINT");
  app.get("/api/telegram-user/line-data", requireAuth, requireAdmin, (req, res) => res.json(history.lineInfo(lineOf(req))));
  app.post("/api/telegram-user/line-data/purge", requireAuth, requireAdmin, (req, res) => {
    if (req.body?.confirm !== true) return res.status(400).json({ error: "confirm", message: "Tasdiqlang" });
    try { res.json({ ok: true, ...history.purgeLine(lineOf(req), { who: req.user?.name }), info: history.lineInfo(lineOf(req)) }); }
    catch (e) { res.status(e.status || 500).json({ error: "purge_failed", message: e.message }); }
  });
}

module.exports = { createChatHistory, registerChatHistory, cleanConfig, linkedChats, DEFAULTS, KEY_CFG, KEY_LOG, KEY_DOWN, KEY_STATE };
