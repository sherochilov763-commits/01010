// task-notify.js — dizayner/pechatchiga yangi vazifa berilganda Telegram'iga shaxsan xabar.
// Vazifa qayerdan berilgani muhim emas (smeta, buyurtma paneli, CRM, dizayn tugab pechatga o'tishi) —
// har 20 soniyada «faol vazifalar» ro'yxati olinadi va yangi paydo bo'lganlari yuboriladi.
// Faol: mas'ul tayinlangan va holati «new» yoki «in_progress». Yuborilganlar: uvix:taskNotified.
const KEY = "uvix:taskNotified";
const KINDS = { design: "🎨 Dizayn", print: "🖨 Pechat" };

function activeTasks(orders, leads) {
  const out = [];
  const take = (src, id, title, number) => {
    for (const kind of Object.keys(KINDS)) {
      const t = src?.[kind];
      if (!t?.assigneeId) continue;
      if (t.status !== "new" && t.status !== "in_progress") continue;
      out.push({ key: `${id}:${kind}:${t.assigneeId}`, assigneeId: t.assigneeId, kind, title, number, format: t.format || "", deadline: t.deadline || "" });
    }
  };
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || o.deletedAt) continue;
    take(o, `o:${o.id}`, o.title || o.materialType || o.customer || "Buyurtma", o.orderNumber || "");
  }
  for (const l of Array.isArray(leads) ? leads : []) {
    if (!l || l.deletedAt || l.orderId) continue; // buyurtmaga aylangan lid vazifasi buyurtmada
    take(l, `l:${l.id}`, l.customer || "Vazifa", "");
  }
  return out;
}

function createTaskNotifier({ getStmt, upsertStmt, sendToEmployee, readEmployees, appUrl = () => "", interval = 20000 }) {
  const read = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  let busy = false;
  async function check() {
    if (busy) return 0;
    busy = true;
    try {
      const list = activeTasks(read("uvix:orders", []), read("uvix:leads", []));
      const prev = read(KEY, null);
      const keys = new Set(list.map((t) => t.key));
      // Birinchi ishga tushishda — eskilarini «yuborilgan» deb belgilaymiz (to'lqin bo'lmasin)
      if (!prev) { upsertStmt.run(KEY, JSON.stringify([...keys])); return 0; }
      const seen = new Set(prev);
      const emps = new Map(readEmployees().map((e) => [e.id, e]));
      let sent = 0;
      for (const t of list) {
        if (seen.has(t.key)) continue;
        const emp = emps.get(t.assigneeId);
        if (!emp) continue;
        const link = appUrl();
        const extra = /^https:\/\//.test(link) ? { reply_markup: { inline_keyboard: [[{ text: "Vazifani ochish", url: link }]] } } : undefined;
        const lines = [`${KINDS[t.kind]} — <b>yangi vazifa</b>`, "", `<b>${esc(t.title)}</b>${t.number ? ` · ${esc(t.number)}` : ""}`, t.format ? `O'lcham: ${esc(t.format)}` : "", t.deadline ? `Muddat: ${esc(t.deadline)}` : ""].filter(Boolean);
        if (await sendToEmployee(emp.id, lines.join("\n"), extra)) sent++;
      }
      // faqat hozir faol bo'lganlarni eslab qolamiz (qayta tayinlansa — yana yuboriladi)
      upsertStmt.run(KEY, JSON.stringify([...keys]));
      return sent;
    } finally { busy = false; }
  }
  const timer = interval ? setInterval(() => check().catch((e) => console.error("Vazifa xabari:", e.message)), interval) : null;
  if (timer?.unref) timer.unref();
  return { check, activeTasks };
}
const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

module.exports = { createTaskNotifier, activeTasks };
