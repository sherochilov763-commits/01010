// money-guard.js — pul ma'lumotlari himoyasi (A1).
//
//  • Operator to'lov QO'SHA oladi. Mavjud to'lovni o'zgartirish/o'chirish, buyurtmani o'chirish va
//    buyurtma summasini kamaytirish — faqat admin tasdig'i bilan (so'rov + sabab).
//  • Qoidalarni server tekshiradi: ilova chetlab o'tilsa ham (to'g'ridan-to'g'ri so'rov) o'zgarish qabul
//    qilinmaydi — serverdagi holat qaytariladi, urinish jurnalga yoziladi va adminga xabar boradi.
//  • Eskirgan nusxa (boshqa xodim keyinroq o'zgartirgan) urinish deb hisoblanmaydi: to'lovdagi `editedAt`
//    va buyurtmadagi `totalAt` belgilari solishtiriladi.
//  • Jurnal (uvix:audit) faqat qo'shiladi: kim/qachon/qurilma — server yozadi, eski yozuvni o'zgartirib
//    yoki o'chirib bo'lmaydi.
// Ichki kalit: uvix:approvals — tasdiqlash so'rovlari.
// Diqqat: bu faylda fs ishlatilmaydi (demo nusxasi uchun ESM'ga o'giriladi).

const permsLib = require("./permissions");
const KEY_APPROVALS = "uvix:approvals";
const KEY_AUDIT = "uvix:audit";
const AUDIT_MAX = 500;
const KINDS = ["payment_edit", "payment_delete", "order_delete", "order_total"];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/[ ,]/g, " ")} so'm`;
const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Qurilma: «telefon · Chrome», «kompyuter · Safari»; brauzer bo'lmasa — «API» (ilovani chetlab so'rov)
function deviceOf(req) {
  const ua = String(req?.headers?.["user-agent"] || "");
  if (!ua || !/Mozilla\//.test(ua)) return "API";
  const kind = /Mobile|Android|iPhone|iPad/.test(ua) ? "telefon" : "kompyuter";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /YaBrowser\//.test(ua) ? "Yandex" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "brauzer";
  return `${kind} · ${br}`;
}

const sameMoney = (a, b) => Number(a?.amount) === Number(b?.amount) && String(a?.paymentType || "") === String(b?.paymentType || "")
  && String(a?.date || "") === String(b?.date || "") && !!a?.deletedAt === !!b?.deletedAt;

function cleanNewPayment(p, user, now) {
  if (!p || typeof p !== "object" || (typeof p.id !== "string" && typeof p.id !== "number")) return null;
  const amount = Math.round(Number(p.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
  const { deletedAt, deletedBy, editedAt, editedBy, prevAmount, ...rest } = p; // eslint-disable-line no-unused-vars
  return { ...rest, amount, createdBy: user.name, createdAt: typeof p.createdAt === "string" ? p.createdAt : now };
}

/**
 * Buyurtmalar ro'yxatini (yangi holat) serverdagi holat bilan solishtirib, qoidalarni qo'llaydi.
 * @returns {{ list: object[], violations: object[] }} violations — haqiqiy urinishlar (eskirgan nusxa emas)
 */
function guardOrders(next, old, user, nowIso = new Date().toISOString()) {
  if (!Array.isArray(next)) return { list: next, violations: [] };
  const admin = user?.role === "admin";
  // Rollar va huquqlar: rahbar bergan ruxsatlar (yo'q bo'lsa — eski qoidalar: hammasi so'rov bilan)
  const P = user?.perms || null;
  const has = (k, need) => (P ? permsLib.can(P, k, need) : false);
  const f = {
    create: P ? has("orders.create") : true, edit: P ? P["orders.edit"] : "all", del: has("orders.delete", "direct"),
    price: has("orders.price"), payAdd: P ? has("payments.add") : true, payEdit: has("payments.edit", "direct"),
  };
  const byId = new Map((Array.isArray(old) ? old : []).filter(Boolean).map((o) => [o.id, o]));
  const violations = [];
  const seen = new Set();
  const list = next.map((o) => {
    if (!o || typeof o !== "object") return o;
    seen.add(o.id);
    const db = byId.get(o.id);
    if (admin) return stampAdmin(o, db, user, nowIso);
    if (!db) return f.create ? cleanNewOrder(o, user, nowIso, violations, f) : null;
    // Tahrirlash huquqi yo'q (yoki «o'ziniki» — boshqaning buyurtmasi) — serverdagi holati qoladi
    if (f.edit === "none" || (f.edit === "own" && db.createdBy && db.createdBy !== user.name)) return db;
    return guardExisting(o, db, user, nowIso, violations, f);
  }).filter((o) => o !== null);
  // Operator yuborgan ro'yxatda yo'q (olib tashlangan) buyurtmalar — serverdagi holatida qoladi
  if (!admin) for (const db of byId.values()) if (!seen.has(db.id)) list.push(db);
  return { list, violations };
}

// Admin: hammasi mumkin, faqat versiya belgilari qo'yiladi (keyin eskirgan nusxani urinishdan ajratish uchun)
function stampAdmin(o, db, user, now) {
  if (!db) return o;
  const out = { ...o };
  const t = Number(o.agreementUzs) || 0;
  if (t !== (Number(db.agreementUzs) || 0)) out.totalAt = now;
  else if (db.totalAt && !o.totalAt) out.totalAt = db.totalAt;
  const dbPay = new Map((db.payments || []).filter(Boolean).map((p) => [p.id, p]));
  if (Array.isArray(o.payments)) {
    out.payments = o.payments.map((p) => {
      const d = p && dbPay.get(p.id);
      if (!d) return p;
      if (!sameMoney(p, d)) return (p.editedAt || "") === (d.editedAt || "") ? { ...p, editedAt: now, editedBy: user.name } : p;
      return d.editedAt && !p.editedAt ? { ...p, editedAt: d.editedAt, editedBy: d.editedBy } : p;
    });
  }
  return out;
}

function cleanNewOrder(o, user, now, violations, f = {}) {
  const out = { ...o };
  delete out.deletedAt; delete out.deletedBy; delete out.purgedPaymentIds;
  if (f.payAdd === false) out.payments = [];
  else if (Array.isArray(o.payments)) {
    out.payments = [];
    for (const p of o.payments) {
      const c = cleanNewPayment(p, user, now);
      if (c) out.payments.push(c); else violations.push({ kind: "payment_invalid", order: o, payment: p });
    }
  }
  return out;
}

function guardExisting(o, db, user, now, violations, f = {}) {
  const out = { ...o };
  // Buyurtmani o'chirish / tiklash
  if (!db.deletedAt && o.deletedAt && f.del) {
    out.deletedAt = o.deletedAt; out.deletedBy = user.name; // huquq bor — so'rovsiz
  } else if (!db.deletedAt && o.deletedAt) {
    if (o.deletedBy === user.name) violations.push({ kind: "order_delete", order: db });
    delete out.deletedAt; delete out.deletedBy;
    if (db.deletedBy) out.deletedBy = db.deletedBy;
  } else if (db.deletedAt) {
    out.deletedAt = db.deletedAt; out.deletedBy = db.deletedBy;
  }
  // Summa: oshirish mumkin, kamaytirish — faqat tasdiq bilan
  const inc = Number(o.agreementUzs) || 0, cur = Number(db.agreementUzs) || 0;
  if (inc < cur && f.price) out.totalAt = now; // narxni o'zgartirish huquqi bor
  else if (inc < cur) {
    if ((o.totalAt || "") === (db.totalAt || "")) violations.push({ kind: "order_total", order: db, from: cur, to: inc });
    out.agreementUzs = db.agreementUzs; out.agreementUsd = db.agreementUsd;
    if (db.totalAt) out.totalAt = db.totalAt; else delete out.totalAt;
  } else if (inc > cur) out.totalAt = now;
  else if (db.totalAt) out.totalAt = db.totalAt; else delete out.totalAt;
  // To'lovlar: mavjudlari — serverdagicha (izoh o'zgarishi mumkin), yangilari — qo'shiladi
  const incPays = Array.isArray(o.payments) ? o.payments.filter(Boolean) : [];
  const incMap = new Map(incPays.map((p) => [p.id, p]));
  const dbPays = (db.payments || []).filter(Boolean);
  const dbIds = new Set(dbPays.map((p) => p.id));
  const pays = dbPays.map((p) => {
    const ip = incMap.get(p.id);
    if (!ip) return p; // eskirgan nusxada yo'q — saqlab qolamiz
    if (f.payEdit && !sameMoney(ip, p) && (ip.editedAt || "") === (p.editedAt || "")) return { ...ip, editedAt: now, editedBy: user.name, ...(ip.deletedAt ? { deletedBy: user.name } : {}) };
    if (sameMoney(ip, p)) return ip.comment !== undefined && ip.comment !== p.comment ? { ...p, comment: String(ip.comment).slice(0, 300) } : p;
    if ((ip.editedAt || "") === (p.editedAt || "")) violations.push({ kind: ip.deletedAt && !p.deletedAt ? "payment_delete" : "payment_edit", order: db, payment: p, to: ip });
    return p;
  });
  for (const ip of incPays) {
    if (dbIds.has(ip.id) || f.payAdd === false) continue;
    const c = cleanNewPayment(ip, user, now);
    if (c) pays.push(c); else violations.push({ kind: "payment_invalid", order: db, payment: ip });
  }
  out.payments = pays;
  if (db.purgedPaymentIds) out.purgedPaymentIds = db.purgedPaymentIds; else delete out.purgedPaymentIds;
  return out;
}

// Jurnal: faqat yangi yozuvlar qo'shiladi; kim/qachon/qurilma — serverdan
function guardAudit(incoming, current, user, dev, nowIso = new Date().toISOString()) {
  const cur = Array.isArray(current) ? current : [];
  const have = new Set(cur.map((x) => x && x.id));
  const fresh = (Array.isArray(incoming) ? incoming : [])
    .filter((x) => x && typeof x === "object" && (typeof x.id === "string" || typeof x.id === "number") && !have.has(x.id) && typeof x.what === "string")
    .slice(0, 50)
    .map((x) => ({ id: x.id, who: user.name, what: x.what.slice(0, 500), when: nowIso, dev }));
  return [...fresh, ...cur].slice(0, AUDIT_MAX);
}

const VIOLATION_TEXT = {
  order_delete: (v) => `buyurtmani so'rovsiz o'chirishga urinish · ${v.order.orderNumber}`,
  order_total: (v) => `buyurtma summasini so'rovsiz kamaytirishga urinish · ${v.order.orderNumber} (${money(v.from)} → ${money(v.to)})`,
  payment_delete: (v) => `to'lovni so'rovsiz o'chirishga urinish · ${v.order.orderNumber} (${money(v.payment.amount)})`,
  payment_edit: (v) => `to'lovni so'rovsiz o'zgartirishga urinish · ${v.order.orderNumber} (${money(v.payment.amount)} → ${money(v.to?.amount)})`,
  payment_invalid: (v) => `noto'g'ri to'lov rad etildi · ${v.order?.orderNumber || ""}`,
};

// So'rovning pul hajmi (tasdiqlash chegarasi bilan solishtiriladi)
function requestAmount(r) {
  if (r.kind === "payment_edit") return Math.abs((Number(r.new?.amount) || 0) - (Number(r.old?.amount) || 0));
  if (r.kind === "payment_delete") return Number(r.old?.amount) || 0;
  if (r.kind === "order_total") return Math.max(0, (Number(r.old?.agreementUzs) || 0) - (Number(r.new?.agreementUzs) || 0));
  return Number(r.old?.agreementUzs) || 0;
}
function describeRequest(r) {
  if (r.kind === "payment_edit") return `to'lov summasini o'zgartirmoqchi: ${money(r.old.amount)} → ${money(r.new.amount)}`;
  if (r.kind === "payment_delete") return `to'lovni o'chirmoqchi: ${money(r.old.amount)}`;
  if (r.kind === "order_delete") return `buyurtmani o'chirmoqchi (${money(r.old.agreementUzs)}, to'langan ${money(r.old.paid)})`;
  return `buyurtma summasini kamaytirmoqchi: ${money(r.old.agreementUzs)} → ${money(r.new.agreementUzs)}`;
}

module.exports = function registerMoneyGuard(app, { rolesCfg = () => ({}), getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin, requireStaff, sendToEmployee = async () => false, emit = () => null, now = () => new Date() }) {
  const read = (k, def) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : def; } catch { return def; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const adminIds = () => readEmployees().filter((e) => e.role === "admin").map((e) => e.id);

  function log(who, what, dev = "server") {
    const list = read(KEY_AUDIT, []);
    list.unshift({ id: `s${rid()}`, who, what, when: now().toISOString(), dev, src: "server" });
    write(KEY_AUDIT, list.slice(0, AUDIT_MAX));
  }
  async function toAdmins(text, title, body) {
    for (const id of adminIds()) {
      await sendToEmployee(id, text).catch(() => false);
      try { emit("approvals", { title, body, view: "orders", to: id }); } catch { /* ixtiyoriy */ }
    }
  }
  // Ruxsatsiz urinishlar: jurnal + adminga bitta xabar
  function report(user, violations, dev) {
    if (!violations?.length) return;
    for (const v of violations) log(user.name, `Rad etildi (server): ${(VIOLATION_TEXT[v.kind] || (() => v.kind))(v)}`, dev);
    const lines = violations.slice(0, 5).map((v) => `• ${esc((VIOLATION_TEXT[v.kind] || (() => v.kind))(v))}`).join("\n");
    toAdmins(`⛔️ <b>Ruxsatsiz o'zgarish rad etildi</b>\nXodim: ${esc(user.name)} (${esc(dev)})\n${lines}\nMa'lumotlar o'zgarmadi.`, "Ruxsatsiz o'zgarish rad etildi", `${user.name}: ${(VIOLATION_TEXT[violations[0].kind] || (() => ""))(violations[0])}`).catch(() => {});
  }

  // ---------- Tasdiqlash so'rovlari ----------
  const all = () => read(KEY_APPROVALS, []);
  // Katta menejer: o'z yo'nalishidagi boshqa xodimlar so'rovini chegarasi doirasida tasdiqlaydi
  const lineOfOrderId = (id) => { const o = read("uvix:orders", []).find((x) => x && x.id === id); return o ? (o.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT") : null; };
  function canDecide(user, r) {
    if (!user || r.status !== "pending") return false;
    if (user.role === "admin") return true;
    if (r.by?.id === user.id) return false;
    const me = readEmployees().find((e) => e.id === user.id);
    const eff = permsLib.resolve(me || user, rolesCfg());
    const lim = eff["approve.limit"];
    if (!(lim === -1 || lim > 0)) return false;
    const limit = lim === -1 ? Infinity : lim;
    const scope = me?.line === "UVONYX" ? "UVONYX" : me?.line === "common" ? null : "UVIXPRINT";
    if (scope && lineOfOrderId(r.orderId) !== scope) return false;
    return requestAmount(r) <= limit;
  }
  const visibleTo = (user, r) => user.role === "admin" || r.by?.id === user.id || canDecide(user, r) || r.decidedBy === user.name;
  const managersFor = (r) => readEmployees().filter((e) => e.role !== "admin" && e.id !== r.by?.id && canDecide({ id: e.id, role: e.role, name: e.name }, r)).map((e) => e.id);
  const save = (list) => write(KEY_APPROVALS, list.slice(0, 300));
  const pending = (list) => list.filter((r) => r.status === "pending");

  app.get("/api/approvals", requireAuth, requireStaff, (req, res) => {
    const list = all();
    const mine = list.filter((r) => visibleTo(req.user, r)).map((r) => ({ ...r, canDecide: canDecide(req.user, r) }));
    res.json({ approvals: mine.slice(0, 100), pending: pending(mine).length });
  });

  app.post("/api/approvals", requireAuth, requireStaff, (req, res) => {
    const b = req.body || {};
    if (!KINDS.includes(b.kind)) return res.status(400).json({ error: "invalid_kind" });
    // «Yo'q» huquqi — so'rov ham yuborilmaydi
    const pk = b.kind === "order_delete" ? "orders.delete" : b.kind === "order_total" ? null : "payments.edit";
    if (pk && req.user.perms && req.user.perms[pk] === "no") return res.status(403).json({ error: "forbidden", message: "Bu amal uchun ruxsat yo'q — rahbar «Rollar va huquqlar»da beradi" });
    const reason = String(b.reason || "").trim().slice(0, 300);
    if (reason.length < 3) return res.status(400).json({ error: "reason_required", message: "Sababni yozing" });
    const orders = read("uvix:orders", []);
    const o = orders.find((x) => x && x.id === b.orderId);
    if (!o || o.deletedAt) return res.status(404).json({ error: "order_not_found", message: "Buyurtma topilmadi" });
    const paid = (o.payments || []).filter((p) => p && !p.deletedAt).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const r = { id: rid(), kind: b.kind, orderId: o.id, orderNumber: o.orderNumber, customer: o.customer, reason, by: { id: req.user.id, name: req.user.name }, dev: deviceOf(req), at: now().toISOString(), status: "pending" };
    if (b.kind === "payment_edit" || b.kind === "payment_delete") {
      const p = (o.payments || []).find((x) => x && x.id === b.paymentId);
      if (!p || p.deletedAt) return res.status(404).json({ error: "payment_not_found", message: "To'lov topilmadi" });
      r.paymentId = p.id;
      r.old = { amount: p.amount, paymentType: p.paymentType, date: p.date, editedAt: p.editedAt || null };
      if (b.kind === "payment_edit") {
        const amount = Math.round(Number(b.amount));
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "invalid_amount", message: "Yangi summa noto'g'ri" });
        if (amount === Number(p.amount)) return res.status(400).json({ error: "same_amount", message: "Summa o'zgarmagan" });
        r.new = { amount };
      }
    } else if (b.kind === "order_delete") {
      r.old = { agreementUzs: o.agreementUzs || 0, paid };
    } else {
      const total = Math.round(Number(b.agreementUzs));
      if (!Number.isFinite(total) || total < 0) return res.status(400).json({ error: "invalid_amount", message: "Yangi summa noto'g'ri" });
      if (total >= (Number(o.agreementUzs) || 0)) return res.status(400).json({ error: "not_decrease", message: "Summani oshirish uchun so'rov kerak emas" });
      r.old = { agreementUzs: o.agreementUzs || 0, totalAt: o.totalAt || null, paid };
      r.new = { agreementUzs: total };
    }
    const list = all();
    if (pending(list).some((x) => x.kind === r.kind && x.orderId === r.orderId && (x.paymentId || null) === (r.paymentId || null))) {
      return res.status(409).json({ error: "duplicate", message: "Bu bo'yicha so'rov allaqachon yuborilgan — admin javobini kuting" });
    }
    list.unshift(r);
    save(list);
    log(req.user.name, `So'rov yubordi: ${describeRequest(r)} · ${o.orderNumber} · sabab: «${reason}»`, r.dev);
    toAdmins(`🛡 <b>Tasdiqlash so'rovi</b>\n${esc(req.user.name)} ${esc(describeRequest(r))}\nBuyurtma: ${esc(o.orderNumber)} · ${esc(o.customer)}\nSabab: «${esc(reason)}»\n\nUVIX'da tasdiqlang yoki rad eting.`,
      "Tasdiqlash so'rovi", `${req.user.name} ${describeRequest(r)} · ${o.orderNumber}`).catch(() => {});
    for (const id of managersFor(r)) {
      sendToEmployee(id, `🛡 <b>Tasdiqlash so'rovi</b>\n${esc(req.user.name)} ${esc(describeRequest(r))}\nBuyurtma: ${esc(o.orderNumber)} · ${esc(o.customer)}\nSabab: «${esc(reason)}»`).catch(() => false);
      try { emit("approvals", { title: "Tasdiqlash so'rovi", body: `${req.user.name} ${describeRequest(r)} · ${o.orderNumber}`, view: "orders", to: id }); } catch { /* ixtiyoriy */ }
    }
    res.json({ approval: r });
  });

  // Xodim o'z so'rovini bekor qiladi
  app.delete("/api/approvals/:id", requireAuth, requireStaff, (req, res) => {
    const list = all();
    const r = list.find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: "not_found" });
    if (r.by?.id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
    if (r.status !== "pending") return res.status(409).json({ error: "already_decided", message: "So'rov allaqachon ko'rib chiqilgan" });
    r.status = "cancelled"; r.decidedAt = now().toISOString(); r.decidedBy = req.user.name;
    save(list);
    log(req.user.name, `So'rovni bekor qildi: ${describeRequest(r)} · ${r.orderNumber}`, deviceOf(req));
    res.json({ approval: r });
  });

  // Admin qarori. Tasdiqlansa — o'zgarish serverda qo'llanadi (bitta tranzaksiya ichida)
  app.post("/api/approvals/:id/:action(approve|reject)", requireAuth, (req, res) => {
    const list = all();
    const r = list.find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: "not_found" });
    if (r.status === "pending" && !canDecide(req.user, r)) return res.status(403).json({ error: "forbidden", message: req.user.role === "manager" ? "Bu so'rov sizning tasdiqlash chegarangizdan yuqori — rahbar hal qiladi" : "Faqat administrator uchun" });
    if (r.status !== "pending") return res.status(409).json({ error: "already_decided", message: "So'rov allaqachon ko'rib chiqilgan" });
    const at = now().toISOString();
    const approve = req.params.action === "approve";
    let changed = null;
    if (approve) {
      const orders = read("uvix:orders", []);
      const i = orders.findIndex((x) => x && x.id === r.orderId);
      const o = i >= 0 ? orders[i] : null;
      if (!o || o.deletedAt) return res.status(409).json({ error: "stale", message: "Buyurtma o'chirilgan yoki topilmadi — so'rovni rad eting" });
      let next = { ...o };
      if (r.kind === "payment_edit" || r.kind === "payment_delete") {
        const p = (o.payments || []).find((x) => x && x.id === r.paymentId);
        if (!p || p.deletedAt) return res.status(409).json({ error: "stale", message: "To'lov o'chirilgan — so'rovni rad eting" });
        if (Number(p.amount) !== Number(r.old.amount)) return res.status(409).json({ error: "stale", message: "To'lov so'rovdan keyin o'zgargan — so'rovni rad eting" });
        next.payments = o.payments.map((x) => (x && x.id === p.id
          ? (r.kind === "payment_delete"
            ? { ...x, deletedAt: at, deletedBy: r.by.name, approvedBy: req.user.name, approvalId: r.id }
            : { ...x, amount: r.new.amount, prevAmount: x.amount, editedAt: at, editedBy: r.by.name, approvedBy: req.user.name, approvalId: r.id })
          : x));
      } else if (r.kind === "order_delete") {
        next = { ...o, deletedAt: at, deletedBy: r.by.name, approvedBy: req.user.name, approvalId: r.id };
      } else {
        if (Number(o.agreementUzs) !== Number(r.old.agreementUzs)) return res.status(409).json({ error: "stale", message: "Summa so'rovdan keyin o'zgargan — so'rovni rad eting" });
        next = { ...o, agreementUzs: r.new.agreementUzs, prevAgreementUzs: o.agreementUzs, totalAt: at, approvedBy: req.user.name, approvalId: r.id };
      }
      orders[i] = next;
      write("uvix:orders", orders);
      changed = next;
    }
    r.status = approve ? "approved" : "rejected"; r.decidedAt = at; r.decidedBy = req.user.name;
    if (!approve && req.body?.note) r.note = String(req.body.note).slice(0, 200);
    save(list);
    log(req.user.name, `${approve ? "Tasdiqladi" : "Rad etdi"}: ${r.by.name} — ${describeRequest(r)} · ${r.orderNumber}`, deviceOf(req));
    const msg = approve
      ? `✅ <b>So'rovingiz tasdiqlandi</b>\n${esc(describeRequest(r))}\nBuyurtma: ${esc(r.orderNumber)} · ${esc(r.customer)}\nTasdiqladi: ${esc(req.user.name)}`
      : `❌ <b>So'rovingiz rad etildi</b>\n${esc(describeRequest(r))}\nBuyurtma: ${esc(r.orderNumber)}\nRad etdi: ${esc(req.user.name)}${r.note ? `\nIzoh: ${esc(r.note)}` : ""}`;
    sendToEmployee(r.by.id, msg).catch(() => false);
    try { emit("approvals", { title: approve ? "So'rovingiz tasdiqlandi" : "So'rovingiz rad etildi", body: `${r.orderNumber}: ${describeRequest(r)}`, view: "orders", to: r.by.id }); } catch { /* ixtiyoriy */ }
    res.json({ approval: r, order: changed });
  });

  return { guardOrders, guardAudit, report, log, deviceOf };
};
module.exports.guardOrders = guardOrders;
module.exports.requestAmount = requestAmount;
module.exports.guardAudit = guardAudit;
module.exports.deviceOf = deviceOf;
module.exports.describeRequest = describeRequest;
