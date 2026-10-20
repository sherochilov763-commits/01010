// customer-msg.js — mijozga Telegram xabarlari (sizning Telegram akkauntingiz — userbot orqali):
//   • Hisob-faktura — faqat qo'lda: xodim «Hisob-faktura yuborish»ni bosadi (rasm brauzerda chiziladi)
//   • «To'lov qabul qilindi» — buyurtmaga yangi to'lov kiritilganda avtomatik (kvitansiya)
//   • «Buyurtmangiz tayyor» — pechat tugaganda yoki xodim «Tayyor» deb belgilaganda (sozlamada yoqilsa)
//   • Qarz eslatmasi — qarz N kundan oshsa, mijozga yumshoq eslatma (har mijozga ko'pi bilan har N kunda 1 marta)
//
// Qabul qiluvchi: mijozning CRM lididagi Telegram chati (eng ishonchli), bo'lmasa — mijozlar bazasidagi
// yoki liddagi @username. Telegrami topilmagan mijozga hech narsa yuborilmaydi.
//
// XAVFSIZLIK (2026-10): sukut bo'yicha hech narsa avtomatik yuborilmaydi — kvitansiya, «tayyor» va qarz eslatmasi
// «Navbat»ga tushadi (uvix:custMsgQueue); xodim matnni ko'rib «Yuborish» yoki «Bekor»ni bosadi. Yuborishdan oldin matn
// joriy ma'lumotdan qayta tuziladi: to'lov o'chirilgan bo'lsa — xabar bekor, summa o'zgargan bo'lsa — yangi summa.
// Shubhali holatlar (ortiqcha to'lov, kelishuv 0, juda katta summa, yaqinda to'lagan mijozga qarz eslatmasi) belgilanadi.
// cfg.paused — «Mijozga xabarlarni to'xtatish»: hech qanday xabar (hisob-faktura ham) ketmaydi.
// cfg.auto = { receipt, ready, debt } — rahbar keyin qaytadan avtomat yoqishi mumkin (shubhali xabar baribir navbatda qoladi).
//
// Saqlash (ichki kalitlar): uvix:custMsgConfig, uvix:custMsgLog (oxirgi 300 ta), uvix:custRemind ({ [mijoz]: sana }), uvix:custMsgQueue
// fs yo'q: yuborish tashqaridan beriladi — sender = { isConnected(), sendText(peer, text), sendImage(peer, base64, caption) }

