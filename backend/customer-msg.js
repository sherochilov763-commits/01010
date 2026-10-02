// customer-msg.js — mijozga Telegram xabarlari (sizning Telegram akkauntingiz — userbot orqali):
//   • Hisob-faktura — faqat qo'lda: xodim «Hisob-faktura yuborish»ni bosadi (rasm brauzerda chiziladi)
//   • «To'lov qabul qilindi» — buyurtmaga yangi to'lov kiritilganda avtomatik (kvitansiya)
//   • Qarz eslatmasi — qarz N kundan oshsa, mijozga yumshoq eslatma (har mijozga ko'pi bilan har N kunda 1 marta)
//
// Qabul qiluvchi: mijozning CRM lididagi Telegram chati (eng ishonchli), bo'lmasa — mijozlar bazasidagi
// yoki liddagi @username. Telegrami topilmagan mijozga hech narsa yuborilmaydi.
//
// Saqlash (ichki kalitlar): uvix:custMsgConfig, uvix:custMsgLog (oxirgi 300 ta), uvix:custRemind ({ [mijoz]: sana })
// fs yo'q: yuborish tashqaridan beriladi — sender = { isConnected(), sendText(peer, text), sendImage(peer, base64, caption) }

const TZ = "Asia/Tashkent";
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DEFAULT_CONFIG = {
  cardNumber: "", cardHolder: "", managerPhone: "", managerName: "", companyLine: "UV bosma ustaxonasi",
  receipt: true, // to'lov qabul qilindi
  debtRemind: false, debtDays: 7, remindEvery: 7, remindAt: "11:00", days: [1, 2, 3, 4, 5, 6], maxPerDay: 20,
};

const fmtParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(d = new Date()) {
  const p = Object.fromEntries(fmtParts.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hm: `${p.hour}:${p.minute}`, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000));
