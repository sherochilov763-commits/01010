// tasks.js — Dizayner va Pechatchi vazifalari
//
// Vazifalar lid ichida saqlanadi:
//   lead.design = { assigneeId, format, fileType, deadline, notes, status, statusAt, startedAt, doneAt }
//   lead.print  = { assigneeId, quality, colorProfile, material, area, deadline, notes, status, ... }
// status: "unassigned" (pechatchi hali tayinlanmagan) | "new" | "in_progress" | "done"
//
// Ishchilar (dizayner/pechatchi) faqat shu yerdagi endpointlar orqali ishlaydi va
// ularga hech qachon summa, to'lov yoki telefon raqami yuborilmaydi.
const crypto = require("crypto");

const KINDS = ["design", "print"];
const STATUS = new Set(["new", "in_progress", "done"]);
const KIND_LABEL = { design: "dizayn", print: "pechat" };
const STATUS_LABEL = { new: "Yangi", in_progress: "Jarayonda", done: "Tugallandi" };

// Menejer eskirgan nusxani saqlasa ham, ishchilar kiritgan holat o'zgarishlari yo'qolmasin
function mergeLeadTaskState(incoming, current) {
  if (!Array.isArray(incoming)) return incoming;
  const byId = new Map((Array.isArray(current) ? current : []).map((l) => [l.id, l]));
  return incoming.map((lead) => {
    const db = lead && byId.get(lead.id);
    if (!db) return lead;
    const out = { ...lead };
    for (const k of KINDS) {
      const d = db[k];
      if (!d) continue;
      const inc = out[k];
      if (!inc) {
        if (d.autoCreated) out[k] = d; // server yaratgan (dizayn tugagach) — saqlab qolamiz
        continue;
      }
      if (d.statusAt && (!inc.statusAt || d.statusAt > inc.statusAt)) {
        out[k] = { ...inc, status: d.status, statusAt: d.statusAt, startedAt: d.startedAt, doneAt: d.doneAt };
      }
    }
    if (db.stageAutoAt && (!out.stageAutoAt || db.stageAutoAt > out.stageAutoAt)) {
      out.stage = db.stage;
      out.stageAutoAt = db.stageAutoAt;
    }
    return out;
  });
}

