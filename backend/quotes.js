// quotes.js — Smeta (hisob-kitob) → to'lov → buyurtmalar.
//
//  • Narxlar ro'yxati va avans foizi: uvix:sales = { advancePct, prices: [{ id, material, unit, price, minArea, inkUsd }] }
//  • Smeta lid ichida saqlanadi: lead.quote = { no: "S-014", items, status: "open"|"converted", total, ... }
//    Lid smetasi buyurtmaga aylangan bo'lsa, yangi smeta shu mijoz uchun YANGI bitim (lid) bo'lib ochiladi.
//  • «Buyurtmaga aylantirish» — bitta amalda: har pozitsiya alohida buyurtma (raqamlar ketma-ket, bitta guruh),
//    to'lov ular orasida taqsimlanadi, dizayner/pechatchi vazifalari yoziladi, lid bosqichi yangilanadi.
//  • Buyurtma holati (Navbatda / Dizaynda / Pechatda / Tayyor / Topshirildi) va vazifa tayinlash.
//  • Umumiy to'lov — bitta to'lov mijozning bir nechta buyurtmasiga bo'linadi.
// Hammasi serverda bajariladi: yarim-yorti saqlanib qolmaydi, raqamlar takrorlanmaydi.
const { PROD_STAGES, PROD_LABEL, setStage, syncLeadStage, allocate } = require("./production");

const KEY_CFG = "uvix:sales";
const KEY_SEQ = "uvix:quoteSeq";
const DEFAULT_SALES = { advancePct: 50, prices: [] };
const PAY_TYPES = ["naqd", "karta", "bank"];
const TZ = "Asia/Tashkent";

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
const dec = (n) => String(round2(n)).replace(".", ",");
const round3 = (n) => Math.round(n * 1000) / 1000;
const DIM_UNITS = ["mm", "sm", "m"];
// O'lcham pozitsiya birligida: 2000×1600 mm · 200×160 sm · 2×1,6 m (eski pozitsiyalar — m)
function sizeText(it) {
  if (!(it.w && it.h)) return "";
  const du = DIM_UNITS.includes(it.du) ? it.du : "m";
  const f = (v) => (du === "mm" ? String(Math.round(v * 1000)) : du === "sm" ? String(Math.round(v * 1000) / 10).replace(".", ",") : dec(v));
  return `${f(it.w)}×${f(it.h)} ${du}`;
}
const paidOf = (o) => (o.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0);
const dueOf = (o) => Math.max(0, (o.agreementUzs || 0) - paidOf(o));
class Bad extends Error { constructor(msg, code = 400, extra) { super(msg); this.status = code; this.extra = extra; } }

