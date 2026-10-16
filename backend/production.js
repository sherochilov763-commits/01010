// production.js — buyurtmaning ishlab chiqarish holati, lid bosqichini buyurtmalardan hisoblash,
// to'lovni bir nechta buyurtmaga taqsimlash va eskirgan nusxadan himoya.
// Toza funksiyalar: tashqi bog'liqlik yo'q (demo ham shu faylni ishlatadi).
//
// Buyurtma maydonlari (smetadan yaratilganlarda):
//   prodStage: "new" (navbatda) | "design" | "printing" | "ready" (tayyor, olib ketilmagan) | "delivered" (topshirildi)
//   prodAt — holat oxirgi o'zgargan vaqt; readyAt, deliveredAt
//   design / print — lid ichidagi vazifalar bilan bir xil tuzilma: { assigneeId, status, statusAt, ... }
//   leadId, groupId ("G-014"), groupIdx, groupSize, quoteNo ("S-014"), title (ish nomi)

// UVONYX: + «Material» va «O'rnatish»
const PROD_STAGES = ["new", "design", "material", "printing", "ready", "install", "delivered"];
const PROD_LABEL = { new: "Navbatda", design: "Dizaynda", material: "Material", printing: "Pechatda", ready: "Tayyor", install: "O'rnatish", delivered: "Topshirildi" };

// Vazifa holati o'zgarganda buyurtma holati (ishchi tugmani bosganda)
function applyOrderTaskStatus(order, kind, status, now) {
  const t = order[kind];
  t.status = status;
  t.statusAt = now;
  if (status === "in_progress" && !t.startedAt) t.startedAt = now;
  if (status === "done") t.doneAt = now; else t.doneAt = null;
  let note = "";
  let becameReady = false;
  if (kind === "design" && status === "done") {
    if (!order.print) { order.print = { status: "unassigned", statusAt: now, autoCreated: true, material: order.materialType || "", area: order.area || 0, quality: "1440 dpi", colorProfile: "CMYK" }; note = " → pechatchi tayinlanishi kerak"; }
    else if (order.print.assigneeId && (!order.print.status || order.print.status === "unassigned")) { order.print = { ...order.print, status: "new", statusAt: now, assignedAt: now }; note = " → pechatchiga o'tdi"; }
    setStage(order, "printing", now);
  } else if (kind === "design" && status !== "done" && ["new", "printing"].includes(order.prodStage) && order.print?.status !== "in_progress" && order.print?.status !== "done") {
    setStage(order, "design", now);
  }
  if (kind === "print" && status === "done") { becameReady = order.prodStage !== "ready" && order.prodStage !== "delivered"; setStage(order, "ready", now); note = " → Tayyor"; }
  else if (kind === "print" && status !== "done" && (order.prodStage === "ready" || order.prodStage === "new")) setStage(order, "printing", now);
  return { note, becameReady };
}

function setStage(order, stage, now) {
  if (!PROD_STAGES.includes(stage)) return false;
  if (order.prodStage === stage) return false;
  order.prodStage = stage;
  order.prodAt = now;
  if (stage === "ready") order.readyAt = now;
  if (stage === "delivered") { order.deliveredAt = now; if (!order.readyAt) order.readyAt = now; }
  if (stage !== "delivered") order.deliveredAt = null;
  return true;
}

// Lid bosqichi — unga bog'langan (smetadan yaratilgan) buyurtmalardan
function deriveLeadStage(orders) {
  const list = (orders || []).filter((o) => o && !o.deletedAt);
  if (!list.length) return null;
  const st = list.map((o) => o.prodStage || "new");
  if (st.every((s) => s === "delivered")) return "won";
  if (st.some((s) => s === "new" || s === "design")) return "design";
  if (st.some((s) => s === "printing" || s === "material")) return "printing";
  return "ready";
}

