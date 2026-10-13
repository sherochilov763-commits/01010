"use strict";

// Read-only, finance-free API adapter for a separate Telegram AI workflow.
// No task/order writes are accepted through this endpoint.
const crypto = require("crypto");

const STAGE = { new: "Navbatda", design: "Dizaynda", printing: "UV bosmada", ready: "Tayyor", delivered: "Topshirildi" };
const TASK = { new: "Yangi", in_progress: "Jarayonda", done: "Tugallandi", unassigned: "Mas'ul biriktirilmagan" };
const WRITE_ACTIONS = new Set(["create_task", "complete_task", "update_order_status", "approve", "reject"]);
const ALLOWED = new Set(["order_details", "list_orders", "list_tasks", "overdue_tasks", "daily_report"]);
const cut = (value, max = 90) => String(value == null ? "" : value).replace(/[\r\n\t]/g, " ").trim().slice(0, max);
const isoDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const stamp = (value) => { const d = Date.parse(value); return Number.isFinite(d) ? d : null; };

function registerAiBridge(app, { getStmt, readEmployees }) {
  const read = (key, fallback) => {
    try { const row = getStmt.get(key); return row ? JSON.parse(row.value) : fallback; } catch { return fallback; }
  };
  const load = (key) => {
    const value = read(key, []);
    return Array.isArray(value) ? value : [];
  };
  const isValidSecret = () => typeof process.env.UVIX_AI_BRIDGE_SECRET === "string" && process.env.UVIX_AI_BRIDGE_SECRET.length >= 32;
  const requireBridge = (req, res, next) => {
    if (!isValidSecret()) return res.status(503).json({ status: "error", message: "AI bridge not configured" });
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    const candidate = match ? match[1] : "";
    const expected = process.env.UVIX_AI_BRIDGE_SECRET;
    const left = crypto.createHash("sha256").update(candidate).digest();
    const right = crypto.createHash("sha256").update(expected).digest();
    if (!candidate || !crypto.timingSafeEqual(left, right)) return res.status(401).json({ status: "forbidden", message: "AI bridge authorization failed" });
    next();
  };
  // Prevent unbounded automated read requests from a compromised bot/account.
  const rate = new Map();
  function allowedRate(key) {
    const now = Date.now();
    if (rate.size > 2000) for (const [k, r] of rate) if (r.expires < now) rate.delete(k);
    const r = rate.get(key);
    if (!r || r.expires < now) { rate.set(key, { n: 1, expires: now + 60000 }); return true; }
    r.n += 1;
    return r.n <= 20;
  }
  function actor(body) {
    const id = cut(body?.actor?.telegram_user_id, 30);
    const chatId = cut(body?.actor?.chat_id, 30);
    if (!/^\d{3,20}$/.test(id) || chatId !== id) return null; // private chats only
    const staffLinks = read("uvix:staffTg", {});
    if (!staffLinks || typeof staffLinks !== "object" || Array.isArray(staffLinks)) return null;
    const empId = Object.keys(staffLinks).find(k => String(staffLinks[k]?.chatId) === chatId);
    const user = empId && readEmployees().find(e => String(e.id) === String(empId));
    if (!user || !user.role || user.disabled === true) return null;
    return user;
  }
  function getTasks() {
    const output = [];
    for (const [source, list] of [["lead", load("uvix:leads")], ["order", load("uvix:orders")]]) {
      for (const obj of list) {
        if (!obj || obj.deletedAt || (source === "lead" && obj.stage === "lost")) continue;
        for (const kind of ["design", "print"]) {
          const item = obj[kind];
          if (!item || !item.status) continue;
          output.push({
            id: source === "order" ? `o:${cut(obj.id, 70)}:${kind}` : `${cut(obj.id, 70)}:${kind}`,
            number: cut(obj.orderNumber || obj.orderId || obj.id, 45),
            title: cut(obj.title || obj.jobTitle || (kind === "design" ? "Dizayn" : "UV bosma"), 90),
            kind, status: item.status,
            assigneeId: item.assigneeId == null ? null : String(item.assigneeId),
            deadline: cut(item.deadline, 28),
          });
        }
      }
    }
    return output;
  }
  const nonFinalOrder = o => o && !o.deletedAt && !["delivered", "cancelled"].includes(o.prodStage);
  const orderStage = o => STAGE[o.prodStage] || cut(o.prodStage || o.stage || "new", 40);
  const canSeeAll = user => user.role === "admin" || user.role === "manager";
  const tasksFor = user => {
    const all = getTasks();
    return canSeeAll(user) ? all : all.filter(t => t.assigneeId === String(user.id));
  };
  function handle(action, fields, user) {
    const orders = load("uvix:orders").filter(nonFinalOrder);
    if (action === "list_tasks" || action === "overdue_tasks") {
      let tasks = tasksFor(user);
      if (action === "overdue_tasks") {
        const today = isoDay(new Date());
        tasks = tasks.filter(t => t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline.slice(0, 10)) && t.deadline.slice(0, 10) < today && t.status !== "done");
      }
      const title = action === "overdue_tasks" ? "Muddati o'tgan vazifalar" : "Vazifalar";
      const lines = tasks.slice(0, 30).map(t => `#${t.number} · ${t.title} · ${TASK[t.status] || cut(t.status, 25)}${t.deadline ? " · " + t.deadline : ""}`);
      return { status: "ok", message: `${title}: ${tasks.length} ta.\n${lines.join("\n") || "Topilmadi."}`.slice(0, 3800) };
    }
    if (!canSeeAll(user)) return { status: "forbidden", message: "Buyurtmalar ma'lumotini faqat rahbar yoki menejer ko'ra oladi." };
    if (action === "order_details") {
      const needle = cut(fields?.order_id, 90);
      if (!needle) return { status: "error", message: "Buyurtma raqamini ko'rsating." };
      const item = load("uvix:orders").find(o => o && !o.deletedAt && (String(o.id) === needle || String(o.orderNumber) === needle));
      if (!item) return { status: "not_found", message: "Bu raqamli buyurtma topilmadi." };
      const active = [item.design, item.print].filter(Boolean).map((x, i) => `${i ? "Pechat" : "Dizayn"}: ${TASK[x.status] || cut(x.status, 25)}`).join("; ");
      return { status: "ok", message: `Buyurtma #${cut(item.orderNumber || item.id, 45)}\nIsh: ${cut(item.title || item.materialType, 100)}\nBosqich: ${orderStage(item)}${active ? "\n" + active : ""}` };
    }
    if (action === "list_orders") {
      const lines = orders.slice(0, 30).map(o => `#${cut(o.orderNumber || o.id, 45)} · ${cut(o.title || o.materialType, 55)} · ${orderStage(o)}`);
      return { status: "ok", message: `Faol buyurtmalar: ${orders.length} ta.\n${lines.join("\n") || "Topilmadi."}`.slice(0, 3800) };
    }
    if (action === "daily_report") {
      const overdue = getTasks().filter(t => t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline.slice(0, 10)) && t.deadline.slice(0, 10) < isoDay(new Date()) && t.status !== "done");
      return { status: "ok", message: `Operatsion hisobot: faol buyurtmalar — ${orders.length} ta, tayyor (topshirilmagan) — ${orders.filter(o => o.prodStage === "ready").length} ta, kechikkan ishlab chiqarish vazifalari — ${overdue.length} ta. Moliyaviy ma'lumotlar kiritilmadi.` };
    }
    return { status: "error", message: "Qo'llab-quvvatlanmaydigan so'rov." };
  }
  app.post("/api/ai-bridge/execute", requireBridge, (req, res) => {
    const user = actor(req.body || {});
    if (!user) return res.status(403).json({ status: "forbidden", message: "Telegram akkaunt CRM xodimiga bog'lanmagan." });
    if (!allowedRate(String(user.id))) return res.status(429).json({ status: "error", message: "So'rovlar limiti tugadi. Bir daqiqadan keyin qayta urinib ko'ring." });
    const action = cut(req.body?.action, 50);
    if (WRITE_ACTIONS.has(action)) return res.status(403).json({ status: "forbidden", message: "Bot hozir faqat ma'lumot o'qiydi; vazifalar yoki buyurtmalarni o'zgartira olmaydi." });
    if (!ALLOWED.has(action)) return res.status(400).json({ status: "error", message: "Noma'lum so'rov turi." });
    return res.json(handle(action, req.body?.fields || {}, user));
  });
  app.post("/api/ai-bridge/scheduled", requireBridge, (req, res) => {
    const action = cut(req.body?.action, 50);
    if (action !== "daily_report" && action !== "overdue_summary") return res.status(400).json({ status: "error", message: "Noma'lum monitoring turi." });
    const admins = readEmployees().filter(e => e.role === "admin");
    if (!admins.length) return res.status(503).json({ status: "error", message: "Rahbar topilmadi." });
    return res.json(handle(action === "overdue_summary" ? "overdue_tasks" : "daily_report", {}, admins[0]));
  });
}

module.exports = registerAiBridge;
