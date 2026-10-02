// debts.js — qarz eslatmalari: har ish kuni belgilangan vaqtda adminning shaxsiy Telegram'iga
// bitta xulosa (jami qarz, eng katta qarzdorlar, kecha to'langan va kecha qo'shilgan qarz).
// Qarz = buyurtma summasi − to'lovlar (o'chirilmaganlari). Har qanday qarz darhol hisobga olinadi.
// Mijoz nomi mijozlar bazasidagi (uvix:customers) nom va birlashtirilgan nomlar bo'yicha guruhlanadi.
//
// Saqlash (ichki kalitlar): uvix:debtConfig — { enabled, at, days }, uvix:debtSent — { date }
// fs/Buffer yo'q — demo ham shu kod bilan ishlaydi.

const TZ = "Asia/Tashkent";
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DEFAULT_CONFIG = { enabled: true, at: "10:00", days: [1, 2, 3, 4, 5, 6], top: 10, appUrl: "" };

const fmtParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(d = new Date()) {
  const p = Object.fromEntries(fmtParts.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hm: `${p.hour}:${p.minute}`, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}
function addDays(date, n) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000));
const dayLabel = (date) => { const [, m, d] = date.split("-").map(Number); return `${d}-${MONTHS[m - 1]}`; };
const money = (n) => `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const custKey = (name) => String(name || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();

module.exports = function registerDebts(app, { getStmt, upsertStmt, requireAuth, requireAdmin, notifyAdmins = async () => false, nowFn = () => new Date() }) {
  const readJson = (key, fb) => { try { const r = getStmt.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const config = () => ({ ...DEFAULT_CONFIG, ...readJson("uvix:debtConfig", {}) });

  function summary(today = local(nowFn()).date) {
    const orders = (readJson("uvix:orders", []) || []).filter((o) => o && !o.deletedAt);
    const profiles = (readJson("uvix:customers", []) || []).filter((p) => p && !p.deletedAt);
    const owner = new Map();
    for (const p of profiles) [p.key, ...(p.aliases || [])].filter(Boolean).forEach((k) => owner.set(k, p));
    // Telefon: mijozlar bazasidan, bo'lmasa — shu nomdagi CRM lididan
    const leadPhone = new Map();
    for (const l of readJson("uvix:leads", []) || []) if (l && !l.deletedAt && l.phone) { const k = custKey(l.customer); if (k && !leadPhone.has(k)) leadPhone.set(k, l.phone); }
    const groups = new Map();
    const yesterday = addDays(today, -1);
    let paidYesterday = 0, paidCount = 0, newDebt = 0;
    for (const o of orders) {
      const pays = (o.payments || []).filter((p) => !p.deletedAt);
      const paid = pays.reduce((s, p) => s + (p.amount || 0), 0);
      pays.filter((p) => p.date === yesterday).forEach((p) => { paidYesterday += p.amount || 0; paidCount++; });
      const debt = Math.max(0, (o.agreementUzs || 0) - paid);
      if (debt <= 0) continue;
      if (String(o.date).slice(0, 10) === yesterday) newDebt += debt;
      const k = custKey(o.customer) || "noma'lum";
      const p = owner.get(k);
      const gk = p ? `p:${p.id}` : k;
      const g = groups.get(gk) || { name: p?.name || String(o.customer || "Noma'lum").trim(), phone: p?.phone || leadPhone.get(k) || [p?.key, ...(p?.aliases || [])].map((x) => leadPhone.get(x)).find(Boolean) || "", debt: 0, orders: 0, oldest: 0 };
      g.debt += debt; g.orders += 1; g.oldest = Math.max(g.oldest, daysBetween(o.date, today));
      groups.set(gk, g);
    }
    const list = [...groups.values()].sort((a, b) => b.debt - a.debt);
    return { today, total: list.reduce((s, g) => s + g.debt, 0), customers: list.length, orders: list.reduce((s, g) => s + g.orders, 0), list, paidYesterday, paidCount, newDebt };
  }

  function digestText(s, cfg = config()) {
    if (!s.total) return `💰 <b>Qarzdorlik — ${dayLabel(s.today)}</b>\nQarz yo'q 🎉${s.paidYesterday ? `\n\n✅ Kecha to'landi: ${money(s.paidYesterday)} (${s.paidCount} ta to'lov)` : ""}`;
    const top = s.list.slice(0, cfg.top || 10).map((g, i) =>
      `${i + 1}. <b>${esc(g.name)}</b> — ${money(g.debt)}\n    ${g.orders} ta buyurtma · eng eskisi ${g.oldest} kun${g.phone ? ` · ${esc(g.phone)}` : ""}`);
    const more = s.list.length > top.length ? `\n… va yana ${s.list.length - top.length} mijoz` : "";
    const link = cfg.appUrl || readJson("uvix:attConfig", {})?.appUrl || "";
    return [
      `💰 <b>Qarzdorlik — ${dayLabel(s.today)}</b>`,
      `Jami: <b>${money(s.total)}</b> · ${s.customers} mijoz · ${s.orders} buyurtma`,
      "",
      top.join("\n") + more,
      "",
      s.paidYesterday ? `✅ Kecha to'landi: ${money(s.paidYesterday)} (${s.paidCount} ta to'lov)` : "Kecha to'lov bo'lmadi",
      s.newDebt ? `🆕 Kecha yangi qarz: ${money(s.newDebt)}` : null,
      link ? `\n${link}` : null,
    ].filter((x) => x != null).join("\n");
  }

  async function tick() {
    const cfg = config();
    if (!cfg.enabled) return;
    const now = local(nowFn());
    if (!cfg.days.includes(now.weekday) || now.hm < cfg.at || now.hm > "20:00") return;
    const sent = readJson("uvix:debtSent", {});
    if (sent.date === now.date) return;
    upsertStmt.run("uvix:debtSent", JSON.stringify({ date: now.date }));
    const s = summary(now.date);
    if (!s.total && !s.paidYesterday) return; // aytadigan gap yo'q — bezovta qilmaymiz
    await notifyAdmins(digestText(s, cfg));
  }
  const timer = setInterval(() => tick().catch((e) => console.error("Qarz eslatmasi:", e.message)), 60 * 1000);
  if (timer.unref) timer.unref();

  app.get("/api/debts/config", requireAuth, requireAdmin, (req, res) => res.json({ config: config() }));
  app.put("/api/debts/config", requireAuth, requireAdmin, (req, res) => {
    const cur = config(), b = req.body || {};
    const next = {
      enabled: b.enabled == null ? cur.enabled : !!b.enabled,
      at: /^\d{2}:\d{2}$/.test(b.at || "") ? b.at : cur.at,
      days: Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : cur.days,
      top: cur.top,
      appUrl: (() => { const o = req.get?.("origin"); return o && /^https?:\/\//.test(o) ? o : cur.appUrl; })(),
    };
    upsertStmt.run("uvix:debtConfig", JSON.stringify(next));
    res.json({ config: next });
  });
  app.post("/api/debts/send", requireAuth, requireAdmin, async (req, res) => {
    const text = digestText(summary());
    const ok = await notifyAdmins(text);
    res.json({ ok, text, message: ok ? "Telegram'ingizga yuborildi" : "Yuborilmadi — botni sozlang va o'z Telegram'ingizni ulang" });
  });

  return { summary, digestText, tick };
};
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