const TZ = "Asia/Tashkent";
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DEFAULT_CONFIG = {
  cardNumber: "", cardHolder: "", managerPhone: "", managerName: "", companyLine: "UV bosma ustaxonasi",
  receipt: true, // to'lov qabul qilindi
  readyNotify: false, // buyurtma tayyor bo'lganda «olib ketishingiz mumkin»
  debtRemind: false, debtDays: 7, remindEvery: 7, remindAt: "11:00", days: [1, 2, 3, 4, 5, 6], maxPerDay: 20,
  auto: { receipt: false, ready: false, debt: false }, // false — navbatga (qo'lda tasdiqlash)
  paused: false, // true — mijozga hech narsa yuborilmaydi
};
const BIG_SUM = 50000000; // bundan katta bitta to'lov — shubhali (xato kiritilgan bo'lishi mumkin)

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
  const config = () => { const c = { ...DEFAULT_CONFIG, ...readJson("uvix:custMsgConfig", {}) }; c.auto = { ...DEFAULT_CONFIG.auto, ...(c.auto || {}) }; return c; };
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
  // Yo'nalish rekvizitlari (Sozlamalar → Yo'nalishlar): to'ldirilgan maydonlar umumiy rekvizitlar o'rniga ishlatiladi
  const PROFILE_FIELDS = ["companyLine", "cardNumber", "cardHolder", "managerPhone", "managerName"];
  function withLine(cfg, order) {
    const line = order?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT";
    const prof = (readJson("uvix:settings", {}) || {}).lineProfiles?.[line] || {};
    const out = { ...cfg };
    for (const k of PROFILE_FIELDS) if (typeof prof[k] === "string" && prof[k].trim()) out[k] = prof[k].trim();
    return out;
  }
  // Mijozga ko'rinadigan nom — yo'nalish nomi (ONYX mijoziga «UVIX» deb yozilmaydi)
  const brandOf = (order) => { const l = order?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT"; const nm = (readJson("uvix:settings", {}) || {}).lineProfiles?.[l]?.brandName; return (typeof nm === "string" && nm.trim()) || l; };
  const cardLine = (cfg) => (cfg.cardNumber ? `Karta: ${cfg.cardNumber}${cfg.cardHolder ? ` (${cfg.cardHolder})` : ""}` : "");

  async function deliver(type, rcp, fn, extra) {
    if (config().paused) { log({ type, customer: rcp?.name, to: rcp?.label, ok: false, error: "Mijozga xabarlar to'xtatilgan", ...extra }); return { ok: false, error: "Mijozga xabarlar to'xtatilgan (Mijozlar → Xabarlar)" }; }
    if (!sender?.isConnected?.()) { log({ type, customer: rcp?.name, to: rcp?.label, ok: false, error: "Telegram akkaunt ulanmagan", ...extra }); return { ok: false, error: "Telegram akkaunt ulanmagan (Sozlamalar → Telegram akkaunt)" }; }
    try { await fn(); log({ type, customer: rcp.name, to: rcp.label, ok: true, ...extra }); return { ok: true }; }
    catch (e) { const error = String(e?.message || e).slice(0, 200); log({ type, customer: rcp.name, to: rcp.label, ok: false, error, ...extra }); return { ok: false, error }; }
  }

  // ==================== NAVBAT ====================
  const QKEY = "uvix:custMsgQueue";
  const qid = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const readQ = () => { const q = readJson(QKEY, []); return Array.isArray(q) ? q : []; };
  const writeQ = (q) => {
    // kutilayotganlar hammasi qoladi; bajarilgan/bekor qilinganlardan — oxirgi 100 tasi
    const pend = q.filter((x) => x.status === "pending"), done = q.filter((x) => x.status !== "pending").slice(0, 100);
    upsertStmt.run(QKEY, JSON.stringify([...pend, ...done]));
  };
  const lineOfOrder = (o) => (o?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
  const ordersNow = () => (readJson("uvix:orders", []) || []).filter((o) => o && !o.deletedAt);

  // ---- Matnlar (har safar joriy ma'lumotdan) ----
  function receiptOf(item, orders) {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const list = item.orderIds.map((id) => byId.get(id)).filter(Boolean);
    const pays = [];
    for (const o of list) for (const p of o.payments || []) if (!p.deletedAt && item.payIds.includes(p.id)) pays.push({ ...p, order: o });
    if (!list.length || !pays.length) return { cancel: "To'lov o'chirildi yoki buyurtma topilmadi" };
    const sum = pays.reduce((s, p) => s + (p.amount || 0), 0);
    const types = [...new Set(pays.map((p) => PAY_LABEL[p.paymentType] || p.paymentType).filter(Boolean))].join(", ");
    const debt = list.reduce((s, o) => s + debtOf(o), 0);
    const many = list.length > 1;
    const text = [
      many ? `✅ To'lov qabul qilindi: ${money(sum)}${types ? ` (${types})` : ""}` : `✅ To'lov qabul qilindi`,
      many ? `Buyurtmalar: ${list.map((o) => o.orderNumber).join(", ")}` : `Buyurtma ${list[0].orderNumber || ""}: ${money(sum)}${types ? ` (${types})` : ""}`,
      debt > 0 ? `Qoldiq: ${money(debt)}` : many ? `Buyurtmalar to'liq to'landi.` : `Buyurtma to'liq to'landi.`,
      `Rahmat!`,
    ].join("\n");
    const flags = [];
    for (const o of list) {
      if (!(o.agreementUzs > 0)) flags.push(`${o.orderNumber}: kelishuv summasi 0`);
      else if (paidOf(o) > o.agreementUzs) flags.push(`${o.orderNumber}: ortiqcha to'langan ${money(paidOf(o) - o.agreementUzs)}`);
    }
    if (pays.some((p) => p.amount >= BIG_SUM)) flags.push(`Juda katta summa (${money(Math.max(...pays.map((p) => p.amount)))}) — xato kiritilmaganini tekshiring`);
    return { text, amount: sum, flags, orderNumbers: list.map((o) => o.orderNumber).join(", "), customer: list[0].customer, line: lineOfOrder(list[0]) };
  }
  function readyOf(item, orders) {
    const cfg = config();
    const byId = new Map(orders.map((o) => [o.id, o]));
    const list = item.orderIds.map((id) => byId.get(id)).filter((o) => o && (o.prodStage === "ready" || o.prodStage === "install"));
    if (!list.length) return { cancel: "Buyurtma endi «Tayyor» holatida emas" };
    const debt = list.reduce((s, o) => s + debtOf(o), 0);
    const what = list.length > 1 ? list.map((o) => `• ${o.title || o.materialType || "Buyurtma"} (${o.orderNumber})`).join("\n") : `${list[0].title || list[0].materialType || "Buyurtma"} (${list[0].orderNumber})`;
    const lc = withLine(cfg, list[0]);
    const text = [
      list.length > 1 ? `✅ Buyurtmalaringiz tayyor!` : `✅ Buyurtmangiz tayyor!`, what, `Olib ketishingiz mumkin.`,
      debt > 0 ? `To'lanishi kerak: ${money(debt)}` : "",
      lc.managerPhone ? `Savollar bo'yicha: ${lc.managerPhone}${lc.managerName ? ` (${lc.managerName})` : ""}` : "",
    ].filter(Boolean).join("\n");
    const flags = list.filter((o) => !(o.agreementUzs > 0)).map((o) => `${o.orderNumber}: kelishuv summasi 0`);
    return { text, amount: debt, flags, orderNumbers: list.map((o) => o.orderNumber).join(", "), customer: list[0].customer, line: lineOfOrder(list[0]) };
  }
  function debtOfGroup(item, orders, today) {
    const g = groupFor(item.groupKey, orders, today);
    if (!g || !g.orders.length) return { cancel: "Mijozda qarz qolmadi" };
    const cfg = config();
    const flags = [];
    if (g.lastPaid && daysBetween(g.lastPaid, today) <= 3) flags.push(`Yaqinda to'lagan (${dayLabel(g.lastPaid)})`);
    if (g.overpaid > 0) flags.push(`Boshqa buyurtmada ortiqcha to'lov bor: ${money(g.overpaid)}`);
    return { text: remindText(g, cfg), amount: g.debt, flags, orderNumbers: g.orders.map((o) => o.orderNumber).join(", "), customer: g.name, line: lineOfOrder(g.orders[0]) };
  }
  function build(item, orders = ordersNow(), today = local(nowFn()).date) {
    return item.type === "receipt" ? receiptOf(item, orders) : item.type === "ready" ? readyOf(item, orders) : debtOfGroup(item, orders, today);
  }
  // Navbatga qo'shish (yoki avtomatik yoqilgan bo'lsa — shubhasiz xabarni darhol yuborish)
  async function enqueue(base, rcp) {
    const cfg = config();
    const built = build(base);
    if (built.cancel) return { skipped: built.cancel };
    if (cfg.auto?.[base.type] && !base.manual && !cfg.paused && !built.flags.length) {
      return deliver(base.type, rcp, () => sender.sendText(rcp.peer, built.text), { orderNumber: built.orderNumbers, amount: built.amount, text: built.text, by: "avtomatik" });
    }
    const q = readQ();
    // bir xil narsa uchun ikkinchi xabar emas — mavjudi yangilanadi
    const same = q.find((x) => x.status === "pending" && x.type === base.type && (base.groupKey ? x.groupKey === base.groupKey : base.type === "ready" ? x.orderIds.join() === base.orderIds.join() : false));
    const item = { ...(same || { id: qid(), createdAt: nowFn().toISOString(), status: "pending" }), ...base, to: rcp.label, via: rcp.via, peer: rcp.peer, customer: built.customer, line: built.line, text: built.text, amount: built.amount, flags: built.flags, orderNumbers: built.orderNumbers, updatedAt: nowFn().toISOString() };
    if (base.payIds && same) item.payIds = [...new Set([...(same.payIds || []), ...base.payIds])];
    writeQ([item, ...q.filter((x) => x.id !== item.id)]);
    return { queued: item.id };
  }

  // ---- To'lov qabul qilindi (buyurtmalar o'zgarganda server chaqiradi) ----
  async function onOrdersChanged(oldValue, newValue) {
    const cfg = config();
    let oldOrders = [], newOrders = [];
    try { oldOrders = oldValue ? JSON.parse(oldValue) : []; newOrders = JSON.parse(newValue); } catch { return; }
    if (!Array.isArray(newOrders)) return;
    // Navbatdagi kvitansiyalar: to'lov o'chirilsa — bekor, summa o'zgarsa — matn yangilanadi
    refreshQueue(newOrders.filter((o) => o && !o.deletedAt));
    if (!cfg.receipt) return;
    const oldById = new Map((Array.isArray(oldOrders) ? oldOrders : []).map((o) => [o.id, o]));
    const nowMs = nowFn().getTime();
    // Bitta umumiy to'lov (batchId) bir nechta buyurtmaga bo'lingan bo'lsa — mijozga bitta kvitansiya
    const batches = new Map();
    for (const o of newOrders) {
      if (!o || o.deletedAt) continue;
      const old = oldById.get(o.id);
      const oldIds = new Set((old?.payments || []).map((p) => p.id));
      // Faqat hozirgina kiritilgan to'lovlar (import yoki eski ma'lumot tiklanganda mijozga yuborilmaydi)
      const fresh = (o.payments || []).filter((p) => !p.deletedAt && !oldIds.has(p.id) && p.amount > 0 && (!p.createdAt || nowMs - new Date(p.createdAt).getTime() < 15 * 60 * 1000));
      if (!fresh.length) continue;
      const own = fresh.filter((p) => !p.batchId);
      for (const p of fresh.filter((x) => x.batchId)) { const b = batches.get(p.batchId) || { orders: new Map(), pays: [] }; b.orders.set(o.id, o); b.pays.push(p); batches.set(p.batchId, b); }
      if (!own.length) continue;
      const rcp = recipientFor(o.customer, o.id);
      if (!rcp) continue;
      await enqueue({ type: "receipt", orderIds: [o.id], payIds: own.map((p) => p.id) }, rcp);
    }
    for (const b of batches.values()) {
      const list = [...b.orders.values()];
      const rcp = recipientFor(list[0].customer, list[0].id);
      if (!rcp) continue;
      await enqueue({ type: "receipt", orderIds: list.map((o) => o.id), payIds: b.pays.map((p) => p.id) }, rcp);
    }
  }
  function refreshQueue(orders) {
    const q = readQ();
    if (!q.some((x) => x.status === "pending")) return;
    const today = local(nowFn()).date;
    let changed = false;
    const next = q.map((x) => {
      if (x.status !== "pending") return x;
      const b = build(x, orders, today);
      if (b.cancel) { changed = true; return { ...x, status: "cancelled", reason: b.cancel, doneAt: nowFn().toISOString(), by: "tizim" }; }
      if (b.text !== x.text || JSON.stringify(b.flags) !== JSON.stringify(x.flags)) { changed = true; return { ...x, text: b.text, amount: b.amount, flags: b.flags, orderNumbers: b.orderNumbers, updatedAt: nowFn().toISOString() }; }
      return x;
    });
    if (changed) writeQ(next);
  }

  // ---- «Buyurtmangiz tayyor» ----
  // Guruh (bitta smetadan bir nechta buyurtma) bo'lsa — hammasi tayyor bo'lganda bitta xabar
  async function sendReady(order) {
    const cfg = config();
    if (!cfg.readyNotify || !order) return { ok: false, skipped: true };
    let list = [order];
    if (order.groupId) {
      const all = ordersNow().filter((o) => o.groupId === order.groupId);
      if (all.some((o) => o.prodStage !== "ready" && o.prodStage !== "delivered")) return { ok: false, waiting: true };
      list = all.filter((o) => o.prodStage === "ready");
      if (!list.length) return { ok: false, skipped: true };
    }
    const rcp = recipientFor(order.customer, order.id);
    if (!rcp) return { ok: false, error: "no_recipient" };
    return enqueue({ type: "ready", orderIds: list.map((o) => o.id) }, rcp);
  }

  // ---- Qarz eslatmasi mijozga ----
  const groupKeyOf = (name, owner) => { const k = custKey(name); const p = owner.get(k); return p ? `p:${p.id}` : k; };
  const ownerMap = () => { const owner = new Map(); (readJson("uvix:customers", []) || []).filter((p) => p && !p.deletedAt).forEach((p) => [p.key, ...(p.aliases || [])].forEach((k) => owner.set(k, p))); return owner; };
  // Bitta mijozning qarzlari (kelishuvi 0 bo'lgan buyurtma qarz hisoblanmaydi), oxirgi to'lov va ortiqcha to'lov
  function groupFor(groupKey, orders, today) {
    const owner = ownerMap();
    const mine = orders.filter((o) => groupKeyOf(o.customer, owner) === groupKey);
    if (!mine.length) return null;
    const debtors = mine.filter((o) => o.agreementUzs > 0 && debtOf(o) > 0);
    const lastPaid = mine.flatMap((o) => (o.payments || []).filter((p) => !p.deletedAt).map((p) => String(p.date || "").slice(0, 10))).filter(Boolean).sort().pop() || null;
    const overpaid = mine.reduce((s, o) => s + Math.max(0, paidOf(o) - (o.agreementUzs || 0)), 0);
    return { key: groupKey, name: mine[0].customer, orders: debtors, debt: debtors.reduce((s, o) => s + debtOf(o), 0), lastPaid, overpaid, oldest: debtors.length ? Math.max(...debtors.map((o) => daysBetween(o.date, today))) : 0 };
  }
  function remindCandidates(today) {
    const cfg = config();
    const orders = (readJson("uvix:orders", []) || []).filter((o) => o && !o.deletedAt && o.agreementUzs > 0 && debtOf(o) > 0);
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
      `${brandOf(g.orders[0])}'dan eslatma: buyurtmalaringiz bo'yicha ${money(g.debt)} to'lov qolgan.`,
      list,
      "",
      cardLine(withLine(cfg, g.orders[0])) || null,
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
        const r = await enqueue({ type: "debt", groupKey: g.key, orderIds: g.orders.map((o) => o.id) }, rcp);
        if (r.ok) { const sentMap = readJson("uvix:custRemind", {}); sentMap[g.key] = now.date; upsertStmt.run("uvix:custRemind", JSON.stringify(sentMap)); }
        count++;
        upsertStmt.run("uvix:custRemindDay", JSON.stringify({ date: now.date, count }));
        if (r.ok === false && /ulanmagan/.test(r.error || "")) break;
        if (r.ok) await sleep(pauseMs); // Telegram cheklovlariga tushmaslik uchun xabarlar orasida pauza
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
    res.json({ config: req.user.role === "admin" || req.can?.("custmsg.config") ? c : publicCfg(c), connected: !!sender?.isConnected?.() });
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
      readyNotify: b.readyNotify == null ? cur.readyNotify : !!b.readyNotify,
      debtRemind: b.debtRemind == null ? cur.debtRemind : !!b.debtRemind,
      debtDays: int(b.debtDays, 1, 120, cur.debtDays), remindEvery: int(b.remindEvery, 3, 60, cur.remindEvery),
      remindAt: /^\d{2}:\d{2}$/.test(b.remindAt || "") ? b.remindAt : cur.remindAt,
      days: Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : cur.days,
      maxPerDay: int(b.maxPerDay, 1, 100, cur.maxPerDay),
      auto: { receipt: !!(b.auto?.receipt ?? cur.auto.receipt), ready: !!(b.auto?.ready ?? cur.auto.ready), debt: !!(b.auto?.debt ?? cur.auto.debt) },
      paused: b.paused == null ? cur.paused : !!b.paused,
    };
    upsertStmt.run("uvix:custMsgConfig", JSON.stringify(next));
    res.json({ config: next, connected: !!sender?.isConnected?.() });
  });
  app.post("/api/customer-msg/recipient", requireAuth, (req, res) => {
    if (!staff(req, res)) return;
    const o = (readJson("uvix:orders", []) || []).find((x) => x.id === req.body?.orderId && (!req.lineScope || (x.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT") === req.lineScope));
    if (!o) return res.status(404).json({ error: "not_found", message: "Buyurtma topilmadi" });
    const r = recipientFor(o.customer, o.id);
    res.json({ recipient: r ? { label: r.label, via: r.via, name: r.name } : null, connected: !!sender?.isConnected?.() });
  });
  app.post("/api/customer-msg/invoice", requireAuth, async (req, res) => {
    if (!staff(req, res)) return;
    const { orderId, image, caption } = req.body || {};
    const o = (readJson("uvix:orders", []) || []).find((x) => x.id === orderId && (!req.lineScope || (x.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT") === req.lineScope));
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
  // ---- Navbat API ----
  const inScope = (req, x) => !req.lineScope || x.line === req.lineScope;
  const canSend = (req, res) => { if (!staff(req, res)) return false; if (req.user.role === "admin" || !req.can || req.can("invoice")) return true; res.status(403).json({ error: "forbidden", message: "Mijozga xabar yuborish huquqi yo'q" }); return false; };
  app.get("/api/customer-msg/queue", requireAuth, (req, res) => {
    if (!staff(req, res)) return;
    refreshQueue(ordersNow());
    const q = readQ().filter((x) => inScope(req, x));
    const cfg = config();
    res.json({ pending: q.filter((x) => x.status === "pending").map(({ peer, ...x }) => x), recent: q.filter((x) => x.status !== "pending").slice(0, 30).map(({ peer, ...x }) => x), paused: !!cfg.paused, connected: !!sender?.isConnected?.() });
  });
  app.post("/api/customer-msg/queue/:id/send", requireAuth, async (req, res) => {
    if (!canSend(req, res)) return;
    const q = readQ(); const x = q.find((i) => i.id === req.params.id && i.status === "pending" && inScope(req, i));
    if (!x) return res.status(404).json({ error: "not_found", message: "Xabar topilmadi yoki allaqachon yuborilgan" });
    const b = build(x);
    if (b.cancel) { writeQ(q.map((i) => (i.id === x.id ? { ...i, status: "cancelled", reason: b.cancel, doneAt: nowFn().toISOString(), by: "tizim" } : i))); return res.status(409).json({ error: "stale", message: `Yuborilmadi: ${b.cancel}` }); }
    // Xodim ko'rgan matn bilan hozirgi matn farq qilsa — avval yangisini ko'rsatamiz
    if (req.body?.text && req.body.text !== b.text) { writeQ(q.map((i) => (i.id === x.id ? { ...i, text: b.text, amount: b.amount, flags: b.flags } : i))); return res.status(409).json({ error: "changed", message: "Ma'lumot o'zgardi — yangilangan matnni tekshirib, qayta bosing", text: b.text }); }
    const r = await deliver(x.type, { peer: x.peer, label: x.to, name: b.customer }, () => sender.sendText(x.peer, b.text), { orderNumber: b.orderNumbers, amount: b.amount, text: b.text, by: req.user.name });
    if (!r.ok) return res.status(502).json({ error: "send_failed", message: r.error });
    if (x.type === "debt" && x.groupKey) { const sentMap = readJson("uvix:custRemind", {}); sentMap[x.groupKey] = local(nowFn()).date; upsertStmt.run("uvix:custRemind", JSON.stringify(sentMap)); }
    writeQ(readQ().map((i) => (i.id === x.id ? { ...i, status: "sent", text: b.text, doneAt: nowFn().toISOString(), by: req.user.name } : i)));
    res.json({ ok: true, to: x.to });
  });
  app.post("/api/customer-msg/queue/:id/cancel", requireAuth, (req, res) => {
    if (!canSend(req, res)) return;
    const q = readQ(); const x = q.find((i) => i.id === req.params.id && i.status === "pending" && inScope(req, i));
    if (!x) return res.status(404).json({ error: "not_found", message: "Xabar topilmadi" });
    writeQ(q.map((i) => (i.id === x.id ? { ...i, status: "cancelled", reason: String(req.body?.reason || "Xodim bekor qildi").slice(0, 120), doneAt: nowFn().toISOString(), by: req.user.name } : i)));
    res.json({ ok: true });
  });
  // Qo'lda qarz eslatmasi (Dashboard → «Eslatma»): navbatga qo'shiladi, xodim matnni ko'rib yuboradi
  app.post("/api/customer-msg/queue/remind", requireAuth, async (req, res) => {
    if (!canSend(req, res)) return;
    const orders = ordersNow().filter((o) => !req.lineScope || lineOfOrder(o) === req.lineScope);
    const o = orders.find((x) => custKey(x.customer) === custKey(req.body?.customer));
    if (!o) return res.status(404).json({ error: "not_found", message: "Mijoz topilmadi" });
    const key = groupKeyOf(o.customer, ownerMap());
    const rcp = recipientFor(o.customer, null);
    if (!rcp) return res.status(400).json({ error: "no_recipient", message: "Mijozning Telegrami topilmadi — mijoz kartasida @username kiriting yoki CRM'da chatini bog'lang" });
    const r = await enqueue({ type: "debt", groupKey: key, orderIds: orders.filter((x) => groupKeyOf(x.customer, ownerMap()) === key).map((x) => x.id), manual: true }, rcp);
    if (r.skipped) return res.status(409).json({ error: "nothing", message: r.skipped });
    res.json(r);
  });
  app.get("/api/customer-msg/log", requireAuth, requireAdmin, (req, res) => res.json({ log: readJson("uvix:custMsgLog", []).slice(0, 100) }));
  app.get("/api/customer-msg/preview-remind", requireAuth, requireAdmin, (req, res) => {
    const cfg = config(); const today = local(nowFn()).date;
    const list = remindCandidates(today).map((g) => ({ name: g.name, debt: g.debt, oldest: g.oldest, last: g.last, to: recipientFor(g.orders[0].customer, null)?.label || null }));
    const sample = list.find((x) => x.to);
    const g = sample ? remindCandidates(today).find((x) => x.name === sample.name) : null;
    res.json({ list: list.slice(0, 50), sample: g ? remindText(g, cfg) : null });
  });

  return { onOrdersChanged, tick, recipientFor, sendReady, refreshQueue };
};
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
