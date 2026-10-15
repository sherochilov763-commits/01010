// sessions.js — ochiq seanslar (qurilmalar) va ekran qulfi (A2).
//
//  • Har bir token o'z `jti` raqamiga ega. Server birinchi so'rovda seansni qayd etadi: xodim, qurilma,
//    oxirgi faollik. Ro'yxatdan «Chiqarish» — o'sha qurilmadagi token darhol yaroqsiz bo'ladi.
//  • /api/auth/me — sahifa yangilanganda (F5) yoki ilova qayta ochilganda kirishni tiklash uchun.
//  • /api/auth/unlock — qulf ekranida PIN tekshiruvi (shu seans egasining PIN'i).
// Ichki kalit: uvix:sessions — { [jti]: { empId, dev, createdAt, lastSeen, exp, revokedAt? } }
// Diqqat: bu faylda fs ishlatilmaydi (demo nusxasi uchun ESM'ga o'giriladi).

const KEY = "uvix:sessions";
const TOUCH_MS = 60 * 1000; // oxirgi faollik ko'pi bilan daqiqada bir yoziladi
const MAX_SESSIONS = 400;

function deviceLabel(req) {
  const ua = String(req?.headers?.["user-agent"] || "");
  if (!ua || !/Mozilla\//.test(ua)) return "API";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Qurilma";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /YaBrowser\//.test(ua) ? "Yandex" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "brauzer";
  return `${br} · ${os}`;
}

module.exports = function registerSessions(app, { getStmt, upsertStmt, readEmployees, requireAuth, pinMatches, checkRateLimit, clearRateLimit, now = () => Date.now() }) {
  const read = () => { try { const r = getStmt.get(KEY); return r ? JSON.parse(r.value) || {} : {}; } catch { return {}; } };
  const write = (m) => {
    const t = now();
    // Muddati o'tganlar (va 2 kundan eski bekor qilinganlar) tozalanadi
    const entries = Object.entries(m).filter(([, s]) => s && (s.exp ? s.exp * 1000 > t - 2 * 86400000 : t - (s.lastSeen || 0) < 3 * 86400000));
    entries.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
    upsertStmt.run(KEY, JSON.stringify(Object.fromEntries(entries.slice(0, MAX_SESSIONS))));
  };

  /** requireAuth ichidan: seans bekor qilinganmi? Yangi bo'lsa — qayd etiladi. false → 401 */
  function check(payload, req) {
    if (!payload?.jti) return true; // eski token (jti'siz) — muddati tugaguncha amal qiladi
    const m = read();
    const s = m[payload.jti];
    const t = now();
    if (s?.revokedAt) return false;
    if (!s) {
      m[payload.jti] = { empId: payload.sub, dev: deviceLabel(req), createdAt: (payload.iat || Math.floor(t / 1000)) * 1000, lastSeen: t, exp: payload.exp || null };
      write(m);
    } else if (t - (s.lastSeen || 0) > TOUCH_MS) {
      s.lastSeen = t;
      write(m);
    }
    return true;
  }
  function revoke(jti) {
    const m = read();
    if (!m[jti]) m[jti] = { revokedAt: now(), lastSeen: now() };
    else m[jti].revokedAt = now();
    write(m);
  }

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const e = readEmployees().find((x) => x.id === req.user.id);
    if (!e) return res.status(401).json({ error: "invalid_token" });
    res.json({ employee: { id: e.id, name: e.name, role: e.role }, ...(e.mustChangePin ? { mustChangePin: true } : {}), exp: req.auth?.exp || null });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    if (req.auth?.jti) revoke(req.auth.jti);
    res.json({ ok: true });
  });

  // Qulf ekrani: shu seans egasining PIN'i
  app.post("/api/auth/unlock", requireAuth, (req, res) => {
    const limitKey = `unlock:${req.user.id}`;
    if (!checkRateLimit(limitKey)) return res.status(429).json({ error: "too_many_attempts", message: "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring yoki chiqib, qaytadan kiring." });
    const e = readEmployees().find((x) => x.id === req.user.id);
    if (!e || !pinMatches(String(req.body?.pin || ""), e.pin)) return res.status(401).json({ error: "invalid_pin", message: "PIN noto'g'ri" });
    clearRateLimit(limitKey);
    res.json({ ok: true });
  });

  // Ochiq qurilmalar: o'ziniki; admin — ?all=1 bilan hammaniki
  app.get("/api/me/sessions", requireAuth, (req, res) => {
    const m = read();
    const t = now();
    const all = req.query.all === "1" && req.user.role === "admin";
    const names = new Map(readEmployees().map((e) => [e.id, e.name]));
    const list = Object.entries(m)
      .filter(([, s]) => s && !s.revokedAt && s.empId && (!s.exp || s.exp * 1000 > t) && (all || s.empId === req.user.id))
      .map(([jti, s]) => ({ id: jti, empId: s.empId, name: names.get(s.empId) || "—", dev: s.dev, createdAt: s.createdAt, lastSeen: s.lastSeen, current: jti === req.auth?.jti }))
      .sort((a, b) => (b.current - a.current) || (b.lastSeen - a.lastSeen));
    res.json({ sessions: list });
  });
  app.delete("/api/me/sessions/:id", requireAuth, (req, res) => {
    const m = read();
    const s = m[req.params.id];
    if (!s || s.revokedAt) return res.status(404).json({ error: "not_found" });
    if (s.empId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
    revoke(req.params.id);
    res.json({ ok: true });
  });

  return { check, revoke, deviceLabel };
};
