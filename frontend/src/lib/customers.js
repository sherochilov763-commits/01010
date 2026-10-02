// customers.js — mijozlar bazasi: buyurtmalar va CRM lidlaridan avtomatik yig'iladi.
// Qo'lda kiritilgan ma'lumot (telefon, Telegram, izoh, birlashtirilgan nomlar) uvix:customers da saqlanadi:
//   { id, key, name, phone, telegram, note, aliases: [key], createdAt, updatedAt, deletedAt? }
// Bog'lash qoidasi: buyurtma — mijoz nomi bo'yicha (katta-kichik harf, ortiqcha bo'shliq farqi yo'q);
// lid — avval bog'langan buyurtma (lead.orderId), so'ng nom, telefon (oxirgi 9 raqam) yoki Telegram nik bo'yicha.
import { ORDER_READY_STAGES } from "../constants.js";
import { orderDebt, orderTotalPaid } from "./finance.js";

export const custKey = (name) => String(name || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
export const phoneKey = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : ""; };
const tgKey = (u) => String(u || "").replace(/^@/, "").toLowerCase().trim();
const daysSince = (date, today) => Math.max(0, Math.round((new Date(`${today}T00:00:00`) - new Date(`${String(date).slice(0, 10)}T00:00:00`)) / 86400000));

export function buildCustomers(orders, leads, profiles, today = new Date().toISOString().slice(0, 10)) {
  const list = [];
  const byKey = new Map(), byPhone = new Map(), byTg = new Map();
  const make = (base) => { const c = { orders: [], leads: [], keys: [], ...base }; list.push(c); return c; };
  for (const p of (profiles || []).filter((x) => x && !x.deletedAt)) {
    const c = make({ id: p.id, profile: p, name: p.name, keys: [p.key, ...(p.aliases || [])].filter(Boolean) });
    c.keys.forEach((k) => byKey.set(k, c));
  }
  const orderOwner = new Map();
  for (const o of orders || []) {
    if (!o || o.deletedAt) continue;
    const k = custKey(o.customer) || "noma'lum";
    let c = byKey.get(k);
    if (!c) { c = make({ id: `k:${k}`, name: String(o.customer || "Noma'lum").trim(), keys: [k] }); byKey.set(k, c); }
    c.orders.push(o);
    orderOwner.set(o.id, c);
  }
  const index = (c) => {
    const ph = phoneKey(c.profile?.phone); if (ph && !byPhone.has(ph)) byPhone.set(ph, c);
    const tg = tgKey(c.profile?.telegram); if (tg && !byTg.has(tg)) byTg.set(tg, c);
  };
  list.forEach(index);
  for (const l of leads || []) {
    if (!l || l.deletedAt) continue;
    const k = custKey(l.customer);
    let c = (l.orderId && orderOwner.get(l.orderId)) || byKey.get(k) || byPhone.get(phoneKey(l.phone)) || byTg.get(tgKey(l.telegramUsername));
    if (!c) {
      if (!ORDER_READY_STAGES.includes(l.stage)) continue; // yangi/yo'qotilgan lidlar CRM'da qoladi
      c = make({ id: `k:${k || l.id}`, name: String(l.customer || "Noma'lum").trim(), keys: [k] });
      if (k) byKey.set(k, c);
    }
    c.leads.push(l);
    const ph = phoneKey(l.phone); if (ph && !byPhone.has(ph)) byPhone.set(ph, c);
    const tg = tgKey(l.telegramUsername); if (tg && !byTg.has(tg)) byTg.set(tg, c);
  }

  for (const c of list) {
    const p = c.profile || {};
    const leadWithPhone = c.leads.find((l) => l.phone);
    const leadWithTg = c.leads.find((l) => l.telegramUsername || l.telegramChatId);
    c.phone = p.phone || leadWithPhone?.phone || "";
    c.telegram = tgKey(p.telegram) || tgKey(leadWithTg?.telegramUsername) || "";
    c.chatLead = c.leads.find((l) => l.telegramChatId) || null;
    c.note = p.note || "";
    c.orders.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const total = c.orders.reduce((s, o) => s + (o.agreementUzs || 0), 0);
    const paid = c.orders.reduce((s, o) => s + orderTotalPaid(o), 0);
    const debtOrders = c.orders.filter((o) => orderDebt(o) > 0).map((o) => ({ order: o, debt: orderDebt(o), days: daysSince(o.date, today) })).sort((a, b) => b.days - a.days);
    const debt = debtOrders.reduce((s, x) => s + x.debt, 0);
    const payments = c.orders.flatMap((o) => (o.payments || []).filter((x) => !x.deletedAt).map((x) => ({ ...x, order: o }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    Object.assign(c, {
      count: c.orders.length, total, paid, debt, debtOrders, payments,
      avg: c.orders.length ? Math.round(total / c.orders.length) : 0,
      firstDate: c.orders.length ? c.orders[c.orders.length - 1].date : null,
      lastDate: c.orders.length ? c.orders[0].date : null,
      oldestDebtDays: debtOrders.length ? debtOrders[0].days : 0,
      lastPayment: payments[0] || null,
    });
  }
  return list.filter((c) => c.orders.length || c.leads.length || c.profile);
}

export function telLink(phone) { const d = String(phone || "").replace(/[^\d+]/g, ""); return d ? `tel:${d}` : null; }
export function tgLink(username) { return username ? `https://t.me/${username}` : null; }
