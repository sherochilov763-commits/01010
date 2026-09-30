// passkeys.js — Face ID / Touch ID / barmoq izi bilan kirish (WebAuthn "passkey")
//
// Qanday ishlaydi:
//  1. Xodim PIN bilan kiradi va "Face ID'ni yoqish"ni bosadi → qurilma yangi kalit juftligini
//     yaratadi. Maxfiy kalit qurilmaning xavfsiz chipida qoladi, serverga faqat OCHIQ kalit keladi.
//  2. Keyingi safar server tasodifiy "challenge" yuboradi, qurilma uni Face ID/barmoq izi
//     tasdiqlangandan keyingina imzolaydi, server imzoni ochiq kalit bilan tekshiradi.
// Biometrik ma'lumot (yuz, barmoq izi) hech qachon qurilmadan chiqmaydi.
const crypto = require("crypto");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const PASSKEYS_KEY = "uvix:passkeys";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_PASSKEYS_PER_EMPLOYEE = 10;

module.exports = function registerPasskeyRoutes(app, { getStmt, upsertStmt, readEmployees, requireAuth, issueToken, rateLimit, secret }) {
  // ---------- saqlash ----------
  function readPasskeys() {
    const row = getStmt.get(PASSKEYS_KEY);
    if (!row) return [];
    try {
      const v = JSON.parse(row.value);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  function writePasskeys(list) {
    upsertStmt.run(PASSKEYS_KEY, JSON.stringify(list));
  }

  // ---------- challenge'lar: imzolangan, serverda saqlanmaydi ----------
  // Oldin xotirada 5 daqiqa turardi: sahifa uzoq ochiq tursa yoki shu orada deploy bo'lsa —
  // "So'rov muddati o'tgan" xatosi chiqardi. Endi challenge o'zi imzolangan ma'lumot
  // (kim uchun, qaysi amal, qachongacha), server qayta ishga tushsa ham tekshiriladi.
  const HMAC_KEY = crypto.createHash("sha256").update(`uvix-passkey:${secret || "dev"}`).digest();
  const used = new Map(); // bir martalik: ishlatilgan challenge'lar (muddati tugaguncha)
  const sign = (s) => crypto.createHmac("sha256", HMAC_KEY).update(s).digest("base64url");
  function makeChallenge(data) {
    const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + CHALLENGE_TTL_MS, n: crypto.randomBytes(12).toString("base64url") })).toString("base64url");
    return `${payload}.${sign(payload)}`; // shu satrning baytlari — WebAuthn challenge
  }
  // challengeB64u — brauzer javobidagi (clientDataJSON) challenge, base64url ko'rinishida
  function readChallenge(challengeB64u, type) {
    let token;
    try { token = Buffer.from(challengeB64u, "base64url").toString("utf8"); } catch { return null; }
    const [payload, mac] = token.split(".");
    if (!payload || !mac) return null;
    const expected = sign(payload);
    if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
    let data;
    try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
    if (data.type !== type || data.exp < Date.now() || used.has(token)) return null;
    return { token, data };
  }
  function consume(token, exp) {
    const now = Date.now();
    for (const [k, v] of used) if (v < now) used.delete(k);
    used.set(token, exp);
  }
  // Javobdagi challenge'ni oldindan o'qib olamiz (tekshiruvdan oldin kim ekanini bilish uchun)
  function challengeOf(response) {
    try { return JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")).challenge; } catch { return null; }
  }
  // Urinishlar limiti faqat MUVAFFAQIYATSIZ tekshiruvlarni sanaydi. Oldin har bir oldindan tayyorlangan
  // so'rov ham sanalardi — ilovaga tez-tez qaytgan xodim bekorga bloklanib qolardi.
  const failures = new Map(); // key -> { n, until }
  const FAIL_MAX = 8, FAIL_WINDOW = 10 * 60 * 1000;
  function isLocked(key) { const f = failures.get(key); return !!f && f.until > Date.now() && f.n >= FAIL_MAX; }
  function noteFailure(key) {
    const now = Date.now();
    const f = failures.get(key);
    if (!f || f.until < now) failures.set(key, { n: 1, until: now + FAIL_WINDOW });
    else f.n += 1;
  }
  const LOCKED = { error: "too_many_attempts", message: "Juda ko'p muvaffaqiyatsiz urinish. 10 daqiqadan so'ng qayta urinib ko'ring yoki PIN bilan kiring." };

  // Faqat shaxsiy telefon/planshet: umumiy kompyuterda Windows Hello xodimni emas, kompyuter egasini taniydi
  const isMobileUA = (ua = "") => /iPhone|iPad|Android/i.test(ua);

  // ---------- domen / origin ----------
  // WEBAUTHN_RP_ID va WEBAUTHN_ORIGIN env orqali qat'iy belgilash mumkin (tavsiya etiladi).
  // Aks holda so'rovning o'zidan olinadi — Origin hostname Host bilan mos kelishi shart.
  function getRp(req) {
    const envRp = process.env.WEBAUTHN_RP_ID;
    const envOrigin = process.env.WEBAUTHN_ORIGIN;
    if (envRp && envOrigin) return { rpID: envRp, origin: envOrigin.split(",").map((s) => s.trim()) };
    const origin = req.get("origin");
    if (!origin) return null;
    let url;
    try { url = new URL(origin); } catch { return null; }
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim().split(":")[0];
    // Vite dev proxy: brauzer localhost:5173 da, backend localhost:4000 da — ikkalasi ham localhost
    if (url.hostname !== host && !(url.hostname === "localhost" && host === "localhost")) return null;
    return { rpID: envRp || url.hostname, origin };
  }

  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const fromB64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));

  function describeDevice(ua = "") {
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows";
    return "Qurilma";
  }

  // ==================== RO'YXATDAN O'TKAZISH (tizimga kirgan xodim) ====================
  app.post("/api/auth/passkey/register/options", requireAuth, async (req, res) => {
    const rp = getRp(req);
    if (!rp) return res.status(400).json({ error: "bad_origin", message: "Domen aniqlanmadi" });
    if (!isMobileUA(req.get("user-agent")) && !/Macintosh/.test(req.get("user-agent") || "")) {
      return res.status(400).json({ error: "mobile_only", message: "Biometrik kirish faqat telefonda yoqiladi" });
    }
    const mine = readPasskeys().filter((p) => p.employeeId === req.user.id);
    if (mine.length >= MAX_PASSKEYS_PER_EMPLOYEE) {
      return res.status(400).json({ error: "too_many", message: `Ko'pi bilan ${MAX_PASSKEYS_PER_EMPLOYEE} ta qurilma` });
    }
    const options = await generateRegistrationOptions({
      challenge: new TextEncoder().encode(makeChallenge({ type: "reg", employeeId: req.user.id })),
      rpName: "UVIX Moliya",
      rpID: rp.rpID,
      userName: req.user.name,
      userDisplayName: req.user.name,
      userID: new TextEncoder().encode(req.user.id),
      attestationType: "none",
      excludeCredentials: mine.map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Face ID / Touch ID / Windows Hello / Android barmoq izi
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    res.json({ options });
  });

  app.post("/api/auth/passkey/register/verify", requireAuth, async (req, res) => {
    const rp = getRp(req);
    const { response } = req.body || {};
    const c = response && readChallenge(challengeOf(response), "reg");
    if (!rp || !c || c.data.employeeId !== req.user.id) {
      return res.status(400).json({ error: "invalid_challenge", message: "So'rov muddati o'tgan, qaytadan urinib ko'ring" });
    }
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeOf(response),
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      return res.status(400).json({ error: "verify_failed", message: "Qurilmani tasdiqlab bo'lmadi, qaytadan urinib ko'ring" });
    }
    consume(c.token, c.data.exp);
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "verify_failed" });
    }
    const { credential, credentialBackedUp } = verification.registrationInfo;
    const list = readPasskeys().filter((p) => p.id !== credential.id);
    const record = {
      id: credential.id,
      publicKey: b64u(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || response.response?.transports || [],
      employeeId: req.user.id,
      device: describeDevice(req.get("user-agent")),
      synced: !!credentialBackedUp,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    list.push(record);
    writePasskeys(list);
    res.json({ ok: true, passkey: publicView(record) });
  });

  // ==================== KIRISH (ochiq) ====================
  app.post("/api/auth/passkey/login/options", async (req, res) => {
    const { employeeId } = req.body || {};
    const rp = getRp(req);
    if (!rp) return res.status(400).json({ error: "bad_origin" });
    const creds = readPasskeys().filter((p) => p.employeeId === employeeId);
    if (!employeeId || creds.length === 0) return res.status(404).json({ error: "no_passkey", message: "Bu xodim uchun Face ID yoqilmagan" });
    const options = await generateAuthenticationOptions({
      challenge: new TextEncoder().encode(makeChallenge({ type: "auth", employeeId })),
      rpID: rp.rpID,
      userVerification: "required",
      allowCredentials: creds.map((p) => ({ id: p.id, transports: p.transports })),
    });
    res.json({ options });
  });

  app.post("/api/auth/passkey/login/verify", async (req, res) => {
    const rp = getRp(req);
    const { response } = req.body || {};
    const c = response?.id && readChallenge(challengeOf(response), "auth");
    if (!rp || !c) return res.status(400).json({ error: "invalid_challenge", message: "So'rov muddati o'tgan, qaytadan urinib ko'ring" });
    const lockKey = `${req.ip || "unknown"}:${c.data.employeeId}`;
    if (isLocked(lockKey)) return res.status(429).json(LOCKED);
    const list = readPasskeys();
    const cred = list.find((p) => p.id === response.id && p.employeeId === c.data.employeeId);
    if (!cred) { noteFailure(lockKey); return res.status(401).json({ error: "unknown_passkey", message: "Bu telefon tanilmadi — PIN bilan kiring" }); }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeOf(response),
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        credential: { id: cred.id, publicKey: fromB64u(cred.publicKey), counter: cred.counter, transports: cred.transports },
      });
    } catch (e) {
      noteFailure(lockKey);
      return res.status(401).json({ error: "verify_failed", message: "Tasdiqlab bo'lmadi" });
    }
    if (!verification.verified) { noteFailure(lockKey); return res.status(401).json({ error: "verify_failed", message: "Tasdiqlab bo'lmadi" }); }
    failures.delete(lockKey);
    consume(c.token, c.data.exp);
    const employee = readEmployees().find((e) => e.id === cred.employeeId);
    if (!employee) return res.status(401).json({ error: "employee_not_found" });
    cred.counter = verification.authenticationInfo.newCounter;
    cred.lastUsedAt = new Date().toISOString();
    writePasskeys(list);
    res.json(issueToken(employee));
  });

  // ==================== BOSHQARISH ====================
  function publicView(p) {
    return { id: p.id, device: p.device, synced: p.synced, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, employeeId: p.employeeId };
  }
  app.get("/api/auth/passkey/list", requireAuth, (req, res) => {
    const all = readPasskeys();
    const visible = req.user.role === "admin" && req.query.all === "1" ? all : all.filter((p) => p.employeeId === req.user.id);
    res.json({ passkeys: visible.map(publicView) });
  });
  app.delete("/api/auth/passkey/:id", requireAuth, (req, res) => {
    const list = readPasskeys();
    const target = list.find((p) => p.id === req.params.id);
    if (!target) return res.status(404).json({ error: "not_found" });
    if (target.employeeId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
    writePasskeys(list.filter((p) => p.id !== req.params.id));
    res.json({ ok: true });
  });

  // Login ekrani uchun: kimda Face ID yoqilgan (faqat ha/yo'q)
  return {
    employeeIdsWithPasskey() {
      return new Set(readPasskeys().map((p) => p.employeeId));
    },
    removeForMissingEmployees(validIds) {
      const list = readPasskeys();
      const kept = list.filter((p) => validIds.has(p.employeeId));
      if (kept.length !== list.length) writePasskeys(kept);
    },
  };
};