function registerTaskRoutes(app, { getStmt, upsertStmt, readEmployees, requireAuth, isWorker }) {
  const readJson = (key, fallback) => {
    const row = getStmt.get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  };

  function taskNumber(lead, orders) {
    const order = lead.orderId ? orders.find((o) => o.id === lead.orderId) : null;
    if (order?.orderNumber) return order.orderNumber;
    return "L-" + String(lead.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  }

  // Faqat ishga kerakli maydonlar — pul, telefon, izohdagi summalar yo'q
  function publicTask(lead, kind, orders, empById) {
    const t = lead[kind];
    const details = kind === "design"
      ? [["Format", t.format], ["Fayl turi", t.fileType]]
      : [["Sifat", t.quality], ["Rang profili", t.colorProfile], ["Material", t.material], ["Hajmi", t.area ? `${t.area} kv/m` : ""]];
    return {
      id: `${lead.id}:${kind}`,
      leadId: lead.id,
      kind,
      taskNo: taskNumber(lead, orders),
      jobTitle: lead.jobTitle || (kind === "design" ? "Maket tayyorlash" : "Bosma ish"),
      customer: lead.customer || "",
      status: t.status,
      assigneeId: t.assigneeId || null,
      assigneeName: (t.assigneeId && empById.get(t.assigneeId)?.name) || null,
      deadline: t.deadline || null,
      notes: t.notes || "",
      details: details.filter(([, v]) => v).map(([label, value]) => ({ label, value: String(value) })),
      assignedAt: t.assignedAt || null,
      startedAt: t.startedAt || null,
      doneAt: t.doneAt || null,
    };
  }

  app.get("/api/tasks", requireAuth, (req, res) => {
    const leads = readJson("uvix:leads", []);
    const orders = readJson("uvix:orders", []);
    const empById = new Map(readEmployees().map((e) => [e.id, e]));
    const worker = isWorker(req.user);
    const tasks = [];
    for (const lead of Array.isArray(leads) ? leads : []) {
      for (const kind of KINDS) {
        const t = lead[kind];
        if (!t || !t.status) continue;
        if (worker && t.assigneeId !== req.user.id) continue;
        if (lead.stage === "lost" && t.status !== "done") continue; // bekor qilingan ish
        tasks.push(publicTask(lead, kind, orders, empById));
      }
    }
    res.json({ tasks });
  });

  app.post("/api/tasks/:leadId/:kind/status", requireAuth, (req, res) => {
    const { leadId, kind } = req.params;
    const { status } = req.body || {};
    if (!KINDS.includes(kind) || !STATUS.has(status)) return res.status(400).json({ error: "bad_request" });
    const leads = readJson("uvix:leads", []);
    const lead = leads.find((l) => l.id === leadId);
    const t = lead?.[kind];
    if (!t || !t.status) return res.status(404).json({ error: "not_found", message: "Vazifa topilmadi" });
    const worker = isWorker(req.user);
    if (worker && t.assigneeId !== req.user.id) return res.status(403).json({ error: "forbidden", message: "Bu vazifa sizga biriktirilmagan" });
    if (t.status === "unassigned") return res.status(409).json({ error: "unassigned", message: "Vazifaga hali mas'ul tayinlanmagan" });
    if (worker) {
      const allowed = { new: ["in_progress"], in_progress: ["done", "new"], done: [] };
      if (!(allowed[t.status] || []).includes(status)) {
        return res.status(409).json({ error: "bad_transition", message: "Bu holatga o'tkazib bo'lmaydi" });
      }
    }

    const now = new Date().toISOString();
    t.status = status;
    t.statusAt = now;
    if (status === "in_progress" && !t.startedAt) t.startedAt = now;
    if (status === "done") t.doneAt = now;
    if (status !== "done") t.doneAt = null;

    let autoNote = "";
    if (kind === "design" && status === "done") {
      // Dizayn tugadi → ish avtomatik pechatchiga o'tadi
      if (lead.stage === "design" || lead.stage === "negotiation" || lead.stage === "new") {
        lead.stage = "printing";
        lead.stageAutoAt = now;
      }
      if (!lead.print) {
        lead.print = { status: "unassigned", statusAt: now, autoCreated: true };
        autoNote = " → pechatchi tayinlanishi kerak";
      } else if (lead.print.assigneeId && (!lead.print.status || lead.print.status === "unassigned")) {
        lead.print = { ...lead.print, status: "new", statusAt: now, assignedAt: now };
        autoNote = " → pechatchiga o'tdi";
      }
    }
    if (kind === "print" && status === "done" && lead.stage === "printing") {
      lead.stage = "won";
      lead.stageAutoAt = now;
      autoNote = " → Yopilgan";
    }
    upsertStmt.run("uvix:leads", JSON.stringify(leads));

    // O'zgarishlar tarixiga yozamiz (admin ko'radi)
    const audit = readJson("uvix:audit", []);
    if (Array.isArray(audit)) {
      audit.unshift({
        id: crypto.randomBytes(6).toString("hex"),
        who: req.user.name,
        what: `${lead.customer}: ${KIND_LABEL[kind]} — ${STATUS_LABEL[status]}${autoNote}`,
        when: now,
      });
      upsertStmt.run("uvix:audit", JSON.stringify(audit.slice(0, 500)));
    }

    const empById = new Map(readEmployees().map((e) => [e.id, e]));
    res.json({ ok: true, task: publicTask(lead, kind, readJson("uvix:orders", []), empById) });
  });
}

module.exports = { registerTaskRoutes, mergeLeadTaskState, KINDS };
