// JobsView.jsx — «Vazifalar»: o'lchov, montaj, yetkazish va boshqa ishlar (kim, nima, qachon, qayerda).
// Tepada holat kartalari (Kechikkan / Bugun / Ertaga / Sanasiz / Bu hafta bajarildi), tur filtrlari, tezkor qo'shish satri.
// Ko'rinishlar: Ro'yxat (guruhlangan qatorlar + o'ng panel), Kalendar. Dizayn/pechat vazifalari (buyurtma ichidagi) — faqat ko'rish.
// MyJobs — ishchi telefoni uchun «Mening kunim» (MyJobs.jsx).
import { usePerms } from "../../lib/perms.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, AlignLeft, CalendarDays, Columns3, Check, CheckCircle2, ChevronDown, ChevronRight, Inbox, List as ListIcon, Loader2, Map as MapIcon, MapPin, Navigation, Play, Plus, Settings, Sun, Sunrise, Star, Zap } from "lucide-react";
import { ConfirmDialog, useIsMobile } from "../../components/ui.jsx";
import { LineTag } from "../../components/LineSwitcher.jsx";
import { useLine } from "../../lib/lines.js";
import { createJob, fetchJobs, fetchTasks, saveJobsConfig, saveJobsPrefs, updateJob } from "../../storage.js";
import { THEME } from "../../theme.js";
import { Board } from "./Board.jsx";
import { Brigade } from "./Brigade.jsx";
import { WeekCalendar } from "./Calendar.jsx";
import { JobDrawer } from "./JobDrawer.jsx";
import { JobForm } from "./JobForm.jsx";
import { JobsMap } from "./JobsMap.jsx";
import { Avatars, JobsEmpty, KindBadge, StatusPill } from "./JobParts.jsx";
import { CustomValue } from "./CustomFields.jsx";
import { JobsSettings } from "./JobsSettings.jsx";
import { colDefs, fieldsFor, fmtCustom, isOn, resolvePrefs } from "./jobsPrefs.js";
import { FIELD_KINDS, JOB_KINDS, groupJobs, isLate, isOpen, mapsUrl, mondayOf, parseQuick, today, weekDoneCount, whenText, fromTask } from "./jobsLib.js";

export { JOB_KINDS } from "./jobsLib.js";
export { JobForm } from "./JobForm.jsx";
export { MyJobs } from "./MyJobs.jsx";

