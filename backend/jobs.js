// jobs.js — «Vazifalar»: aniq odamga aniq ish (o'lchov, montaj, yetkazish, boshqa).
// Saqlanadi: uvix:jobs (faqat server orqali). Dizayn/pechat vazifalari avvalgidek buyurtma ichida (tasks.js).
//
// Zanjir:
//   • Buyurtma «Tayyor» bo'lsa — avtomatik vazifa: UVIXPRINT → «Yetkazish», UVONYX → «Montaj» (mas'ulsiz, menejer tayinlaydi).
//   • Buyurtmaga bog'langan Montaj/Yetkazish «Bajarildi» → buyurtma «Topshirildi» (lid ham yangilanadi).
// Ko'rinish:
//   • Rahbar / «Umumiy» xodim — hammasi; yo'nalish xodimi — o'z yo'nalishi; ishchi (dizayner/pechatchi/montajchi) — faqat o'ziga berilgani.
//   • Mas'ul xodim faqat holat, izoh va rasmni o'zgartiradi.
// Telegram: tayinlanganda mas'ulga xabar; sana+vaqt bo'lsa — 1 soat oldin eslatma.
const crypto = require("crypto");
const { setStage, syncLeadStage } = require("./production");

const KEY = "uvix:jobs";
const CFG = "uvix:jobsConfig"; // { fields: [...], stages: [...], defaults: {...} } — o'z ustunlari, doska holatlari, hamma uchun ko'rinish
const PREFS = "uvix:jobsPrefs"; // { [xodimId]: {...} } — har kimning o'z ko'rinishi
const FIELD_TYPES = ["text", "number", "date", "select", "check", "person"];
const SEEN = "uvix:jobsAutoSeen";
const REM = "uvix:jobsReminded";
const KINDS = { measure: "📏 O'lchov", install: "🛠 Montaj", deliver: "🚚 Yetkazish", other: "📌 Vazifa" };
const STATUSES = ["new", "doing", "done", "cancelled"];
const STATUS_L = { new: "Yangi", doing: "Jarayonda", done: "Bajarildi", cancelled: "Bekor" };
// Tekshiruv ro'yxati — tur bo'yicha standart bandlar (vazifa yaratilganda qo'yiladi, keyin tahrirlanadi)
const CHECKLIST = {
  measure: ["Mijoz bilan kelishildi", "O'lchamlar olindi", "Joy rasmi olindi"],
  install: ["Material yuklandi", "Joy o'lchami tekshirildi", "O'rnatildi", "Mijoz qabul qildi (rasm)"],
  deliver: ["Yuklandi", "Mijozga topshirildi", "Rasm / imzo olindi"],
  other: [],
};
// Taxminiy davomiylik (daqiqa) — Brigada jadvali uchun
const DURATION = { measure: 60, install: 120, deliver: 40, other: 60 };
const lineOfOrder = (o) => (o?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
const { lineOfLead } = require("./lines");
const rid = () => crypto.randomBytes(8).toString("hex");
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const dateOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
const geoOk = (g) => { const lat = Number(g?.lat), lng = Number(g?.lng); return g && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null; };
const timeOk = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || "") ? v : null);

