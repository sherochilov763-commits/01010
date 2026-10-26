// chat-files.js — Chat fayllari (116-eskiz): nima qancha joy egallaydi, tozalash, saqlash muddati, disk to'lsa avtomatik.
//
// uploads papkasi UMUMIY (buyurtma rasmlari, vazifa rasmlari, chat fayllari...). Xavfsiz qoida:
//   • fayl nomi bazaning ISTALGAN joyida (Telegram xabarlaridan tashqari) uchrasa — «biriktirilgan», hech qachon o'chirilmaydi;
//   • faqat Telegram xabarlarida uchrasa — chat fayli: muddati o'tsa o'chirilishi mumkin (Telegram'da qoladi — qayta olinadi);
//   • hech qayerda uchramasa va 24 soatdan eski bo'lsa — «yetim» (takroriy nusxa): faqat admin qo'lda tasdiqlasa o'chiriladi.
// Avtomatik (har kuni va disk 80% to'lsa) faqat qayta olinadigan chat fayllari o'chiriladi — yetimlar faqat qo'lda.
// O'chirilgan chat faylining xabarida mediaUrl o'chadi, `mediaGone: true` qo'yiladi — chatda «↻ Qayta yuklash».
// Sozlama: uvix:chatFiles = { lazyDocs, keepDays, autoClean }; jurnal: uvix:chatFilesLog (oxirgi 50 ta).

const fs = require("fs");
const path = require("path");

const KEY_CFG = "uvix:chatFiles";
const KEY_LOG = "uvix:chatFilesLog";
const KEY_MSGS = "uvix:telegramMessages";
const DEFAULTS = { lazyDocs: true, keepDays: 60, autoClean: true };
const KEEP_CHOICES = [0, 30, 60, 90]; // 0 — cheksiz
const DAY = 24 * 60 * 60 * 1000;
const ORPHAN_MIN_AGE = DAY; // yangi yuklangan, hali saqlanmagan fayl yetim deb hisoblanmasin
const DISK_HIGH = 0.8, DISK_TARGET = 0.75;
const NAME_RE = /[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]{2,5}/g;

