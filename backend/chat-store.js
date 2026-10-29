// chat-store.js — chat xabarlari alohida jadvalda (118-eskiz).
//
// Avval barcha chatlarning barcha xabarlari bitta KV yozuvida (uvix:telegramMessages) turardi: har chat ochilganda,
// har yangi xabarda butun yozuv o'qilib qayta yozilardi. Endi har xabar — `chat_messages` jadvalida bitta qator;
// chat ochilganda faqat so'nggi 50 tasi o'qiladi.
//
// Ko'chirish o'zi bajariladi: KV'da uvix:telegramMessages paydo bo'lsa (eski baza, eski zaxiradan tiklash,
// testlar), u jadvalga to'liq o'tkaziladi, asl nusxa uvix:telegramMessagesBak ga qo'yiladi (7 kundan keyin o'chadi).
// Xabarning to'liq ko'rinishi `data` ustunida (JSON) — tashqi kod avvalgidek oddiy obyektlar bilan ishlaydi.

const crypto = require("crypto");

const KEY_LEGACY = "uvix:telegramMessages";
const KEY_BAK = "uvix:telegramMessagesBak";
const KEY_META = "uvix:chatStoreMeta";
const LINE_ONYX = "on:";

const isoOf = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(); };
const photoName = (url) => { const m = /^\/api\/photos\/([^/?#]+)/.exec(String(url || "")); return m ? m[1] : null; };
const lineOfChat = (chatId) => (String(chatId || "").startsWith(LINE_ONYX) ? "UVONYX" : "UVIXPRINT");
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

function createChatStore({ db, upsertStmt, now = () => Date.now() }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      chat_id TEXT NOT NULL,
      id TEXT NOT NULL,
      tg_id INTEGER,
      date TEXT NOT NULL,
      out INTEGER NOT NULL DEFAULT 0,
      auto TEXT,
      channel TEXT NOT NULL DEFAULT 'telegram',
      data TEXT NOT NULL,
      PRIMARY KEY (chat_id, id)
    );
    CREATE INDEX IF NOT EXISTS chat_messages_chat_date ON chat_messages(chat_id, date);
    CREATE INDEX IF NOT EXISTS chat_messages_chat_tg ON chat_messages(chat_id, tg_id);
    CREATE INDEX IF NOT EXISTS chat_messages_date ON chat_messages(date);
  `);
  const q = {
    kvGet: db.prepare("SELECT value FROM kv_store WHERE key = ?"),
    kvDel: db.prepare("DELETE FROM kv_store WHERE key = ?"),
    put: db.prepare("INSERT OR REPLACE INTO chat_messages (chat_id, id, tg_id, date, out, auto, channel, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
    tail: db.prepare("SELECT data FROM chat_messages WHERE chat_id = ? ORDER BY date DESC, id DESC LIMIT ?"),
    before: db.prepare("SELECT data FROM chat_messages WHERE chat_id = ? AND (date < ? OR (date = ? AND id < ?)) ORDER BY date DESC, id DESC LIMIT ?"),
    countBefore: db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ? AND (date < ? OR (date = ? AND id < ?))"),
    count: db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ?"),
    byId: db.prepare("SELECT data FROM chat_messages WHERE chat_id = ? AND id = ?"),
    byTg: db.prepare("SELECT data FROM chat_messages WHERE chat_id = ? AND tg_id = ? LIMIT 1"),
    tgIds: db.prepare("SELECT tg_id FROM chat_messages WHERE chat_id = ? AND tg_id IS NOT NULL"),
    near: db.prepare("SELECT data FROM chat_messages WHERE chat_id = ? AND tg_id IS NULL AND out = ? AND date BETWEEN ? AND ?"),
    del: db.prepare("DELETE FROM chat_messages WHERE chat_id = ? AND id = ?"),
    delChat: db.prepare("DELETE FROM chat_messages WHERE chat_id = ?"),
    chatIds: db.prepare("SELECT DISTINCT chat_id FROM chat_messages"),
    recentOut: db.prepare("SELECT 1 FROM chat_messages WHERE chat_id = ? AND out = 1 AND auto IS NULL AND date >= ? LIMIT 1"),
    recent: db.prepare(`SELECT chat_id, data FROM (
        SELECT chat_id, data, date, id, ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY date DESC, id DESC) AS rn FROM chat_messages
      ) WHERE rn <= ? ORDER BY chat_id, date, id`),
    lastIn: db.prepare("SELECT chat_id, MAX(date) AS d FROM chat_messages WHERE out = 0 GROUP BY chat_id"),
    all: db.prepare("SELECT chat_id, data FROM chat_messages ORDER BY chat_id, date, id"),
    allDesc: db.prepare("SELECT chat_id, data FROM chat_messages ORDER BY date DESC, id DESC"),
    media: db.prepare("SELECT chat_id, data FROM chat_messages WHERE data LIKE '%/api/photos/%'"),
    old: db.prepare("SELECT chat_id, id, data FROM chat_messages WHERE date < ?"),
    total: db.prepare("SELECT COUNT(*) AS n FROM chat_messages"),
    oldCount: db.prepare("SELECT chat_id, COUNT(*) AS n FROM chat_messages WHERE date < ? GROUP BY chat_id"),
    perChat: db.prepare("SELECT chat_id, COUNT(*) AS n FROM chat_messages GROUP BY chat_id"),
  };

  function row(chatId, m) {
    const msg = { ...m, id: String(m.id || crypto.randomUUID()) };
    const tg = Number.isInteger(msg.tgId) ? msg.tgId : null;
    q.put.run(String(chatId), msg.id, tg, isoOf(msg.date), msg.out ? 1 : 0, msg.auto ? String(msg.auto) : null, msg.channel || "telegram", JSON.stringify(msg));
    return msg;
  }

  // Eski KV yozuvi bo'lsa — jadvalga to'liq o'tkazamiz (o'rniga qo'yamiz: KV'dagi holat — haqiqat)
  function sync() {
    const r = q.kvGet.get(KEY_LEGACY);
    if (!r) return;
    const blob = parse(r.value) || {};
    let count = 0;
    db.transaction(() => {
      db.prepare("DELETE FROM chat_messages").run();
      for (const [chatId, list] of Object.entries(blob)) for (const m of Array.isArray(list) ? list : []) if (m && typeof m === "object") { row(chatId, m); count++; }
      upsertStmt.run(KEY_BAK, r.value);
      upsertStmt.run(KEY_META, JSON.stringify({ migratedAt: new Date(now()).toISOString(), count }));
      q.kvDel.run(KEY_LEGACY);
    })();
    console.log(`Chat xabarlari alohida jadvalga ko'chirildi: ${count} ta`);
  }
  const rows = (list) => list.map((x) => parse(x.data)).filter(Boolean);
  const S = (fn) => (...a) => { sync(); return fn(...a); };

  /** Suhbatning so'nggi `limit` xabari (yoki `before` dan eskiroqlari); eskisi birinchi */
  function list(chatId, { limit = 50, before = null } = {}) {
    const id = String(chatId);
    const got = before
      ? q.before.all(id, isoOf(before.date), isoOf(before.date), String(before.id || ""), limit)
      : q.tail.all(id, limit);
    return rows(got).reverse();
  }
  function countBefore(chatId, m) {
    if (!m) return 0;
    return q.countBefore.get(String(chatId), isoOf(m.date), isoOf(m.date), String(m.id || "")).n;
  }
  const get = (chatId, id) => { const r = q.byId.get(String(chatId), String(id)); return r ? parse(r.data) : null; };
  const byTg = (chatId, tgId) => { const r = q.byTg.get(String(chatId), Number(tgId)); return r ? parse(r.data) : null; };
  const tgIds = (chatId) => new Set(q.tgIds.all(String(chatId)).map((r) => r.tg_id));

  // Mavjud xabarni topadi: avval Telegram ID bo'yicha, bo'lmasa (ID'siz yozuvlar) — matn + yo'nalish + vaqt (±3 daqiqa)
  function findSame(chatId, m) {
    if (m.tgId != null) { const x = byTg(chatId, m.tgId); if (x) return x; }
    const t = Date.parse(m.date);
    if (!Number.isFinite(t)) return null;
    const near = rows(q.near.all(String(chatId), m.out ? 1 : 0, new Date(t - 180000).toISOString(), new Date(t + 180000).toISOString()));
    return near.find((x) => (x.text || "") === (m.text || "") && (x.mediaType || null) === (m.mediaType || null)) || null;
  }
  /** Kelgan xabarlarni qo'shadi (takrorlarini tashlaydi); qaytaradi: qo'shilganlar soni */
  function merge(chatId, incoming, normalize = (m) => m) {
    let added = 0;
    db.transaction(() => {
      for (const m of incoming) {
        const same = findSame(chatId, m);
        if (same) {
          let changed = false;
          if (same.tgId == null && m.tgId != null) { same.tgId = m.tgId; changed = true; }
          if (same.replyToTgId == null && m.replyToTgId != null) { same.replyToTgId = m.replyToTgId; changed = true; }
          if (changed) row(chatId, same);
          continue;
        }
        row(chatId, normalize(m));
        added++;
      }
    })();
    return added;
  }
  const insert = (chatId, m) => row(chatId, m);
  /** fn(msg) — o'zgartiradi; null qaytarsa — o'zgarmaydi */
  function update(chatId, id, fn) {
    const m = get(chatId, id);
    if (!m) return null;
    const r = fn(m);
    if (r === false) return m;
    row(chatId, r && typeof r === "object" ? r : m);
    return get(chatId, id);
  }
  function updateByTg(chatId, tgId, fn) {
    const m = byTg(chatId, tgId);
    return m ? update(chatId, m.id, fn) : null;
  }

  /** Chatlar ro'yxati uchun: har chatning so'nggi `n` xabari va oxirgi kiruvchi xabar sanasi */
  function summaries(n = 8) {
    const out = new Map();
    for (const r of q.recent.all(n)) {
      const m = parse(r.data);
      if (!m) continue;
      if (!out.has(r.chat_id)) out.set(r.chat_id, { recent: [], lastIn: null });
      out.get(r.chat_id).recent.push(m);
    }
    for (const r of q.lastIn.all()) if (out.has(r.chat_id)) out.get(r.chat_id).lastIn = r.d;
    return out;
  }
  const recentOut = (chatId, sinceIso) => !!q.recentOut.get(String(chatId), isoOf(sinceIso));
  /** Eng yangisidan boshlab barcha xabarlar: cb(chatId, msg) true qaytarsa — to'xtaydi */
  function scanDesc(cb) {
    for (const r of q.allDesc.iterate()) { const m = parse(r.data); if (m && cb(r.chat_id, m) === true) break; }
  }
  /** Fayl bog'langan xabarlar: cb(chatId, msg) */
  function eachMedia(cb) {
    for (const r of q.media.all()) { const m = parse(r.data); if (m) cb(r.chat_id, m); }
  }
  /** O'chirilgan fayllar: xabarda mediaUrl o'chadi, `mediaGone` qo'yiladi */
  function markGone(names) {
    let n = 0;
    db.transaction(() => {
      for (const r of q.media.all()) {
        const m = parse(r.data);
        if (!m) continue;
        const a = photoName(m.mediaUrl), b = photoName(m.mediaUrlAlt);
        if (!((a && names.has(a)) || (b && names.has(b)))) continue;
        if (a && !names.has(a) && b && names.has(b)) m.mediaUrlAlt = null; // faqat zaxira format o'chdi
        else { m.mediaUrl = null; m.mediaUrlAlt = null; m.mediaGone = true; }
        row(r.chat_id, m); n++;
      }
    })();
    return n;
  }
  const chatIds = () => q.chatIds.all().map((r) => r.chat_id);
  function all() {
    const out = {};
    for (const r of q.all.iterate()) { const m = parse(r.data); if (m) (out[r.chat_id] ||= []).push(m); }
    return out;
  }
  const count = (chatId) => (chatId == null ? q.total.get().n : q.count.get(String(chatId)).n);
  function perChat() { const m = new Map(); for (const r of q.perChat.all()) m.set(r.chat_id, r.n); return m; }
  function oldPerChat(cutoffIso) { const m = new Map(); for (const r of q.oldCount.all(cutoffIso)) m.set(r.chat_id, r.n); return m; }

  const mediaOf = (m) => [photoName(m.mediaUrl), photoName(m.mediaUrlAlt)].filter(Boolean);
  /** `cutoffIso` dan eski xabarlarni o'chiradi (keep(chatId) true bo'lgan chatlardan tashqari) */
  function pruneBefore(cutoffIso, keep = () => false) {
    const media = new Set();
    let count = 0;
    db.transaction(() => {
      for (const r of q.old.all(cutoffIso)) {
        if (keep(r.chat_id)) continue;
        const m = parse(r.data);
        if (m) for (const n of mediaOf(m)) media.add(n);
        q.del.run(r.chat_id, r.id); count++;
      }
    })();
    return { count, media };
  }
  /** Butun chatlarni o'chiradi (pick(chatId) true bo'lganlar) */
  function removeChats(pick) {
    const media = new Set();
    let count = 0, chats = 0;
    const ids = chatIds().filter(pick);
    db.transaction(() => {
      for (const id of ids) {
        for (const m of list(id, { limit: 1e9 })) for (const n of mediaOf(m)) media.add(n);
        count += q.delChat.run(id).changes; chats++;
      }
    })();
    return { count, chats, media, ids };
  }
  /** Zaxiradan tiklash: jadvalni berilgan qatorlar bilan almashtiradi */
  function replaceAll(list) {
    db.transaction(() => {
      db.prepare("DELETE FROM chat_messages").run();
      for (const r of list) {
        const m = parse(r.data);
        if (m) row(r.chat_id, m);
      }
    })();
  }
  /** Ko'chirishdan 7 kun o'tgach eski KV nusxasini o'chiradi */
  function dropBackup(days = 7) {
    const meta = parse(q.kvGet.get(KEY_META)?.value || "null");
    if (!meta?.migratedAt || !q.kvGet.get(KEY_BAK)) return false;
    if (now() - Date.parse(meta.migratedAt) < days * 86400000) return false;
    q.kvDel.run(KEY_BAK);
    return true;
  }

  sync();
  return {
    sync, list: S(list), countBefore: S(countBefore), get: S(get), byTg: S(byTg), tgIds: S(tgIds), merge: S(merge), insert: S(insert),
    update: S(update), updateByTg: S(updateByTg), summaries: S(summaries), recentOut: S(recentOut), scanDesc: S(scanDesc),
    eachMedia: S(eachMedia), markGone: S(markGone), chatIds: S(chatIds), all: S(all), count: S(count), perChat: S(perChat),
    oldPerChat: S(oldPerChat), pruneBefore: S(pruneBefore), removeChats: S(removeChats), replaceAll, dropBackup, mediaOf,
  };
}

module.exports = { createChatStore, lineOfChat, photoName, KEY_LEGACY, KEY_BAK, KEY_META };
