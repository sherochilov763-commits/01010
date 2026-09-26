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
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS_PER_EMPLOYEE = 10;

module.exports = function registerPasskeyRoutes(app, { getStmt, upsertStmt, readEmployees, requireAuth, issueToken, rateLimit }) {
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

  // ---------- challenge'lar (xotirada, 5 daqiqa) ----------
  const challenges = new Map(); // id -> { challenge, employeeId, type, expiresAt }
  function saveChallenge(data) {
    const now = Date.now();
    for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k);
    const id = crypto.randomBytes(16).toString("hex");
    challenges.set(id, { ...data, expiresAt: now + CHALLENGE_TTL_MS });
    return id;
  }
  function takeChallenge(id, type) {
    const c = challenges.get(id);
    challenges.delete(id); // bir martalik
    if (!c || c.type !== type || c.expiresAt < Date.now()) return null;
    return c;
  }

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
    const mine = readPasskeys().filter((p) => p.employeeId === req.user.id);
    if (mine.length >= MAX_PASSKEYS_PER_EMPLOYEE) {
      return res.status(400).json({ error: "too_many", message: `Ko'pi bilan ${MAX_PASSKEYS_PER_EMPLOYEE} ta qurilma` });
    }
    const options = await generateRegistrationOptions({
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
    const challengeId = saveChallenge({ challenge: options.challenge, employeeId: req.user.id, type: "reg" });
    res.json({ challengeId, options });
  });

  app.post("/api/auth/passkey/register/verify", requireAuth, async (req, res) => {
    const rp = getRp(req);
    const { challengeId, response } = req.body || {};
    const c = challengeId && takeChallenge(challengeId, "reg");
    if (!rp || !c || c.employeeId !== req.user.id || !response) {
      return res.status(400).json({ error: "invalid_challenge", message: "So'rov muddati o'tgan, qaytadan urinib ko'ring" });
    }
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: c.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      return res.status(400).json({ error: "verify_failed", message: e.message });
    }
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
    if (!rateLimit(`${req.ip || "unknown"}:${employeeId}`)) return res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring." });
    const rp = getRp(req);
    if (!rp) return res.status(400).json({ error: "bad_origin" });
    const creds = readPasskeys().filter((p) => p.employeeId === employeeId);
    if (!employeeId || creds.length === 0) return res.status(404).json({ error: "no_passkey", message: "Bu xodim uchun Face ID yoqilmagan" });
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: "required",
      allowCredentials: creds.map((p) => ({ id: p.id, transports: p.transports })),
    });
    const challengeId = saveChallenge({ challenge: options.challenge, employeeId, type: "auth" });
    res.json({ challengeId, options });
  });

  app.post("/api/auth/passkey/login/verify", async (req, res) => {
    const rp = getRp(req);
    const { challengeId, response } = req.body || {};
    const c = challengeId && takeChallenge(challengeId, "auth");
    if (!rp || !c || !response?.id) return res.status(400).json({ error: "invalid_challenge", message: "So'rov muddati o'tgan, qaytadan urinib ko'ring" });
    const list = readPasskeys();
    const cred = list.find((p) => p.id === response.id && p.employeeId === c.employeeId);
    if (!cred) return res.status(401).json({ error: "unknown_passkey", message: "Bu qurilma tanilmadi" });
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: c.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        credential: { id: cred.id, publicKey: fromB64u(cred.publicKey), counter: cred.counter, transports: cred.transports },
      });
    } catch (e) {
      return res.status(401).json({ error: "verify_failed", message: "Tasdiqlab bo'lmadi" });
    }
    if (!verification.verified) return res.status(401).json({ error: "verify_failed", message: "Tasdiqlab bo'lmadi" });
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
