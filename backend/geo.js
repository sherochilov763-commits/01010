// geo.js — vazifa joylari va ish vaqtidagi kuzatuv.
//
// Kuzatuv FAQAT ish vaqtida: xodim «Keldim» bosgandan «Ketdim»gacha. Undan tashqarida kelgan joy saqlanmaydi.
// Manbalar: (1) Telegram «jonli lokatsiya» (telefon qulfda ham keladi), (2) ilova ochiq paytda brauzer joyi.
// Xodim birinchi marta yozma rozilik beradi; rozilik bo'lmasa — joy qabul qilinmaydi.
// Ko'radi: rahbar (hammasi) va katta menejer (o'z yo'nalishi xodimlari). Tarix — 30 kun, keyin o'chadi.
//
// Saqlash (ichki kalitlar, KV orqali yopiq):
//   uvix:geoConfig        — { enabled, retentionDays }
//   uvix:geoConsent       — { [empId]: ISO }
//   uvix:geoLast          — { [empId]: { lat, lng, at, src, acc, speed } }
//   uvix:geo:YYYY-MM-DD   — { [empId]: [[ms, lat, lng, src], ...] }
//   uvix:geoAlerts        — { "empId:date": ISO } — «joy kelmayapti» xabari bir marta
const KEY_CFG = "uvix:geoConfig", KEY_CONSENT = "uvix:geoConsent", KEY_LAST = "uvix:geoLast", KEY_ALERT = "uvix:geoAlerts";
const DAY_KEY = (d) => `uvix:geo:${d}`;
const DEFAULT_CFG = { enabled: false, retentionDays: 30 };

function haversine(a, b) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const okCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// Xarita havolasidan koordinata: Yandex (ll=lng,lat / pt / whatshere), Google (@lat,lng / q= / !3d!4d), oddiy «41.31, 69.24»
function parseMapLink(s) {
  const t = decodeURIComponent(String(s || "")).replace(/\+/g, " ");
  const num = "(-?\\d{1,3}\\.\\d+)";
  const pick = (lat, lng) => { const a = Number(lat), b = Number(lng); return okCoord(a, b) ? { lat: a, lng: b } : null; };
  let m;
  if (/yandex\./i.test(t)) {
    if ((m = new RegExp(`whatshere\\[point\\]=${num},${num}`).exec(t))) return pick(m[2], m[1]);
    if ((m = new RegExp(`[?&]pt=${num},${num}`).exec(t))) return pick(m[2], m[1]);
    if ((m = new RegExp(`[?&]ll=${num},${num}`).exec(t))) return pick(m[2], m[1]);
  }
  if ((m = new RegExp(`!3d${num}!4d${num}`).exec(t))) return pick(m[1], m[2]);
  if ((m = new RegExp(`@${num},${num}`).exec(t))) return pick(m[1], m[2]);
  if ((m = new RegExp(`[?&](?:q|query|ll|destination|center)=${num},\\s*${num}`).exec(t))) return pick(m[1], m[2]);
  if ((m = new RegExp(`^\\s*${num}\\s*[,; ]\\s*${num}\\s*$`).exec(t))) return pick(m[1], m[2]);
  return null;
}

// Xodim holati: ish joyida (vazifa joyidan ≤150 m), sexda, yo'lda (tezlik), to'xtagan (bir joyda N daqiqa)
function statusOf(points, { jobs = [], workshop = null, now = Date.now() } = {}) {
  if (!points?.length) return { s: "none" };
  const last = points[points.length - 1];
  const p = { lat: last[1], lng: last[2] };
  const ago = Math.round((now - last[0]) / 60000);
  const near = jobs.find((j) => j.geo && haversine(p, j.geo) <= 150);
  if (near) return { s: "onsite", jobId: near.id, ago };
  if (workshop && haversine(p, workshop) <= (workshop.radius || 150)) return { s: "workshop", ago };
  // tezlik: oxirgi 10 daqiqadagi birinchi nuqtagacha
  const recent = points.filter((x) => last[0] - x[0] <= 10 * 60000);
  const first = recent[0];
  if (first && first !== last) {
    const km = haversine({ lat: first[1], lng: first[2] }, p) / 1000, h = (last[0] - first[0]) / 3600000;
    const speed = h > 0 ? km / h : 0;
    if (speed >= 5) return { s: "moving", speed: Math.round(speed), ago };
  }
  // bir joyda qancha turgani (≤100 m)
  let since = last[0];
  for (let i = points.length - 1; i >= 0; i--) { if (haversine({ lat: points[i][1], lng: points[i][2] }, p) > 100) break; since = points[i][0]; }
  return { s: "stopped", min: Math.round((last[0] - since) / 60000), ago };
}

