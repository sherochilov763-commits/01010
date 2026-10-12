// qr-login.js — kompyuterga telefon orqali kirish (QR).
//
//  1) Kompyuter: POST /api/auth/qr/start → { id, key, svg, url, expiresAt }. QR ichida faqat id bor (url ?qr=<id>),
//     «key» faqat kompyuterda qoladi — QR'ni rasmga olgan odam token ololmaydi.
//  2) Telefon (UVIX'ga kirgan xodim): GET /api/auth/qr/:id/info → qaysi brauzer/OS so'rayapti.
//     POST /api/auth/qr/:id/approve { response } (Face ID imzosi) yoki { pin } (Face ID yo'q telefonda).
//  3) Kompyuter har 1,5 soniyada: GET /api/auth/qr/:id?key=… → tasdiqlansa — token (bir marta), keyin yozuv o'chadi.
//  Kod 60 soniya amal qiladi, bir martalik. Hammasi xotirada (server qayta ishga tushsa — yangi QR).
const crypto = require("crypto");
const QRCode = require("qrcode");

const TTL = 60 * 1000;

function deviceLabel(ua = "") {
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /YaBrowser/.test(ua) ? "Yandex" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Brauzer";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return [b, os].filter(Boolean).join(" · ");
}

function registerQrLogin(app, { requireAuth, readEmployees, issueToken, pinMatches, passkeyApi, onLogin = () => {}, now = () => Date.now() }) {
  const sessions = new Map(); // id -> { key, exp, ua, ip, status, token, approvedBy }
  const sweep = () => { const t = now(); for (const [id, s] of sessions) if (s.exp < t - 30000) sessions.delete(id); };
  const hits = new Map();
  const limited = (k, max) => { const t = now(), r = hits.get(k); if (!r || t > r.at) { hits.set(k, { n: 1, at: t + 60000 }); return false; } r.n += 1; return r.n > max; };

  app.post("/api/auth/qr/start", async (req, res) => {
    sweep();
    if (limited(`s:${req.ip}`, 20)) return res.status(429).json({ error: "too_many", message: "Juda ko'p urinish — bir daqiqadan so'ng" });
    const id = crypto.randomBytes(12).toString("base64url");
    const key = crypto.randomBytes(18).toString("base64url");
    const origin = (() => { const o = req.get("origin"); if (o && /^https?:\/\//.test(o)) return o; return `${req.protocol}://${req.get("host")}`; })();
    const url = `${origin}/?qr=${id}`;
    const exp = now() + TTL;
    sessions.set(id, { key, exp, ua: deviceLabel(req.get("user-agent")), ip: req.ip, status: "pending" });
    let svg = "";
    try { svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#18181B", light: "#FFFFFF" } }); } catch { /* QR chizilmasa — havola baribir bor */ }
    res.json({ id, key, url, svg, expiresAt: new Date(exp).toISOString() });
  });

  // Kompyuter kutadi
  app.get("/api/auth/qr/:id", (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s || !req.query.key || req.query.key !== s.key) return res.status(404).json({ status: "expired" });
    if (s.status === "approved") {
      sessions.delete(req.params.id);
      return res.json({ status: "approved", ...s.token });
    }
    if (s.status === "rejected") { sessions.delete(req.params.id); return res.json({ status: "rejected" }); }
    if (s.exp < now()) { sessions.delete(req.params.id); return res.json({ status: "expired" }); }
    res.json({ status: s.scannedBy ? "scanned" : "pending", by: s.scannedBy || null });
  });

  // Telefon: kim so'rayapti
  app.get("/api/auth/qr/:id/info", requireAuth, (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s || s.exp < now() || s.status !== "pending") return res.status(404).json({ error: "expired", message: "QR kod eskirgan — kompyuterda yangisini oching" });
    s.scannedBy = req.user.name;
    res.json({ device: s.ua, createdAt: new Date(s.exp - TTL).toISOString(), hasPasskey: !!passkeyApi?.hasPasskey(req.user.id) });
  });

  app.post("/api/auth/qr/:id/approve", requireAuth, async (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s || s.exp < now() || s.status !== "pending") return res.status(404).json({ error: "expired", message: "QR kod eskirgan — kompyuterda yangisini oching" });
    if (limited(`a:${req.user.id}`, 6)) return res.status(429).json({ error: "too_many", message: "Juda ko'p urinish" });
    const emp = readEmployees().find((e) => e.id === req.user.id);
    if (!emp) return res.status(401).json({ error: "no_user" });
    const { response, pin } = req.body || {};
    if (response) {
      try {
        const who = await passkeyApi.verifyAssertion(req, response);
        if (who.id !== emp.id) return res.status(403).json({ error: "other_user", message: "Bu boshqa xodimning Face ID'si" });
      } catch (e) { return res.status(e.status || 401).json(e.body || { error: "verify_failed", message: "Tasdiqlab bo'lmadi" }); }
    } else if (pin) {
      if (passkeyApi?.hasPasskey(emp.id)) return res.status(400).json({ error: "use_passkey", message: "Bu telefonda Face ID bilan tasdiqlang" });
      if (!pinMatches(String(pin), emp.pin)) return res.status(401).json({ error: "bad_pin", message: "PIN noto'g'ri" });
    } else return res.status(400).json({ error: "no_proof", message: "Face ID yoki PIN bilan tasdiqlang" });
    if (emp.mustChangePin) return res.status(400).json({ error: "must_change_pin", message: "Avval telefonda o'z PIN'ingizni qo'ying" });
    s.status = "approved";
    s.token = issueToken(emp);
    s.approvedBy = emp.id;
    onLogin(emp, s.ua);
    res.json({ ok: true, device: s.ua });
  });

  app.post("/api/auth/qr/:id/reject", requireAuth, (req, res) => {
    const s = sessions.get(req.params.id);
    if (s && s.status === "pending") s.status = "rejected";
    res.json({ ok: true });
  });

  return { sessions, deviceLabel };
}

module.exports = { registerQrLogin, deviceLabel };
