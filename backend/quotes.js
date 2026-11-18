// quotes.js — Smeta / Buyurtma (138–140-eskizlar): bitta oyna, bitta buyurtma.
//
//  • Hisob — quote-calc.js (brauzerdagi frontend/src/lib/quoteCalc.js bilan aynan bir xil): pozitsiyalar
//    Material · Pechat · Ish · Montaj · Dizayn; m² (detallar mm da) · dona · kelishilgan summa; narx so'm yoki $.
//    Summa serverda qayta hisoblanadi — brauzer yuborgan summaga ishonilmaydi.
//  • Smeta lid ichida: lead.quote = { v: 2, no: "S-014", items, total, totalUsd, rate, rateSrc, subcategory, status }.
//    Buyurtmaga aylangan lidda yangi smeta — shu mijoz uchun YANGI bitim (lid).
//  • «Buyurtma yaratish» — smeta BITTA buyurtma bo'ladi (pozitsiyalar uning ichida, order.items).
//    Avans kamida Sozlamalardagi foiz; kam bo'lsa — rahbar o'zi ochadi (force), xodim esa rahbarga so'rov yuboradi
//    (uvix:orderRequests, Telegram'da «Tasdiqlash / Rad etish» tugmalari) — tasdiqlansa buyurtma o'zi ochiladi.
//  • Bo'yoq tannarxi buyurtmaga yozilmaydi (qatlamlar har xil) — hisobotda davrdagi «Kraska» rasxodlari olinadi.
//  • Buyurtma holati (Navbatda / Dizaynda / Pechatda / Tayyor / Topshirildi), vazifa tayinlash, umumiy to'lov.
// Hammasi serverda bajariladi: yarim-yorti saqlanib qolmaydi, raqamlar takrorlanmaydi.
const { PROD_STAGES, PROD_LABEL, setStage, syncLeadStage, allocate } = require("./production");
const QC = require("./quote-calc");

const KEY_CFG = "uvix:sales";
const KEY_SEQ = "uvix:quoteSeq";
const KEY_REQ = "uvix:orderRequests";
const DEFAULT_SALES = { advancePct: 50 };
const PAY_TYPES = ["naqd", "karta", "bank"];
const TZ = "Asia/Tashkent";

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const paidOf = (o) => (o.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0);
const dueOf = (o) => Math.max(0, (o.agreementUzs || 0) - paidOf(o));
class Bad extends Error { constructor(msg, code = 400, extra) { super(msg); this.status = code; this.extra = extra; } }