const MODES = [["list", "Ro'yxat", ListIcon], ["board", "Doska", Columns3], ["brigade", "Brigada", AlignLeft], ["calendar", "Kalendar", CalendarDays], ["map", "Xarita", MapIcon]];
const GROUP_ICON = { late: AlarmClock, today: Sun, tomorrow: Sunrise, later: CalendarDays, nodate: Inbox, done: CheckCircle2 };
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export function JobsView({ employees, orders, currentUser, onGo, quickAddNonce = 0, quickAddPrefill = null, onQuickAddHandled }) {
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
  const [config, setConfig] = useState({ fields: [], stages: [], defaults: null });
  const [saved, setSaved] = useState(undefined); // undefined — hali yuklanmagan; null — shaxsiy sozlama yo'q
  const [canConfig, setCanConfig] = useState(false);
  const [srvFlags, setSrvFlags] = useState({ reopen: true, map: true });
  const { can } = usePerms();
  const [scope, setScope] = useState("me");
  const [showSettings, setShowSettings] = useState(false);
  const [cf, setCf] = useState({}); // o'z ustunlari bo'yicha filtr
  const [sort, setSort] = useState(null);
  const saveT = useRef(null);
  const setModeP = (m) => { setMode(m); lsSet("uvix_jobs_mode2", m); };

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([fetchJobs(), fetchTasks().catch(() => [])]);
      setJobs(r.jobs || []); setTasks(t || []); setCanManage(r.canManage !== false); setErr("");
      if (r.config) setConfig(r.config);
      setCanConfig(!!r.canConfig);
      setSrvFlags({ reopen: r.canReopen !== false, map: r.canMap !== false });
      setSaved((v) => { if (v === undefined) { if (r.prefs?.mine || (!r.prefs && r.config?.defaults?.mine)) setMine(true); return r.prefs || null; } return v; });
    } catch (e) { setErr(e.message); setJobs((x) => x || []); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const prefs = useMemo(() => resolvePrefs(scope === "all" ? config.defaults : saved, config), [saved, config, scope]);
  const views = prefs.views.filter((v) => v.on && (v.k !== "map" || srvFlags.map)).map((v) => MODES.find((m) => m[0] === v.k)).filter(Boolean);
  const curMode = views.some((v) => v[0] === mode) ? mode : views[0]?.[0] || "list";
  function setPrefs(next) {
    if (scope === "all") setConfig((c) => ({ ...c, defaults: next })); else setSaved(next);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      try {
        if (scope === "all") { const c = await saveJobsConfig({ defaults: next }); setConfig(c); await saveJobsPrefs(null); setSaved(null); }
        else await saveJobsPrefs(next);
      } catch (e) { setErr(e.message); }
    }, 400);
  }
  async function resetPrefs() {
    try {
      await saveJobsPrefs(null); setSaved(null);
      if (scope === "all") setConfig(await saveJobsConfig({ defaults: null }));
    } catch (e) { setErr(e.message); }
  }
  async function saveConfig(patch) {
    try { setConfig(await saveJobsConfig(patch)); } catch (e) { setErr(e.message); }
  }
  const activeFields = useMemo(() => (config.fields || []).filter((f) => !f.archived), [config]);
  const listCols = prefs.columns.filter((c) => c.on).map((c) => c.k);
  const gridCols = listCols.filter((k) => ["when", "people", "status"].includes(k) || (k.startsWith("f:") && activeFields.some((f) => f.id === k.slice(2))));
  const filtersOn = prefs.filters.filter((x) => x.on).map((x) => x.k);

  const all = useMemo(() => [...(jobs || []), ...tasks.filter((t) => t.status).map(fromTask)], [jobs, tasks]);
  const base = useMemo(() => all.filter((j) =>
    (!personF || (personF === "none" ? !(j.assigneeIds || []).length : (j.assigneeIds || []).includes(personF))) &&
    (!lineF || j.line === lineF) &&
    (!mine || (j.assigneeIds || []).includes(currentUser.id)) &&
    Object.entries(cf).every(([id, v]) => v === "" || v === undefined || (v === "__yes" ? !!j.custom?.[id] : v === "__no" ? !j.custom?.[id] : String(j.custom?.[id] ?? "") === v))), [all, personF, lineF, mine, currentUser.id, cf]);
  const list = useMemo(() => base.filter((j) => kindF === "all" || j.kind === kindF), [base, kindF]);
  const groups = useMemo(() => {
    const g = groupJobs(list);
    if (!sort) return g;
    const val = (j) => sort.k === "when" ? `${j.date || "9999"}${j.time || "99"}` : sort.k === "people" ? (j.assignees || []).map((a) => a.name).join() || "~" : sort.k === "status" ? ({ doing: 0, new: 1, done: 2, cancelled: 3 }[j.status] ?? 4) : sort.k === "title" ? j.title : (j.custom?.[sort.k.slice(2)] ?? "~");
    const cmp = (a, b) => { const x = val(a), y = val(b); const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "uz", { numeric: true }); return sort.dir * r; };
    return g.map(([k, l, arr]) => [k, l, [...arr].sort(cmp)]);
  }, [list, sort]);
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
  // Ovozli yordamchidan: vazifa formasi to'ldirilgan holda ochiladi
  useEffect(() => {
    if (!quickAddNonce) return;
    setEdit({ _preset: quickAddPrefill || {} });
    onQuickAddHandled?.();
  }, [quickAddNonce]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const visibleGroups = groups.filter(([k, , arr]) => arr.length && (!groupF || groupF === k) && (prefs.showDone || k !== "done" || groupF === "done"));
  const STAT = { late: ["Kechikkan", gcount.late || 0, AlarmClock, "rose"], today: ["Bugun", gcount.today || 0, Sun], tomorrow: ["Ertaga", gcount.tomorrow || 0, Sunrise], nodate: ["Sanasiz", gcount.nodate || 0, Inbox], done: ["Bu hafta bajarildi", weekDone, CheckCircle2, "green"] };
  const cardsOn = prefs.cards.filter((c) => c.on && (c.k !== "done" || prefs.showDone));
  const colLabel = Object.fromEntries(colDefs(config));
  const sortBy = (k) => setSort((s0) => (s0?.k === k ? (s0.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }));

  return (
    <div data-testid="jobs-view" style={{ paddingRight: (opened || showSettings) && !isMobile ? 440 : 0, transition: "padding .2s" }}>
      {/* Ko'rinish + qo'shish */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: isMobile ? "nowrap" : "wrap" }}>
        <button type="button" onClick={() => { setOpenId(null); setShowSettings(true); }} aria-label="Bo'limni sozlash" title="Bo'limni sozlash" data-testid="jobs-gear"
          style={{ width: 40, height: 40, borderRadius: 11, border: `1.5px solid ${showSettings ? THEME.blue : THEME.border}`, background: showSettings ? THEME.blueBg : THEME.card, color: showSettings ? THEME.blue : THEME.text, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
          <Settings size={18} />
        </button>
        {views.length > 1 && <div role="group" aria-label="Ko'rinish" className={isMobile ? "uvix-scroll" : undefined} style={{ display: "inline-flex", background: THEME.chip, borderRadius: 11, padding: 3, gap: 2, flex: isMobile ? 1 : "0 0 auto", minWidth: 0, overflowX: isMobile ? "auto" : "visible" }}>
          {views.map(([v, l, I]) => (
            <button key={v} type="button" onClick={(e) => { setModeP(v); e.currentTarget.scrollIntoView?.({ inline: "nearest", block: "nearest" }); }} aria-pressed={curMode === v} data-jobs-mode={v}
              style={{ flex: isMobile ? (views.length > 3 ? "0 0 auto" : 1) : "0 0 auto", justifyContent: "center", height: 34, padding: isMobile ? (views.length > 3 ? "0 11px" : "0 4px") : "0 14px", whiteSpace: "nowrap", border: 0, borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, background: curMode === v ? THEME.card : "transparent", color: curMode === v ? THEME.text : THEME.muted, boxShadow: curMode === v ? THEME.shadowSm : "none" }}>
              {!isMobile && <I size={15} />}{l}
            </button>
          ))}
        </div>}
        {(!isMobile || views.length <= 1) && <div style={{ flex: 1 }} />}
        {canManage && (
          <button type="button" onClick={() => setEdit({})} data-testid="job-new" aria-label="Yangi vazifa"
            style={{ height: 40, padding: isMobile ? "0 11px" : "0 18px", borderRadius: 11, border: 0, background: THEME.primarySolid || THEME.violet, color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <Plus size={17} />{!isMobile && " Vazifa"}
          </button>
        )}
      </div>

      {/* Holat kartalari */}
      {curMode === "list" && cardsOn.length > 0 && <div style={{ display: "flex", gap: 10, marginBottom: 12, overflowX: isMobile ? "auto" : "visible" }} className="uvix-scroll" data-testid="jobs-stats">
        {cardsOn.map((c) => stat(c.k, ...STAT[c.k]))}
      </div>}

      {/* Filtrlar */}
      {filtersOn.length > 0 && <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 6, marginBottom: 12, display: "flex", flexWrap: isMobile ? "nowrap" : "wrap", gap: 4, alignItems: "center", overflowX: isMobile ? "auto" : "visible" }} className="uvix-scroll" data-testid="jobs-filters">
        {filtersOn.map((fk, i) => {
          const sep = i > 0 && filtersOn[i - 1] === "kinds" ? <span key={fk + "sep"} style={{ width: 1, height: 22, background: THEME.border, margin: "0 4px", flexShrink: 0 }} /> : null;
          let el = null;
          if (fk === "kinds") el = <span key={fk} style={{ display: "contents" }}>{chip("all", "Hammasi", counts.all)}{["measure", "install", "deliver", "print", "design", "other"].map((k) => chip(k, JOB_KINDS[k].l, counts[k], JOB_KINDS[k].I))}</span>;
          else if (fk === "person") el = (
            <select key={fk} value={personF} onChange={(e) => setPersonF(e.target.value)} style={selStyle} aria-label="Mas'ul" data-testid="jobs-person">
              <option value="">Mas'ul: hammasi</option><option value="none">Mas'ulsiz</option>
              {people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>);
          else if (fk === "line") el = showLine ? (
            <select key={fk} value={lineF} onChange={(e) => setLineF(e.target.value)} style={selStyle} aria-label="Yo'nalish" data-testid="jobs-line">
              <option value="">Yo'nalish: hammasi</option><option value="UVIXPRINT">UVIXPRINT</option><option value="UVONYX">UVONYX</option>
            </select>) : null;
          else if (fk === "mine") el = (
            <button key={fk} type="button" onClick={() => setMine((v) => !v)} aria-pressed={mine} data-testid="jobs-mine"
              style={{ ...selStyle, display: "inline-flex", alignItems: "center", gap: 6, borderStyle: mine ? "solid" : "dashed", borderColor: mine ? THEME.text : THEME.border2, fontWeight: mine ? 700 : 500, whiteSpace: "nowrap" }}>
              <Star size={14} fill={mine ? "currentColor" : "none"} /> Mening ishlarim
            </button>);
          else if (fk.startsWith("f:")) {
            const f = activeFields.find((x) => x.id === fk.slice(2));
            if (f) {
              const opts = f.type === "check" ? [["__yes", "Ha"], ["__no", "Yo'q"]] : f.type === "select" ? f.options.map((o) => [o, o]) : people.map((e) => [e.id, e.name]);
              el = (
                <select key={fk} value={cf[f.id] || ""} onChange={(e) => setCf((x) => ({ ...x, [f.id]: e.target.value }))} style={{ ...selStyle, borderStyle: cf[f.id] ? "solid" : "dashed" }} aria-label={f.name} data-cf-filter={f.id}>
                  <option value="">{f.name}: hammasi</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>);
            }
          }
          return el ? [sep, el] : null;
        })}
      </div>}

      {canManage && curMode === "list" && <QuickAdd employees={people} orders={orders} lineDefault={lineF || (line !== "all" ? line : "UVIXPRINT")} onCreated={load} isMobile={isMobile} />}
      {err && <div role="alert" style={{ padding: "10px 14px", borderRadius: 12, background: THEME.roseBg, color: THEME.roseText || THEME.rose, fontSize: 13.5, marginBottom: 12 }}>{err}</div>}

      {jobs === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48, color: THEME.muted }}><Loader2 size={22} className="uvix-spin" /></div>
      ) : curMode === "board" ? (
        <Board list={list} stages={config.stages || []} isMobile={isMobile} showLine={showLine} canManage={canManage} employees={people} onOpen={(j) => setOpenId(j.id)} onPatch={patchJob} onDone={(j) => setConfirm(j)} onPlan={(j) => plan(j)} />
      ) : curMode === "brigade" ? (
        <Brigade list={list} employees={employees} isMobile={isMobile} canManage={canManage} onOpen={(j) => !j.ro && setOpenId(j.id)} onPatch={patchJob} onPlan={plan} />
      ) : curMode === "map" ? (
        <JobsMap list={list} employees={people} isMobile={isMobile} canWatch={can("geo.view")} isAdmin={can("geo.config")} onOpen={(j) => !j.ro && setOpenId(j.id)} onPatch={patchJob} onPlan={(j) => setEdit(j)} />
      ) : curMode === "calendar" ? (
        <WeekCalendar list={list} week={week} setWeek={setWeek} isMobile={isMobile} onOpen={(j) => setOpenId(j.id)} showLine={showLine} />
      ) : visibleGroups.length === 0 ? (
        <JobsEmpty kind={kindF !== "all" ? kindF : null} group={groupF} canManage={canManage} onAdd={(k) => setEdit({ _preset: { kind: FIELD_KINDS.includes(k) ? k : "measure" } })} onGo={onGo} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!isMobile && (
            <div data-testid="list-head" style={{ display: "grid", gridTemplateColumns: gridTemplate(gridCols), gap: 12, padding: "0 16px", fontSize: 12.5, fontWeight: 700, color: THEME.muted, marginBottom: -6 }}>
              <span />
              <button type="button" onClick={() => sortBy("title")} style={headBtn}>Vazifa{sort?.k === "title" ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</button>
              {gridCols.map((k) => <button key={k} type="button" onClick={() => sortBy(k)} data-col-head={k} style={{ ...headBtn, color: k.startsWith("f:") ? THEME.blue : THEME.muted }}>{colLabel[k]}{k.startsWith("f:") ? " ✦" : ""}{sort?.k === k ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</button>)}
              <span />
            </div>
          )}
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
                    {shown.map((j) => <JobRow key={j.id} j={j} isMobile={isMobile} showLine={showLine && isOn(prefs.columns, "line")} selected={openId === j.id} busy={busy}
                      cols={gridCols} inline={listCols} fields={activeFields} employees={people} compact={prefs.compact}
                      onCustom={(c) => patchJob(j, { custom: c })}
                      onOpen={() => !j.ro && setOpenId(j.id)} onDone={() => setConfirm(j)} onStart={() => quickStatus(j, "doing")} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {opened && (
        <JobDrawer job={opened} canManage={canManage} canReopen={srvFlags.reopen} isMobile={isMobile} onClose={() => setOpenId(null)}
          onChanged={(nj) => setJobs((l) => (l || []).map((x) => (x.id === nj.id ? nj : x)))}
          onEdit={(j) => setEdit(j)} onDone={(j) => setConfirm(j)} stages={config.stages || []}
          customFields={fieldsFor(config, opened.kind)} renderCustom={(f, j, patch) => <CustomValue f={f} j={j} employees={people} onSave={(c) => patch({ custom: c })} align="right" />} />
      )}
      {showSettings && (
        <JobsSettings prefs={prefs} setPrefs={setPrefs} config={config} canConfig={canConfig} scope={scope} setScope={setScope} isMobile={isMobile}
          onSaveConfig={saveConfig} onReset={resetPrefs} onClose={() => setShowSettings(false)} />
      )}
      {edit && <JobForm allJobs={jobs || []} job={edit.id ? edit : null} preset={edit._preset} config={config} employees={employees} orders={orders} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {confirm && (
        <ConfirmDialog title="Bajarildimi?" message={`«${confirm.title}» bajarildi deb belgilansinmi?${confirm.orderId && ["install", "deliver"].includes(confirm.kind) ? " Buyurtma «Topshirildi» bo'ladi." : ""}`}
          confirmLabel="Ha, bajarildi" tone="primary" icon={Check} onCancel={() => setConfirm(null)} onConfirm={() => markDone(confirm)} />
      )}
    </div>
  );
}

// ---------- Ro'yxat qatori ----------
const COL_W = { when: "110px", people: "92px", status: "118px" };
function gridTemplate(cols) { return `28px minmax(0,1fr) ${cols.map((k) => COL_W[k] || "minmax(90px, 140px)").join(" ")} 38px`; }
const headBtn = { border: 0, background: "none", padding: 0, textAlign: "left", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: THEME.muted, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

function JobRow({ j, isMobile, showLine, selected, busy, onOpen, onDone, onStart, cols = ["when", "people", "status"], inline = ["address", "checklist"], fields = [], employees = [], compact, onCustom }) {
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
      {j.address && inline.includes("address") && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: THEME.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}><MapPin size={13} />{j.address}</span>}
      {isMobile && fields.filter((f) => inline.includes(`f:${f.id}`) && j.custom?.[f.id] !== undefined && j.custom?.[f.id] !== "").map((f) => <span key={f.id} style={{ fontSize: 12.5, color: THEME.blue }}>{f.name}: <b>{fmtCustom(f, j.custom[f.id], employees)}</b></span>)}
      {j.checklist?.length > 0 && inline.includes("checklist") && <span style={{ fontSize: 12.5, color: THEME.muted }}>☑ {j.checklist.filter((c) => c.done).length}/{j.checklist.length}</span>}
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
  const onKey = (e) => { if (e.target !== e.currentTarget) return; if (!j.ro && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } };

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
  const cell = (k) => {
    if (k === "when") return <span key={k}>{when}</span>;
    if (k === "people") return <span key={k}><Avatars list={j.assignees} size={compact ? 24 : 28} /></span>;
    if (k === "status") return <span key={k}><StatusPill j={j} small={compact} /></span>;
    const f = fields.find((x) => x.id === k.slice(2));
    return <span key={k} style={{ minWidth: 0, overflow: "hidden" }}>{f && !j.ro ? <CustomValue f={f} j={j} employees={employees} onSave={onCustom} /> : null}</span>;
  };
  return (
    <div data-job={j.id} onClick={onOpen} role={j.ro ? undefined : "button"} tabIndex={j.ro ? undefined : 0} onKeyDown={onKey}
      style={{ ...rowStyle, padding: compact ? "6px 14px" : "11px 14px", display: "grid", gridTemplateColumns: gridTemplate(cols), gap: 12, alignItems: "center", borderRadius: compact ? 10 : 14 }}>
      {circle}
      <div style={{ minWidth: 0, display: compact ? "flex" : "block", alignItems: "center", gap: 8 }}>{compact ? <><KindBadge kind={j.kind} small />{title}</> : <>{title}{sub}</>}</div>
      {cols.map(cell)}
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