// Lid bosqichini yangilaydi (o'zgarsa true). "Yo'qotilgan" lidga tegilmaydi.
function syncLeadStage(lead, allOrders, now) {
  if (!lead || lead.stage === "lost") return false;
  const mine = (allOrders || []).filter((o) => o && o.leadId === lead.id && !o.deletedAt);
  const next = deriveLeadStage(mine);
  if (!next || next === lead.stage) return false;
  lead.stage = next;
  lead.stageAt = now;
  lead.stageAutoAt = now;
  if (next === "won") lead.closedAt = now; else delete lead.closedAt;
  return true;
}

// Summani buyurtmalarga taqsimlash.
//   targets: [{ id, due }] — tartib muhim ("oldest" rejimida birinchidan boshlab to'ldiriladi)
//   mode: "oldest" — ketma-ket; "prop" — qarzga mutanosib
// Qaytaradi: { [id]: summa }. Summa jami qarzdan oshsa — xato.
function allocate(amount, targets, mode = "prop") {
  const amt = Math.round(Number(amount) || 0);
  const list = (targets || []).map((t) => ({ id: t.id, due: Math.max(0, Math.round(Number(t.due) || 0)) })).filter((t) => t.due > 0);
  const totalDue = list.reduce((s, t) => s + t.due, 0);
  if (amt <= 0) return {};
  if (amt > totalDue) { const e = new Error("Summa qarzdan ko'p"); e.code = "overpay"; throw e; }
  const out = {};
  if (mode === "oldest") {
    let left = amt;
    for (const t of list) { if (left <= 0) break; const x = Math.min(left, t.due); out[t.id] = x; left -= x; }
    return out;
  }
  // mutanosib: avval pastga yaxlitlab, qoldiq so'mlarni eng katta kasr qismidan boshlab
  let used = 0;
  const parts = list.map((t) => { const raw = (amt * t.due) / totalDue; const base = Math.min(t.due, Math.floor(raw)); used += base; return { t, base, frac: raw - base }; });
  let rest = amt - used;
  parts.sort((a, b) => b.frac - a.frac);
  for (const p of parts) { if (rest <= 0) break; if (p.base < p.t.due) { p.base += 1; rest -= 1; } }
  for (const p of parts) if (p.base > 0) out[p.t.id] = p.base;
  return out;
}

// Menejerning eskirgan nusxasi server o'zgartirgan maydonlarni bosib ketmasin
function mergeOrderState(incoming, current) {
  if (!Array.isArray(incoming)) return incoming;
  const byId = new Map((Array.isArray(current) ? current : []).map((o) => [o && o.id, o]));
  return incoming.map((o) => {
    const db = o && byId.get(o.id);
    if (!db) return o;
    let out = o;
    const touch = () => { if (out === o) out = { ...o }; };
    for (const k of ["design", "print"]) {
      const d = db[k];
      if (!d) continue;
      const inc = out[k];
      if (!inc) { touch(); out[k] = d; continue; }
      if (d.statusAt && (!inc.statusAt || d.statusAt > inc.statusAt)) { touch(); out[k] = { ...inc, ...d }; }
    }
    if (db.prodAt && (!out.prodAt || db.prodAt > out.prodAt)) {
      touch();
      out.prodStage = db.prodStage; out.prodAt = db.prodAt; out.readyAt = db.readyAt; out.deliveredAt = db.deliveredAt;
    }
    for (const f of ["leadId", "groupId", "groupIdx", "groupSize", "quoteNo"]) if (db[f] != null && out[f] == null) { touch(); out[f] = db[f]; }
    // Server kiritgan (umumiy/smeta) to'lovlar — eskirgan nusxada bo'lmasa ham yo'qolmaydi
    const incIds = new Set((out.payments || []).map((p) => p && p.id));
    const purged = new Set(out.purgedPaymentIds || []);
    const lost = (db.payments || []).filter((p) => p && p.batchId && !incIds.has(p.id) && !purged.has(p.id));
    if (lost.length) { touch(); out.payments = [...(out.payments || []), ...lost]; }
    return out;
  });
}

module.exports = { PROD_STAGES, PROD_LABEL, applyOrderTaskStatus, setStage, deriveLeadStage, syncLeadStage, allocate, mergeOrderState };
