// JobsView.jsx — «Vazifalar»: o'lchov, montaj, yetkazish va boshqa ishlar (kim, nima, qachon, qayerda).
// Tepada holat kartalari (Kechikkan / Bugun / Ertaga / Sanasiz / Bu hafta bajarildi), tur filtrlari, tezkor qo'shish satri.
// Ko'rinishlar: Ro'yxat (guruhlangan qatorlar + o'ng panel), Kalendar. Dizayn/pechat vazifalari (buyurtma ichidagi) — faqat ko'rish.
// MyJobs — ishchi telefoni uchun «Mening kunim» (MyJobs.jsx).
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, AlignLeft, CalendarDays, Columns3, Check, CheckCircle2, ChevronDown, ChevronRight, Inbox, List as ListIcon, Loader2, MapPin, Navigation, Play, Plus, Sun, Sunrise, Star, Zap } from "lucide-react";
import { ConfirmDialog, useIsMobile } from "../../components/ui.jsx";
import { LineTag } from "../../components/LineSwitcher.jsx";
import { useLine } from "../../lib/lines.js";
import { createJob, fetchJobs, fetchTasks, updateJob } from "../../storage.js";
import { THEME } from "../../theme.js";
import { Board } from "./Board.jsx";
import { Brigade } from "./Brigade.jsx";
import { WeekCalendar } from "./Calendar.jsx";
import { JobDrawer } from "./JobDrawer.jsx";
import { JobForm } from "./JobForm.jsx";
import { Avatars, JobsEmpty, KindBadge, StatusPill } from "./JobParts.jsx";
import { FIELD_KINDS, JOB_KINDS, groupJobs, isLate, isOpen, mapsUrl, mondayOf, parseQuick, today, weekDoneCount, whenText, fromTask } from "./jobsLib.js";

export { JOB_KINDS } from "./jobsLib.js";
export { JobForm } from "./JobForm.jsx";
export { MyJobs } from "./MyJobs.jsx";