module.exports = function registerGeo(app, { getStmt, upsertStmt, deleteStmt = null, readEmployees, requireAuth, isWorker, sendToEmployee = async () => false, onShift, workshop = () => null, now = () => new Date(), localDate, interval = 60000 }) {
  const read = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const cfg = () => ({ ...DEFAULT_CFG, ...read(KEY_CFG, {}) });
  const emps = () => readEmployees().filter((e) => !e.deletedAt);
  const canWatch = (u) => u.role === "admin" || u.role === "manager";
  const watchable = (u) => emps().filter((e) => e.role !== "admin" && (u.role === "admin" || (u.role === "manager" && (!u.line || u.line === "common" || e.line === u.line || e.line === "common"))));

  // Joyni qabul qilish: kuzatuv yoqilgan, rozilik bor, ish vaqtida (Keldim → Ketdim)
  function ingest(empId, { lat, lng, acc = null, src = "app", at = null }) {
    const c = cfg();
    if (!c.enabled) return { ok: false, reason: "disabled" };
    if (!read(KEY_CONSENT, {})[empId]) return { ok: false, reason: "consent" };
    if (!okCoord(lat, lng)) return { ok: false, reason: "coords" };
    if (acc != null && acc > 1000) return { ok: false, reason: "inaccurate" };
    const t = at ? new Date(at) : now();
    if (!onShift(empId, t)) return { ok: false, reason: "off_shift" };
    const date = localDate(t);
    const day = read(DAY_KEY(date), {});
    const pts = day[empId] || (day[empId] = []);
    const ms = t.getTime();
    const prev = pts[pts.length - 1];
    // 20 soniyadan tez-tez va 15 m dan yaqin nuqtalar yozilmaydi (baza shishmasin)
    if (prev && ms - prev[0] < 20000 && haversine({ lat: prev[1], lng: prev[2] }, { lat, lng }) < 15) return { ok: true, skipped: true };
    pts.push([ms, Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6, src === "tg" ? "tg" : "app"]);
    if (pts.length > 3000) pts.splice(0, pts.length - 3000);
    write(DAY_KEY(date), day);
    const last = read(KEY_LAST, {});
    last[empId] = { lat, lng, at: t.toISOString(), src, acc };
    write(KEY_LAST, last);
    return { ok: true };
  }

  // ---- API ----
  app.get("/api/geo/me", requireAuth, (req, res) => {
    const c = cfg();
    res.json({ enabled: c.enabled, consent: read(KEY_CONSENT, {})[req.user.id] || null, onShift: !!onShift(req.user.id, now()), last: read(KEY_LAST, {})[req.user.id] || null });
  });
  app.post("/api/geo/consent", requireAuth, (req, res) => {
    const all = read(KEY_CONSENT, {});
    if (req.body?.agree === false) delete all[req.user.id]; else all[req.user.id] = now().toISOString();
    write(KEY_CONSENT, all);
    res.json({ consent: all[req.user.id] || null });
  });
  app.post("/api/geo/ping", requireAuth, (req, res) => {
    const b = req.body || {};
    res.json(ingest(req.user.id, { lat: Number(b.lat), lng: Number(b.lng), acc: b.acc == null ? null : Number(b.acc), src: "app" }));
  });
  // Joriy joy (eng yaqin ish maslahati uchun) — kuzatuv o'chiq bo'lsa ham saqlanmaydi, faqat javob
  // Sex (ishxona) — davomat sozlamasidagi kenglik/uzunlik; xaritada doim belgilanadi
  app.get("/api/geo/config", requireAuth, (req, res) => res.json({ config: cfg(), canEdit: req.user.role === "admin", workshop: workshop() }));
  app.put("/api/geo/config", requireAuth, (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden", message: "Kuzatuvni rahbar yoqadi" });
    const b = req.body || {};
    const next = { ...cfg(), ...(b.enabled !== undefined ? { enabled: !!b.enabled } : {}), ...(b.retentionDays ? { retentionDays: Math.max(7, Math.min(90, Math.round(Number(b.retentionDays)) || 30)) } : {}) };
    write(KEY_CFG, next);
    res.json({ config: next });
  });
  // Rahbar: hozir kim qayerda (faqat ishda bo'lganlar)
  app.get("/api/geo/live", requireAuth, (req, res) => {
    if (!canWatch(req.user)) return res.status(403).json({ error: "forbidden" });
    const t = now(); const date = localDate(t);
    const day = read(DAY_KEY(date), {}); const last = read(KEY_LAST, {}); const consent = read(KEY_CONSENT, {});
    const jobs = (read("uvix:jobs", []) || []).filter((j) => j.geo && j.date === date && !["cancelled"].includes(j.status));
    const ws = workshop();
    const me = emps().find((e) => e.id === req.user.id) || req.user;
    const list = watchable({ ...req.user, line: me.line }).map((e) => {
      const shift = onShift(e.id, t);
      const pts = day[e.id] || [];
      const st = shift ? statusOf(pts, { jobs: jobs.filter((j) => (j.assigneeIds || []).includes(e.id)), workshop: ws, now: t.getTime() }) : { s: "off" };
      const l = last[e.id];
      return { id: e.id, name: e.name, role: e.role, line: e.line || null, onShift: !!shift, consent: !!consent[e.id], status: st,
        pos: shift && l && String(l.at).slice(0, 10) >= date.slice(0, 10) && pts.length ? { lat: l.lat, lng: l.lng, at: l.at, src: l.src } : null };
    });
    res.json({ enabled: cfg().enabled, staff: list, workshop: ws });
  });
  app.get("/api/geo/trail", requireAuth, (req, res) => {
    if (!canWatch(req.user)) return res.status(403).json({ error: "forbidden" });
    const id = String(req.query.emp || ""), date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : localDate(now());
    const me = emps().find((e) => e.id === req.user.id) || req.user;
    if (!watchable({ ...req.user, line: me.line }).some((e) => e.id === id)) return res.status(404).json({ error: "not_found" });
    res.json({ points: read(DAY_KEY(date), {})[id] || [] });
  });
  // Qisqa havolani ochish (maps.app.goo.gl, yandex.uz/maps/-/...) → koordinata
  app.post("/api/geo/resolve-link", requireAuth, async (req, res) => {
    const url = String(req.body?.url || "").trim().slice(0, 500);
    const direct = parseMapLink(url);
    if (direct) return res.json(direct);
    if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|yandex\.[a-z.]+|maps\.yandex\.[a-z.]+)\//i.test(url)) return res.status(400).json({ error: "bad_link", message: "Yandex yoki Google xarita havolasini qo'ying" });
    try {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 6000);
      const r = await fetch(url, { redirect: "follow", signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 UVIX" } });
      clearTimeout(tm);
      const found = parseMapLink(r.url) || parseMapLink(((await r.text()).match(/https?:\/\/[^"'\s]*(?:@-?\d+\.\d+,-?\d+\.\d+|ll=-?\d+\.\d+(?:%2C|,)-?\d+\.\d+)[^"'\s]*/) || [""])[0]);
      if (found) return res.json(found);
      res.status(422).json({ error: "no_coords", message: "Havoladan joyni aniqlab bo'lmadi — xaritada bosib belgilang" });
    } catch { res.status(502).json({ error: "network", message: "Havolani ochib bo'lmadi — xaritada bosib belgilang" }); }
  });

  // ---- Fon: «joy kelmayapti» ogohlantirishi, eski tarixni o'chirish ----
  async function tick() {
    const c = cfg(); if (!c.enabled) return;
    const t = now(); const date = localDate(t);
    const consent = read(KEY_CONSENT, {}); const last = read(KEY_LAST, {}); const alerts = read(KEY_ALERT, {});
    let changed = false;
    for (const e of emps()) {
      if (!consent[e.id] || !onShift(e.id, t)) continue;
      const l = last[e.id];
      if (!l || String(l.at).slice(0, 10) !== date) continue; // bugun umuman kelmagan — «ulashmagan», ogohlantirish emas
      const gap = (t.getTime() - Date.parse(l.at)) / 60000;
      const k = `${e.id}:${date}`;
      if (gap >= 20 && gap <= 240 && !alerts[k]) {
        alerts[k] = t.toISOString(); changed = true;
        for (const a of emps().filter((x) => x.role === "admin" || (x.role === "manager" && (!x.line || x.line === "common" || x.line === e.line)))) {
          try { await sendToEmployee(a.id, `📍 <b>${e.name}</b>: ish vaqtida joylashuv ${Math.round(gap)} daqiqadan beri kelmayapti (o'chirilgan bo'lishi mumkin).`); } catch { /* */ }
        }
      }
    }
    if (changed) write(KEY_ALERT, Object.fromEntries(Object.entries(alerts).filter(([, v]) => t.getTime() - Date.parse(v) < 3 * 86400000)));
    cleanup(c, t);
  }
  let lastClean = "";
  function cleanup(c, t) {
    const date = localDate(t);
    if (lastClean === date || !deleteStmt) return;
    lastClean = date;
    // Saqlash muddatidan eski kunlar (yana 60 kun orqaga tekshiriladi)
    for (let i = c.retentionDays + 1; i <= c.retentionDays + 60; i++) {
      try { deleteStmt.run(DAY_KEY(localDate(new Date(t.getTime() - i * 86400000)))); } catch { /* */ }
    }
  }
  if (interval > 0) setInterval(() => tick().catch((e) => console.error("Kuzatuv foni:", e.message)), interval).unref?.();

  // Telegram jonli lokatsiya
  function onTelegramLocation(empId, loc) { return ingest(empId, { ...loc, src: "tg" }); }
  // «Keldim» / «Ketdim» — botda eslatma
  async function onCheck(empId, type) {
    const c = cfg(); if (!c.enabled || !read(KEY_CONSENT, {})[empId]) return;
    if (type === "in") {
      await sendToEmployee(empId, "📍 Ish vaqtida joyingizni ulashing: <b>📎 → Joylashuv → «Jonli joylashuvni ulashish» → 8 soat</b>.\n«Ketdim» bosilganda kuzatuv o'zi to'xtaydi — ish vaqtidan tashqari joy olinmaydi.").catch(() => {});
    } else {
      await sendToEmployee(empId, "✅ Kuzatuv to'xtadi. Telegram'da jonli joylashuvni ham to'xtatib qo'yishingiz mumkin.").catch(() => {});
    }
  }
  return { ingest, onTelegramLocation, onCheck, tick, cfg };
};
module.exports.parseMapLink = parseMapLink;
module.exports.statusOf = statusOf;
module.exports.haversine = haversine;
