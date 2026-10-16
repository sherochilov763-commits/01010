// JobsView.jsx — «Vazifalar»: o'lchov, montaj, yetkazish va boshqa ishlar (kim, nima, qachon, qayerda).
// Ro'yxat (Kechikkan / Bugun / Ertaga / Keyinroq / Sanasiz) va hafta kalendari.
// Dizayn/pechat vazifalari (buyurtma ichidagi) — shu yerda ham ko'rinadi (faqat ko'rish).
// MyJobs — ishchi telefoni uchun «Mening vazifalarim» (Yo'l / Qo'ng'iroq / Bajarildi).
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCheck, List as ListIcon, MapPin, Navigation, Phone, Plus, Ruler, Trash2, Truck, Wrench, Palette, Printer, Loader2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { LineTag } from "../../components/LineSwitcher.jsx";
import { useLine } from "../../lib/lines.js";
import { createJob, deleteJob, fetchJobs, fetchTasks, updateJob } from "../../storage.js";
import { THEME } from "../../theme.js";

export const JOB_KINDS = {
  measure: { l: "O'lchov", I: Ruler, c: "#6D28D9" },
  install: { l: "Montaj", I: Wrench, c: "#0E7C6B" },
  deliver: { l: "Yetkazish", I: Truck, c: "#B45309" },
  other: { l: "Boshqa", I: ClipboardCheck, c: "#52525B" },
  design: { l: "Dizayn", I: Palette, c: "#1F5FD6", ro: true },
  print: { l: "Pechat", I: Printer, c: "#0E7490", ro: true },
};
const STATUS = { new: "Yangi", doing: "Jarayonda", done: "Bajarildi", cancelled: "Bekor", in_progress: "Jarayonda" };
const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const mondayOf = (s) => { const d = new Date(s + "T00:00:00"); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); };
const dayText = (s) => { if (!s) return ""; const d = new Date(s + "T00:00:00"); return `${d.getDate()}-${MONTHS[d.getMonth()]}`; };
const isOpen = (j) => !["done", "cancelled"].includes(j.status);
const isLate = (j) => isOpen(j) && !!j.date && (j.date < today() || (j.date === today() && j.time && j.time < new Date().toTimeString().slice(0, 5)));
const mapsUrl = (a) => `https://yandex.uz/maps/?text=${encodeURIComponent(a)}`;

// Dizayn/pechat vazifasini umumiy ko'rinishga keltirish
const fromTask = (t) => ({ id: t.id, kind: t.kind, ro: true, title: `${t.taskNo} · ${t.jobTitle}`, line: t.line, date: t.deadline || null, time: null, status: t.status === "done" ? "done" : t.status === "in_progress" ? "doing" : "new", assignees: t.assigneeName ? [{ id: t.assigneeId, name: t.assigneeName }] : [], assigneeIds: t.assigneeId ? [t.assigneeId] : [], address: "", order: null, customer: t.customer });

function KindBadge({ kind, small }) {
  const k = JOB_KINDS[kind] || JOB_KINDS.other;
  return (
    <span data-job-kind={kind} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: small ? 20 : 24, padding: small ? "0 6px" : "0 8px", borderRadius: 7, fontSize: small ? 11 : 12, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: k.c, background: k.c + "1A", whiteSpace: "nowrap" }}>
      <k.I size={small ? 12 : 13} />{k.l}
    </span>
  );
}
function People({ list }) {
  if (!list?.length) return <span style={{ color: THEME.amber || "#B45309", fontWeight: 600 }}>mas'ul tayinlanmagan</span>;
  return <span>{list.map((a) => a.name).join(", ")}</span>;
}

