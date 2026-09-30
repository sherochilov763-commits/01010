// leads.js — lidlarning yopilish sanasi, faolligi va arxiv uchun yordamchilar
export const CLOSED_STAGES = new Set(["won", "lost"]);
export const isClosed = (lead) => CLOSED_STAGES.has(lead?.stage);

// Qachon yopilgan: yangi lidlarda closedAt yoziladi; eskilarida — bog'langan buyurtma sanasi yoki yaratilgan kun
export function closedDate(lead, ordersById) {
  const order = lead.orderId && ordersById ? ordersById.get(lead.orderId) : null;
  return lead.closedAt || order?.date || lead.stageAt || lead.stageAutoAt || lead.createdAt || null;
}

// Oxirgi harakat: bosqich o'zgarishi, tahrir, dizayn/pechat vazifasi holati
export function lastActivity(lead) {
  const dates = [lead.stageAt, lead.stageAutoAt, lead.updatedAt, lead.createdAt, lead.design?.statusAt, lead.print?.statusAt]
    .filter(Boolean).map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
  return dates.length ? Math.max(...dates) : null;
}

// Faol bosqichda uzoq turib qolgan lid: 14+ kun — sariq, 30+ kun — qizil
export const STALE_WARN_DAYS = 14;
export const STALE_DANGER_DAYS = 30;
export function staleInfo(lead, now = Date.now()) {
  if (isClosed(lead)) return null;
  const last = lastActivity(lead);
  if (!last) return null;
  const days = Math.floor((now - last) / 86400000);
  if (days >= STALE_DANGER_DAYS) return { level: "danger", days };
  if (days >= STALE_WARN_DAYS) return { level: "warn", days };
  return null;
}

// Lid qiymati: yopilgan va buyurtmaga bog'langan bo'lsa — buyurtma summasi, aks holda taxminiy qiymat
export function leadValue(lead, ordersById) {
  const order = lead.stage === "won" && lead.orderId && ordersById ? ordersById.get(lead.orderId) : null;
  return Number(order?.agreementUzs) || Number(lead.estimatedValue) || 0;
}

export const monthKeyOf = (iso) => (iso ? String(iso).slice(0, 7) : "");
export function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---- Davr (CRM natijalari va arxiv uchun) ----
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const UZ_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
// mode: month | prev | quarter | year | range | all
export function periodRange(mode, custom = {}, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (mode === "prev") { const s = new Date(y, m - 1, 1), e = new Date(y, m, 0); return { from: ymd(s), to: ymd(e), label: `${UZ_MONTHS[s.getMonth()]}` }; }
  if (mode === "quarter") { const q = Math.floor(m / 3); const s = new Date(y, q * 3, 1), e = new Date(y, q * 3 + 3, 0); return { from: ymd(s), to: ymd(e), label: `${q + 1}-chorak` }; }
  if (mode === "year") return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}-yil` };
  if (mode === "range") {
    const from = custom.from || ymd(new Date(y, m, 1)), to = custom.to || ymd(now);
    return { from: from <= to ? from : to, to: from <= to ? to : from, label: "Oraliq" };
  }
  if (mode === "all") return { from: "0000-00-00", to: "9999-12-31", label: "Barchasi" };
  return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)), label: UZ_MONTHS[m] };
}
export const inPeriod = (iso, p) => { if (!iso) return false; const d = String(iso).slice(0, 10); return d >= p.from && d <= p.to; };

// Tanlangan davr natijalari: yangi lidlar, yopilganlar va summa, o'rtacha yopilish muddati (kun)
export function periodStats(leads, ordersById, p) {
  let created = 0, won = 0, wonSum = 0, lost = 0, daysSum = 0, daysN = 0;
  (leads || []).forEach((l) => {
    if (inPeriod(l.createdAt, p)) created++;
    if (!isClosed(l)) return;
    const cd = closedDate(l, ordersById);
    if (!inPeriod(cd, p)) return;
    if (l.stage === "lost") { lost++; return; }
    won++;
    wonSum += leadValue(l, ordersById);
    if (l.createdAt && cd) {
      const days = (new Date(cd) - new Date(l.createdAt)) / 86400000;
      if (days >= 0 && days < 3650) { daysSum += days; daysN++; }
    }
  });
  return { created, won, wonSum, lost, avgDays: daysN ? Math.round(daysSum / daysN) : null };
}
