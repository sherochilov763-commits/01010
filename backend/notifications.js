// notifications.js — ilova ichidagi bildirishnomalar markazi + Web Push (telefon/kompyuter ekraniga).
// Manba: mavjud Telegram xabarnomalari (notify) va kiruvchi Telegram xabarlari — yangi hodisa qo'shilmaydi,
// faqat bir xil xabar ilovaga ham yetkaziladi. Har xodim o'zi tanlaydi: ilovada / push / ovoz, sokin soatlar.
// Diqqat: bu faylda fs ishlatilmaydi (demo nusxasi uchun ESM'ga o'giriladi).

const KEY_LIST = "uvix:notifications";
const KEY_PREFS = "uvix:notifyPrefs";
const KEY_SUBS = "uvix:pushSubs";
const KEY_VAPID = "uvix:vapid";
const MAX_ITEMS = 400;

// Foydalanuvchiga ko'rinadigan turkumlar
const CATS = {
  orders: { label: "Yangi buyurtmalar", aud: "staff", view: "orders", push: true, sound: "chime" },
  payments: { label: "To'lovlar", aud: "staff", view: "orders", push: true, sound: "cash" },
  chats: { label: "Telegram xabarlari", aud: "staff", view: "chats", push: true, sound: "marimba" },
  expenses: { label: "Rasxodlar", aud: "admins", view: "expense", push: false, sound: "tink" },
  debts: { label: "Qarz eslatmalari", aud: "admins", view: "customers", push: true, sound: "marimba" },
  paint: { label: "Bo'yoq ombori", aud: "admins", view: "paint", push: true, sound: "critical", critical: true },
  attendance: { label: "Davomat", aud: "admins", view: "attendance", push: false, sound: "tink" },
  reports: { label: "Hisobotlar", aud: "admins", view: "report", push: false, sound: "tink" },
  system: { label: "Tizim (zaxira, ulanish)", aud: "admins", view: "settings", push: true, sound: "critical", critical: true },
};
// Telegram yo'nalishi turkumi → bildirishnoma turkumi
const FROM_TG = {
  orders: "orders", payments: "payments", expenses: "expenses", dailyReport: "reports", monthlyReport: "reports",
  backup: "system", system: "system", attendanceDaily: "attendance", attendanceAbsent: "attendance", attendanceReports: "attendance",
  paint: "paint", debts: "debts",
};
const SOUNDS = ["marimba", "chime", "tink", "cash", "critical", "none"];

function stripHtml(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
// Telegram matnidan sarlavha (1-qator, emoji'siz) va qisqa matn
function splitText(text) {
  const lines = stripHtml(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || "UVIX").replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "").trim() || "UVIX";
  const body = lines.slice(1).join(" · ").slice(0, 240);
  return { title: title.slice(0, 120), body };
}