function JobCard({ j, showLine, onOpen, onDone, busy }) {
  const late = isLate(j);
  return (
    <div data-job={j.id} onClick={() => !j.ro && onOpen(j)} role={j.ro ? undefined : "button"} tabIndex={j.ro ? undefined : 0}
      onKeyDown={(e) => { if (!j.ro && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(j); } }}
      style={{ background: THEME.card, border: `1px solid ${late ? THEME.rose + "66" : THEME.border}`, borderRadius: 14, padding: "11px 13px", display: "flex", gap: 12, alignItems: "flex-start", cursor: j.ro ? "default" : "pointer", opacity: j.status === "done" || j.status === "cancelled" ? 0.62 : 1 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <KindBadge kind={j.kind} small />
          {showLine && j.line && <LineTag line={j.line} />}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: late ? THEME.rose : THEME.muted }}>
            {late ? "Kechikdi · " : ""}{j.date ? dayText(j.date) : "Sanasiz"}{j.time ? ` · ${j.time}` : ""}
          </span>
          {j.status !== "new" && <span style={{ fontSize: 12, color: j.status === "done" ? THEME.greenText : THEME.muted, fontWeight: 600 }}>· {STATUS[j.status]}</span>}
          {j.auto && j.status === "new" && <span title="Buyurtma «Tayyor» bo'lganda o'zi yaratildi" style={{ fontSize: 11, color: THEME.dim }}>· avtomatik</span>}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, textDecoration: j.status === "cancelled" ? "line-through" : "none" }}>{j.title}</div>
        <div style={{ fontSize: 12.5, color: THEME.muted, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {j.address && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} />{j.address}</span>}
          <People list={j.assignees} />
        </div>
      </div>
      {!j.ro && isOpen(j) && onDone && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onDone(j); }} disabled={busy} data-job-done={j.id} aria-label="Bajarildi" title="Bajarildi"
          style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.greenText, display: "grid", placeItems: "center", cursor: "pointer" }}>
          <Check size={18} />
        </button>
      )}
    </div>
  );
}

function groupJobs(list) {
  const t = today(), tm = addDays(t, 1);
  const g = { late: [], today: [], tomorrow: [], later: [], nodate: [], done: [] };
  for (const j of list) {
    if (!isOpen(j)) g.done.push(j);
    else if (isLate(j)) g.late.push(j);
    else if (!j.date) g.nodate.push(j);
    else if (j.date === t) g.today.push(j);
    else if (j.date === tm) g.tomorrow.push(j);
    else g.later.push(j);
  }
  const byTime = (a, b) => `${a.date || "9"}${a.time || "99"}`.localeCompare(`${b.date || "9"}${b.time || "99"}`);
  Object.values(g).forEach((x) => x.sort(byTime));
  g.done.sort((a, b) => String(b.doneAt || b.date || "").localeCompare(String(a.doneAt || a.date || "")));
  g.done = g.done.slice(0, 20);
  return [["late", "Kechikkan", g.late], ["today", "Bugun", g.today], ["tomorrow", "Ertaga", g.tomorrow], ["later", "Keyinroq", g.later], ["nodate", "Sanasi belgilanmagan", g.nodate], ["done", "Bajarilgan", g.done]];
}