function localDate(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function cleanPrices(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((p) => ({
    id: str(p?.id, 40) || rid(),
    material: str(p?.material, 60),
    unit: p?.unit === "pcs" ? "pcs" : "m2",
    cur: p?.cur === "usd" ? "usd" : "uzs",
    price: p?.cur === "usd" ? Math.max(0, Math.min(1e6, round2(num(p?.price) || 0))) : Math.max(0, Math.min(1e10, Math.round(num(p?.price) || 0))),
    minArea: Math.max(0, Math.min(100, round2(num(p?.minArea) || 0))),
    inkUsd: Math.max(0, Math.min(1000, round2(num(p?.inkUsd) || 0))),
  })).filter((p) => p.material);
}

// Smeta pozitsiyasi — summa va maydon serverda qayta hisoblanadi (brauzerga ishonilmaydi)
function cleanItem(raw, prices) {
  if (!raw || typeof raw !== "object") throw new Bad("Pozitsiya noto'g'ri");
  const title = str(raw.title, 80);
  const material = str(raw.material, 60);
  const p = prices.find((x) => x.id === raw.priceId) || prices.find((x) => x.material === material) || null;
  // Birlik: m2 — o'lcham bo'yicha, pcs — dona × narx, lump — umumiy (erkin) summa
  const unit = raw.unit === "lump" ? "lump" : raw.unit === "pcs" ? "pcs" : raw.unit === "m2" ? "m2" : p?.unit || "m2";
  const w = unit === "lump" ? 0 : num(raw.w), h = unit === "lump" ? 0 : num(raw.h);
  const qty = unit === "lump" ? 1 : Math.round(num(raw.qty) || 1);
  const label = title || material || "Pozitsiya";
  if (!(qty >= 1 && qty <= 100000)) throw new Bad(`«${label}»: dona soni noto'g'ri`);
  const hasDims = w > 0 && h > 0;
  if (unit === "m2" && !(hasDims && w <= 100 && h <= 100)) throw new Bad(`«${label}»: eni va bo'yini kiriting`);
  if (hasDims && (w > 100 || h > 100)) throw new Bad(`«${label}»: o'lcham juda katta`);
  // Narx dollarda kiritilgan bo'lsa: priceUsd × kurs (kurs pozitsiyada saqlanadi — keyin o'zgarmaydi)
  const isUsd = raw.cur === "usd";
  let price, priceUsd = 0, rate = 0;
  if (isUsd) {
    priceUsd = round2(num(raw.priceUsd));
    rate = round2(num(raw.rate));
    if (!(priceUsd > 0 && priceUsd <= 1e6)) throw new Bad(`«${label}»: dollar narxi noto'g'ri`);
    if (!(rate >= 1000 && rate <= 1e6)) throw new Bad(`«${label}»: dollar kursi noto'g'ri`);
    price = Math.round(priceUsd * rate);
  } else {
    price = Math.round(num(raw.price));
  }
  if (!(price >= 0 && price <= 1e10)) throw new Bad(`«${label}»: narx noto'g'ri`);
  const ownMin = raw.minArea === undefined || raw.minArea === null || raw.minArea === "" ? NaN : num(raw.minArea);
  const minArea = Math.max(0, Math.min(100, round2(Number.isFinite(ownMin) ? ownMin : (p?.minArea || 0))));
  const rawArea = hasDims ? round2(w * h * qty) : 0;
  const area = unit === "m2" ? Math.max(rawArea, minArea) : rawArea;
  const units = unit === "m2" ? area : unit === "lump" ? 1 : qty;
  const calcTotal = isUsd ? Math.round(units * priceUsd * rate) : Math.round(units * price);
  // Summani qo'lda o'zgartirish (yaxlitlash, chegirma) — hisoblangan summa ham saqlanadi
  const manual = !!raw.manualTotal && unit !== "lump" && num(raw.total) > 0;
  const total = manual ? Math.round(num(raw.total)) : calcTotal;
  if (manual && !(total <= 1e10)) throw new Bad(`«${label}»: summa noto'g'ri`);
  if (!(total > 0)) throw new Bad(`«${label}»: summa 0 bo'lmasligi kerak`);
  const out = {
    id: str(raw.id, 40) || rid(), title, material, priceId: p?.id || null, unit,
    w: hasDims ? round3(w) : 0, h: hasDims ? round3(h) : 0, du: DIM_UNITS.includes(raw.du) ? raw.du : "m", qty, price, minArea, rawArea, area, total,
    inkUsd: p?.inkUsd || 0, note: str(raw.note, 200),
  };
  if (isUsd) Object.assign(out, { cur: "usd", priceUsd, rate, totalUsd: manual ? round2(total / rate) : round2(units * priceUsd) });
  if (manual) Object.assign(out, { manualTotal: true, calcTotal });
  return out;
}
function describeItem(it) {
  const size = sizeText(it);
  const kurs = it.cur === "usd" ? `kurs ${dec(it.rate).replace(/\B(?=(\d{3})+(?!\d))/, " ")}` : "";
  if (it.unit === "lump") return [it.material, it.cur === "usd" ? `${dec(it.priceUsd)} $ (${kurs})` : ""].filter(Boolean).join(" · ");
  const usd = it.cur === "usd" ? `${dec(it.priceUsd)} $/${it.unit === "pcs" ? "dona" : "m²"} (${kurs})` : "";
  return [it.material, size, it.qty > 1 ? `${it.qty} dona` : "", it.area ? `${dec(it.area)} m²` : "", usd, it.manualTotal ? "summa qo'lda" : ""].filter(Boolean).join(" · ");
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

module.exports = function registerQuotes(app, { getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin, requireStaff, onOrdersWritten = () => {}, onOrderReady = () => {}, now = () => new Date(), getFx = null, onSalesChanged = () => {} }) {
  const readJson = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const raw = (k) => { const r = getStmt.get(k); return r ? r.value : null; };
  const write = (k, v) => { const s = JSON.stringify(v); upsertStmt.run(k, s); return s; };
  const salesConfig = () => { const c = readJson(KEY_CFG, {}) || {}; return { ...DEFAULT_SALES, ...c, prices: cleanPrices(c.prices) }; };
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
  function saveQuoteOn(lead, items, b, user, at) {
    const total = items.reduce((s, i) => s + i.total, 0);
    if (!items.length) { delete lead.quote; lead.updatedAt = at; return; }
    lead.quote = {
      no: lead.quote?.no || nextQuoteNo(), items, total, status: "open",
      subcategory: b.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT",
      createdAt: lead.quote?.createdAt || at, createdBy: lead.quote?.createdBy || user.name, updatedAt: at,
    };
    lead.estimatedValue = total;
    if (!lead.jobTitle) lead.jobTitle = items.map((i) => i.title || i.material).filter(Boolean).join(", ").slice(0, 80);
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

  // ---------- Narxlar ro'yxati ----------
  // Kurs (fx) — kalkulyatorda dollar narxini so'mga o'girish uchun
  const fxInfo = async () => {
    if (getFx) { try { return await getFx(); } catch (e) { /* pastdagi zaxira */ } }
    const s = readJson("uvix:settings", {}) || {};
    const manual = Number(s.usdRate) > 0 ? Number(s.usdRate) : 12700;
    return { rate: manual, source: "manual", auto: false, manual, cbu: null };
  };
  app.get("/api/sales/config", requireAuth, requireStaff, async (req, res) => res.json({ config: salesConfig(), fx: await fxInfo() }));
  app.put("/api/sales/config", requireAuth, requireAdmin, async (req, res) => {
    const b = req.body || {};
    const cur = salesConfig();
    const pct = Math.round(num(b.advancePct));
    const next = { advancePct: pct >= 0 && pct <= 100 ? pct : cur.advancePct, prices: Array.isArray(b.prices) ? cleanPrices(b.prices) : cur.prices };
    write(KEY_CFG, next);
    onSalesChanged(req.user?.name, cur, next);
    res.json({ config: next, fx: await fxInfo() });
  });

  // ---------- Smetani saqlash ----------
  // Mavjud lid (chat yoki CRM)
  app.put("/api/quotes/:leadId", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    const { prices } = salesConfig();
    if (!Array.isArray(b.items) || b.items.length > 30) throw new Bad("Pozitsiyalar ro'yxati noto'g'ri");
    const items = b.items.map((i) => cleanItem(i, prices));
    const leads = readJson("uvix:leads", []);
    let lead = Array.isArray(leads) ? leads.find((l) => l && l.id === req.params.leadId && !l.deletedAt) : null;
    if (!lead || !leadOk(req, lead)) throw new Bad("Lid topilmadi", 404);
    const at = now().toISOString();
    let created = false;
    if (lead.quote?.status === "converted") {
      if (!items.length) return res.json({ lead });
      lead = newDealFrom(lead, req.user, at);
      leads.unshift(lead);
      created = true;
    }
    saveQuoteOn(lead, items, b, req.user, at);
    write("uvix:leads", leads);
    if (created) audit(req.user.name, `Yangi bitim (smeta ${lead.quote.no}): ${lead.customer}`, at);
    res.json({ lead, created });
  }));
  // Ustaxonaga kelgan / telefon qilgan mijoz — smeta yangi lid sifatida saqlanadi
  app.post("/api/quotes", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    const { prices } = salesConfig();
    const customer = str(b.customer, 120);
    if (!customer) throw new Bad("Mijoz nomini kiriting");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) throw new Bad("Smetaga kamida bitta pozitsiya qo'shing");
    const items = b.items.map((i) => cleanItem(i, prices));
    const at = now().toISOString();
    const lead = { id: rid(), customer, phone: str(b.phone, 40), source: str(b.source, 40) || "Ustaxona", estimatedValue: 0, manager: str(b.manager, 80) || req.user.name, notes: str(b.notes, 500), stage: "negotiation", orderId: null, createdBy: req.user.name, createdAt: at, stageAt: at, line: req.lineScope || (b.line === "UVONYX" ? "UVONYX" : "UVIXPRINT") };
    saveQuoteOn(lead, items, b, req.user, at);
    const leads = readJson("uvix:leads", []);
    write("uvix:leads", [lead, ...(Array.isArray(leads) ? leads : [])]);
    audit(req.user.name, `Smeta ${lead.quote.no} saqlandi: ${customer} (${money(lead.quote.total)})`, at);
    res.json({ lead });
  }));

  // ---------- Buyurtmaga aylantirish ----------
  app.post("/api/quotes/convert", requireAuth, requireStaff, (req, res) => send(res, () => {
    const b = req.body || {};
    if (req.can && (!req.can("crm.edit") || !req.can("orders.create"))) { const e = new Bad("Buyurtma yaratish uchun ruxsat yo'q — rahbar «Rollar va huquqlar»da beradi"); e.status = 403; throw e; }
    const cfg = salesConfig();
    if (!Array.isArray(b.items) || !b.items.length) throw new Bad("Smetaga kamida bitta pozitsiya qo'shing");
    if (b.items.length > 30) throw new Bad("Bitta smetada ko'pi bilan 30 ta pozitsiya");
    const items = b.items.map((i) => cleanItem(i, cfg.prices));
    const total = items.reduce((s, i) => s + i.total, 0);

    const lines = (Array.isArray(b.payments) ? b.payments : []).slice(0, 10)
      .map((l) => ({ amount: Math.round(num(l?.amount) || 0), paymentType: PAY_TYPES.includes(l?.paymentType) ? l.paymentType : "naqd" }))
      .filter((l) => l.amount > 0);
    const paid = lines.reduce((s, l) => s + l.amount, 0);
    if (paid > total) throw new Bad(`To'lov (${money(paid)}) smeta summasidan (${money(total)}) ko'p`);
    const need = Math.ceil((total * (cfg.advancePct || 0)) / 100);
    const force = !!b.force && isAdmin(req.user);
    if (paid < need && !force) throw new Bad(`Avans kamida ${money(need)} (${cfg.advancePct}%) bo'lishi kerak`, 409, { error: "advance_required", need });

    const leads = readJson("uvix:leads", []);
    const leadList = Array.isArray(leads) ? leads : [];
    const at = now().toISOString();
    let lead = null;
    if (b.leadId) {
      lead = leadList.find((l) => l && l.id === b.leadId && !l.deletedAt);
      if (!lead || !leadOk(req, lead)) throw new Bad("Lid topilmadi", 404);
      if (lead.quote?.status === "converted") { lead = newDealFrom(lead, req.user, at); leadList.unshift(lead); }
    }
    const customer = str(lead?.customer || b.customer, 120);
    if (!customer) throw new Bad("Mijoz nomini kiriting");
    const manager = str(b.manager, 80) || lead?.manager || req.user.name;
    const subcategory = req.lineScope || (b.subcategory === "UVONYX" ? "UVONYX" : b.subcategory === "UVIXPRINT" ? "UVIXPRINT" : lead ? lineOfLead(lead) : "UVIXPRINT");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : localDate(now());

    // Vazifalarni oldindan tekshiramiz (xato bo'lsa hech narsa yozilmaydi)
    const emps = new Map(readEmployees().map((e) => [e.id, e]));
    const taskOf = (it) => {
      const t = (b.tasks && b.tasks[it.id]) || {};
      const mode = ["design", "print", "none"].includes(t.mode) ? t.mode : "none";
      const label = it.title || it.material;
      if (mode === "design") {
        const d = emps.get(t.assigneeId);
        if (!d || d.role !== "designer") throw new Bad(`«${label}»: dizaynerni tanlang`);
      }
      const printer = t.printerId ? emps.get(t.printerId) : null;
      if (t.printerId && (!printer || printer.role !== "printer")) throw new Bad(`«${label}»: pechatchi topilmadi`);
      return { mode, designerId: mode === "design" ? t.assigneeId : null, printerId: printer?.id || null };
    };
    const tasks = items.map(taskOf);

    if (!lead) {
      lead = { id: rid(), customer, phone: str(b.phone, 40), source: str(b.source, 40) || "Ustaxona", estimatedValue: 0, manager, notes: "", stage: "negotiation", orderId: null, createdBy: req.user.name, createdAt: at, stageAt: at, line: subcategory };
      leadList.unshift(lead);
    }
    const no = lead.quote?.status === "open" && lead.quote.no ? lead.quote.no : nextQuoteNo();
    const groupId = `G-${no.slice(2)}`;

    const ordersRaw = raw("uvix:orders");
    const orders = (() => { try { const v = ordersRaw ? JSON.parse(ordersRaw) : []; return Array.isArray(v) ? v : []; } catch { return []; } })();
    const settings = readJson("uvix:settings", {}) || {};
    const rate = Math.round(Number(settings.usdRate) || 12700);
    const prefix = `${linePrefix(subcategory)}-${date.replace(/-/g, "").slice(2)}-`; // yo'nalish: UV-… / ON-… (prefiks — Sozlamalar → Yo'nalishlar)
    let seq = orders.reduce((m, o) => { const s = String(o?.orderNumber || ""); return s.startsWith(prefix) ? Math.max(m, parseInt(s.slice(prefix.length), 10) || 0) : m; }, 0);

    const created = items.map((it, i) => {
      seq += 1;
      const itemRate = it.cur === "usd" && it.rate > 0 ? it.rate : rate;
      const usdTotal = round2(it.area * (it.inkUsd || 0));
      const kraska = Math.round(usdTotal * itemRate);
      const tk = tasks[i];
      const o = {
        id: rid(), orderNumber: prefix + String(seq).padStart(3, "0"), date, customer, subcategory,
        title: it.title || it.material, materialType: it.material,
        materialLines: [{ materialType: it.material, area: it.area, priceUsd: it.inkUsd || 0, totalUsd: usdTotal }],
        manager, area: it.area, exchangeRate: itemRate, agreementUsd: usdTotal, agreementUzs: it.total,
        kraskaLines: kraska > 0 ? [{ amount: kraska }] : [], kraskaSum: kraska, materialSum: 0, payments: [],
        note: [describeItem(it), it.note].filter(Boolean).join(" · "),
        createdBy: req.user.name, createdAt: at, photos: [], ...(str(b.place, 60) ? { place: str(b.place, 60) } : {}),
        leadId: lead.id, groupId, groupIdx: i + 1, groupSize: items.length, quoteNo: no, quoteItemId: it.id,
        prodStage: "new", prodAt: at,
      };
      const printBase = { quality: "1440 dpi", colorProfile: "CMYK", material: it.material, area: it.area, notes: it.note || "" };
      if (tk.mode === "design") {
        o.design = { assigneeId: tk.designerId, status: "new", statusAt: at, assignedAt: at, format: it.w && it.h ? `${sizeText(it)}${it.qty > 1 ? ` × ${it.qty}` : ""}` : "", fileType: "", notes: it.note || "" };
        if (tk.printerId) o.print = { ...printBase, assigneeId: tk.printerId };
        o.prodStage = "design";
      } else if (tk.mode === "print") {
        o.print = { ...printBase, assigneeId: tk.printerId, status: tk.printerId ? "new" : "unassigned", statusAt: at, assignedAt: tk.printerId ? at : null };
        o.prodStage = "printing";
      }
      return o;
    });

    // To'lov — guruh buyurtmalariga taqsimlanadi
    const batchId = paid > 0 ? rid() : null;
    if (paid > 0) {
      const mode = b.distribute === "oldest" ? "oldest" : "prop";
      const per = allocate(paid, created.map((o) => ({ id: o.id, due: o.agreementUzs })), mode);
      const byId = new Map(created.map((o) => [o.id, o]));
      for (const r of spreadPayments(per, created.map((o) => o.id), lines)) {
        byId.get(r.orderId).payments.push({ id: rid(), amount: r.amount, date, paymentType: r.paymentType, comment: `Smeta ${no} avansi`, createdBy: req.user.name, createdAt: at, batchId });
      }
    }

    lead.quote = { ...(lead.quote || {}), no, items, total, status: "converted", subcategory, convertedAt: at, convertedBy: req.user.name, groupId, orderIds: created.map((o) => o.id), createdAt: lead.quote?.createdAt || at, updatedAt: at, advanceForced: paid < need ? true : undefined };
    lead.orderIds = created.map((o) => o.id);
    if (!lead.orderId) lead.orderId = created[0].id;
    lead.estimatedValue = total;
    if (!lead.manager) lead.manager = manager;
    if (!lead.jobTitle) lead.jobTitle = items.map((i) => i.title || i.material).filter(Boolean).join(", ").slice(0, 80);
    syncLeadStage(lead, created, at);

    const nextOrders = write("uvix:orders", [...created, ...orders]);
    write("uvix:leads", leadList);
    audit(req.user.name, `Smeta ${no} → ${created.length} ta buyurtma (${created.map((o) => o.orderNumber).join(", ")}): ${customer}, ${money(total)}${paid ? `, to'lov ${money(paid)}` : ""}${paid < need ? " — avanssiz (admin ruxsati)" : ""}`, at);
    try { onOrdersWritten(ordersRaw, nextOrders); } catch (e) { console.error("Buyurtma xabarnomasi:", e.message); }
    res.json({ orders: created, lead });
  }));

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
module.exports.cleanItem = cleanItem;
module.exports.spreadPayments = spreadPayments;
