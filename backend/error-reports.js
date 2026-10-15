// error-reports.js — ilova va server xatolari (A3).
//
//  • Brauzer xatolari (oq ekran o'rniga chiqadigan oyna, kutilmagan xatolar) POST /api/client-errors bilan keladi.
//  • Server xatolari (Express, ushlanmagan istisnolar) — record() orqali.
//  • Bir xil xato (barmoq izi: xabar + birinchi stek qatorlari) bitta yozuv bo'lib yig'iladi: soni, oxirgi vaqt.
//    Adminga Telegram xabari — faqat yangi xato bo'lsa yoki 24 soatdan keyin takrorlansa.
//  • Admin: GET /api/system/errors — «Tizim holati»dagi «So'nggi xatolar»; DELETE — tozalash.
// Ichki kalit: uvix:errors. Diqqat: bu faylda fs ishlatilmaydi (demo nusxasi uchun ESM'ga o'giriladi).

const KEY = "uvix:errors";
const MAX = 100;
const RENOTIFY_MS = 24 * 3600 * 1000;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
// Tarmoq uzilishi va brauzer shovqini — dastur xatosi emas
const NOISE = /ResizeObserver loop|Failed to fetch|NetworkError|Load failed|The operation was aborted|AbortError|cancelled|Importing a module script failed|dynamically imported module/i;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function fingerprint(message, stack) {
  // Stekdagi fayl nomlari build'ga qarab o'zgaradi (xesh) — faqat funksiya nomlari olinadi
  const frames = String(stack || "").split("\n").slice(1, 4).map((l) => (l.match(/at ([\w$.<>]+)/) || l.match(/^([\w$.<>]+)@/) || [])[1] || "").join("|");
  return hash(`${String(message || "").replace(/\d+/g, "#").slice(0, 200)}|${frames}`);
}
function deviceOf(ua) {
  ua = String(ua || "");
  if (!ua || !/Mozilla\//.test(ua)) return "API";
  const kind = /Mobile|Android|iPhone|iPad/.test(ua) ? "telefon" : "kompyuter";
  const br = /Edg\//.test(ua) ? "Edge" : /YaBrowser\//.test(ua) ? "Yandex" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "brauzer";
  return `${kind} · ${br}`;
}
const VIEW_UZ = { dashboard: "Dashboard", orders: "Buyurtmalar", crm: "CRM", chats: "Chatlar", customers: "Mijozlar", expense: "Rasxod", operations: "Operatsiyalar", report: "Hisobot", categories: "Kategoriyalar", employees: "Xodimlar", paint: "Bo'yoq ombori", attendance: "Davomat", settings: "Sozlamalar" };

module.exports = function registerErrorReports(app, { getStmt, upsertStmt, requireAuth, requireAdmin, userOf = () => null, notify = async () => false, now = () => Date.now() }) {
  const read = () => { try { const r = getStmt.get(KEY); return r ? JSON.parse(r.value) || [] : []; } catch { return []; } };
  const write = (list) => upsertStmt.run(KEY, JSON.stringify(list.slice(0, MAX)));
  const hits = new Map(); // IP → { n, reset }

  function record({ message, stack, src = "client", view = "", url = "", ua = "", user = null, code = "" }) {
    const msg = String(message || "Noma'lum xato").slice(0, 500);
    if (NOISE.test(msg)) return null;
    const fp = fingerprint(msg, stack);
    const t = now();
    const list = read();
    let e = list.find((x) => x.fp === fp);
    const isNew = !e;
    if (!e) {
      e = { fp, message: msg, stack: String(stack || "").slice(0, 2500), src, count: 0, firstAt: t, codes: [] };
      list.unshift(e);
    } else {
      list.splice(list.indexOf(e), 1);
      list.unshift(e);
    }
    e.count += 1; e.lastAt = t; e.view = view || e.view || ""; e.url = String(url || "").slice(0, 200); e.dev = deviceOf(ua);
    if (user) e.user = user;
    if (code) e.codes = [code, ...(e.codes || []).filter((c) => c !== code)].slice(0, 5);
    const shouldNotify = isNew || !e.notifiedAt || t - e.notifiedAt > RENOTIFY_MS;
    if (shouldNotify) e.notifiedAt = t;
    write(list);
    if (shouldNotify) {
      const where = src === "server" ? "Server" : [VIEW_UZ[view] || view || "Ilova", user, e.dev].filter(Boolean).join(" · ");
      notify(`⚠️ <b>${src === "server" ? "Serverda xato" : "Ilovada xato"}</b>${code ? `\nKod: <code>${esc(code)}</code>` : ""}\nXabar: ${esc(msg.slice(0, 200))}\nQayerda: ${esc(where)}${isNew ? "" : `\nTakrorlandi: ${e.count} marta`}\nBatafsil: Sozlamalar → Ma'lumotlar → So'nggi xatolar`).catch(() => false);
    }
    return e;
  }

  app.post("/api/client-errors", (req, res) => {
    const ip = req.ip || "x";
    const t = now();
    const h = hits.get(ip);
    if (!h || t > h.reset) hits.set(ip, { n: 1, reset: t + 10 * 60000 });
    else if (++h.n > 30) return res.status(429).json({ error: "too_many" });
    const b = req.body || {};
    const u = userOf(req);
    const code = /^[A-Z0-9]{4,8}$/.test(String(b.code || "")) ? b.code : "";
    record({ message: b.message, stack: b.stack, src: "client", view: String(b.view || "").slice(0, 30), url: b.url, ua: req.headers["user-agent"], user: u?.name || null, code });
    res.json({ ok: true, code });
  });

  app.get("/api/system/errors", requireAuth, requireAdmin, (req, res) => {
    const day = now() - 24 * 3600 * 1000;
    const list = read();
    res.json({ errors: list.slice(0, 30), last24h: list.filter((e) => e.lastAt > day).reduce((s, e) => s + e.count, 0) });
  });
  app.delete("/api/system/errors", requireAuth, requireAdmin, (req, res) => { write([]); res.json({ ok: true }); });

  return { record, fingerprint };
};
module.exports.fingerprint = fingerprint;