export function JobsView({ employees, orders, currentUser }) {
  const isMobile = useIsMobile();
  const { line } = useLine();
  const [jobs, setJobs] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("uvix_jobs_mode") || "list"; } catch { return "list"; } });
  const [kindF, setKindF] = useState("all");
  const [mine, setMine] = useState(false);
  const [week, setWeek] = useState(() => mondayOf(today()));
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const setModeP = (m) => { setMode(m); try { localStorage.setItem("uvix_jobs_mode", m); } catch { /* */ } };

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([fetchJobs(), fetchTasks().catch(() => [])]);
      setJobs(r.jobs || []); setTasks(t || []); setErr("");
    } catch (e) { setErr(e.message); setJobs((x) => x || []); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const all = useMemo(() => [...(jobs || []), ...tasks.filter((t) => t.status).map(fromTask)], [jobs, tasks]);
  const list = useMemo(() => all.filter((j) => (kindF === "all" || (kindF === "late" ? isLate(j) : j.kind === kindF)) && (!mine || (j.assigneeIds || []).includes(currentUser.id))), [all, kindF, mine, currentUser.id]);
  const counts = useMemo(() => {
    const c = { late: all.filter(isLate).length };
    for (const k of Object.keys(JOB_KINDS)) c[k] = all.filter((j) => j.kind === k && isOpen(j)).length;
    return c;
  }, [all]);

  async function markDone(j) {
    setBusy(true);
    try { await updateJob(j.id, { status: "done" }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); setConfirm(null); }
  }

  const chip = (k, label, n, color) => {
    const on = kindF === k;
    return (
      <button key={k} type="button" onClick={() => setKindF(on && k !== "all" ? "all" : k)} aria-pressed={on} data-kind-filter={k} className="uvix-fchip"
        style={{ height: 32, padding: "0 12px", borderRadius: 16, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
          border: `1px solid ${on ? THEME.text : THEME.border2}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : color || THEME.mutedDark }}>
        {label}{n ? <b style={{ fontWeight: 700 }}>{n}</b> : null}
      </button>
    );
  };
  const showLine = line === "all";

  return (
    <div data-testid="jobs-view">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div role="group" aria-label="Ko'rinish" style={{ display: "inline-flex", background: THEME.chip, borderRadius: 9, padding: 3, gap: 2 }}>
          {[["list", "Ro'yxat", ListIcon], ["calendar", "Kalendar", CalendarDays]].map(([v, l, I]) => (
            <button key={v} type="button" onClick={() => setModeP(v)} aria-pressed={mode === v} data-jobs-mode={v}
              style={{ height: 30, padding: "0 12px", border: 0, borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, background: mode === v ? THEME.card : "transparent", color: mode === v ? THEME.text : THEME.muted, boxShadow: mode === v ? THEME.shadowSm : "none" }}>
              <I size={14} />{l}
            </button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: THEME.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} data-testid="jobs-mine" /> Faqat menga
        </label>
        <div style={{ flex: 1 }} />
        <Button onClick={() => setEdit({})} data-testid="job-new"><Plus size={15} /> Vazifa</Button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }} className="uvix-scroll">
        {chip("all", "Hammasi")}
        {["measure", "install", "deliver", "print", "design", "other"].map((k) => chip(k, JOB_KINDS[k].l, counts[k]))}
        {counts.late > 0 && chip("late", "Kechikkan", counts.late, THEME.rose)}
      </div>
      {err && <div role="alert" style={{ padding: "10px 14px", borderRadius: 12, background: THEME.roseBg, color: THEME.roseText || THEME.rose, fontSize: 13.5, marginBottom: 12 }}>{err}</div>}

      {jobs === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48, color: THEME.muted }}><Loader2 size={22} className="uvix-spin" /></div>
      ) : mode === "calendar" ? (
        <WeekCalendar list={list} week={week} setWeek={setWeek} isMobile={isMobile} onOpen={setEdit} showLine={showLine} />
      ) : list.length === 0 ? (
        <Card style={{ padding: 0 }}><EmptyState text="Vazifa yo'q. «+ Vazifa» bilan qo'shing — buyurtma «Tayyor» bo'lganda yetkazish/montaj o'zi paydo bo'ladi." /></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groupJobs(list).filter(([, , arr]) => arr.length).map(([k, label, arr]) => (
            <section key={k} data-job-group={k}>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: k === "late" ? THEME.rose : THEME.muted, marginBottom: 8 }}>{label} · {arr.length}</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(330px, 1fr))", gap: 10 }}>
                {arr.map((j) => <JobCard key={j.id} j={j} showLine={showLine} onOpen={setEdit} onDone={setConfirm} busy={busy} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {edit && <JobForm job={edit.id ? edit : null} employees={employees} orders={orders} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {confirm && (
        <ConfirmDialog title="Bajarildimi?" message={`«${confirm.title}» bajarildi deb belgilansinmi?${confirm.orderId && ["install", "deliver"].includes(confirm.kind) ? " Buyurtma «Topshirildi» bo'ladi." : ""}`}
          confirmLabel="Ha, bajarildi" tone="primary" icon={Check} onCancel={() => setConfirm(null)} onConfirm={() => markDone(confirm)} />
      )}
    </div>
  );
}

function WeekCalendar({ list, week, setWeek, isMobile, onOpen, showLine }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const t = today();
  const byDay = Object.fromEntries(days.map((d) => [d, list.filter((j) => j.date === d).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"))]));
  const noDate = list.filter((j) => !j.date && isOpen(j));
  const navBtn = { width: 34, height: 34, borderRadius: 9, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" };
  return (
    <div data-testid="jobs-calendar">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button type="button" style={navBtn} onClick={() => setWeek(addDays(week, -7))} aria-label="Oldingi hafta"><ChevronLeft size={16} /></button>
        <button type="button" style={navBtn} onClick={() => setWeek(addDays(week, 7))} aria-label="Keyingi hafta"><ChevronRight size={16} /></button>
        <b style={{ fontSize: 15 }}>{dayText(days[0])} — {dayText(days[6])}</b>
        {week !== mondayOf(t) && <button type="button" onClick={() => setWeek(mondayOf(t))} style={{ border: 0, background: "none", color: THEME.violet, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Bugun</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(7, minmax(0, 1fr))", gap: 8 }}>
        {days.map((d, i) => (
          <div key={d} data-cal-day={d} style={{ background: d === t ? THEME.violetSoft || THEME.chip : THEME.chip, borderRadius: 12, padding: 8, minHeight: isMobile ? 0 : 180, display: isMobile && !byDay[d].length ? "none" : "block" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: d === t ? THEME.violet : THEME.mutedDark || THEME.muted, marginBottom: 6 }}>{WD[i]} {Number(d.slice(8))}</div>
            {byDay[d].map((j) => {
              const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
              return (
                <button key={j.id} type="button" data-cal-job={j.id} onClick={() => !j.ro && onOpen(j)}
                  style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderLeft: `3px solid ${k.c}`, borderRadius: 8, padding: "6px 8px", marginBottom: 6, fontFamily: "inherit", cursor: j.ro ? "default" : "pointer",
                    background: THEME.card, color: THEME.text, opacity: isOpen(j) ? 1 : 0.55, fontSize: 12.5, lineHeight: 1.3 }}>
                  <b style={{ color: k.c }}>{j.time ? `${j.time} ` : ""}{k.l}</b>{showLine && j.line ? <span style={{ color: THEME.dim }}> · {j.line === "UVONYX" ? "ON" : "UV"}</span> : null}
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{j.title}</div>
                  <div style={{ color: THEME.muted, fontSize: 11.5 }}>{(j.assignees || []).map((a) => a.name.split(" ")[0]).join(", ") || "mas'ulsiz"}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {noDate.length > 0 && <div style={{ marginTop: 12, fontSize: 13, color: THEME.muted }}>Sanasi belgilanmagan: <b>{noDate.length}</b> ta — «Ro'yxat»da.</div>}
    </div>
  );
}

export function JobForm({ job, employees, orders, onClose, onSaved, presetOrderId, preset }) {
  const { line } = useLine();
  const [f, setF] = useState(() => ({
    kind: job?.kind || preset?.kind || "measure", orderId: job?.orderId || presetOrderId || "", leadId: job?.leadId || preset?.leadId || null, title: job?.title || preset?.title || "", date: job ? job.date || "" : today(), time: job?.time || "",
    address: job?.address || preset?.address || "", phone: job?.phone || preset?.phone || "", note: job?.note || "", assigneeIds: job?.assigneeIds || [], line: job?.line || preset?.line || (line !== "all" ? line : "UVIXPRINT"),
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const openOrders = useMemo(() => (orders || []).filter((o) => !o.deletedAt && (o.prodStage !== "delivered" || o.id === f.orderId)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 300), [orders, f.orderId]);
  const people = (employees || []).filter((e) => e.role !== "admin" || e.id === job?.createdById);
  const toggle = (id) => set("assigneeIds", f.assigneeIds.includes(id) ? f.assigneeIds.filter((x) => x !== id) : [...f.assigneeIds, id]);

  async function save(extra = {}) {
    setBusy(true); setErr("");
    try {
      const body = { ...f, orderId: f.orderId || null, time: f.time || null, ...extra };
      if (job) await updateJob(job.id, body); else await createJob(body);
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await deleteJob(job.id); onSaved(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  const inp = getInputStyle();
  return (
    <Modal title={job ? "Vazifa" : "Yangi vazifa"} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="job-form">
        <div role="group" aria-label="Turi" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["measure", "install", "deliver", "other"].map((k) => {
            const K = JOB_KINDS[k]; const on = f.kind === k;
            return (
              <button key={k} type="button" onClick={() => set("kind", k)} aria-pressed={on} data-kind={k}
                style={{ flex: 1, minWidth: 92, height: 40, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  border: `1.5px solid ${on ? K.c : THEME.border}`, background: on ? K.c + "14" : THEME.card, color: on ? K.c : THEME.text }}>
                <K.I size={15} />{K.l}
              </button>
            );
          })}
        </div>
        {f.leadId && <div data-testid="job-lead" style={{ fontSize: 12.5, color: THEME.muted }}>CRM lidi bilan bog'langan — o'lchov bajarilsa, lid «Smeta» bosqichiga o'tadi.</div>}
        <Field label="Buyurtma (ixtiyoriy)">
          <select value={f.orderId} onChange={(e) => set("orderId", e.target.value)} style={inp} data-testid="job-order">
            <option value="">— Buyurtmasiz (masalan, yangi mijoz o'lchovi)</option>
            {openOrders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} · {o.customer}{o.title ? ` · ${o.title}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Nomi">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} style={inp} placeholder={f.orderId ? "Bo'sh qolsa — buyurtma nomi" : "Masalan: Yunusobod, yangi mijoz — o'lchov"} data-testid="job-title" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Sana"><input type="date" value={f.date || ""} onChange={(e) => set("date", e.target.value)} style={inp} data-testid="job-date" /></Field>
          <Field label="Vaqt"><input type="time" value={f.time || ""} onChange={(e) => set("time", e.target.value)} style={inp} data-testid="job-time" /></Field>
        </div>
        <Field label="Manzil"><input value={f.address} onChange={(e) => set("address", e.target.value)} style={inp} placeholder="Chilonzor 9, 12-uy" data-testid="job-address" /></Field>
        <Field label="Telefon (mijoz)"><input value={f.phone} onChange={(e) => set("phone", e.target.value)} style={inp} placeholder="+998 90 123 45 67" inputMode="tel" /></Field>
        {line === "all" && !f.orderId && !f.leadId && (
          <Field label="Yo'nalish">
            <div style={{ display: "flex", gap: 6 }}>
              {["UVIXPRINT", "UVONYX"].map((l) => (
                <button key={l} type="button" onClick={() => set("line", l)} aria-pressed={f.line === l} style={{ flex: 1, height: 36, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, border: `1.5px solid ${f.line === l ? THEME.text : THEME.border}`, background: THEME.card, color: THEME.text }}>{l}</button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Mas'ul (bir yoki bir nechta)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-testid="job-people">
            {people.map((e) => {
              const on = f.assigneeIds.includes(e.id);
              return (
                <button key={e.id} type="button" onClick={() => toggle(e.id)} aria-pressed={on} data-person={e.id}
                  style={{ height: 34, padding: "0 12px", borderRadius: 17, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? THEME.violet : THEME.border2}`, background: on ? THEME.violet : THEME.card, color: on ? THEME.onPrimary || "#fff" : THEME.text }}>
                  {on ? "✓ " : ""}{e.name}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Izoh"><textarea value={f.note} onChange={(e) => set("note", e.target.value)} style={{ ...inp, minHeight: 60, resize: "vertical" }} /></Field>
        {job && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid="job-status">
            <span style={{ fontSize: 12.5, color: THEME.muted }}>Holat:</span>
            {["new", "doing", "done", "cancelled"].map((s) => (
              <button key={s} type="button" onClick={() => save({ status: s })} disabled={busy} aria-pressed={job.status === s} data-status={s}
                style={{ height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, border: `1px solid ${job.status === s ? THEME.text : THEME.border2}`, background: job.status === s ? THEME.text : THEME.card, color: job.status === s ? THEME.card : THEME.text }}>
                {STATUS[s]}
              </button>
            ))}
          </div>
        )}
        {err && <div style={{ color: THEME.rose, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {job && <button type="button" onClick={() => setDel(true)} style={{ border: 0, background: "none", color: THEME.rose, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontFamily: "inherit" }}><Trash2 size={14} /> O'chirish</button>}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={() => save()} disabled={busy} data-testid="job-save">Saqlash</Button>
        </div>
      </div>
      {del && <ConfirmDialog message="Vazifa o'chirilsinmi?" onCancel={() => setDel(false)} onConfirm={remove} />}
    </Modal>
  );
}

// ---------- Ishchi telefoni: «Mening vazifalarim» (joydagi ishlar) ----------
export function MyJobs({ currentUser, hideEmpty }) {
  const [jobs, setJobs] = useState(null);
  const [tab, setTab] = useState("today");
  const [confirm, setConfirm] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => { try { const r = await fetchJobs(); setJobs((r.jobs || []).filter((j) => (j.assigneeIds || []).includes(currentUser.id))); } catch (e) { setErr(e.message); setJobs((x) => x || []); } }, [currentUser.id]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  if (jobs === null) return null;
  const open = jobs.filter(isOpen);
  const t = today();
  const tabs = [
    ["today", "Bugun", open.filter((j) => !isLate(j) && (j.date === t || !j.date))],
    ["tomorrow", "Ertaga", open.filter((j) => j.date === addDays(t, 1))],
    ["later", "Keyin", open.filter((j) => j.date && j.date > addDays(t, 1))],
    ["late", "Kechikkan", open.filter(isLate)],
  ];
  if (hideEmpty && !open.length) return null;
  const cur = tabs.find((x) => x[0] === tab) || tabs[0];
  const sorted = [...cur[2]].sort((a, b) => `${a.date}${a.time || "99"}`.localeCompare(`${b.date}${b.time || "99"}`));
  async function done(j) {
    try { await updateJob(j.id, { status: "done" }); setConfirm(null); load(); } catch (e) { setErr(e.message); setConfirm(null); }
  }
  const btn = { flex: 1, height: 44, borderRadius: 12, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, textDecoration: "none" };
  return (
    <section data-testid="my-jobs" style={{ marginBottom: 18 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700 }}>Joydagi ishlar</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
        {tabs.map(([k, l, arr]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-myjobs-tab={k}
            style={{ height: 36, padding: "0 14px", borderRadius: 18, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, border: `1px solid ${tab === k ? THEME.text : THEME.border}`, background: tab === k ? THEME.text : THEME.card, color: tab === k ? THEME.card : k === "late" && arr.length ? THEME.rose : THEME.text }}>
            {l} {arr.length}
          </button>
        ))}
      </div>
      {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {sorted.length === 0 ? <div style={{ color: THEME.muted, fontSize: 14, padding: "8px 2px" }}>Bu yerda ish yo'q</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((j) => {
            const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
            return (
              <Card key={j.id} data-myjob={j.id} style={{ padding: 14, borderColor: isLate(j) ? THEME.rose + "88" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <KindBadge kind={j.kind} small />
                  {j.line && <LineTag line={j.line} />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: isLate(j) ? THEME.rose : k.c }}>{j.date ? dayText(j.date) : ""}{j.time ? ` · ${j.time}` : ""}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{j.title}</div>
                {j.address && <div style={{ fontSize: 14, color: THEME.muted, marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}><MapPin size={14} />{j.address}</div>}
                {j.phone && <div style={{ fontSize: 14, color: THEME.muted, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}><Phone size={14} />{j.phone}</div>}
                {j.note && <div style={{ fontSize: 13.5, marginTop: 6, color: THEME.text }}>{j.note}</div>}
                {j.assignees?.length > 1 && <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4 }}>Brigada: {j.assignees.map((a) => a.name).join(", ")}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {j.address && <a href={mapsUrl(j.address)} target="_blank" rel="noreferrer" style={{ ...btn, background: THEME.chip, color: THEME.text }}><Navigation size={17} /> Yo'l</a>}
                  {j.phone && <a href={`tel:${j.phone.replace(/[^\d+]/g, "")}`} style={{ ...btn, background: THEME.chip, color: THEME.text }}><Phone size={17} /> Qo'ng'iroq</a>}
                  <button type="button" onClick={() => setConfirm(j)} data-myjob-done={j.id} style={{ ...btn, background: k.c, color: "#fff" }}><Check size={18} /> Bajarildi</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {confirm && <ConfirmDialog title="Bajarildimi?" message={`«${confirm.title}» bajarildi deb belgilansinmi?`} confirmLabel="Ha, bajarildi" tone="primary" icon={Check} onCancel={() => setConfirm(null)} onConfirm={() => done(confirm)} />}
    </section>
  );
}