function tashkent(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
// Vazifa vaqti (Toshkent, UTC+5) → ms
const jobTime = (j) => (j.date && j.time ? Date.parse(`${j.date}T${j.time}:00+05:00`) : null);

module.exports = function registerJobs(app, { getStmt, upsertStmt, readEmployees, requireAuth, isWorker, upload = null, sendToEmployee = async () => false, appUrl = () => "", now = () => new Date(), interval = 20000 }) {
  const read = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const jobs = () => { const v = read(KEY, []); return Array.isArray(v) ? v : []; };
  const empMap = () => new Map(readEmployees().map((e) => [e.id, e]));
  const config = () => { const c = read(CFG, {}); return { fields: Array.isArray(c?.fields) ? c.fields : [], stages: Array.isArray(c?.stages) ? c.stages : [], defaults: c?.defaults && typeof c.defaults === "object" ? c.defaults : null }; };
  const fid = (v) => (typeof v === "string" && /^[a-z0-9]{4,24}$/.test(v) ? v : rid());
  function cleanFields(list, prev) {
    const old = new Map((prev || []).map((f) => [f.id, f]));
    return (Array.isArray(list) ? list : []).slice(0, 30).map((f) => {
      const name = str(f?.name, 40); if (!name) return null;
      const type = FIELD_TYPES.includes(f.type) ? f.type : old.get(f.id)?.type || "text";
      return { id: fid(f.id), name, type, options: type === "select" ? [...new Set((Array.isArray(f.options) ? f.options : []).map((o) => str(o, 40)).filter(Boolean))].slice(0, 20) : [],
        kinds: (Array.isArray(f.kinds) ? f.kinds : []).filter((k) => Object.keys(KINDS).includes(k)), archived: !!f.archived };
    }).filter(Boolean);
  }
  function cleanStages(list) {
    return (Array.isArray(list) ? list : []).slice(0, 6).map((x) => { const name = str(x?.name, 30); return name ? { id: fid(x.id), name, color: /^#[0-9a-fA-F]{6}$/.test(x.color || "") ? x.color : "#BE185D" } : null; }).filter(Boolean);
  }
  function cleanPrefs(p) {
    if (!p || typeof p !== "object") return null;
    const keys = (a, n = 40) => (Array.isArray(a) ? a.slice(0, n).map((x) => ({ k: str(x?.k, 40), on: !!x?.on })).filter((x) => x.k) : undefined);
    return { views: keys(p.views, 8), cards: keys(p.cards, 8), columns: keys(p.columns), filters: keys(p.filters, 20), showDone: p.showDone !== false, compact: !!p.compact, mine: !!p.mine };
  }
  // O'z ustunlari qiymati: turi bo'yicha tekshiriladi
  function cleanCustom(input, prev, kind) {
    const out = { ...(prev || {}) };
    if (!input || typeof input !== "object") return out;
    const emps = empMap();
    for (const f of config().fields) {
      if (!(f.id in input)) continue;
      const v = input[f.id];
      if (v === null || v === "" || v === undefined) { delete out[f.id]; continue; }
      if (f.kinds.length && !f.kinds.includes(kind)) continue;
      if (f.type === "text") out[f.id] = str(String(v), 200);
      else if (f.type === "number") { const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); if (Number.isFinite(n)) out[f.id] = n; }
      else if (f.type === "date") { if (dateOk(v)) out[f.id] = v; }
      else if (f.type === "select") { if (f.options.includes(v)) out[f.id] = v; }
      else if (f.type === "check") out[f.id] = !!v;
      else if (f.type === "person") { if (emps.has(String(v))) out[f.id] = String(v); }
    }
    return out;
  }

  function canSee(user, scope, j) {
    if ((j.assigneeIds || []).includes(user.id)) return true;
    if (isWorker(user)) return false;
    return !scope || j.line === scope;
  }
  const isStaffManager = (user) => !isWorker(user);
  function publicJob(j, emps, orders) {
    const o = j.orderId ? orders.find((x) => x && x.id === j.orderId) : null;
    return {
      ...j,
      assignees: (j.assigneeIds || []).map((id) => ({ id, name: emps.get(id)?.name || "—" })),
      order: o ? { id: o.id, orderNumber: o.orderNumber, customer: o.customer, title: o.title || "", prodStage: o.prodStage || "new" } : null,
    };
  }

  async function notifyAssigned(j, ids, emps) {
    const when = j.date ? ` · ${j.date}${j.time ? " " + j.time : ""}` : "";
    const url = appUrl();
    for (const id of ids) {
      const text = `${KINDS[j.kind] || "📌 Vazifa"}${when}\n<b>${esc(j.title)}</b>${j.address ? `\n📍 ${esc(j.address)}` : ""}${j.phone ? `\n📞 ${esc(j.phone)}` : ""}${url ? `\n\n${url}` : ""}`;
      try { await sendToEmployee(id, text); } catch { /* xabar ixtiyoriy */ }
    }
    void emps;
  }
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function clean(b, prev, user, scope, orders) {
    const kind = Object.keys(KINDS).includes(b.kind) ? b.kind : prev?.kind || "other";
    // Yuborilmagan maydon — avvalgisi qoladi (masalan, faqat holat o'zgartirilganda)
    const orderIdIn = b.orderId === undefined ? prev?.orderId || null : b.orderId || null;
    const order = orderIdIn ? orders.find((o) => o && o.id === orderIdIn && !o.deletedAt) : null;
    if (orderIdIn && !order) throw Object.assign(new Error("Buyurtma topilmadi"), { status: 404 });
    if (order && scope && lineOfOrder(order) !== scope) throw Object.assign(new Error("Buyurtma topilmadi"), { status: 404 });
    // Lid (CRM) — masalan, UVONYX o'lchovi: bajarilsa lid «Smeta»ga o'tadi
    const leadIdIn = b.leadId === undefined ? prev?.leadId || null : b.leadId || null;
    const lead = leadIdIn ? (read("uvix:leads", []) || []).find((l) => l && l.id === leadIdIn && !l.deletedAt) : null;
    if (leadIdIn && (!lead || (scope && lineOfLead(lead) !== scope))) throw Object.assign(new Error("Lid topilmadi"), { status: 404 });
    const line = order ? lineOfOrder(order) : lead ? lineOfLead(lead) : scope || (b.line === "UVONYX" ? "UVONYX" : b.line === "UVIXPRINT" ? "UVIXPRINT" : prev?.line || "UVIXPRINT");
    const emps = empMap();
    const assigneeIds = Array.isArray(b.assigneeIds) ? [...new Set(b.assigneeIds.map(String))].filter((id) => emps.has(id)).slice(0, 10) : prev?.assigneeIds || [];
    const title = str(b.title, 140) || (order ? `${order.orderNumber} · ${order.title || order.customer || ""}`.trim() : "") || (lead ? lead.customer || "" : "") || prev?.title || "";
    if (!title) throw Object.assign(new Error("Vazifa nomini kiriting"), { status: 400 });
    return {
      kind, title, line, orderId: order ? order.id : null, leadId: lead ? lead.id : null,
      date: b.date === undefined ? prev?.date || null : dateOk(b.date),
      time: b.time === undefined ? prev?.time || null : timeOk(b.time),
      address: b.address === undefined ? prev?.address || "" : str(b.address, 200),
      geo: b.geo === undefined ? prev?.geo || null : geoOk(b.geo),
      phone: b.phone === undefined ? prev?.phone || "" : str(b.phone, 40),
      note: b.note === undefined ? prev?.note || "" : str(b.note, 1000),
      duration: b.duration === undefined ? prev?.duration || DURATION[kind] : Math.max(15, Math.min(720, Math.round(Number(b.duration) || DURATION[kind]))),
      checklist: Array.isArray(b.checklist) ? cleanChecklist(b.checklist, prev?.checklist) : prev?.checklist || CHECKLIST[kind].map((text) => ({ id: rid(), text, done: false })),
      assigneeIds,
    };
  }

  function cleanChecklist(list, prev) {
    const old = new Map((prev || []).map((c) => [c.id, c]));
    return list.slice(0, 30).map((c) => {
      const text = str(c?.text, 120);
      if (!text) return null;
      const id = typeof c.id === "string" && /^[a-z0-9]{4,24}$/.test(c.id) ? c.id : rid();
      const o = old.get(id);
      const done = !!c.done;
      return { id, text, done, ...(done ? { doneBy: o?.done ? o.doneBy : c.doneBy || null, doneAt: o?.done ? o.doneAt : c.doneAt || null } : {}) };
    }).filter(Boolean);
  }
  // Tarix: kim, nima, qachon (oxirgi 100 ta)
  function logIt(j, who, text, at) {
    j.log = [...(Array.isArray(j.log) ? j.log : []), { at, who, text: String(text).slice(0, 500) }].slice(-100);
  }

  // Bajarildi → buyurtma «Topshirildi» (shu buyurtmaning boshqa montaj/yetkazish vazifalari ham tugagan bo'lsa)
  function chainDone(j, all, at) {
    if (!j.orderId || !["install", "deliver"].includes(j.kind)) return null;
    const open = all.some((x) => x.id !== j.id && x.orderId === j.orderId && ["install", "deliver"].includes(x.kind) && !["done", "cancelled"].includes(x.status));
    if (open) return null;
    const orders = read("uvix:orders", []);
    const o = orders.find((x) => x && x.id === j.orderId && !x.deletedAt);
    if (!o || !setStage(o, "delivered", at)) return null;
    write("uvix:orders", orders);
    if (o.leadId) {
      const leads = read("uvix:leads", []);
      const lead = Array.isArray(leads) ? leads.find((l) => l && l.id === o.leadId) : null;
      if (lead && syncLeadStage(lead, orders, at)) write("uvix:leads", leads);
    }
    audit(`${j.doneBy || "Xodim"}: ${KINDS[j.kind]} bajarildi → ${o.orderNumber} «Topshirildi»`, at);
    return o;
  }
  // Lid bosqichi: o'lchov vazifasi qo'shilsa — «O'lchov»; bajarilsa — «Smeta» (muzokara)
  function leadStage(j, at, from, to) {
    if (!j.leadId) return null;
    const leads = read("uvix:leads", []);
    const l = Array.isArray(leads) ? leads.find((x) => x && x.id === j.leadId && !x.deletedAt) : null;
    if (!l || !from.includes(l.stage || "new")) return null;
    l.stage = to; l.stageAt = at;
    write("uvix:leads", leads);
    return l;
  }
  // Montaj boshlandi → buyurtma «O'rnatish»
  function chainDoing(j, at) {
    if (!j.orderId || j.kind !== "install") return;
    const orders = read("uvix:orders", []);
    const o = orders.find((x) => x && x.id === j.orderId && !x.deletedAt);
    if (o && ["ready", "printing", "material"].includes(o.prodStage) && setStage(o, "install", at)) write("uvix:orders", orders);
  }
  function audit(text, at) {
    const list = read("uvix:audit", []);
    write("uvix:audit", [{ id: rid(), who: "Tizim", what: text, when: at }, ...(Array.isArray(list) ? list : [])].slice(0, 500));
  }

  // ---------- API ----------
  // Sozlama: o'z ustunlari va doska holatlari (rahbar / katta menejer), «Hamma uchun» ko'rinish
  app.put("/api/jobs/config", requireAuth, (req, res) => {
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ error: "forbidden", message: "Ustunlarni rahbar yoki katta menejer sozlaydi" });
    const prev = config(); const b = req.body || {};
    const next = {
      fields: b.fields !== undefined ? cleanFields(b.fields, prev.fields) : prev.fields,
      stages: b.stages !== undefined ? cleanStages(b.stages) : prev.stages,
      defaults: b.defaults !== undefined ? cleanPrefs(b.defaults) : prev.defaults,
    };
    write(CFG, next);
    res.json({ config: next });
  });
  app.put("/api/jobs/prefs", requireAuth, (req, res) => {
    const all = read(PREFS, {}) || {};
    const p = cleanPrefs(req.body?.prefs);
    if (p) all[req.user.id] = p; else delete all[req.user.id];
    write(PREFS, all);
    res.json({ prefs: p });
  });
  app.get("/api/jobs", requireAuth, (req, res) => {
    const emps = empMap();
    const orders = read("uvix:orders", []);
    const list = jobs().filter((j) => canSee(req.user, req.lineScope, j)).map((j) => publicJob(j, emps, orders));
    const prefs = read(PREFS, {})?.[req.user.id] || null;
    res.json({ jobs: list, canManage: isStaffManager(req.user), config: config(), prefs, canConfig: req.user.role === "admin" || req.user.role === "manager" });
  });

  app.post("/api/jobs", requireAuth, (req, res) => {
    if (!isStaffManager(req.user)) return res.status(403).json({ error: "forbidden", message: "Vazifani menejer yoki rahbar qo'shadi" });
    try {
      const orders = read("uvix:orders", []);
      const at = now().toISOString();
      const j = { id: rid(), ...clean(req.body || {}, null, req.user, req.lineScope, orders), status: "new", createdBy: req.user.name, createdAt: at, updatedAt: at, auto: false, photos: [] };
      if (req.body?.custom) j.custom = cleanCustom(req.body.custom, {}, j.kind);
      const emps0 = empMap();
      logIt(j, req.user.name, `vazifa yaratildi${j.assigneeIds.length ? ` · ${j.assigneeIds.map((id) => emps0.get(id)?.name || id).join(", ")}` : ""}`, at);
      write(KEY, [j, ...jobs()]);
      if (j.kind === "measure" && j.line === "UVONYX") leadStage(j, at, ["new"], "measure");
      notifyAssigned(j, j.assigneeIds, empMap());
      res.json({ job: publicJob(j, empMap(), orders) });
    } catch (e) { res.status(e.status || 400).json({ error: "bad_request", message: e.message }); }
  });

  app.patch("/api/jobs/:id", requireAuth, (req, res) => {
    const all = jobs();
    const j = all.find((x) => x.id === req.params.id);
    if (!j || !canSee(req.user, req.lineScope, j)) return res.status(404).json({ error: "not_found", message: "Vazifa topilmadi" });
    const b = req.body || {};
    const orders = read("uvix:orders", []);
    const at = now().toISOString();
    try {
      const before = new Set(j.assigneeIds || []);
      const prevWhen = `${j.date || ""} ${j.time || ""}`;
      if (isStaffManager(req.user)) Object.assign(j, clean(b, j, req.user, req.lineScope, orders));
      else if (b.note !== undefined) j.note = str(b.note, 1000); // mas'ul: faqat izoh
      if (Array.isArray(b.photos)) j.photos = b.photos.filter((p) => p && /^\/api\/photos\/[a-zA-Z0-9.]+$/.test(String(p.url || ""))).slice(0, 20).map((p) => ({ url: p.url, by: p.by || null, at: p.at || null }));
      // Tekshiruv bandini belgilash — mas'ul ham qila oladi
      if (b.check && typeof b.check.id === "string") {
        if (!Array.isArray(j.checklist)) j.checklist = [];
        const c = j.checklist.find((x) => x.id === b.check.id);
        if (c && !!b.check.done !== !!c.done) {
          c.done = !!b.check.done;
          if (c.done) { c.doneBy = req.user.name; c.doneAt = at; } else { delete c.doneBy; delete c.doneAt; }
          logIt(j, req.user.name, `${c.done ? "✓" : "✗"} ${c.text}`, at);
        }
      }
      if (b.custom && typeof b.custom === "object") j.custom = cleanCustom(b.custom, j.custom, j.kind);
      if (b.stage !== undefined) {
        const st = config().stages.find((x) => x.id === b.stage);
        if (st) { if (j.stage !== st.id) logIt(j, req.user.name, `«${st.name}»`, at); j.stage = st.id; if (!b.status && j.status !== "doing") b.status = "doing"; }
        else delete j.stage;
      }
      const comment = str(b.comment, 1000);
      if (comment) logIt(j, req.user.name, `💬 ${comment}`, at);
      if (isStaffManager(req.user)) {
        const emps1 = empMap();
        const addedIds = (j.assigneeIds || []).filter((id) => !before.has(id));
        const removed = [...before].filter((id) => !(j.assigneeIds || []).includes(id));
        if (addedIds.length) logIt(j, req.user.name, `biriktirildi: ${addedIds.map((id) => emps1.get(id)?.name || id).join(", ")}`, at);
        if (removed.length) logIt(j, req.user.name, `olib tashlandi: ${removed.map((id) => emps1.get(id)?.name || id).join(", ")}`, at);
        const nowWhen = `${j.date || ""} ${j.time || ""}`;
        if (nowWhen !== prevWhen) logIt(j, req.user.name, `vaqt: ${nowWhen.trim() || "sanasiz"}`, at);
      }
      let order = null;
      if (b.status && STATUSES.includes(b.status) && b.status !== j.status) {
        if (b.status === "cancelled" && !isStaffManager(req.user)) return res.status(403).json({ error: "forbidden", message: "Bekor qilishni menejer qiladi" });
        j.status = b.status;
        if (b.status !== "doing") delete j.stage;
        logIt(j, req.user.name, `«${STATUS_L[b.status]}»`, at);
        if (b.status === "doing") { j.startedAt = at; j.startedBy = req.user.name; }
        if (b.status === "done") { j.doneAt = at; j.doneBy = req.user.name; } else { delete j.doneAt; delete j.doneBy; }
        if (b.status === "done") order = chainDone(j, all, at);
        if (b.status === "done" && j.kind === "measure") leadStage(j, at, ["new", "measure"], "negotiation");
        if (b.status === "doing") chainDoing(j, at);
      }
      j.updatedAt = at;
      write(KEY, all);
      const added = (j.assigneeIds || []).filter((id) => !before.has(id));
      if (added.length) notifyAssigned(j, added, empMap());
      res.json({ job: publicJob(j, empMap(), read("uvix:orders", [])), order });
    } catch (e) { res.status(e.status || 400).json({ error: "bad_request", message: e.message }); }
  });

  // Vazifa rasmi — mas'ul xodim ham yuklay oladi (umumiy /api/photos/upload faqat ofis xodimlariga)
  app.post("/api/jobs/:id/photos", requireAuth, (req, res) => {
    const j0 = jobs().find((x) => x.id === req.params.id);
    if (!j0 || !canSee(req.user, req.lineScope, j0)) return res.status(404).json({ error: "not_found", message: "Vazifa topilmadi" });
    if (!upload) return res.status(501).json({ error: "no_upload" });
    upload.array("photos", 10)(req, res, (err) => {
      if (err) return res.status(400).json({ error: "upload_failed", message: err.message });
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: "no_files" });
      const all = jobs();
      const j = all.find((x) => x.id === req.params.id);
      if (!j) return res.status(404).json({ error: "not_found" });
      const at = now().toISOString();
      j.photos = [...(j.photos || []), ...files.map((f) => ({ url: `/api/photos/${f.filename}`, by: req.user.name, at }))].slice(-20);
      logIt(j, req.user.name, `📷 ${files.length} ta rasm`, at);
      j.updatedAt = at;
      write(KEY, all);
      res.json({ job: publicJob(j, empMap(), read("uvix:orders", [])) });
    });
  });

  app.delete("/api/jobs/:id", requireAuth, (req, res) => {
    if (!isStaffManager(req.user)) return res.status(403).json({ error: "forbidden" });
    const all = jobs();
    const j = all.find((x) => x.id === req.params.id);
    if (!j || !canSee(req.user, req.lineScope, j)) return res.status(404).json({ error: "not_found" });
    write(KEY, all.filter((x) => x.id !== j.id));
    res.json({ ok: true });
  });

  // ---------- Bajarilgan ish statistikasi (umumiy xodim oyligini bo'lish uchun) ----------
  // { "2026-10": { empId: { UVIXPRINT: n, UVONYX: n } } } — vazifalar + buyurtmadagi dizayn/pechat
  function workStats() {
    const out = {};
    const add = (month, emp, line) => {
      if (!month || !emp) return;
      ((out[month] ||= {})[emp] ||= { UVIXPRINT: 0, UVONYX: 0 })[line] += 1;
    };
    for (const j of jobs()) {
      if (j.status !== "done" || !j.doneAt) continue;
      for (const id of j.assigneeIds || []) add(String(j.doneAt).slice(0, 7), id, j.line === "UVONYX" ? "UVONYX" : "UVIXPRINT");
    }
    for (const o of read("uvix:orders", []) || []) {
      if (!o || o.deletedAt) continue;
      for (const kind of ["design", "print"]) {
        const t = o[kind];
        if (!t || t.status !== "done" || !t.assigneeId) continue;
        add(String(t.doneAt || t.statusAt || o.date || "").slice(0, 7), t.assigneeId, lineOfOrder(o));
      }
    }
    return out;
  }
  app.get("/api/work-stats", requireAuth, (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
    res.json({ stats: workStats() });
  });

  // ---------- Avtomatik vazifalar va eslatmalar (fon) ----------
  function reconcile() {
    const orders = read("uvix:orders", []);
    const ready = (Array.isArray(orders) ? orders : []).filter((o) => o && !o.deletedAt && o.prodStage === "ready");
    const seen = read(SEEN, null);
    if (!seen) { write(SEEN, ready.map((o) => o.id)); return 0; } // birinchi ishga tushish — eskilar uchun yaratilmaydi
    const seenSet = new Set(seen);
    const all = jobs();
    const at = now().toISOString();
    let n = 0;
    for (const o of ready) {
      if (seenSet.has(o.id)) continue;
      seenSet.add(o.id);
      if (all.some((j) => j.orderId === o.id && ["install", "deliver"].includes(j.kind))) continue;
      const kind = lineOfOrder(o) === "UVONYX" ? "install" : "deliver";
      all.unshift({ id: rid(), kind, title: `${o.orderNumber} · ${o.title || o.customer || ""}`.trim(), line: lineOfOrder(o), orderId: o.id, date: null, time: null, address: "", phone: "", note: "", assigneeIds: [], status: "new", createdBy: "Tizim", createdAt: at, updatedAt: at, auto: true, photos: [],
        duration: DURATION[kind], checklist: CHECKLIST[kind].map((text) => ({ id: rid(), text, done: false })), log: [{ at, who: "Tizim", text: `buyurtma «Tayyor» — ${KINDS[kind]} yaratildi` }] });
      n++;
    }
    if (n) write(KEY, all);
    write(SEEN, [...seenSet].slice(-5000));
    return n;
  }
  async function remind() {
    const t = now().getTime();
    const done = new Set(read(REM, []));
    let changed = false;
    for (const j of jobs()) {
      const ts = jobTime(j);
      if (!ts || ["done", "cancelled"].includes(j.status) || !(j.assigneeIds || []).length) continue;
      const k = `${j.id}:${j.date}:${j.time}`;
      if (done.has(k) || ts - t > 60 * 60 * 1000 || ts < t) continue;
      done.add(k); changed = true;
      for (const id of j.assigneeIds) {
        try { await sendToEmployee(id, `⏰ 1 soatdan keyin: ${KINDS[j.kind]} · ${j.time}\n<b>${esc(j.title)}</b>${j.address ? `\n📍 ${esc(j.address)}` : ""}`); } catch { /* */ }
      }
    }
    // Kechikdi (30 daqiqa o'tdi, hali boshlanmagan) — rahbar va shu yo'nalish katta menejeriga, bir marta
    const emps = readEmployees().filter((e) => !e.deletedAt);
    const bosses = (line) => emps.filter((e) => e.role === "admin" || (e.role === "manager" && (!e.line || e.line === line || e.line === "common")));
    for (const j of jobs()) {
      const ts = jobTime(j);
      if (!ts || j.status !== "new" || t - ts < 30 * 60 * 1000 || t - ts > 24 * 3600 * 1000) continue;
      const k = `late:${j.id}:${j.date}:${j.time}`;
      if (done.has(k)) continue;
      done.add(k); changed = true;
      const who = (j.assigneeIds || []).map((id) => emps.find((e) => e.id === id)?.name).filter(Boolean).join(", ") || "mas'ulsiz";
      for (const e of bosses(j.line)) {
        try { await sendToEmployee(e.id, `⏰ Kechikmoqda: ${KINDS[j.kind]} · ${j.time}\n<b>${esc(j.title)}</b>\n👤 ${esc(who)}`); } catch { /* */ }
      }
    }
    // Kun yakuni (19:00) — rahbarga qisqa hisobot
    const tk = tashkent(new Date(t));
    if (tk.hm >= "19:00" && !done.has(`day:${tk.date}`)) {
      done.add(`day:${tk.date}`); changed = true;
      const todays = jobs().filter((j) => j.date === tk.date && j.status !== "cancelled");
      if (todays.length) {
        const ok = todays.filter((j) => j.status === "done").length;
        for (const e of emps.filter((x) => x.role === "admin")) {
          try { await sendToEmployee(e.id, `📋 Bugungi vazifalar: <b>${todays.length} tadan ${ok} tasi bajarildi</b>${todays.length - ok ? `\nQolgani: ${todays.length - ok}` : ""}`); } catch { /* */ }
        }
      }
    }
    if (changed) write(REM, [...done].slice(-3000));
  }
  async function tick() {
    try { reconcile(); await remind(); } catch (e) { console.error("Vazifalar foni:", e.message); }
  }
  if (interval > 0) { setTimeout(tick, 3000); setInterval(tick, interval).unref?.(); }
  return { reconcile, remind, tashkent, workStats };
};
module.exports.KINDS = KINDS;
module.exports.CHECKLIST = CHECKLIST;
module.exports.DURATION = DURATION;
