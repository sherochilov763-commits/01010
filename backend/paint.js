// paint.js — bo'yoq ombori: qoldiq (litr), avtomatik sarf (buyurtmalardagi m² × sarf normasi),
// haftalik sanash bilan tuzatish, sarf normasini sanashlardan o'zi o'rganishi va
// "qachon tugaydi" prognozi (oldindan Telegram ogohlantirish bilan).
//
// Qanday hisoblanadi:
//   Qoldiq  = oxirgi sanash + undan keyingi kirim (Rasxod → Kraska, litr bilan) − undan keyingi sarf
//   Sarf    = buyurtmalardagi m² × sarf normasi (ml/m²)
//   Norma   = avval qo'lda berilgan taxminiy qiymat; ketma-ket ikki sanash orasidagi haqiqiy sarfdan
//             (oxirgi 4 ta oraliq, m² bo'yicha og'irlik bilan) o'zi aniqlashtiriladi
//   Prognoz = oxirgi 30 kundagi o'rtacha m²/kun × norma → litr/kun → qoldiq necha kunga yetadi
//
// Saqlash (ichki kalitlar, KV orqali o'qib/yozib bo'lmaydi):
//   uvix:paintConfig  — bo'yoqlar ro'yxati, ogohlantirish muddati, sanash kuni
//   uvix:paintCounts  — [{ id, date, at, values: { itemId: litr }, by, note }]
//   uvix:paintSent    — qaysi ogohlantirish yuborilgani (qayta yubormaslik uchun)
// Kirim: uvix:transactions dagi Kraska rasxodlari — tx.paintLines = [{ itemId, liters }]
// Bu faylda fs/Buffer yo'q — demo ham aynan shu kod bilan ishlaydi.

const TZ = "Asia/Tashkent";
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

const DEFAULT_ITEMS = [
  { id: "c", name: "Cyan (C)", color: "#00AEEF", norm: 3, active: true },
  { id: "m", name: "Magenta (M)", color: "#EC008C", norm: 3, active: true },
  { id: "y", name: "Yellow (Y)", color: "#FFD400", norm: 3, active: true },
  { id: "k", name: "Black (K)", color: "#231F20", norm: 2.5, active: true },
  { id: "w", name: "Oq (White)", color: "#E5E7EB", norm: 6, active: true },
  { id: "lak", name: "Lak", color: "#C4B5FD", norm: 6, active: true },
  { id: "primer", name: "Primer", color: "#FDBA74", norm: 4, active: true },
  { id: "clean", name: "Tozalash suyuqligi", color: "#67E8F9", norm: 2, active: true },
];
const DEFAULT_CONFIG = {
  items: DEFAULT_ITEMS,
  leadDays: 30, // shuncha kun qolganda ogohlantiradi
  alerts: true, // adminning shaxsiy Telegram'iga
  countWeekday: 1, // haftalik sanash kuni (dushanba)
  countAt: "10:00", // sanash eslatmasi vaqti
  since: null, // ombor hisobi boshlangan kun
  appUrl: "",
};
const WINDOW_DAYS = 30; // o'rtacha sarf shu kunlar bo'yicha
const MIN_SAMPLE_M2 = 3; // undan kam m² bo'lgan oraliqdan norma o'rganilmaydi
const SAMPLES = 4;