function localDate(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// Smeta hisobi (xato bo'lsa — 400)
function calcOf(b) {
  const r = QC.computeQuote(b?.items, b?.rate);
  if (r.error) throw new Bad(r.error);
  return r;
}
// To'lov qatorlari: [{ amount, paymentType }]
function payLines(b) {
  return (Array.isArray(b?.payments) ? b.payments : []).slice(0, 10)
    .map((l) => ({ amount: Math.round(num(l?.amount) || 0), paymentType: PAY_TYPES.includes(l?.paymentType) ? l.paymentType : "naqd" }))
    .filter((l) => l.amount > 0);
}

// Bitta to'lov (bir nechta usulda bo'lishi mumkin) → buyurtmalar bo'yicha qatorlar
function spreadPayments(perOrder, orderIds, lines) {
  const queue = lines.map((l) => ({ ...l, left: l.amount }));
  const rows = [];
  let li = 0;
  for (const id of orderIds) {
    let need = perOrder[id] || 0;
    while (need > 0 && li < queue.length) {
      const l = queue[li];
      const x = Math.min(need, l.left);
      if (x > 0) rows.push({ orderId: id, amount: x, paymentType: l.paymentType });
      need -= x; l.left -= x;
      if (l.left <= 0) li++;
    }
  }
  return rows;
}

module.exports = function registerQuotes(app, { getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin, requireStaff, onOrdersWritten = () => {}, onOrderReady = () => {}, now = () => new Date(), getFx = null, onSalesChanged = () => {}, bot = null, emit = () => {} }) {
  const readJson = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const raw = (k) => { const r = getStmt.get(k); return r ? r.value : null; };
  const write = (k, v) => { const s = JSON.stringify(v); upsertStmt.run(k, s); return s; };
  const salesConfig = () => { const c = readJson(KEY_CFG, {}) || {}; const p = Math.round(Number(c.advancePct)); return { advancePct: p >= 0 && p <= 100 ? p : DEFAULT_SALES.advancePct }; };
  const isAdmin = (u) => u?.role === "admin";

  function nextQuoteNo() {
    const s = readJson(KEY_SEQ, { n: 0 }) || { n: 0 };
    const n = (Number(s.n) || 0) + 1;
    write(KEY_SEQ, { n });
    return `S-${String(n).padStart(3, "0")}`;
  }
  function audit(who, what, when) {
    const list = readJson("uvix:audit", []);
    if (!Array.isArray(list)) return;
    list.unshift({ id: rid(), who, what, when });
    write("uvix:audit", list.slice(0, 500));
  }
  function send(res, fn) {
    try { return fn(); } catch (e) {
      if (e instanceof Bad) return res.status(e.status).json({ error: "bad_request", message: e.message, ...(e.extra || {}) });
      console.error("Smeta xatosi:", e);
      return res.status(500).json({ error: "server_error", message: "Serverda xato" });
    }
  }
  // Buyurtmaga aylangan lid uchun yangi bitim (shu mijoz, shu chat)
  function newDealFrom(lead, user, at) {
    return {
      id: rid(), customer: lead.customer, phone: lead.phone || "", source: lead.source || "", estimatedValue: 0,
      manager: lead.manager || user.name, notes: "", stage: "negotiation", orderId: null,
      telegramChatId: lead.telegramChatId, telegramUsername: lead.telegramUsername,
      createdBy: user.name, createdAt: at, stageAt: at, fromLeadId: lead.id,
    };
  }
  // Smeta lidga yoziladi (v2). Bo'sh ro'yxat — smeta o'chiriladi.
  function saveQuoteOn(lead, calc, b, user, at) {
    if (!calc) { delete lead.quote; lead.updatedAt = at; return; }
    lead.quote = {
      v: 2, no: lead.quote?.no || nextQuoteNo(), items: calc.items, total: calc.total, totalUsd: calc.totalUsd,
      rate: calc.usd ? calc.rate : 0, rateSrc: calc.usd ? (b.rateSrc === "manual" ? "manual" : "cbu") : undefined, rateAt: calc.usd ? at : undefined,
      status: "open", subcategory: b.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT",
      createdAt: lead.quote?.createdAt || at, createdBy: lead.quote?.createdBy || user.name, updatedAt: at, updatedBy: user.name,
      ...(lead.quote?.request?.status === "pending" ? { request: lead.quote.request } : {}),
    };
    lead.estimatedValue = calc.total;
    if (!lead.jobTitle) lead.jobTitle = calc.items.map((i) => i.name || QC.KIND_LABEL[i.kind]).filter(Boolean).join(", ").slice(0, 80);
    if (lead.stage === "new") { lead.stage = "negotiation"; lead.stageAt = at; }
    lead.updatedAt = at;
  }
  const { lineOfLead } = require("./lines");
  const leadOk = (req, l) => !req.lineScope || lineOfLead(l) === req.lineScope;
  // Buyurtma raqami prefiksi: rahbar sozlagan (settings.lineProfiles[line].prefix, 2–4 belgi), aks holda UV / ON
  function linePrefix(line) {
    const def = line === "UVONYX" ? "ON" : "UV";
    let st = {};
    try { st = readJson("uvix:settings", {}) || {}; } catch { st = {}; }
    const clean = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const mine = clean(st.lineProfiles?.[line]?.prefix);
    const other = clean(st.lineProfiles?.[line === "UVONYX" ? "UVIXPRINT" : "UVONYX"]?.prefix) || (line === "UVONYX" ? "UV" : "ON");
    if (mine.length < 2) return def;
    return line === "UVONYX" && mine === other ? def : mine;
  }
  const findOrderAny = (orders, id) => (Array.isArray(orders) ? orders.find((o) => o && o.id === id && !o.deletedAt) : null);
  // Yo'nalish: xodim faqat o'z yo'nalishidagi buyurtma bilan ishlaydi (boshqasi «topilmadi»)
  const findOrder = (orders, id, req) => { const o = findOrderAny(orders, id); return o && (!req?.lineScope || (o.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT") === req.lineScope) ? o : null; };
  function syncLeadOf(order, orders, at) {
    if (!order.leadId) return null;
    const leads = readJson("uvix:leads", []);
    const lead = Array.isArray(leads) ? leads.find((l) => l && l.id === order.leadId) : null;
    if (lead && syncLeadStage(lead, orders, at)) write("uvix:leads", leads);
    return lead || null;
  }

  // ---------- Sozlama: avans foizi; dollar kursi (Markaziy bank yoki qo'lda) ----------
  const fxInfo = async () => {
    if (getFx) { try { return await getFx(); } catch (e) { /* pastdagi zaxira */ } }
    const s = readJson("uvix:settings", {}) || {};
    const manual = Number(s.usdRate) > 0 ? Number(s.usdRate) : 12700;
    return { rate: manual, source: "manual", auto: false, manual, cbu: null };
  };
  app.get("/api/sales/config", requireAuth, requireStaff, async (req, res) => res.json({ config: salesConfig(), fx: await fxInfo() }));
  app.put("/api/sales/config", requireAuth, requireAdmin, async (req, res) => {
    const cur = salesConfig();
    const pct = Math.round(num(req.body?.advancePct));
    const next = { advancePct: pct >= 0 && pct <= 100 ? pct : cur.advancePct };
    write(KEY_CFG, next);
    onSalesChanged(req.user?.name, cur, next);
    res.json({ config: next, fx: await fxInfo() });
  });

  // ---------- Smetani saqlash ----------
  // Mavjud lid (CRM, chat). Bo'sh ro'yxat — smeta o'chadi.
  app.put("/api/quotes/:leadId", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    const calc = Array.isArray(b.items) && b.items.length ? calcOf(b) : null;
    const leads = readJson("uvix:leads", []);
    let lead = Array.isArray(leads) ? leads.find((l) => l && l.id === req.params.leadId && !l.deletedAt) : null;
    if (!lead || !leadOk(req, lead)) throw new Bad("Lid topilmadi", 404);
    if (lead.quote?.request?.status === "pending") throw new Bad("Smeta rahbar tasdig'ini kutmoqda — o'zgartirib bo'lmaydi", 409);
    const at = now().toISOString();
    let created = false;
    if (lead.quote?.status === "converted") {
      if (!calc) return res.json({ lead });
      lead = newDealFrom(lead, req.user, at);
      leads.unshift(lead);
      created = true;
    }
    saveQuoteOn(lead, calc, { ...b, subcategory: req.lineScope || b.subcategory }, req.user, at);
    write("uvix:leads", leads);
    audit(req.user.name, created ? `Yangi bitim (smeta ${lead.quote.no}): ${lead.customer}` : calc ? `Smeta ${lead.quote.no} saqlandi: ${lead.customer} (${money(calc.total)})` : `Smeta o'chirildi: ${lead.customer}`, at);
    res.json({ lead, created });
  }));
  // Lidsiz mijoz (ustaxonaga kelgan, telefon qilgan) — smeta yangi lid bo'lib saqlanadi
  app.post("/api/quotes", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    const customer = str(b.customer, 120);
    if (!customer) throw new Bad("Mijoz nomini kiriting");
    const calc = calcOf(b);
    const at = now().toISOString();
    const line = req.lineScope || (b.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
    const lead = { id: rid(), customer, phone: str(b.phone, 40), source: str(b.source, 40) || "Ustaxona", estimatedValue: 0, manager: str(b.manager, 80) || req.user.name, notes: "", stage: "negotiation", orderId: null, createdBy: req.user.name, createdAt: at, stageAt: at, line };
    saveQuoteOn(lead, calc, { ...b, subcategory: line }, req.user, at);
    const leads = readJson("uvix:leads", []);
    write("uvix:leads", [lead, ...(Array.isArray(leads) ? leads : [])]);
    audit(req.user.name, `Smeta ${lead.quote.no} saqlandi: ${customer} (${money(calc.total)})`, at);
    res.json({ lead });
  }));

  // ---------- Buyurtma yaratish (smeta → BITTA buyurtma) ----------
  // user — kim yaratyapti (tasdiqlangan so'rovda — so'rov yuborgan xodim); scope — uning yo'nalishi
  function createOrder(b, user, { scope = null, force = false, approvedBy = null } = {}) {
    const cfg = salesConfig();
    const calc = calcOf(b);
    const total = calc.total;
    const lines = payLines(b);
    const paid = lines.reduce((s, l) => s + l.amount, 0);
    if (paid > total) throw new Bad(`To'lov (${money(paid)}) smeta summasidan (${money(total)}) ko'p`);
    const need = Math.ceil((total * (cfg.advancePct || 0)) / 100);
    if (paid < need && !force) throw new Bad(`Avans kamida ${money(need)} (${cfg.advancePct}%) bo'lishi kerak`, 409, { error: "advance_required", need, pct: cfg.advancePct });

    const leads = readJson("uvix:leads", []);
    const leadList = Array.isArray(leads) ? leads : [];
    const at = now().toISOString();
    let lead = null;
    if (b.leadId) {
      lead = leadList.find((l) => l && l.id === b.leadId && !l.deletedAt);
      if (!lead || (scope && lineOfLead(lead) !== scope)) throw new Bad("Lid topilmadi", 404);
      if (lead.quote?.status === "converted") { lead = newDealFrom(lead, user, at); leadList.unshift(lead); }
    }
    const customer = str(lead?.customer || b.customer, 120);
    if (!customer) throw new Bad("Mijoz nomini kiriting");
    const manager = str(b.manager, 80) || lead?.manager || user.name;
    const subcategory = scope || (b.subcategory === "UVONYX" ? "UVONYX" : b.subcategory === "UVIXPRINT" ? "UVIXPRINT" : lead ? lineOfLead(lead) : "UVIXPRINT");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : localDate(now());
    if (!lead) {
      lead = { id: rid(), customer, phone: str(b.phone, 40), source: str(b.source, 40) || "Ustaxona", estimatedValue: 0, manager, notes: "", stage: "negotiation", orderId: null, createdBy: user.name, createdAt: at, stageAt: at, line: subcategory };
      leadList.unshift(lead);
    }
    const no = lead.quote?.status === "open" && lead.quote.no ? lead.quote.no : nextQuoteNo();
    const ordersRaw = raw("uvix:orders");
    const orders = (() => { try { const v = ordersRaw ? JSON.parse(ordersRaw) : []; return Array.isArray(v) ? v : []; } catch { return []; } })();
    const prefix = `${linePrefix(subcategory)}-${date.replace(/-/g, "").slice(2)}-`; // UV-… / ON-… (prefiks — Sozlamalar → Yo'nalishlar)
    const seq = orders.reduce((m, o) => { const s = String(o?.orderNumber || ""); return s.startsWith(prefix) ? Math.max(m, parseInt(s.slice(prefix.length), 10) || 0) : m; }, 0) + 1;
    const firstMat = calc.items.find((i) => i.kind === "material");
    const title = str(b.title, 100) || lead.jobTitle || calc.items.map((i) => i.name || QC.KIND_LABEL[i.kind]).join(", ").slice(0, 100);
    const order = {
      id: rid(), orderNumber: prefix + String(seq).padStart(3, "0"), date, customer, subcategory, title,
      materialType: firstMat ? firstMat.name || "Material" : "",
      items: calc.items, quoteV: 2,
      // Maydon — bosilgan (pechat) m²: bo'yoq ombori sarfi shundan hisoblanadi
      area: calc.area.pechat, materialArea: calc.area.material,
      manager, exchangeRate: calc.usd ? calc.rate : 0, agreementUsd: calc.totalUsd, agreementUzs: total,
      materialLines: [], kraskaLines: [], kraskaSum: 0, materialSum: 0, payments: [],
      note: str(b.note, 500), // pozitsiyalar — order.items (buyurtma panelida ro'yxat)
      createdBy: user.name, createdAt: at, photos: [],
      leadId: lead.id, quoteNo: no, prodStage: "new", prodAt: at,
      ...(approvedBy ? { approvedBy, approvedAt: at } : {}),
    };
    const batchId = paid > 0 ? rid() : null;
    for (const l of lines) order.payments.push({ id: rid(), amount: l.amount, date, paymentType: l.paymentType, comment: `Smeta ${no} avansi`, createdBy: user.name, createdAt: at, batchId });

    lead.quote = { ...(lead.quote || {}), v: 2, no, items: calc.items, total, totalUsd: calc.totalUsd, rate: calc.usd ? calc.rate : 0, status: "converted", subcategory, convertedAt: at, convertedBy: user.name, orderIds: [order.id], createdAt: lead.quote?.createdAt || at, updatedAt: at, advanceForced: paid < need ? true : undefined, request: lead.quote?.request ? { ...lead.quote.request, status: approvedBy ? "approved" : lead.quote.request.status } : undefined };
    lead.orderIds = [...new Set([...(lead.orderIds || []), order.id])];
    if (!lead.orderId) lead.orderId = order.id;
    lead.estimatedValue = total;
    if (!lead.manager) lead.manager = manager;
    if (!lead.jobTitle) lead.jobTitle = title.slice(0, 80);
    syncLeadStage(lead, [order], at);

    const nextOrders = write("uvix:orders", [order, ...orders]);
    write("uvix:leads", leadList);
    audit(user.name, `Smeta ${no} → buyurtma ${order.orderNumber}: ${customer}, ${money(total)}${paid ? `, avans ${money(paid)}` : ""}${paid < need ? (approvedBy ? ` — avans kam (${approvedBy} tasdiqladi)` : " — avans kam (rahbar)") : ""}`, at);
    try { onOrdersWritten(ordersRaw, nextOrders); } catch (e) { console.error("Buyurtma xabarnomasi:", e.message); }
    return { order, lead };
  }
  app.post("/api/quotes/convert", requireAuth, requireStaff, (req, res) => send(res, () => {
    if (req.can && (!req.can("crm.edit") || !req.can("orders.create"))) throw new Bad("Buyurtma yaratish uchun ruxsat yo'q — rahbar «Rollar va huquqlar»da beradi", 403);
    const b = req.body || {};
    try {
      const r = createOrder(b, req.user, { scope: req.lineScope, force: !!b.force && isAdmin(req.user) });
      res.json({ order: r.order, orders: [r.order], lead: r.lead });
    } catch (e) {
      if (e instanceof Bad && e.extra?.error === "advance_required") e.extra.canForce = isAdmin(req.user);
      throw e;
    }
  }));

  // ---------- Avans kam — rahbar tasdig'i (Telegram tugmalari) ----------
  const reqList = () => { const v = readJson(KEY_REQ, []); return Array.isArray(v) ? v : []; };
  const reqText = (r) => `🧾 <b>Avanssiz buyurtma — tasdiqlaysizmi?</b>\n${esc(r.by.name)} · ${esc(r.customer)}\nSumma: <b>${money(r.total)}</b> · avans: ${r.paid ? money(r.paid) : "yo'q"} (kerak ${money(r.need)})\n${r.lines.map((l) => `• ${esc(l)}`).join("\n")}`;
  const admins = () => readEmployees().filter((e) => e.role === "admin" && e.active !== false);
  async function sendRequest(r) {
    const markup = { reply_markup: { inline_keyboard: [[{ text: "✅ Tasdiqlash", callback_data: `oreq:a:${r.id}` }, { text: "❌ Rad etish", callback_data: `oreq:r:${r.id}` }]] } };
    for (const a of admins()) {
      try { await bot?.sendToEmployee(a.id, reqText(r), markup); } catch { /* bot ulanmagan */ }
      try { emit("approvals", { title: "Avanssiz buyurtma", body: `${r.by.name}: ${r.customer} · ${money(r.total)}`, view: "crm", to: a.id }); } catch { /* ixtiyoriy */ }
    }
  }
  function decide(id, approve, who) {
    const list = reqList();
    const r = list.find((x) => x.id === id);
    if (!r) throw new Bad("So'rov topilmadi", 404);
    if (r.status !== "pending") throw new Bad(r.status === "approved" ? "Allaqachon tasdiqlangan" : r.status === "rejected" ? "Allaqachon rad etilgan" : "So'rov bekor qilingan", 409);
    const at = now().toISOString();
    let result = null;
    const leads = readJson("uvix:leads", []);
    const lead = Array.isArray(leads) ? leads.find((l) => l && l.id === r.leadId) : null;
    if (approve) {
      const by = readEmployees().find((e) => e.id === r.by.id) || { id: r.by.id, name: r.by.name, role: "operator" };
      // So'rovni avval yopamiz: createOrder lidni qayta o'qiydi
      if (lead?.quote?.request) { lead.quote.request = { ...lead.quote.request, status: "approved" }; write("uvix:leads", leads); }
      try { result = createOrder({ ...r.body, leadId: r.leadId }, by, { scope: r.scope, force: true, approvedBy: who.name }); }
      catch (e) { if (lead?.quote?.request) { const l2 = readJson("uvix:leads", []); const x = l2.find((l) => l && l.id === r.leadId); if (x?.quote) { x.quote.request = { ...x.quote.request, status: "pending" }; write("uvix:leads", l2); } } throw e; }
    } else if (lead?.quote) {
      lead.quote.request = { ...lead.quote.request, status: "rejected", decidedBy: who.name, decidedAt: at };
      write("uvix:leads", leads);
    }
    const l2 = reqList(); const x = l2.find((y) => y.id === id);
    Object.assign(x, { status: approve ? "approved" : "rejected", decidedBy: who.name, decidedAt: at, orderId: result?.order?.id || null, orderNumber: result?.order?.orderNumber || null });
    write(KEY_REQ, l2.slice(0, 300));
    audit(who.name, `${approve ? "Tasdiqladi" : "Rad etdi"}: avanssiz buyurtma — ${r.customer} (${money(r.total)}), so'rovchi ${r.by.name}${result ? ` → ${result.order.orderNumber}` : ""}`, at);
    try { bot?.sendToEmployee(r.by.id, approve ? `✅ ${esc(who.name)} tasdiqladi: ${esc(r.customer)} — buyurtma ${esc(result.order.orderNumber)} ochildi.` : `❌ ${esc(who.name)} rad etdi: ${esc(r.customer)} (${money(r.total)}). Avans oling yoki smetani o'zgartiring.`); } catch { /* ixtiyoriy */ }
    try { emit("approvals", { title: approve ? "Buyurtma tasdiqlandi" : "Buyurtma rad etildi", body: `${r.customer} · ${money(r.total)}`, view: "crm", to: r.by.id }); } catch { /* ixtiyoriy */ }
    return { request: x, ...(result || {}) };
  }
  // Xodim: rahbarga so'rov (smeta lidga saqlanadi va so'rov hal bo'lguncha qulflanadi)
  app.post("/api/quotes/request", requireAuth, requireStaff, (req, res) => send(res, () => {
    if (req.can && (!req.can("crm.edit") || !req.can("orders.create"))) throw new Bad("Buyurtma yaratish uchun ruxsat yo'q — rahbar «Rollar va huquqlar»da beradi", 403);
    const b = req.body || {};
    const calc = calcOf(b);
    const lines = payLines(b);
    const paid = lines.reduce((s, l) => s + l.amount, 0);
    if (paid > calc.total) throw new Bad(`To'lov (${money(paid)}) smeta summasidan (${money(calc.total)}) ko'p`);
    const need = Math.ceil((calc.total * (salesConfig().advancePct || 0)) / 100);
    if (paid >= need) throw new Bad("Avans yetarli — tasdiq kerak emas, buyurtmani yarating");
    const leads = readJson("uvix:leads", []);
    const leadList = Array.isArray(leads) ? leads : [];
    const at = now().toISOString();
    let lead = b.leadId ? leadList.find((l) => l && l.id === b.leadId && !l.deletedAt) : null;
    if (b.leadId && (!lead || !leadOk(req, lead))) throw new Bad("Lid topilmadi", 404);
    if (lead?.quote?.request?.status === "pending") throw new Bad("So'rov allaqachon yuborilgan — rahbar javobini kuting", 409);
    const scope = req.lineScope || null;
    const line = scope || (b.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
    if (!lead) {
      const customer = str(b.customer, 120);
      if (!customer) throw new Bad("Mijoz nomini kiriting");
      lead = { id: rid(), customer, phone: str(b.phone, 40), source: str(b.source, 40) || "Ustaxona", estimatedValue: 0, manager: str(b.manager, 80) || req.user.name, notes: "", stage: "negotiation", orderId: null, createdBy: req.user.name, createdAt: at, stageAt: at, line };
      leadList.unshift(lead);
    } else if (lead.quote?.status === "converted") { lead = newDealFrom(lead, req.user, at); leadList.unshift(lead); }
    saveQuoteOn(lead, calc, { ...b, subcategory: line }, req.user, at);
    const r = { id: rid(), at, status: "pending", by: { id: req.user.id, name: req.user.name }, scope, leadId: lead.id, customer: lead.customer, total: calc.total, paid, need,
      lines: calc.items.map(QC.describeItem).slice(0, 12),
      body: { items: b.items, rate: b.rate, rateSrc: b.rateSrc, payments: lines, subcategory: line, manager: str(b.manager, 80), title: str(b.title, 100) } };
    lead.quote.request = { id: r.id, status: "pending", by: req.user.name, at };
    write("uvix:leads", leadList);
    write(KEY_REQ, [r, ...reqList()].slice(0, 300));
    audit(req.user.name, `So'rov: avanssiz buyurtma — ${lead.customer} (${money(calc.total)}), avans ${money(paid)}`, at);
    sendRequest(r).catch(() => {});
    res.json({ request: r, lead });
  }));
  app.get("/api/quotes/requests", requireAuth, requireStaff, (req, res) => {
    const list = reqList().filter((r) => isAdmin(req.user) || r.by.id === req.user.id);
    res.json({ requests: list.slice(0, 100), pending: list.filter((r) => r.status === "pending").length });
  });
  app.post("/api/quotes/requests/:id/:action(approve|reject|cancel)", requireAuth, requireStaff, (req, res) => send(res, () => {
    const act = req.params.action;
    if (act === "cancel") {
      const list = reqList(); const r = list.find((x) => x.id === req.params.id);
      if (!r) throw new Bad("So'rov topilmadi", 404);
      if (r.by.id !== req.user.id && !isAdmin(req.user)) throw new Bad("Faqat o'z so'rovingizni bekor qila olasiz", 403);
      if (r.status !== "pending") throw new Bad("So'rov allaqachon hal qilingan", 409);
      r.status = "cancelled"; r.decidedAt = now().toISOString(); r.decidedBy = req.user.name;
      write(KEY_REQ, list);
      const leads = readJson("uvix:leads", []); const l = Array.isArray(leads) ? leads.find((x) => x && x.id === r.leadId) : null;
      if (l?.quote?.request) { delete l.quote.request; write("uvix:leads", leads); }
      return res.json({ request: r, lead: l || null });
    }
    if (!isAdmin(req.user)) throw new Bad("Faqat rahbar tasdiqlaydi", 403);
    res.json(decide(req.params.id, act === "approve", req.user));
  }));
  // Telegram tugmasi: «oreq:a:<id>» / «oreq:r:<id>» — faqat rahbarning bog'langan akkauntidan
  if (bot?.onMessage) bot.onMessage(async ({ empId, chatId, callback }) => {
    const m = /^oreq:([ar]):([\w-]+)$/.exec(String(callback?.data || ""));
    if (!m) return false;
    const who = readEmployees().find((e) => e.id === empId);
    const answer = (text) => bot.api("answerCallbackQuery", { callback_query_id: callback.id, text, show_alert: false }).catch(() => {});
    if (!who || who.role !== "admin") { await answer("Faqat rahbar tasdiqlaydi"); return true; }
    let note;
    try { const r = decide(m[2], m[1] === "a", who); note = m[1] === "a" ? `✅ Tasdiqlandi — buyurtma ${r.order.orderNumber}` : "❌ Rad etildi"; }
    catch (e) { note = `ℹ️ ${e.message}`; }
    await answer(note.replace(/<[^>]+>/g, ""));
    const msgId = callback.message?.message_id;
    if (msgId) await bot.api("editMessageText", { chat_id: chatId, message_id: msgId, text: `${callback.message.text || ""}\n\n${note}`.slice(0, 4000) }).catch(() => {});
    return true;
  }, true); // ovozli ish jurnalidan oldin — u barcha tugmalarni o'ziga oladi

  // ---------- Umumiy to'lov (bir nechta buyurtmaga) ----------
  app.post("/api/orders/pay-batch", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    const ids = Array.isArray(b.orderIds) ? [...new Set(b.orderIds.map(String))].slice(0, 100) : [];
    if (!ids.length) throw new Bad("Buyurtmalarni tanlang");
    const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 10)
      .map((l) => ({ amount: Math.round(num(l?.amount) || 0), paymentType: PAY_TYPES.includes(l?.paymentType) ? l.paymentType : "naqd" }))
      .filter((l) => l.amount > 0);
    const amount = lines.reduce((s, l) => s + l.amount, 0);
    if (!amount) throw new Bad("To'lov summasini kiriting");
    const ordersRaw = raw("uvix:orders");
    const orders = JSON.parse(ordersRaw || "[]");
    const targets = ids.map((id) => findOrder(orders, id, req));
    if (targets.some((o) => !o)) throw new Bad("Buyurtma topilmadi", 404);
    const sorted = targets.slice().sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.orderNumber).localeCompare(String(y.orderNumber)));
    const due = new Map(sorted.map((o) => [o.id, dueOf(o)]));
    let per;
    if (b.allocation && typeof b.allocation === "object") {
      per = {};
      let s = 0;
      for (const o of sorted) {
        const x = Math.round(num(b.allocation[o.id]) || 0);
        if (x < 0 || x > due.get(o.id)) throw new Bad(`${o.orderNumber}: summa qarzdan (${money(due.get(o.id))}) ko'p`);
        if (x > 0) { per[o.id] = x; s += x; }
      }
      if (s !== amount) throw new Bad(`Taqsimot (${money(s)}) to'lov summasiga (${money(amount)}) teng emas`);
    } else {
      try { per = allocate(amount, sorted.map((o) => ({ id: o.id, due: due.get(o.id) })), b.mode === "prop" ? "prop" : "oldest"); }
      catch { throw new Bad(`To'lov (${money(amount)}) jami qarzdan (${money([...due.values()].reduce((x, y) => x + y, 0))}) ko'p`); }
    }
    const at = now().toISOString();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : localDate(now());
    const batchId = rid();
    const comment = str(b.comment, 120) || "Umumiy to'lov";
    const byId = new Map(sorted.map((o) => [o.id, o]));
    for (const r of spreadPayments(per, sorted.map((o) => o.id), lines)) {
      const o = byId.get(r.orderId);
      o.payments = [...(o.payments || []), { id: rid(), amount: r.amount, date, paymentType: r.paymentType, comment, createdBy: req.user.name, createdAt: at, batchId }];
    }
    const nextOrders = write("uvix:orders", orders);
    const touched = sorted.filter((o) => per[o.id]);
    audit(req.user.name, `Umumiy to'lov ${money(amount)}: ${touched[0]?.customer || ""} — ${touched.map((o) => `${o.orderNumber} (${money(per[o.id])})`).join(", ")}`, at);
    try { onOrdersWritten(ordersRaw, nextOrders); } catch (e) { console.error("To'lov xabarnomasi:", e.message); }
    res.json({ orders: touched, allocation: per, batchId });
  }));

  // ---------- Buyurtma holati ----------
  app.post("/api/orders/:id/stage", requireAuth, requireStaff, (req, res) => send(res, () => {
    const stage = String(req.body?.stage || "");
    if (!PROD_STAGES.includes(stage)) throw new Bad("Holat noto'g'ri");
    const orders = readJson("uvix:orders", []);
    const order = findOrder(orders, req.params.id, req);
    if (!order) throw new Bad("Buyurtma topilmadi", 404);
    const prev = order.prodStage;
    const at = now().toISOString();
    // Qo'lda «Pechatda» qilinsa — oldindan tayinlangan pechatchi vazifasi faollashadi
    if (stage === "printing" && order.print?.assigneeId && (!order.print.status || order.print.status === "unassigned")) {
      order.print = { ...order.print, status: "new", statusAt: at, assignedAt: at };
    }
    if (setStage(order, stage, at) || order.print?.statusAt === at) {
      write("uvix:orders", orders);
      audit(req.user.name, `${order.customer} (${order.orderNumber}): holat — ${PROD_LABEL[stage]}`, at);
      if (stage === "ready" && prev !== "ready" && prev !== "delivered") { try { onOrderReady(order); } catch (e) { console.error("Tayyor xabari:", e.message); } }
    }
    const lead = syncLeadOf(order, orders, at);
    res.json({ order, lead });
  }));

  // ---------- Buyurtmaga dizayner / pechatchi tayinlash ----------
  app.post("/api/orders/:id/task", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    const kind = b.kind === "print" ? "print" : b.kind === "design" ? "design" : null;
    if (!kind) throw new Bad("Vazifa turi noto'g'ri");
    const emp = readEmployees().find((e) => e.id === b.assigneeId);
    if (!emp || emp.role !== (kind === "design" ? "designer" : "printer")) throw new Bad(kind === "design" ? "Dizaynerni tanlang" : "Pechatchini tanlang");
    const orders = readJson("uvix:orders", []);
    const order = findOrder(orders, req.params.id, req);
    if (!order) throw new Bad("Buyurtma topilmadi", 404);
    const at = now().toISOString();
    const prev = order[kind] || {};
    const reassigned = !!prev.assigneeId && prev.assigneeId !== emp.id;
    const keep = prev.status && prev.status !== "unassigned" && !reassigned;
    const extra = { deadline: /^\d{4}-\d{2}-\d{2}$/.test(b.deadline || "") ? b.deadline : prev.deadline || null, notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 500) : prev.notes || "" };
    if (kind === "design") {
      order.design = { format: "", fileType: "", ...prev, ...extra, assigneeId: emp.id, status: keep ? prev.status : "new", statusAt: at, assignedAt: reassigned || !prev.assignedAt ? at : prev.assignedAt };
      if (!order.prodStage || order.prodStage === "new") setStage(order, "design", at);
    } else {
      const active = !order.design || order.design.status === "done" || order.prodStage === "printing" || prev.status === "unassigned";
      order.print = { quality: "1440 dpi", colorProfile: "CMYK", material: order.materialType || "", area: order.area || 0, ...prev, ...extra, assigneeId: emp.id, status: active ? (keep ? prev.status : "new") : undefined, statusAt: at, assignedAt: active ? (reassigned || !prev.assignedAt ? at : prev.assignedAt) : prev.assignedAt || null, autoCreated: undefined };
      if (active && (!order.prodStage || order.prodStage === "new")) setStage(order, "printing", at);
    }
    write("uvix:orders", orders);
    audit(req.user.name, `${kind === "design" ? "Dizayn" : "Pechat"} vazifasi: ${order.customer} (${order.orderNumber}) → ${emp.name}`, at);
    const lead = syncLeadOf(order, orders, at);
    res.json({ order, lead });
  }));

  return { salesConfig };
};
module.exports.spreadPayments = spreadPayments;