function cleanConfig(c) {
  const out = { ...DEFAULTS };
  if (c && typeof c === "object") {
    if (typeof c.lazyDocs === "boolean") out.lazyDocs = c.lazyDocs;
    if (typeof c.autoClean === "boolean") out.autoClean = c.autoClean;
    if (KEEP_CHOICES.includes(Number(c.keepDays))) out.keepDays = Number(c.keepDays);
  }
  return out;
}
const photoName = (url) => { const m = /^\/api\/photos\/([^/?#]+)/.exec(String(url || "")); return m ? m[1] : null; };

/**
 * Fayllarni guruhlarga ajratadi (sof funksiya — testlanadi).
 * files: [{ name, size, mtimeMs }]; otherText: Telegram xabarlaridan tashqari butun baza matni;
 * msgs: { chatId: [msg] }; keepDays; now (ms)
 */
function classify({ files, otherText, msgs, keepDays, now }) {
  const other = new Set(String(otherText || "").match(NAME_RE) || []);
  // chat fayli → eng yangi xabar sanasi (bir fayl bir necha xabarda bo'lishi mumkin)
  const chatRef = new Map();
  for (const list of Object.values(msgs || {})) for (const m of Array.isArray(list) ? list : []) {
    for (const u of [m?.mediaUrl, m?.mediaUrlAlt]) {
      const n = photoName(u);
      if (!n) continue;
      const t = Date.parse(m.date) || 0;
      chatRef.set(n, Math.max(chatRef.get(n) || 0, t));
    }
  }
  const groups = { orphan: [], old: [], attached: [], recent: [] };
  const limit = keepDays ? now - keepDays * DAY : null;
  for (const f of files) {
    if (other.has(f.name)) groups.attached.push(f);
    else if (chatRef.has(f.name)) (limit && chatRef.get(f.name) < limit ? groups.old : groups.recent).push(f);
    else if (now - f.mtimeMs > ORPHAN_MIN_AGE) groups.orphan.push(f);
    else groups.recent.push(f);
  }
  return groups;
}
const sum = (list) => ({ count: list.length, size: list.reduce((s, f) => s + f.size, 0) });

function createChatFiles({ db, getStmt, upsertStmt, uploadsDir, dbPath, now = () => Date.now(), onPolicy, loadMedia, notify }) {
  const read = (k, d) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : d; } catch { return d; } };
  const config = () => cleanConfig(read(KEY_CFG, null));
  const listFiles = () => {
    let names = [];
    try { names = fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch { return []; }
    const out = [];
    for (const name of names) { try { const s = fs.statSync(path.join(uploadsDir, name)); out.push({ name, size: s.size, mtimeMs: s.mtimeMs }); } catch { /* o'chirilgan */ } }
    return out;
  };
  // Telegram xabarlaridan tashqari bazadagi BARCHA matn (barcha jadvallar, barcha kalitlar)
  function otherText() {
    const parts = [];
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      try {
        for (const row of db.prepare(`SELECT * FROM "${name.replace(/"/g, "")}"`).iterate()) {
          if (name === "kv_store" && row.key === KEY_MSGS) continue;
          parts.push(JSON.stringify(row));
        }
      } catch { /* o'qib bo'lmadi — xavfsizlik uchun keyingi jadval */ }
    }
    return parts.join("\n");
  }
  function analyze(keepDays = config().keepDays) {
    const g = classify({ files: listFiles(), otherText: otherText(), msgs: read(KEY_MSGS, {}), keepDays, now: now() });
    return { groups: g, summary: { orphan: sum(g.orphan), old: sum(g.old), attached: sum(g.attached), recent: sum(g.recent) } };
  }
  function disk() {
    try { const s = fs.statfsSync(path.dirname(dbPath)); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { return null; }
  }
  function log(entry) {
    const l = read(KEY_LOG, []);
    upsertStmt.run(KEY_LOG, JSON.stringify([...(Array.isArray(l) ? l : []), { at: new Date(now()).toISOString(), ...entry }].slice(-50)));
  }
  // Fayllarni o'chiradi; chat fayllari bo'lsa — xabarlarda «mediaGone» belgisi
  function remove(list, { reason, who }) {
    const gone = new Set();
    let size = 0;
    for (const f of list) {
      try { fs.unlinkSync(path.join(uploadsDir, f.name)); gone.add(f.name); size += f.size; } catch { /* allaqachon yo'q */ }
    }
    if (gone.size) {
      const all = read(KEY_MSGS, {});
      let changed = false;
      for (const msgs of Object.values(all)) for (const m of Array.isArray(msgs) ? msgs : []) {
        const a = photoName(m.mediaUrl), b = photoName(m.mediaUrlAlt);
        if ((a && gone.has(a)) || (b && gone.has(b))) {
          if (a && !gone.has(a) && b && gone.has(b)) { m.mediaUrlAlt = null; changed = true; continue; } // faqat zaxira format o'chdi
          m.mediaUrl = null; m.mediaUrlAlt = null; m.mediaGone = true; changed = true;
        }
      }
      if (changed) upsertStmt.run(KEY_MSGS, JSON.stringify(all));
      log({ reason, who: who || "Tizim", count: gone.size, size });
    }
    return { count: gone.size, size };
  }
  // Qo'lda: orphans va/yoki old (muddati o'tgan chat fayllari)
  function clean({ orphans, old, who }) {
    const { groups } = analyze();
    const list = [...(orphans ? groups.orphan : []), ...(old ? groups.old : [])];
    return remove(list, { reason: [orphans && "yetim", old && "muddati o'tgan"].filter(Boolean).join(" + "), who });
  }
  // Har kuni: muddati o'tgan chat fayllari; disk 80% dan oshsa — eng eski chat fayllaridan 75% gacha
  function daily() {
    const cfg = config();
    const res = { old: { count: 0, size: 0 }, disk: { count: 0, size: 0 } };
    if (cfg.keepDays) res.old = remove(analyze(cfg.keepDays).groups.old, { reason: `saqlash muddati ${cfg.keepDays} kun` });
    const d = disk();
    if (cfg.autoClean && d && d.total && (d.total - d.free) / d.total > DISK_HIGH) {
      const need = (d.total - d.free) - d.total * DISK_TARGET;
      const msgs = read(KEY_MSGS, {});
      const { groups } = analyze(0);
      // Eng eski xabardagi fayllardan boshlab (recent — chat fayllari; biriktirilganlarga tegilmaydi)
      const dateOf = new Map();
      for (const list of Object.values(msgs)) for (const m of list || []) for (const u of [m.mediaUrl, m.mediaUrlAlt]) { const n = photoName(u); if (n) dateOf.set(n, Math.max(dateOf.get(n) || 0, Date.parse(m.date) || 0)); }
      const cand = groups.recent.filter((f) => dateOf.has(f.name)).sort((a, b) => dateOf.get(a.name) - dateOf.get(b.name));
      const pick = []; let acc = 0;
      for (const f of cand) { if (acc >= need) break; pick.push(f); acc += f.size; }
      res.disk = remove(pick, { reason: "disk 80% dan oshdi" });
      if (res.disk.count) notify?.({ title: "Disk to'lyapti — chat fayllari tozalandi", body: `${res.disk.count} ta eski chat fayli serverdan o'chirildi (Telegram'da qoladi).` });
    }
    return res;
  }
  // O'chirilgan yoki oldindan yuklanmagan faylni Telegram'dan qayta olish
  async function fetchMedia(chatId, tgId) {
    const all = read(KEY_MSGS, {});
    const m = (all[chatId] || []).find((x) => x.tgId === tgId);
    if (!m) { const e = new Error("Xabar topilmadi"); e.status = 404; throw e; }
    const c = await loadMedia(chatId, tgId);
    if (!c || !c.mediaUrl) { const e = new Error("Telegram'dan olib bo'lmadi — xabar o'chirilgan bo'lishi mumkin"); e.status = 410; throw e; }
    const fresh = read(KEY_MSGS, {});
    const t = (fresh[chatId] || []).find((x) => x.tgId === tgId);
    if (t) { t.mediaUrl = c.mediaUrl; t.mediaUrlAlt = c.mediaUrlAlt || null; delete t.mediaGone; delete t.lazy; if (c.fileSize) t.fileSize = c.fileSize; upsertStmt.run(KEY_MSGS, JSON.stringify(fresh)); }
    return { mediaUrl: c.mediaUrl, mediaUrlAlt: c.mediaUrlAlt || null };
  }
  const applyPolicy = () => onPolicy?.({ lazyDocs: config().lazyDocs });
  applyPolicy();
  return { config, analyze, clean, daily, fetchMedia, applyPolicy, disk };
}

function registerChatFiles(app, { requireAuth, requireAdmin, requireStaff, upsertStmt, chatFiles, chatAllowed }) {
  const summary = () => { const a = chatFiles.analyze(); return { config: chatFiles.config(), ...a.summary, disk: chatFiles.disk() }; };
  app.get("/api/system/chat-files", requireAuth, requireAdmin, (req, res) => res.json(summary()));
  app.put("/api/system/chat-files/config", requireAuth, requireAdmin, (req, res) => {
    upsertStmt.run(KEY_CFG, JSON.stringify(cleanConfig({ ...chatFiles.config(), ...(req.body?.config || {}) })));
    chatFiles.applyPolicy();
    res.json(summary());
  });
  app.post("/api/system/chat-files/clean", requireAuth, requireAdmin, (req, res) => {
    const orphans = req.body?.orphans === true, old = req.body?.old === true;
    if (!orphans && !old) return res.status(400).json({ error: "nothing", message: "Nimani tozalashni tanlang" });
    const r = chatFiles.clean({ orphans, old, who: req.user?.name });
    res.json({ ...r, ...summary() });
  });
  app.post("/api/telegram-user/media/:chatId/:tgId", requireAuth, requireStaff, async (req, res) => {
    const chatId = String(req.params.chatId).slice(0, 64), tgId = parseInt(req.params.tgId, 10);
    if (!Number.isInteger(tgId) || tgId <= 0) return res.status(400).json({ error: "bad_id" });
    if (chatAllowed && !chatAllowed(req, chatId)) return res.status(404).json({ error: "not_found" });
    try { res.json(await chatFiles.fetchMedia(chatId, tgId)); }
    catch (e) { res.status(e.status || 502).json({ error: "media_failed", message: e.message }); }
  });
}

module.exports = { createChatFiles, registerChatFiles, classify, cleanConfig, DEFAULTS, KEY_CFG, KEY_LOG };