const MODES = [["list", "Ro'yxat", ListIcon], ["board", "Doska", Columns3], ["brigade", "Brigada", AlignLeft], ["calendar", "Kalendar", CalendarDays]];
const GROUP_ICON = { late: AlarmClock, today: Sun, tomorrow: Sunrise, later: CalendarDays, nodate: Inbox, done: CheckCircle2 };
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export function JobsView({ employees, orders, currentUser, onGo }) {
  const isMobile = useIsMobile();
  const { line } = useLine();
  const [jobs, setJobs] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [canManage, setCanManage] = useState(true);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(() => { const m = lsGet("uvix_jobs_mode2", "list"); return MODES.some((x) => x[0] === m) ? m : "list"; });
  const [kindF, setKindF] = useState("all");
  const [groupF, setGroupF] = useState(null);
  const [personF, setPersonF] = useState("");
  const [lineF, setLineF] = useState("");
  const [mine, setMine] = useState(false);
  const [week, setWeek] = useState(() => mondayOf(today()));
  const [edit, setEdit] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(() => lsGet("uvix_jobs_groups", {}));
  const setModeP = (m) => { setMode(m); lsSet("uvix_jobs_mode2", m); };

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([fetchJobs(), fetchTasks().catch(() => [])]);
      setJobs(r.jobs || []); setTasks(t || []); setCanManage(r.canManage !== false); setErr("");
    } catch (e) { setErr(e.message); setJobs((x) => x || []); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const all = useMemo(() => [...(jobs || []), ...tasks.filter((t) => t.status).map(fromTask)], [jobs, tasks]);
  const base = useMemo(() => all.filter((j) =>
    (!personF || (personF === "none" ? !(j.assigneeIds || []).length : (j.assigneeIds || []).includes(personF))) &&
    (!lineF || j.line === lineF) &&
    (!mine || (j.assigneeIds || []).includes(currentUser.id))), [all, personF, lineF, mine, currentUser.id]);
  const list = useMemo(() => base.filter((j) => kindF === "all" || j.kind === kindF), [base, kindF]);
  const groups = useMemo(() => groupJobs(list), [list]);
  const gcount = Object.fromEntries(groups.map(([k, , arr]) => [k, arr.length]));
  const counts = useMemo(() => {
    const c = { all: base.filter(isOpen).length };
    for (const k of Object.keys(JOB_KINDS)) c[k] = base.filter((j) => j.kind === k && isOpen(j)).length;
    return c;
  }, [base]);
  const weekDone = useMemo(() => weekDoneCount(list), [list]);
  const opened = openId ? (jobs || []).find((j) => j.id === openId) : null;

  async function markDone(j) {
    setBusy(true);
    try { await updateJob(j.id, { status: "done" }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); setConfirm(null); }
  }
  async function quickStatus(j, status) {
    setBusy(true);
    try { await updateJob(j.id, { status }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function patchJob(j, body) {
    setBusy(true); setErr("");
    try { const r = await updateJob(j.id, body); setJobs((l) => (l || []).map((x) => (x.id === j.id ? r.job : x))); load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const plan = (j, preset) => setEdit(j ? j : { _preset: preset || {} });
  const people = useMemo(() => (employees || []).filter((e) => e.role !== "admin" && !e.deletedAt), [employees]);
  const isGroupOpen = (k) => {
    if (groupF) return true;
    if (open[k] !== undefined) return open[k];
    if (k === "done" || k === "later") return false;
    if (k === "tomorrow") return !(gcount.late || gcount.today || gcount.nodate);
    return true;
  };
  const toggleGroup = (k) => { const next = { ...open, [k]: !isGroupOpen(k) }; setOpen(next); lsSet("uvix_jobs_groups", next); };

  const chip = (k, label, n, I) => {
    const on = kindF === k;
    return (
      <button key={k} type="button" onClick={() => setKindF(on && k !== "all" ? "all" : k)} aria-pressed={on} data-kind-filter={k}
        style={{ height: 34, padding: "0 12px", borderRadius: 10, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
          border: 0, background: on ? THEME.text : "transparent", color: on ? THEME.card : THEME.text }}>
        {I && <I size={15} />}{label}{n ? <span style={{ fontWeight: 600, color: on ? THEME.card : THEME.muted }}>{n}</span> : null}
      </button>
    );
  };
  const stat = (k, label, n, I, tone) => {
    const on = groupF === k;
    const c = tone === "rose" ? THEME.rose : tone === "green" ? THEME.green : THEME.text;
    return (
      <button key={k} type="button" onClick={() => setGroupF(on ? null : k)} aria-pressed={on} data-stat={k}
        style={{ flex: isMobile ? "0 0 auto" : 1, minWidth: isMobile ? 104 : 0, textAlign: "left", padding: isMobile ? "10px 12px" : "12px 16px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
          border: `1.5px solid ${on ? THEME.text : tone === "rose" && n ? THEME.roseBorder : THEME.border}`, background: on ? THEME.chip : THEME.card, color: THEME.text, boxShadow: on ? THEME.shadowMd : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: tone === "rose" && n ? THEME.rose : THEME.muted }}><I size={15} />{label}</div>
        <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, marginTop: 4, color: n ? c : THEME.dim, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      </button>
    );
  };
  const showLine = line === "all";
  const selStyle = { height: 34, borderRadius: 10, border: `1px dashed ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 13.5, padding: "0 10px", cursor: "pointer" };
  const visibleGroups = groups.filter(([k, , arr]) => arr.length && (!groupF || groupF === k));

  return (
    <div data-testid="jobs-view" style={{ paddingRight: opened && !isMobile ? 440 : 0, transition: "padding .2s" }}>
      {/* Ko'rinish + qo'shish */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: isMobile ? "nowrap" : "wrap" }}>
        <div role="group" aria-label="Ko'rinish" style={{ display: "inline-flex", background: THEME.chip, borderRadius: 11, padding: 3, gap: 2, flex: isMobile ? 1 : "0 0 auto", minWidth: 0 }}>
          {MODES.map(([v, l, I]) => (
            <button key={v} type="button" onClick={() => setModeP(v)} aria-pressed={mode === v} data-jobs-mode={v}
              style={{ flex: isMobile ? 1 : "0 0 auto", justifyContent: "center", height: 34, padding: isMobile ? "0 4px" : "0 14px", border: 0, borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, background: mode === v ? THEME.card : "transparent", color: mode === v ? THEME.text : THEME.muted, boxShadow: mode === v ? THEME.shadowSm : "none" }}>
              {!isMobile && <I size={15} />}{l}
            </button>
          ))}
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        {canManage && (
          <button type="button" onClick={() => setEdit({})} data-testid="job-new" aria-label="Yangi vazifa"
            style={{ height: 40, padding: isMobile ? "0 11px" : "0 18px", borderRadius: 11, border: 0, background: THEME.primarySolid || THEME.violet, color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <Plus size={17} />{!isMobile && " Vazifa"}
          </button>
        )}
      </div>

      {/* Holat kartalari */}
      {mode === "list" && <div style={{ display: "flex", gap: 10, marginBottom: 12, overflowX: isMobile ? "auto" : "visible" }} className="uvix-scroll" data-testid="jobs-stats">
        {stat("late", "Kechikkan", gcount.late || 0, AlarmClock, "rose")}
        {stat("today", "Bugun", gcount.today || 0, Sun)}
        {stat("tomorrow", "Ertaga", gcount.tomorrow || 0, Sunrise)}
        {stat("nodate", "Sanasiz", gcount.nodate || 0, Inbox)}
        {stat("done", "Bu hafta bajarildi", weekDone, CheckCircle2, "green")}
      </div>}

      {/* Filtrlar */}
      <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 6, marginBottom: 12, display: "flex", flexWrap: isMobile ? "nowrap" : "wrap", gap: 4, alignItems: "center", overflowX: isMobile ? "auto" : "visible" }} className="uvix-scroll">
        {chip("all", "Hammasi", counts.all)}
        {["measure", "install", "deliver", "print", "design", "other"].map((k) => chip(k, JOB_KINDS[k].l, counts[k], JOB_KINDS[k].I))}
        <span style={{ width: 1, height: 22, background: THEME.border, margin: "0 4px", flexShrink: 0 }} />
        <select value={personF} onChange={(e) => setPersonF(e.target.value)} style={selStyle} aria-label="Mas'ul" data-testid="jobs-person">
          <option value="">Mas'ul: hammasi</option>
          <option value="none">Mas'ulsiz</option>
          {people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {showLine && (
          <select value={lineF} onChange={(e) => setLineF(e.target.value)} style={selStyle} aria-label="Yo'nalish" data-testid="jobs-line">
            <option value="">Yo'nalish: hammasi</option><option value="UVIXPRINT">UVIXPRINT</option><option value="UVONYX">UVONYX</option>
          </select>
        )}
        <button type="button" onClick={() => setMine((v) => !v)} aria-pressed={mine} data-testid="jobs-mine"
          style={{ ...selStyle, display: "inline-flex", alignItems: "center", gap: 6, borderStyle: mine ? "solid" : "dashed", borderColor: mine ? THEME.text : THEME.border2, fontWeight: mine ? 700 : 500, whiteSpace: "nowrap" }}>
          <Star size={14} fill={mine ? "currentColor" : "none"} /> Mening ishlarim
        </button>
      </div>

      {canManage && mode === "list" && <QuickAdd employees={people} orders={orders} lineDefault={lineF || (line !== "all" ? line : "UVIXPRINT")} onCreated={load} isMobile={isMobile} />}
      {err && <div role="alert" style={{ padding: "10px 14px", borderRadius: 12, background: THEME.roseBg, color: THEME.roseText || THEME.rose, fontSize: 13.5, marginBottom: 12 }}>{err}</div>}

      {jobs === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48, color: THEME.muted }}><Loader2 size={22} className="uvix-spin" /></div>
      ) : mode === "board" ? (
        <Board list={list} isMobile={isMobile} showLine={showLine} canManage={canManage} employees={people} onOpen={(j) => setOpenId(j.id)} onPatch={patchJob} onDone={(j) => setConfirm(j)} onPlan={(j) => plan(j)} />
      ) : mode === "brigade" ? (
        <Brigade list={list} employees={employees} isMobile={isMobile} canManage={canManage} onOpen={(j) => !j.ro && setOpenId(j.id)} onPatch={patchJob} onPlan={plan} />
      ) : mode === "calendar" ? (
        <WeekCalendar list={list} week={week} setWeek={setWeek} isMobile={isMobile} onOpen={(j) => setOpenId(j.id)} showLine={showLine} />
      ) : visibleGroups.length === 0 ? (
        <JobsEmpty kind={kindF !== "all" ? kindF : null} group={groupF} canManage={canManage} onAdd={(k) => setEdit({ _preset: { kind: FIELD_KINDS.includes(k) ? k : "measure" } })} onGo={onGo} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visibleGroups.map(([k, label, arr]) => {
            const I = GROUP_ICON[k]; const isOpenG = isGroupOpen(k);
            const shown = k === "done" && !groupF ? arr.slice(0, 30) : arr;
            return (
              <section key={k} data-job-group={k}>
                <button type="button" onClick={() => toggleGroup(k)} aria-expanded={isOpenG} data-group-toggle={k}
                  style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "none", padding: "2px 0", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", color: k === "late" ? THEME.rose : THEME.mutedDark || THEME.muted }}>
                  <I size={16} />
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}{k === "today" ? ` · ${new Date().getDate()}-${["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"][new Date().getMonth()]}` : ""}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: k === "late" ? THEME.roseBg : THEME.chip }}>{arr.length}</span>
                  {isOpenG ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  {!isOpenG && <span style={{ fontSize: 12.5, color: THEME.dim, fontWeight: 500 }}>— bosilsa ochiladi</span>}
                </button>
                {isOpenG && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {shown.map((j) => <JobRow key={j.id} j={j} isMobile={isMobile} showLine={showLine} selected={openId === j.id} busy={busy}
                      onOpen={() => !j.ro && setOpenId(j.id)} onDone={() => setConfirm(j)} onStart={() => quickStatus(j, "doing")} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {opened && (
        <JobDrawer job={opened} canManage={canManage} isMobile={isMobile} onClose={() => setOpenId(null)}
          onChanged={(nj) => setJobs((l) => (l || []).map((x) => (x.id === nj.id ? nj : x)))}
          onEdit={(j) => setEdit(j)} onDone={(j) => setConfirm(j)} />
      )}
      {edit && <JobForm job={edit.id ? edit : null} preset={edit._preset} employees={employees} orders={orders} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {confirm && (
        <ConfirmDialog title="Bajarildimi?" message={`«${confirm.title}» bajarildi deb belgilansinmi?${confirm.orderId && ["install", "deliver"].includes(confirm.kind) ? " Buyurtma «Topshirildi» bo'ladi." : ""}`}
          confirmLabel="Ha, bajarildi" tone="primary" icon={Check} onCancel={() => setConfirm(null)} onConfirm={() => markDone(confirm)} />
      )}
    </div>
  );
}

// ---------- Ro'yxat qatori ----------
function JobRow({ j, isMobile, showLine, selected, busy, onOpen, onDone, onStart }) {
  const late = isLate(j);
  const done = !isOpen(j);
  const circle = (
    <button type="button" onClick={(e) => { e.stopPropagation(); if (!done && !j.ro) onDone(); }} disabled={busy || done || j.ro} data-job-done={!done && !j.ro ? j.id : undefined}
      aria-label={done ? "Bajarilgan" : "Bajarildi deb belgilash"} title={j.ro ? "Buyurtma ichida belgilanadi" : done ? "Bajarilgan" : "Bajarildi"}
      style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, padding: 0, display: "grid", placeItems: "center", cursor: done || j.ro ? "default" : "pointer",
        border: `2px solid ${done ? THEME.green : THEME.border2}`, background: done ? THEME.green : THEME.card, color: "#fff" }}>
      {done && <Check size={14} strokeWidth={3} />}
    </button>
  );
  const sub = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4, minWidth: 0 }}>
      <KindBadge kind={j.kind} small />
      {showLine && j.line && <LineTag line={j.line} />}
      {j.address && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: THEME.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}><MapPin size={13} />{j.address}</span>}
      {j.checklist?.length > 0 && <span style={{ fontSize: 12.5, color: THEME.muted }}>☑ {j.checklist.filter((c) => c.done).length}/{j.checklist.length}</span>}
      {j.auto && j.status === "new" && <span title="Buyurtma «Tayyor» bo'lganda o'zi yaratildi" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: THEME.dim }}><Zap size={12} />avtomatik</span>}
      {j.ro && <span style={{ fontSize: 12, color: THEME.dim }}>buyurtma ichida</span>}
    </div>
  );
  const when = <span style={{ fontSize: 14, fontWeight: 700, color: late ? THEME.rose : THEME.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{whenText(j)}</span>;
  const action = !j.ro && !done ? (
    j.status === "new"
      ? <button type="button" onClick={(e) => { e.stopPropagation(); onStart(); }} disabled={busy} aria-label="Boshlash" title="Boshlash" data-job-start={j.id} style={iconBtn}><Play size={16} /></button>
      : j.address ? <a href={mapsUrl(j.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Yo'l" title="Yo'l" style={iconBtn}><Navigation size={16} /></a> : <span style={{ width: 38 }} />
  ) : <span style={{ width: 38 }} />;
  const rowStyle = { background: THEME.card, border: `1.5px solid ${selected ? THEME.blue : late ? THEME.roseBorder : THEME.border}`, borderRadius: 14, cursor: j.ro ? "default" : "pointer", opacity: done ? 0.62 : 1, boxShadow: selected ? `0 0 0 3px ${THEME.blueBg}` : "none" };
  const title = <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, textDecoration: j.status === "cancelled" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isMobile ? "normal" : "nowrap" }}>{j.title}</div>;
  const onKey = (e) => { if (!j.ro && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } };

  if (isMobile) {
    return (
      <div data-job={j.id} onClick={onOpen} role={j.ro ? undefined : "button"} tabIndex={j.ro ? undefined : 0} onKeyDown={onKey} style={{ ...rowStyle, padding: "11px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ paddingTop: 2 }}>{circle}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title}{sub}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>{when}<div style={{ flex: 1 }} /><Avatars list={j.assignees} size={26} /><StatusPill j={j} small /></div>
        </div>
      </div>
    );
  }
  return (
    <div data-job={j.id} onClick={onOpen} role={j.ro ? undefined : "button"} tabIndex={j.ro ? undefined : 0} onKeyDown={onKey}
      style={{ ...rowStyle, padding: "11px 14px", display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 110px 92px 118px 38px", gap: 12, alignItems: "center" }}>
      {circle}
      <div style={{ minWidth: 0 }}>{title}{sub}</div>
      {when}
      <Avatars list={j.assignees} />
      <span><StatusPill j={j} /></span>
      {action}
    </div>
  );
}
const iconBtn = { width: 38, height: 38, borderRadius: 11, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" };

// ---------- Tezkor qo'shish: bitta satr ----------
function QuickAdd({ employees, orders, lineDefault, onCreated, isMobile }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const p = useMemo(() => parseQuick(text, { employees, orders }), [text, employees, orders]);
  const TONE = { kind: [THEME.violet, THEME.violetSoft], order: [THEME.greenText, THEME.greenBg], date: [THEME.blueText, THEME.blueBg], time: [THEME.blueText, THEME.blueBg], person: ["#6D28D9", "#6D28D91A"] };
  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    if (!p.title && !p.orderId) { setMsg("Nomini yozing: masalan «Montaj ON-261016-001 ertaga 14:00 @Bekzod»"); return; }
    setBusy(true); setMsg("");
    try {
      await createJob({ kind: p.kind || "other", title: p.title, orderId: p.orderId, date: p.date, time: p.time, assigneeIds: p.assigneeIds, line: lineDefault });
      setText(""); setMsg("✓ Qo'shildi"); onCreated?.();
      setTimeout(() => setMsg(""), 2500);
    } catch (er) { setMsg(er.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ marginBottom: 14 }} data-testid="quick-add">
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: THEME.card, border: `1.5px solid ${text ? THEME.blue : THEME.border}`, borderRadius: 12, padding: "0 12px", minHeight: 46 }}>
        {busy ? <Loader2 size={17} className="uvix-spin" style={{ color: THEME.muted }} /> : <Plus size={17} style={{ color: THEME.muted }} />}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={isMobile ? "Montaj ertaga 14:00 @Bekzod" : "Tezkor qo'shish: «Montaj ON-261016-001 ertaga 14:00 @Bekzod» — Enter"} aria-label="Tezkor qo'shish" data-testid="quick-input"
          style={{ flex: 1, minWidth: 0, height: 44, border: 0, outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14.5, color: THEME.text }} />
        {text && !isMobile && <span style={{ fontSize: 12, color: THEME.dim, fontFamily: "ui-monospace, monospace" }}>Enter</span>}
      </div>
      {(p.tokens.length > 0 || msg) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6, fontSize: 12.5 }} data-testid="quick-tokens">
          {p.tokens.map((t, i) => <span key={i} data-qt={t.t} style={{ padding: "2px 8px", borderRadius: 6, fontWeight: 700, color: TONE[t.t][0], background: TONE[t.t][1] }}>{t.v}</span>)}
          {p.title && <span style={{ color: THEME.muted }}>nomi: «{p.title}»</span>}
          {msg && <span style={{ color: msg.startsWith("✓") ? THEME.greenText : THEME.rose, fontWeight: 600 }}>{msg}</span>}
        </div>
      )}
    </form>
  );
}