module.exports = function registerNotifications(app, { getStmt, upsertStmt, readEmployees, requireAuth, webpush, now = () => new Date() }) {
  const read = (k, def) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : def; } catch { return def; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  // ---------- VAPID kalitlari (bir marta yaratiladi, bazada saqlanadi) ----------
  function vapid() {
    if (!webpush) return null;
    let v = read(KEY_VAPID, null);
    if (!v?.publicKey) {
      v = webpush.generateVAPIDKeys();
      write(KEY_VAPID, v);
    }
    return v;
  }

  // ---------- Xodim sozlamalari ----------
  const isStaffRole = (role) => role === "admin" || role === "operator" || !role;
  function allowedCats(user) {
    return Object.keys(CATS).filter((c) => (CATS[c].aud === "admins" ? user.role === "admin" : isStaffRole(user.role)));
  }
  function defaultPrefs(user) {
    const matrix = {};
    for (const c of allowedCats(user)) matrix[c] = { app: true, push: !!CATS[c].push, sound: CATS[c].sound };
    return { matrix, quiet: { on: false, from: "22:00", to: "08:00" }, volume: 0.8 };
  }
  function prefsOf(user) {
    const all = read(KEY_PREFS, {});
    const p = all[user.id] || {};
    const d = defaultPrefs(user);
    const matrix = {};
    for (const c of Object.keys(d.matrix)) {
      const m = { ...d.matrix[c], ...(p.matrix?.[c] || {}) };
      if (CATS[c].critical) m.app = true; // muhim xabarlar ilovada doim ko'rinadi
      if (!SOUNDS.includes(m.sound)) m.sound = d.matrix[c].sound;
      matrix[c] = m;
    }
    return { matrix, quiet: { ...d.quiet, ...(p.quiet || {}) }, volume: typeof p.volume === "number" ? Math.max(0, Math.min(1, p.volume)) : d.volume };
  }
  function tashkentHM() {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(now());
  }
  function inQuiet(q) {
    if (!q?.on || !q.from || !q.to) return false;
    const t = tashkentHM();
    return q.from <= q.to ? t >= q.from && t < q.to : t >= q.from || t < q.to;
  }
  const staff = () => readEmployees().filter((e) => isStaffRole(e.role));
  function audience(cat) {
    const aud = CATS[cat]?.aud || "admins";
    return staff().filter((e) => (aud === "admins" ? e.role === "admin" : true));
  }
  const visibleTo = (user) => {
    const cats = new Set(allowedCats(user));
    return (n) => cats.has(n.cat) && (!n.to || n.to === user.id);
  };

  // ---------- Push ----------
  async function pushTo(userId, payload) {
    if (!webpush) return 0;
    const v = vapid();
    const subs = read(KEY_SUBS, {});
    const list = subs[userId] || [];
    if (!list.length) return 0;
    let sent = 0;
    const dead = new Set();
    await Promise.all(list.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(payload), { vapidDetails: { subject: "mailto:admin@uvix.uz", publicKey: v.publicKey, privateKey: v.privateKey }, TTL: 3600, urgency: payload.critical ? "high" : "normal" });
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.add(s.endpoint);
      }
    }));
    if (dead.size) {
      const fresh = read(KEY_SUBS, {});
      fresh[userId] = (fresh[userId] || []).filter((s) => !dead.has(s.endpoint));
      write(KEY_SUBS, fresh);
    }
    return sent;
  }

  // ---------- Hodimni qayd etish ----------
  function emit(cat, { title, body = "", view, to = null, level } = {}) {
    if (!CATS[cat]) return null;
    const item = { id: uid(), cat, title: String(title || CATS[cat].label).slice(0, 140), body: String(body || "").slice(0, 300), view: view || CATS[cat].view, at: now().toISOString(), level: level || (CATS[cat].critical ? "critical" : "info"), to };
    const list = read(KEY_LIST, []);
    list.unshift(item);
    write(KEY_LIST, list.slice(0, MAX_ITEMS));
    // Push — har bir qabul qiluvchining sozlamasiga qarab (fon rejimida, ilova yopiq bo'lsa ham)
    const targets = to ? staff().filter((e) => e.id === to) : audience(cat);
    for (const u of targets) {
      const p = prefsOf(u);
      const m = p.matrix[cat];
      if (!m?.push) continue;
      if (inQuiet(p.quiet) && item.level !== "critical") continue;
      pushTo(u.id, { id: item.id, title: item.title, body: item.body, view: item.view, cat, critical: item.level === "critical", tag: cat === "chats" ? `chat-${view || ""}` : item.id }).catch(() => {});
    }
    return item;
  }
  function fromTelegram(tgCat, text) {
    const cat = FROM_TG[tgCat];
    if (!cat) return null;
    const { title, body } = splitText(text);
    const critical = cat === "paint" ? /tugadi|tugagan|qolmadi|0 l\b/i.test(stripHtml(text)) : undefined;
    return emit(cat, { title, body, level: critical === undefined ? undefined : critical ? "critical" : "info" });
  }
  // Kiruvchi Telegram xabari: bir suhbatdan ketma-ket kelganlarni 2 daqiqada bitta qilib yig'amiz
  const lastChat = new Map();
  function fromChat({ chatId, fromName, text, mediaType }) {
    const k = String(chatId);
    const t = Date.now();
    if (lastChat.has(k) && t - lastChat.get(k) < 120000) return null;
    lastChat.set(k, t);
    const snippet = text ? String(text).slice(0, 160) : mediaType === "photo" ? "📷 Rasm" : mediaType === "voice" ? "🎤 Ovozli xabar" : mediaType ? "📎 Fayl" : "Yangi xabar";
    return emit("chats", { title: fromName || "Telegram", body: snippet, view: "chats" });
  }

  // ---------- API ----------
  app.get("/api/notifications", requireAuth, (req, res) => {
    const user = req.user;
    const reads = read("uvix:notifyRead", {});
    const r = reads[user.id] || { at: null, ids: [] };
    const since = r.at || "";
    const readIds = new Set(r.ids || []);
    const items = read(KEY_LIST, []).filter(visibleTo(user)).slice(0, 100)
      .map((n) => ({ ...n, read: (since && n.at <= since) || readIds.has(n.id) }));
    const prefs = prefsOf(user);
    res.json({
      items: items.filter((n) => prefs.matrix[n.cat]?.app !== false),
      unread: items.filter((n) => !n.read && prefs.matrix[n.cat]?.app !== false).length,
      prefs,
      cats: Object.fromEntries(allowedCats(user).map((c) => [c, { label: CATS[c].label, critical: !!CATS[c].critical, view: CATS[c].view }])),
      sounds: SOUNDS,
      push: { available: !!webpush, publicKey: webpush ? vapid().publicKey : null, devices: (read(KEY_SUBS, {})[user.id] || []).length },
      quietNow: inQuiet(prefs.quiet),
    });
  });
  app.post("/api/notifications/read", requireAuth, (req, res) => {
    const reads = read("uvix:notifyRead", {});
    const cur = reads[req.user.id] || { at: null, ids: [] };
    if (req.body?.all) reads[req.user.id] = { at: now().toISOString(), ids: [] };
    else {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 200);
      reads[req.user.id] = { at: cur.at, ids: [...new Set([...ids, ...(cur.ids || [])])].slice(0, 400) };
    }
    write("uvix:notifyRead", reads);
    res.json({ ok: true });
  });
  app.put("/api/notifications/prefs", requireAuth, (req, res) => {
    const body = req.body || {};
    const all = read(KEY_PREFS, {});
    const allowed = new Set(allowedCats(req.user));
    const matrix = {};
    for (const [c, m] of Object.entries(body.matrix || {})) {
      if (!allowed.has(c) || !m || typeof m !== "object") continue;
      matrix[c] = { app: m.app !== false, push: !!m.push, sound: SOUNDS.includes(m.sound) ? m.sound : CATS[c].sound };
    }
    const hm = (x, d) => (/^\d{2}:\d{2}$/.test(String(x || "")) ? x : d);
    const quiet = { on: !!body.quiet?.on, from: hm(body.quiet?.from, "22:00"), to: hm(body.quiet?.to, "08:00") };
    all[req.user.id] = { matrix, quiet, volume: typeof body.volume === "number" ? Math.max(0, Math.min(1, body.volume)) : 0.8 };
    write(KEY_PREFS, all);
    res.json({ ok: true, prefs: prefsOf(req.user) });
  });
  app.post("/api/push/subscribe", requireAuth, (req, res) => {
    const s = req.body?.subscription;
    if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) return res.status(400).json({ error: "bad_subscription" });
    const subs = read(KEY_SUBS, {});
    const list = (subs[req.user.id] || []).filter((x) => x.endpoint !== s.endpoint);
    list.unshift({ endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) }, ua: String(req.headers["user-agent"] || "").slice(0, 160), at: now().toISOString() });
    subs[req.user.id] = list.slice(0, 6); // bir xodim — ko'pi bilan 6 qurilma
    write(KEY_SUBS, subs);
    res.json({ ok: true, devices: subs[req.user.id].length });
  });
  app.post("/api/push/unsubscribe", requireAuth, (req, res) => {
    const ep = String(req.body?.endpoint || "");
    const subs = read(KEY_SUBS, {});
    subs[req.user.id] = (subs[req.user.id] || []).filter((x) => (ep ? x.endpoint !== ep : false));
    write(KEY_SUBS, subs);
    res.json({ ok: true, devices: subs[req.user.id].length });
  });
  app.post("/api/notifications/test", requireAuth, async (req, res) => {
    const cats = allowedCats(req.user);
    const cat = cats.includes(req.body?.cat) ? req.body.cat : cats.includes("payments") ? "payments" : cats[0];
    const item = emit(cat, { title: "Sinov bildirishnomasi", body: `${CATS[cat].label} — shunday ko'rinadi`, to: req.user.id });
    res.json({ ok: true, item });
  });

  return { emit, fromTelegram, fromChat, CATS, _splitText: splitText, _inQuiet: inQuiet };
};
module.exports.CATS = CATS;
module.exports.splitText = splitText;