const dayLabel = (date) => { const [, m, d] = String(date).slice(0, 10).split("-").map(Number); return `${d}-${MONTHS[m - 1]}`; };
const money = (n) => `${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
const custKey = (name) => String(name || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
const phoneKey = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : ""; };
const tgUser = (u) => String(u || "").replace(/^@/, "").trim();
const paidOf = (o) => (o.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0);
const debtOf = (o) => Math.max(0, (o.agreementUzs || 0) - paidOf(o));
const PAY_LABEL = { naqd: "naqd", karta: "karta", bank: "bank o'tkazma", perechisleniye: "bank o'tkazma" };
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

module.exports = function registerCustomerMsg(app, { getStmt, upsertStmt, requireAuth, requireAdmin, sender, nowFn = () => new Date(), pauseMs = 3000 }) {
  const readJson = (key, fb) => { try { const r = getStmt.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const config = () => ({ ...DEFAULT_CONFIG, ...readJson("uvix:custMsgConfig", {}) });
  const isWorker = (u) => u?.role === "designer" || u?.role === "printer";

  function log(entry) {
    const list = readJson("uvix:custMsgLog", []);
    list.unshift({ at: nowFn().toISOString(), ...entry });
    upsertStmt.run("uvix:custMsgLog", JSON.stringify(list.slice(0, 300)));
  }

  // Mijozning Telegrami: lid chati → mijozlar bazasidagi @username → liddagi @username
  function recipientFor(customerName, orderId) {
    const key = custKey(customerName);
    const profiles = (readJson("uvix:customers", []) || []).filter((p) => p && !p.deletedAt);
    const prof = profiles.find((p) => [p.key, ...(p.aliases || [])].includes(key));
    const keys = new Set(prof ? [prof.key, ...(prof.aliases || [])] : [key]);
    const phones = new Set([phoneKey(prof?.phone)].filter(Boolean));
    const leads = (readJson("uvix:leads", []) || []).filter((l) => l && !l.deletedAt);
    const mine = leads.filter((l) => (orderId && l.orderId === orderId) || keys.has(custKey(l.customer)) || (phoneKey(l.phone) && phones.has(phoneKey(l.phone))));
    const withChat = mine.find((l) => l.orderId === orderId && l.telegramChatId) || mine.find((l) => l.telegramChatId);
    const name = prof?.name || String(customerName || "").trim();
    if (withChat) return { peer: String(withChat.telegramChatId), label: withChat.telegramUsername ? `@${tgUser(withChat.telegramUsername)}` : "CRM chati", via: "chat", name };
    const u = tgUser(prof?.telegram) || tgUser(mine.find((l) => l.telegramUsername)?.telegramUsername);
    if (u) return { peer: u, label: `@${u}`, via: "username", name };
    return null;
  }
  const cardLine = (cfg) => (cfg.cardNumber ? `Karta: ${cfg.cardNumber}${cfg.cardHolder ? ` (${cfg.cardHolder})` : ""}` : "");

  async function deliver(type, rcp, fn, extra) {
    if (!sender?.isConnected?.()) { log({ type, customer: rcp?.name, to: rcp?.label, ok: false, error: "Telegram akkaunt ulanmagan", ...extra }); return { ok: false, error: "Telegram akkaunt ulanmagan (Sozlamalar → Telegram akkaunt)" }; }
    try { await fn(); log({ type, customer: rcp.name, to: rcp.label, ok: true, ...extra }); return { ok: true }; }
    catch (e) { const error = String(e?.message || e).slice(0, 200); log({ type, customer: rcp.name, to: rcp.label, ok: false, error, ...extra }); return { ok: false, error }; }
  }

  // ---- To'lov qabul qilindi (buyurtmalar o'zgarganda server chaqiradi) ----
  async function onOrdersChanged(oldValue, newValue) {
    const cfg = config();
    if (!cfg.receipt) return;
    let oldOrders = [], newOrders = [];
    try { oldOrders = oldValue ? JSON.parse(oldValue) : []; newOrders = JSON.parse(newValue); } catch { return; }
    if (!Array.isArray(newOrders)) return;
    const oldById = new Map((Array.isArray(oldOrders) ? oldOrders : []).map((o) => [o.id, o]));
    const nowMs = nowFn().getTime();
    for (const o of newOrders) {
      if (!o || o.deletedAt) continue;
      const old = oldById.get(o.id);
      const oldIds = new Set((old?.payments || []).map((p) => p.id));
      // Faqat hozirgina kiritilgan to'lovlar (import yoki eski ma'lumot tiklanganda mijozga yuborilmaydi)
      const fresh = (o.payments || []).filter((p) => !p.deletedAt && !oldIds.has(p.id) && p.amount > 0 && (!p.createdAt || nowMs - new Date(p.createdAt).getTime() < 15 * 60 * 1000));
      if (!fresh.length) continue;
      const rcp = recipientFor(o.customer, o.id);
      if (!rcp) continue;
      const sum = fresh.reduce((s, p) => s + p.amount, 0);
      const types = [...new Set(fresh.map((p) => PAY_LABEL[p.paymentType] || p.paymentType).filter(Boolean))].join(", ");
      const debt = debtOf(o);
      const text = [
        `✅ To'lov qabul qilindi`,
        `Buyurtma ${o.orderNumber || ""}: ${money(sum)}${types ? ` (${types})` : ""}`,
        debt > 0 ? `Qoldiq: ${money(debt)}` : `Buyurtma to'liq to'landi.`,
        `Rahmat!`,
      ].join("\n");
      await deliver("receipt", rcp, () => sender.sendText(rcp.peer, text), { orderNumber: o.orderNumber, amount: sum });
    }
  }

  // ---- Qarz eslatmasi mijozga ----
  function remindCandidates(today) {
    const cfg = config();
    const orders = (readJson("uvix:orders", []) || []).filter((o) => o && !o.deletedAt && debtOf(o) > 0);
    const profiles = (readJson("uvix:customers", []) || []).filter((p) => p && !p.deletedAt);
    const owner = new Map();
    profiles.forEach((p) => [p.key, ...(p.aliases || [])].forEach((k) => owner.set(k, p)));
    const groups = new Map();
    for (const o of orders) {
      const k = custKey(o.customer); const p = owner.get(k); const gk = p ? `p:${p.id}` : k;
      const g = groups.get(gk) || { key: gk, name: o.customer, orders: [] };
      g.orders.push(o); groups.set(gk, g);
    }
    const sent = readJson("uvix:custRemind", {});
    return [...groups.values()].map((g) => {
      const oldest = Math.max(...g.orders.map((o) => daysBetween(o.date, today)));
      return { ...g, oldest, debt: g.orders.reduce((s, o) => s + debtOf(o), 0), last: sent[g.key] || null };
    }).filter((g) => g.oldest >= cfg.debtDays && (!g.last || daysBetween(g.last, today) >= cfg.remindEvery)).sort((a, b) => b.debt - a.debt);
  }
  function remindText(g, cfg) {
    const list = g.orders.sort((a, b) => String(a.date).localeCompare(String(b.date))).map((o) => `• ${o.orderNumber || "—"} (${dayLabel(o.date)}): ${money(debtOf(o))}`).join("\n");
    return [
      `Assalomu alaykum!`,
      `UVIX'dan eslatma: buyurtmalaringiz bo'yicha ${money(g.debt)} to'lov qolgan.`,
      list,
      "",
      cardLine(cfg) || null,
      `Agar to'lagan bo'lsangiz, iltimos chek rasmini shu yerga yuboring. Rahmat!`,
    ].filter((x) => x != null).join("\n");
  }
  let reminding = false;
  async function tick() {
    const cfg = config();
    if (!cfg.debtRemind || reminding) return;
    const now = local(nowFn());
    if (!cfg.days.includes(now.weekday) || now.hm < cfg.remindAt || now.hm > "19:00") return;
    const state = readJson("uvix:custRemindDay", {});
    if (state.date === now.date && state.done) return;
    reminding = true;
    try {
      let count = state.date === now.date ? state.count || 0 : 0;
      for (const g of remindCandidates(now.date)) {
        if (count >= cfg.maxPerDay) break;
        const rcp = recipientFor(g.orders[0].customer, null);
        if (!rcp) continue;
        const r = await deliver("debt", rcp, () => sender.sendText(rcp.peer, remindText({ ...g, rcpName: rcp.name }, cfg)), { amount: g.debt });
        const sentMap = readJson("uvix:custRemind", {}); sentMap[g.key] = now.date; upsertStmt.run("uvix:custRemind", JSON.stringify(sentMap));
        count++;
        upsertStmt.run("uvix:custRemindDay", JSON.stringify({ date: now.date, count }));
        if (!r.ok && /ulanmagan/.test(r.error || "")) break;
        await sleep(pauseMs); // Telegram cheklovlariga tushmaslik uchun xabarlar orasida pauza
      }
      upsertStmt.run("uvix:custRemindDay", JSON.stringify({ date: now.date, count, done: true }));
    } finally { reminding = false; }
  }
  const timer = setInterval(() => tick().catch((e) => console.error("Mijozga qarz eslatmasi:", e.message)), 60 * 1000);
  if (timer.unref) timer.unref();

  // ==================== API ====================
  const staff = (req, res) => { if (isWorker(req.user)) { res.status(403).json({ error: "forbidden" }); return false; } return true; };
  const publicCfg = (c) => ({ cardNumber: c.cardNumber, cardHolder: c.cardHolder, managerPhone: c.managerPhone, managerName: c.managerName, companyLine: c.companyLine });

  app.get("/api/customer-msg/config", requireAuth, (req, res) => {
    if (!staff(req, res)) return;
    const c = config();
    res.json({ config: req.user.role === "admin" ? c : publicCfg(c), connected: !!sender?.isConnected?.() });
  });
  app.put("/api/customer-msg/config", requireAuth, requireAdmin, (req, res) => {
    const cur = config(), b = req.body || {};
    const str = (v, n, d) => (typeof v === "string" ? v.trim().slice(0, n) : d);
    const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
    const next = {
      cardNumber: str(b.cardNumber, 40, cur.cardNumber), cardHolder: str(b.cardHolder, 60, cur.cardHolder),
      managerPhone: str(b.managerPhone, 40, cur.managerPhone), managerName: str(b.managerName, 60, cur.managerName),
      companyLine: str(b.companyLine, 80, cur.companyLine),
      receipt: b.receipt == null ? cur.receipt : !!b.receipt,
      debtRemind: b.debtRemind == null ? cur.debtRemind : !!b.debtRemind,
      debtDays: int(b.debtDays, 1, 120, cur.debtDays), remindEvery: int(b.remindEvery, 3, 60, cur.remindEvery),
      remindAt: /^\d{2}:\d{2}$/.test(b.remindAt || "") ? b.remindAt : cur.remindAt,
      days: Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : cur.days,
      maxPerDay: int(b.maxPerDay, 1, 100, cur.maxPerDay),
    };
    upsertStmt.run("uvix:custMsgConfig", JSON.stringify(next));
    res.json({ config: next, connected: !!sender?.isConnected?.() });
  });
  app.post("/api/customer-msg/recipient", requireAuth, (req, res) => {
    if (!staff(req, res)) return;
    const o = (readJson("uvix:orders", []) || []).find((x) => x.id === req.body?.orderId);
    if (!o) return res.status(404).json({ error: "not_found", message: "Buyurtma topilmadi" });
    const r = recipientFor(o.customer, o.id);
    res.json({ recipient: r ? { label: r.label, via: r.via, name: r.name } : null, connected: !!sender?.isConnected?.() });
  });
  app.post("/api/customer-msg/invoice", requireAuth, async (req, res) => {
    if (!staff(req, res)) return;
    const { orderId, image, caption } = req.body || {};
    const o = (readJson("uvix:orders", []) || []).find((x) => x.id === orderId);
    if (!o) return res.status(404).json({ error: "not_found", message: "Buyurtma topilmadi" });
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ""));
    if (!m || m[2].length > 4 * 1024 * 1024) return res.status(400).json({ error: "bad_image", message: "Hisob-faktura rasmi noto'g'ri" });
    const rcp = recipientFor(o.customer, o.id);
    if (!rcp) return res.status(400).json({ error: "no_recipient", message: "Mijozning Telegrami topilmadi — mijoz kartasida @username kiriting yoki CRM'da chatini bog'lang" });
    const text = String(caption || "").slice(0, 1000);
    const r = await deliver("invoice", rcp, () => sender.sendImage(rcp.peer, m[2], text, m[1]), { orderNumber: o.orderNumber, amount: debtOf(o), by: req.user.name });
    if (!r.ok) return res.status(502).json({ error: "send_failed", message: r.error });
    res.json({ ok: true, to: rcp.label });
  });
  app.get("/api/customer-msg/log", requireAuth, requireAdmin, (req, res) => res.json({ log: readJson("uvix:custMsgLog", []).slice(0, 100) }));
  app.get("/api/customer-msg/preview-remind", requireAuth, requireAdmin, (req, res) => {
    const cfg = config(); const today = local(nowFn()).date;
    const list = remindCandidates(today).map((g) => ({ name: g.name, debt: g.debt, oldest: g.oldest, last: g.last, to: recipientFor(g.orders[0].customer, null)?.label || null }));
    const sample = list.find((x) => x.to);
    const g = sample ? remindCandidates(today).find((x) => x.name === sample.name) : null;
    res.json({ list: list.slice(0, 50), sample: g ? remindText(g, cfg) : null });
  });

  return { onOrdersChanged, tick, recipientFor };
};
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
