// analytics.js — «Hisobot va tahlil»: foyda va zarar, pul oqimi, oyma-oy dinamika, menejerlar reytingi,
// tanlangan davrni oldingi davr (yoki o'tgan yilning shu davri) bilan taqqoslash.
//
// Hisoblash qoidalari:
//   Tushum            = davrdagi buyurtmalar summasi (buyurtma sanasi bo'yicha — hisoblangan usul)
//   Tannarx           = buyurtmalardagi kraska + material summasi + davrdagi «Brak» rasxodlari
//   Qo'shilgan qiymat = Tushum − Tannarx
//   Operatsion rasxod = davrdagi rasxodlar, Material/Kraska/Brak (tannarxda hisoblangan) va «Shaxsiy»dan tashqari
//   Sof foyda         = Qo'shilgan qiymat − Operatsion rasxod; «Shaxsiy» alohida ko'rsatiladi (foydadan olingan pul)
//   Pul oqimi         = davrda haqiqatda kelgan to'lovlar − davrdagi BARCHA rasxodlar
//   Qarzdorlik        = davr oxirigacha ochilgan buyurtmalar bo'yicha, davr oxirigacha to'lanmagan qism
//   Menejer           = buyurtmadagi «Mas'ul menejer», bo'sh bo'lsa — buyurtmani kiritgan xodim
// fs yo'q — demo ham shu kod bilan ishlaydi; PDF yaratish tashqaridan beriladi (makePdf).

const TZ = "Asia/Tashkent";
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const MONTHS_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const COGS_CATS = new Set(["Material", "Kraska", "Brak"]);
const OWNER_CATS = new Set(["Shaxsiy"]);

const fmtParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(d = new Date()) {
  const p = Object.fromEntries(fmtParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
const D = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
function addDays(s, n) { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function addMonths(s, n) { const d = D(s.slice(0, 7) + "-01"); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); }
const monthEnd = (s) => addDays(addMonths(s, 1), -1);
const daysIn = (from, to) => Math.round((D(to) - D(from)) / 86400000) + 1;
const isFullMonth = (from, to) => from.endsWith("-01") && to === monthEnd(from);
const day10 = (x) => String(x || "").slice(0, 10);
const inR = (x, from, to) => { const d = day10(x); return d >= from && d <= to; };
const pct = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? null : 0);
const r0 = (n) => Math.round(n || 0);

function periodLabel(from, to) {
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = to.split("-").map(Number);
  if (isFullMonth(from, to)) return `${MONTHS[m1 - 1][0].toUpperCase()}${MONTHS[m1 - 1].slice(1)} ${y1}`;
  if (from.endsWith("-01-01") && to.endsWith("-12-31") && y1 === y2) return `${y1}-yil`;
  if (y1 === y2 && d1 === 1 && [1, 4, 7, 10].includes(m1) && m2 === m1 + 2 && to === monthEnd(to)) return `${(m1 + 2) / 3}-chorak ${y1}`;
  return `${d1}-${MONTHS[m1 - 1]}${y1 !== y2 ? ` ${y1}` : ""} — ${d2}-${MONTHS[m2 - 1]} ${y2}`;
}
function comparePeriod(from, to, mode) {
  if (mode === "yoy") return { from: `${Number(from.slice(0, 4)) - 1}${from.slice(4)}`, to: `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`.replace(/-02-29$/, "-02-28") };
  // Oy/chorak/yil boshidan boshlangan davr (to'liq yoki «shu kungacha») — oldingi oy/chorak/yilning xuddi shu kunlari bilan
  if (from.endsWith("-01")) {
    const span = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    const m1 = Number(from.slice(5, 7));
    // yil boshidan — o'tgan yilning shu davri; chorak boshidan — oldingi chorak; aks holda shuncha oy oldin
    const months = m1 === 1 && span > 3 ? 12 : [1, 4, 7, 10].includes(m1) && span > 1 && span <= 3 ? 3 : span;
    const f = addMonths(from, -months);
    const tm = addMonths(to, -months), end = monthEnd(tm);
    const t = to === monthEnd(to) ? end : `${tm.slice(0, 8)}${String(Math.min(Number(to.slice(8)), Number(end.slice(8)))).padStart(2, "0")}`;
    return { from: f, to: t };
  }
  const n = daysIn(from, to);
  return { from: addDays(from, -n), to: addDays(from, -1) };
}

function computeCore(data, from, to) {
  const orders = data.orders.filter((o) => inR(o.date, from, to));
  const txs = data.transactions.filter((t) => t.type === "chiqim" && inR(t.date, from, to));
  const revenue = orders.reduce((s, o) => s + (o.agreementUzs || 0), 0);
  const kraska = orders.reduce((s, o) => s + (o.kraskaSum || 0), 0);
  const material = orders.reduce((s, o) => s + (o.materialSum || 0), 0);
  const brak = txs.filter((t) => t.category === "Brak").reduce((s, t) => s + (t.amount || 0), 0);
  const added = revenue - kraska - material - brak;
  const opexMap = {};
  let owner = 0;
  for (const t of txs) {
    if (COGS_CATS.has(t.category)) continue;
    if (OWNER_CATS.has(t.category)) { owner += t.amount || 0; continue; }
    const k = t.category || "Boshqa";
    opexMap[k] = (opexMap[k] || 0) + (t.amount || 0);
  }
  const opex = Object.values(opexMap).reduce((s, v) => s + v, 0);
  const net = added - opex;
  // pul oqimi
  let cashIn = 0, payCount = 0;
  for (const o of data.orders) for (const p of o.payments || []) if (!p.deletedAt && inR(p.date, from, to)) { cashIn += p.amount || 0; payCount++; }
  const cashOut = txs.reduce((s, t) => s + (t.amount || 0), 0);
  // davr oxiridagi qarz
  let debt = 0;
  const debtBy = {};
  for (const o of data.orders) {
    if (day10(o.date) > to) continue;
    const paid = (o.payments || []).filter((p) => !p.deletedAt && day10(p.date) <= to).reduce((s, p) => s + (p.amount || 0), 0);
    const d = Math.max(0, (o.agreementUzs || 0) - paid);
    if (d > 0) { debt += d; const k = String(o.customer || "Noma'lum").trim(); debtBy[k] = (debtBy[k] || 0) + d; }
  }
  const topDebtor = Object.entries(debtBy).sort((a, b) => b[1] - a[1])[0] || null;
  return { from, to, orders: orders.length, revenue, kraska, material, brak, added, opexMap, opex, net, owner, margin: revenue ? (net / revenue) * 100 : 0, cashIn, payCount, cashOut, cashNet: cashIn - cashOut, debt, topDebtor: topDebtor ? { name: topDebtor[0], debt: topDebtor[1] } : null, avgCheck: orders.length ? revenue / orders.length : 0 };
}

function managers(data, from, to) {
  const rows = new Map();
  const get = (name) => { const k = name || "Belgilanmagan"; if (!rows.has(k)) rows.set(k, { name: k, orders: 0, revenue: 0, collected: 0, debt: 0, leads: 0, leadsWon: 0 }); return rows.get(k); };
  for (const o of data.orders) {
    const m = get(String(o.manager || o.createdBy || "").trim());
    const pays = (o.payments || []).filter((p) => !p.deletedAt);
    m.collected += pays.filter((p) => inR(p.date, from, to)).reduce((s, p) => s + (p.amount || 0), 0);
    if (!inR(o.date, from, to)) continue;
    m.orders++; m.revenue += o.agreementUzs || 0;
    m.debt += Math.max(0, (o.agreementUzs || 0) - pays.reduce((s, p) => s + (p.amount || 0), 0));
  }
  for (const l of data.leads) {
    if (!inR(l.createdAt, from, to)) continue;
    const m = get(String(l.createdBy || "").trim());
    m.leads++;
    if (l.orderId || l.stage === "won") m.leadsWon++;
  }
  return [...rows.values()].filter((m) => m.orders || m.collected || m.leads).map((m) => ({
    ...m, avg: m.orders ? m.revenue / m.orders : 0, conversion: m.leads ? (m.leadsWon / m.leads) * 100 : null, debtShare: m.revenue ? (m.debt / m.revenue) * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue || b.collected - a.collected);
}

function monthlySeries(data, endDate, n = 12) {
  const out = [];
  const endMonth = endDate.slice(0, 7) + "-01";
  for (let i = n - 1; i >= 0; i--) {
    const f = addMonths(endMonth, -i), t = monthEnd(f);
    const c = computeCore(data, f, t);
    out.push({ month: f.slice(0, 7), label: MONTHS_SHORT[Number(f.slice(5, 7)) - 1], revenue: r0(c.revenue), costs: r0(c.kraska + c.material + c.brak + c.opex), net: r0(c.net), cashIn: r0(c.cashIn) });
  }
  return out;
}

function insights(cur, prev, mgr) {
  const out = [];
  const fm = (n) => (Math.abs(n) >= 1e9 ? `${(Math.round(n / 1e8) / 10).toLocaleString("ru-RU")} mlrd` : `${(Math.round(n / 100000) / 10).toLocaleString("ru-RU")} mln`);
  if (cur.net > 0 && cur.cashNet < cur.net * 0.8) out.push(`Foyda ${fm(cur.net)}, lekin kassaga ${fm(cur.cashNet)} tushdi — farq asosan qarzdorlikda (${fm(cur.debt)}).${cur.topDebtor ? ` Eng katta qarzdor: ${cur.topDebtor.name}, ${fm(cur.topDebtor.debt)}.` : ""}`);
  const growth = Object.entries(cur.opexMap).map(([k, v]) => ({ k, v, p: prev.opexMap[k] || 0 })).filter((x) => x.v - x.p > 1000000 && x.p > 0).sort((a, b) => (b.v - b.p) - (a.v - a.p))[0];
  if (growth) out.push(`«${growth.k}» rasxodi ${Math.round(pct(growth.v, growth.p))}% oshdi (+${fm(growth.v - growth.p)}).`);
  if (prev.revenue && cur.revenue) {
    const p = pct(cur.revenue, prev.revenue);
    if (Math.abs(p) >= 10) out.push(`Tushum oldingi davrga nisbatan ${p > 0 ? "o'sdi" : "kamaydi"}: ${p > 0 ? "+" : ""}${Math.round(p)}%.`);
  }
  if (cur.margin && prev.margin && Math.abs(cur.margin - prev.margin) >= 3) out.push(`Foyda marjasi ${prev.margin.toFixed(1).replace(".", ",")}% dan ${cur.margin.toFixed(1).replace(".", ",")}% ga ${cur.margin > prev.margin ? "ko'tarildi" : "tushdi"}.`);
  if (cur.material && prev.material && cur.revenue && prev.revenue) {
    const a = (cur.material / cur.revenue) * 100, b = (prev.material / prev.revenue) * 100;
    if (a - b >= 3) out.push(`Material tushumning ${a.toFixed(0)}% ini tashkil qildi (oldin ${b.toFixed(0)}%) — narxlarni tekshirish kerak bo'lishi mumkin.`);
  }
  const top = mgr.filter((m) => m.name !== "Belgilanmagan")[0];
  if (top && top.revenue) out.push(`Eng yaxshi menejer: ${top.name} — ${fm(top.revenue)} aylanma, ${top.orders} ta buyurtma.`);
  return out.slice(0, 4);
}

function report(data, from, to, mode = "prev") {
  const cmp = comparePeriod(from, to, mode);
  const cur = computeCore(data, from, to);
  const prev = computeCore(data, cmp.from, cmp.to);
  const mgrCur = managers(data, from, to);
  const mgrPrev = new Map(managers(data, cmp.from, cmp.to).map((m) => [m.name, m]));
  const mgr = mgrCur.map((m) => ({ ...m, prevRevenue: mgrPrev.get(m.name)?.revenue || 0, change: pct(m.revenue, mgrPrev.get(m.name)?.revenue || 0) }));
  const cats = [...new Set([...Object.keys(cur.opexMap), ...Object.keys(prev.opexMap)])].map((k) => ({ name: k, cur: cur.opexMap[k] || 0, prev: prev.opexMap[k] || 0 })).sort((a, b) => b.cur - a.cur);
  return {
    from, to, label: periodLabel(from, to), mode, cmp: { ...cmp, label: periodLabel(cmp.from, cmp.to) },
    cur, prev, cats, managers: mgr, series: monthlySeries(data, to), insights: insights(cur, prev, mgrCur),
    delta: { revenue: pct(cur.revenue, prev.revenue), added: pct(cur.added, prev.added), net: pct(cur.net, prev.net), debt: cur.debt - prev.debt, kraska: pct(cur.kraska, prev.kraska), material: pct(cur.material, prev.material), brak: pct(cur.brak, prev.brak), opex: pct(cur.opex, prev.opex), cashIn: pct(cur.cashIn, prev.cashIn) },
  };
}

module.exports = function registerAnalytics(app, { getStmt, upsertStmt, requireAuth, requireAdmin, makePdf = null, sendMonthlyPdf = null, nowFn = () => new Date() }) {
  const readJson = (key, fb) => { try { const r = getStmt.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const data = () => ({
    orders: (readJson("uvix:orders", []) || []).filter((o) => o && !o.deletedAt),
    transactions: (readJson("uvix:transactions", []) || []).filter((t) => t && !t.deletedAt),
    leads: (readJson("uvix:leads", []) || []).filter((l) => l && !l.deletedAt),
  });
  const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  function rangeOf(q) {
    const today = local(nowFn()).date;
    let from = valid(q.from) ? q.from : today.slice(0, 7) + "-01";
    let to = valid(q.to) ? q.to : today;
    if (from > to) [from, to] = [to, from];
    if (daysIn(from, to) > 3660) from = addDays(to, -3659);
    return { from, to, mode: q.cmp === "yoy" ? "yoy" : "prev" };
  }
  const company = () => readJson("uvix:custMsgConfig", {})?.companyLine || "UV bosma ustaxonasi";

  app.get("/api/analytics", requireAuth, requireAdmin, (req, res) => {
    const { from, to, mode } = rangeOf(req.query || {});
    res.json(report(data(), from, to, mode));
  });
  app.get("/api/analytics/pdf", requireAuth, requireAdmin, async (req, res) => {
    if (!makePdf) return res.status(501).json({ error: "no_pdf", message: "PDF faqat serverda yaratiladi (demo rejimda mavjud emas)" });
    const { from, to, mode } = rangeOf(req.query || {});
    const r = report(data(), from, to, mode);
    try {
      const buf = await makePdf(r, { company: company(), createdAt: local(nowFn()).date });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="UVIX_hisobot_${from}_${to}.pdf"`);
      res.end(buf);
    } catch (e) { res.status(500).json({ error: "pdf_failed", message: e.message }); }
  });
  app.post("/api/analytics/send-pdf", requireAuth, requireAdmin, async (req, res) => {
    if (!makePdf || !sendMonthlyPdf) return res.status(501).json({ error: "no_pdf", message: "Demo rejimda mavjud emas" });
    const { from, to, mode } = rangeOf(req.body || {});
    const r = report(data(), from, to, mode);
    const buf = await makePdf(r, { company: company(), createdAt: local(nowFn()).date });
    const ok = await sendMonthlyPdf(buf, `UVIX_hisobot_${from}_${to}.pdf`, `📈 Hisobot — ${r.label}`);
    res.json({ ok, message: ok ? "Telegram'ga yuborildi" : "Yuborilmadi — Telegram bot sozlanmagan" });
  });

  // Har oyning 1-kuni 09:00 dan keyin o'tgan oy PDF hisoboti (bir marta)
  async function tick() {
    if (!makePdf || !sendMonthlyPdf) return;
    const now = local(nowFn());
    if (!now.date.endsWith("-01") || now.hm < "09:00") return;
    const prevFrom = addMonths(now.date, -1), prevTo = monthEnd(prevFrom);
    const key = prevFrom.slice(0, 7);
    if (readJson("uvix:monthlyPdfSent", null) === key) return;
    upsertStmt.run("uvix:monthlyPdfSent", JSON.stringify(key));
    const r = report(data(), prevFrom, prevTo, "prev");
    if (!r.cur.orders && !r.cur.cashOut && !r.cur.cashIn) return;
    const buf = await makePdf(r, { company: company(), createdAt: now.date });
    await sendMonthlyPdf(buf, `UVIX_oylik_hisobot_${key}.pdf`, `📈 Oylik hisobot — ${r.label}\nSof foyda: ${r0(r.cur.net).toLocaleString("ru-RU")} so'm`);
  }
  const timer = setInterval(() => tick().catch((e) => console.error("Oylik PDF:", e.message)), 10 * 60 * 1000);
  if (timer.unref) timer.unref();

  return { report: (from, to, mode) => report(data(), from, to, mode), tick };
};
module.exports.report = report;
module.exports.comparePeriod = comparePeriod;