// ---------- vaqt (Toshkent) ----------
const fmtParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(d = new Date()) {
  const p = Object.fromEntries(fmtParts.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hm: `${p.hour}:${p.minute}`, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}
function addDays(date, n) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const dayLabel = (date) => { const [, m, d] = date.split("-").map(Number); return `${d}-${MONTHS[m - 1]}`; };
const r2 = (x) => Math.round(x * 100) / 100;
const fmtL = (x) => `${(Math.round(x * 10) / 10).toLocaleString("ru-RU")} L`;
const num = (v) => { if (v == null || v === "") return NaN; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

module.exports = function registerPaint(app, { getStmt, upsertStmt, requireAuth, requireAdmin, notifyAdmins = async () => false, nowFn = () => new Date() }) {
  const readJson = (key, fb) => { try { const r = getStmt.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const config = () => {
    const c = { ...DEFAULT_CONFIG, ...readJson("uvix:paintConfig", {}) };
    if (!Array.isArray(c.items) || !c.items.length) c.items = DEFAULT_ITEMS;
    return c;
  };
  const counts = () => readJson("uvix:paintCounts", []).filter((c) => c && c.date && c.values).sort((a, b) => (a.date + (a.at || "")).localeCompare(b.date + (b.at || "")));
  const today = () => local(nowFn()).date;
  function ensureSince() {
    const raw = readJson("uvix:paintConfig", null);
    if (raw?.since) return raw.since;
    const since = today();
    upsertStmt.run("uvix:paintConfig", JSON.stringify({ ...(raw || {}), since }));
    return since;
  }

  // Hodisalar: buyurtma m² (sarf) va Kraska rasxodi (kirim)
  function events() {
    const orders = readJson("uvix:orders", []);
    const txs = readJson("uvix:transactions", []);
    const m2 = [];
    for (const o of Array.isArray(orders) ? orders : []) {
      if (!o || o.deletedAt || !o.date) continue;
      const a = Number(o.area) || 0;
      if (a > 0) m2.push({ date: String(o.date).slice(0, 10), at: o.createdAt || null, m2: a });
    }
    const intake = [];
    for (const t of Array.isArray(txs) ? txs : []) {
      if (!t || t.deletedAt || t.type !== "chiqim" || !Array.isArray(t.paintLines)) continue;
      for (const l of t.paintLines) {
        const liters = Number(l?.liters) || 0;
        if (l?.itemId && liters > 0) intake.push({ date: String(t.date).slice(0, 10), at: t.createdAt || null, item: l.itemId, liters, txId: t.id, amount: t.amount || 0 });
      }
    }
    return { m2, intake };
  }

  // Hodisa sanashdan keyin bo'lganmi? Sana bo'yicha; sanash kuni — aniq vaqt bo'yicha
  // (ertalab sanab, keyin kiritilgan bugungi buyurtma ham to'g'ri hisobga tushadi).
  // Vaqt belgisi faqat sanash kuni bilan bir xil sanadagi hodisalar uchun ishlatiladi (keyinroq kiritilgan eski buyurtma
  // o'z sanasiga tegishli bo'lib qoladi).
  const after = (ev, c) => (ev.date !== c.date ? ev.date > c.date : ev.at && c.at ? ev.at > c.at : false);
  const upto = (ev, date) => ev.date <= date;

  function compute(dateArg) {
    const cfg = config();
    const since = cfg.since || ensureSince();
    const date = dateArg || today();
    const all = counts();
    const ev = events();
    const winFrom = addDays(date, -WINDOW_DAYS + 1);
    const winM2 = ev.m2.filter((e) => e.date >= winFrom && e.date <= date).reduce((s, e) => s + e.m2, 0);
    const m2PerDay = winM2 / WINDOW_DAYS;

    const items = cfg.items.map((it) => {
      const cs = all.filter((c) => Number.isFinite(num(c.values[it.id])) && c.date <= date);
      // ---- normani o'rganish: ketma-ket sanashlar orasidagi haqiqiy sarf ----
      const samples = [];
      for (let i = 1; i < cs.length; i++) {
        const a = cs[i - 1], b = cs[i];
        const inRange = (e) => after(e, a) && !after(e, b);
        const m2 = ev.m2.filter(inRange).reduce((s, e) => s + e.m2, 0);
        const inL = ev.intake.filter((e) => e.item === it.id && inRange(e)).reduce((s, e) => s + e.liters, 0);
        const used = num(a.values[it.id]) + inL - num(b.values[it.id]);
        if (m2 >= MIN_SAMPLE_M2 && used >= 0) samples.push({ from: a.date, to: b.date, m2: r2(m2), used: r2(used), rate: r2((used * 1000) / m2) });
      }
      const last = samples.slice(-SAMPLES);
      const sm2 = last.reduce((s, x) => s + x.m2, 0);
      const learned = sm2 > 0 ? r2((last.reduce((s, x) => s + x.used, 0) * 1000) / sm2) : null;
      const rate = learned != null ? learned : Number(it.norm) || 0; // ml/m²

      const st = stockAt(it.id, date, { cfg, since, all: cs, ev, rate });
      const dailyL = (m2PerDay * rate) / 1000;
      const daysLeft = dailyL > 0 ? st.stock / dailyL : null;
      // Hech qachon sanalmagan va kirim bo'lmagan bo'yoq — qoldig'i noma'lum (ogohlantirish yuborilmaydi)
      const known = !!st.count || st.intake > 0;
      const status = !known ? "unknown" : st.stock <= 0.05 ? "empty" : daysLeft != null && daysLeft < cfg.leadDays ? "low" : "ok";
      const need = dailyL * (cfg.leadDays + 30) - st.stock; // ogohlantirish muddati + 1 oyga yetadigan
      return {
        ...it,
        stock: r2(st.stock), lastCount: st.count ? { date: st.count.date, value: num(st.count.values[it.id]) } : null,
        intakeSince: r2(st.intake), usedSince: r2(st.used),
        rate, learned, samples: samples.slice(-6), rateSource: learned != null ? "learned" : "norm",
        dailyL: r2(dailyL), daysLeft: daysLeft == null ? null : Math.max(0, Math.floor(daysLeft)),
        runOut: daysLeft == null ? null : addDays(date, Math.max(0, Math.floor(daysLeft))),
        status, recommend: need > 0 ? Math.ceil(need * 2) / 2 : 0,
      };
    });
    const lastCount = all.length ? all[all.length - 1] : null;
    const countDue = !lastCount || daysBetween(lastCount.date, date) >= 7;
    return { date, since, m2PerDay: r2(m2PerDay), windowDays: WINDOW_DAYS, items, lastCount, countDue, cfg };
  }

  // Berilgan kun oxiridagi qoldiq
  function stockAt(itemId, date, ctx) {
    const { since, ev, rate } = ctx;
    const cs = (ctx.all || counts()).filter((c) => Number.isFinite(num(c.values[itemId])) && c.date <= date);
    const c = cs.length ? cs[cs.length - 1] : null;
    const base = c ? num(c.values[itemId]) : 0;
    const inScope = (e) => upto(e, date) && (c ? after(e, c) : e.date >= since);
    const intake = ev.intake.filter((e) => e.item === itemId && (c ? inScope(e) : upto(e, date))).reduce((s, e) => s + e.liters, 0);
    const m2 = ev.m2.filter(inScope).reduce((s, e) => s + e.m2, 0);
    const used = (m2 * rate) / 1000;
    return { stock: base + intake - used, intake, used, count: c };
  }

  // Oy bo'yicha kunma-kun: m², har bo'yoq sarfi va kirimi; oy boshi/oxiri qoldig'i
  function month(ym) {
    const now = compute();
    const from = `${ym}-01`;
    const lastDay = addDays(addDays(from, 32).slice(0, 8) + "01", -1);
    const to = lastDay < now.date ? lastDay : now.date;
    const ev = events();
    const all = counts();
    const days = [];
    if (from <= to) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const m2 = ev.m2.filter((e) => e.date === d).reduce((s, e) => s + e.m2, 0);
        const used = {}, intake = {};
        for (const it of now.items) {
          used[it.id] = r2((m2 * it.rate) / 1000);
          const inL = ev.intake.filter((e) => e.item === it.id && e.date === d).reduce((s, e) => s + e.liters, 0);
          if (inL) intake[it.id] = r2(inL);
        }
        const cnt = all.filter((c) => c.date === d);
        days.push({ date: d, m2: r2(m2), used, intake, counted: cnt.length > 0 });
      }
    }
    const summary = now.items.map((it) => {
      const ctx = { since: now.since, ev, rate: it.rate, all };
      const start = from <= to ? stockAt(it.id, addDays(from, -1), ctx).stock : 0;
      const end = from <= to ? stockAt(it.id, to, ctx).stock : 0;
      const intake = days.reduce((s, d) => s + (d.intake[it.id] || 0), 0);
      const used = days.reduce((s, d) => s + (d.used[it.id] || 0), 0);
      return { id: it.id, start: r2(start), intake: r2(intake), used: r2(used), correction: r2(end - (start + intake - used)), end: r2(end) };
    });
    const intakes = ev.intake.filter((e) => e.date >= from && e.date <= to).map((e) => ({ date: e.date, item: e.item, liters: e.liters, txId: e.txId, amount: e.amount }));
    return { ym, from, to, days, summary, intakes, counts: all.filter((c) => c.date >= from && c.date <= to), items: now.items.map(({ id, name, color, active, rate }) => ({ id, name, color, active, rate })) };
  }

  // ---------- Telegram ----------
  function lowText(items, cfg) {
    const lines = items.map((it) => {
      const when = it.status === "empty" ? "tugagan!" : `~${it.daysLeft} kunga yetadi (${dayLabel(it.runOut)} atrofida tugaydi)`;
      return `• <b>${it.name}</b>: ${fmtL(Math.max(0, it.stock))} — ${when}${it.recommend ? `\n   Tavsiya: ${fmtL(it.recommend)} buyurtma qiling` : ""}`;
    });
    const link = cfg.appUrl || readJson("uvix:attConfig", {})?.appUrl || "";
    return `🎨 <b>Bo'yoq zahirasi kamaymoqda</b>\n${lines.join("\n")}\n\nHisob: oxirgi ${WINDOW_DAYS} kundagi o'rtacha sarf bo'yicha.${link ? `\n${link}` : ""}`;
  }
  async function tick() {
    const cfg = config();
    if (!cfg.alerts) return;
    const now = local(nowFn());
    if (now.hm < "09:00" || now.hm > "20:00") return;
    const sent = readJson("uvix:paintSent", {});
    sent.low = sent.low || {};
    let changed = false;
    const st = compute(now.date);
    const fresh = [];
    for (const it of st.items) {
      if (!it.active) continue;
      if (it.status === "ok" || it.status === "unknown") { if (sent.low[it.id]) { delete sent.low[it.id]; changed = true; } continue; }
      if (!sent.low[it.id]) { sent.low[it.id] = now.date; changed = true; fresh.push(it); }
    }
    if (fresh.length) await notifyAdmins(lowText(fresh, cfg));
    if (st.countDue && now.weekday === cfg.countWeekday && now.hm >= cfg.countAt && sent.countReminder !== now.date) {
      sent.countReminder = now.date; changed = true;
      await notifyAdmins(`📋 <b>Bo'yoq sanash kuni</b>\nOmbordagi bo'yoqlarni o'lchab, UVIX → Bo'yoq ombori → «Sanash» ga kiriting.\nShu bilan prognoz va sarf normasi aniqlashadi.`);
    }
    if (changed) upsertStmt.run("uvix:paintSent", JSON.stringify(sent));
  }
  const timer = setInterval(() => tick().catch((e) => console.error("Bo'yoq ombori:", e.message)), 10 * 60 * 1000);
  if (timer.unref) timer.unref();

  // ==================== API ====================
  const isWorker = (u) => u?.role === "designer" || u?.role === "printer";
  const staffOnly = (req, res) => { if (isWorker(req.user)) { res.status(403).json({ error: "forbidden" }); return false; } return true; };
  const publicState = (s) => ({ date: s.date, since: s.since, m2PerDay: s.m2PerDay, windowDays: s.windowDays, items: s.items, lastCount: s.lastCount, countDue: s.countDue,
    settings: { leadDays: s.cfg.leadDays, alerts: s.cfg.alerts, countWeekday: s.cfg.countWeekday, countAt: s.cfg.countAt } });

  app.get("/api/paint", requireAuth, (req, res) => {
    if (!staffOnly(req, res)) return;
    res.json(publicState(compute()));
  });
  app.get("/api/paint/month", requireAuth, (req, res) => {
    if (!staffOnly(req, res)) return;
    const ym = /^\d{4}-\d{2}$/.test(String(req.query.ym || "")) ? req.query.ym : today().slice(0, 7);
    res.json(month(ym));
  });
  app.post("/api/paint/count", requireAuth, (req, res) => {
    if (!staffOnly(req, res)) return;
    const { values = {}, note = "" } = req.body || {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || "")) ? req.body.date : today();
    if (date > today()) return res.status(400).json({ error: "future", message: "Kelajakdagi sana bo'lishi mumkin emas" });
    const ids = new Set(config().items.map((i) => i.id));
    const clean = {};
    for (const [k, v] of Object.entries(values)) {
      if (!ids.has(k) || v === "" || v == null) continue;
      const n = num(v);
      if (!Number.isFinite(n) || n < 0 || n > 10000) return res.status(400).json({ error: "bad_value", message: "Litr qiymati noto'g'ri" });
      clean[k] = r2(n);
    }
    if (!Object.keys(clean).length) return res.status(400).json({ error: "empty", message: "Kamida bitta bo'yoq qoldig'ini kiriting" });
    const list = readJson("uvix:paintCounts", []);
    const at = date === today() ? nowFn().toISOString() : new Date(`${date}T23:59:00+05:00`).toISOString();
    list.push({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date, at, values: clean, by: req.user.name || "", note: String(note).slice(0, 200) });
    upsertStmt.run("uvix:paintCounts", JSON.stringify(list.slice(-400)));
    res.json(publicState(compute()));
  });
  app.delete("/api/paint/count/:id", requireAuth, requireAdmin, (req, res) => {
    const list = readJson("uvix:paintCounts", []).filter((c) => c.id !== req.params.id);
    upsertStmt.run("uvix:paintCounts", JSON.stringify(list));
    res.json(publicState(compute()));
  });
  app.get("/api/paint/counts", requireAuth, (req, res) => {
    if (!staffOnly(req, res)) return;
    res.json({ counts: counts().slice(-60).reverse() });
  });
  app.put("/api/paint/config", requireAuth, requireAdmin, (req, res) => {
    const cur = config();
    const b = req.body || {};
    let items = cur.items;
    if (Array.isArray(b.items)) {
      const seen = new Set();
      items = b.items.slice(0, 30).map((it) => {
        let id = String(it.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || `p${Math.random().toString(36).slice(2, 8)}`;
        while (seen.has(id)) id += "x";
        seen.add(id);
        const norm = num(it.norm);
        return { id, name: String(it.name || "").trim().slice(0, 40) || "Bo'yoq", color: /^#[0-9a-f]{6}$/i.test(it.color || "") ? it.color : "#9CA3AF",
          norm: Number.isFinite(norm) && norm >= 0 && norm <= 1000 ? r2(norm) : 0, active: it.active !== false };
      });
      if (!items.length) return res.status(400).json({ error: "empty", message: "Kamida bitta bo'yoq bo'lishi kerak" });
    }
    const leadDays = Math.round(num(b.leadDays));
    const next = {
      ...readJson("uvix:paintConfig", {}), items,
      leadDays: leadDays >= 3 && leadDays <= 120 ? leadDays : cur.leadDays,
      alerts: b.alerts == null ? cur.alerts : !!b.alerts,
      countWeekday: Number.isInteger(b.countWeekday) && b.countWeekday >= 0 && b.countWeekday <= 6 ? b.countWeekday : cur.countWeekday,
      countAt: /^\d{2}:\d{2}$/.test(b.countAt || "") ? b.countAt : cur.countAt,
      since: cur.since || today(),
      appUrl: (() => { const o = req.get?.("origin"); return o && /^https?:\/\//.test(o) ? o : cur.appUrl; })(),
    };
    upsertStmt.run("uvix:paintConfig", JSON.stringify(next));
    // Ogohlantirish muddati o'zgarsa — holat qayta baholanadi
    upsertStmt.run("uvix:paintSent", JSON.stringify({ ...readJson("uvix:paintSent", {}), low: {} }));
    res.json(publicState(compute()));
  });
  app.post("/api/paint/test-alert", requireAuth, requireAdmin, async (req, res) => {
    const s = compute();
    const low = s.items.filter((i) => i.active && (i.status === "low" || i.status === "empty"));
    const text = low.length ? lowText(low, s.cfg) : `🎨 <b>Bo'yoq ombori</b>\nHozircha hamma bo'yoq yetarli (${s.cfg.leadDays} kundan ko'proqqa).\n${s.items.filter((i) => i.active).map((i) => `• ${i.name}: ${fmtL(Math.max(0, i.stock))}${i.daysLeft != null ? ` (~${i.daysLeft} kun)` : ""}`).join("\n")}`;
    const ok = await notifyAdmins(text);
    res.json({ ok, text, message: ok ? "Telegram'ingizga yuborildi" : "Yuborilmadi — botni sozlang va o'z Telegram'ingizni ulang (Davomat → Mening)" });
  });

  return { compute, month, tick };
};
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
