// MyJobs.jsx — ishchi telefoni: «Mening kunim». Bitta savol — «bugun nima qilaman?»
// Tepada «Keyingisi» katta kartasi (Yo'l / Boshlash / Bajarildi), pastda qolganlari. Kartani o'ngga sursa — «Bajarildi».
// Karta bosilsa — pastdan vazifa varag'i (tekshiruv ro'yxati, rasm, izoh).
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MapPin, Navigation, Phone, Play } from "lucide-react";
import { ConfirmDialog } from "../../components/ui.jsx";
import { fetchJobs, updateJob } from "../../storage.js";
import { THEME } from "../../theme.js";
import { JobDrawer } from "./JobDrawer.jsx";
import { KindBadge } from "./JobParts.jsx";
import { JOB_KINDS, MONTHS, WD_FULL, addDays, byWhen, isLate, isOpen, mapsUrl, today, untilText, weekdayOf, whenText } from "./jobsLib.js";

export function MyJobs({ currentUser, hideEmpty }) {
  const [jobs, setJobs] = useState(null);
  const [tab, setTab] = useState("today");
  const [confirm, setConfirm] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const r = await fetchJobs(); setJobs((r.jobs || []).filter((j) => (j.assigneeIds || []).includes(currentUser.id))); } catch (e) { setErr(e.message); setJobs((x) => x || []); } }, [currentUser.id]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  if (jobs === null) return null;
  const open = jobs.filter(isOpen);
  const t = today();
  const doneToday = jobs.filter((j) => j.status === "done" && String(j.doneAt || "").slice(0, 10) === t).length;
  const tabs = [
    ["today", "Bugun", open.filter((j) => !isLate(j) && (j.date === t || !j.date))],
    ["late", "Kechikkan", open.filter(isLate)],
    ["tomorrow", "Ertaga", open.filter((j) => j.date === addDays(t, 1))],
    ["later", "Keyin", open.filter((j) => j.date && j.date > addDays(t, 1))],
  ];
  if (hideEmpty && !open.length) return null;
  const cur = tabs.find((x) => x[0] === tab) || tabs[0];
  // Jarayondagisi birinchi, keyin vaqt bo'yicha; vaqtsizlar oxirida
  const sorted = [...cur[2]].sort((a, b) => (a.status === "doing" ? 0 : 1) - (b.status === "doing" ? 0 : 1) || byWhen(a, b));
  const next = tab === "today" ? sorted[0] : null;
  const rest = next ? sorted.slice(1) : sorted;
  const opened = openId ? jobs.find((j) => j.id === openId) : null;

  async function setStatus(j, status) {
    setBusy(true);
    try { await updateJob(j.id, { status }); setConfirm(null); await load(); } catch (e) { setErr(e.message); setConfirm(null); } finally { setBusy(false); }
  }
  const wd = WD_FULL[weekdayOf(t)];
  const btn = { flex: 1, height: 48, borderRadius: 13, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, textDecoration: "none" };

  return (
    <section data-testid="my-jobs" style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, color: THEME.muted }}>{wd}, {Number(t.slice(8))}-{MONTHS[Number(t.slice(5, 7)) - 1]}</div>
      <h2 style={{ margin: "2px 0 12px", fontSize: 24, fontWeight: 800, letterSpacing: -0.3 }}>Mening kunim</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }} className="uvix-scroll">
        {tabs.map(([k, l, arr]) => {
          const on = tab === k; const rose = k === "late" && arr.length;
          return (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={on} data-myjobs-tab={k}
              style={{ height: 38, padding: "0 15px", borderRadius: 19, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                border: `1.5px solid ${on ? THEME.text : rose ? THEME.roseBorder : THEME.border}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : rose ? THEME.rose : THEME.text }}>
              {l} <span style={{ opacity: 0.7 }}>{arr.length}</span>
            </button>
          );
        })}
        {doneToday > 0 && <span style={{ alignSelf: "center", fontSize: 13, color: THEME.greenText, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 4 }}>✓ bugun {doneToday}</span>}
      </div>
      {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {sorted.length === 0 ? (
        <div style={{ color: THEME.muted, fontSize: 14.5, padding: "18px 14px", textAlign: "center", border: `1.5px dashed ${THEME.border}`, borderRadius: 14 }}>
          {tab === "today" ? "Bugun ish yo'q — dam oling yoki menejerdan so'rang" : tab === "late" ? "Kechikkan ish yo'q 👍" : "Bu yerda ish yo'q"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {next && (() => {
            const k = JOB_KINDS[next.kind] || JOB_KINDS.other;
            const u = untilText(next);
            return (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted }}>{next.status === "doing" ? "Hozir" : "Keyingisi"}{u && next.status !== "doing" ? ` · ${u}` : ""}</div>
                <div data-myjob={next.id} data-myjob-next onClick={() => setOpenId(next.id)} role="button" tabIndex={0}
                  style={{ background: THEME.card, border: `2px solid ${isLate(next) ? THEME.rose : k.c}`, borderRadius: 18, padding: 14, boxShadow: `0 0 0 4px ${k.c}14`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <KindBadge kind={next.kind} small suffix={next.time || null} />
                    {next.status === "doing" && <span style={{ fontSize: 12, fontWeight: 700, color: THEME.amber }}>● jarayonda</span>}
                    <div style={{ flex: 1 }} />
                    <DoneCircle j={next} onDone={() => setConfirm(next)} />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3, marginTop: 8 }}>{next.title}</div>
                  {next.address && <div style={{ fontSize: 14.5, color: THEME.muted, marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}><MapPin size={15} />{next.address}</div>}
                  {next.phone && <div style={{ fontSize: 14.5, color: THEME.muted, marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}><Phone size={15} />{next.order?.customer ? `${next.order.customer} · ` : ""}{next.phone}</div>}
                  {next.checklist?.length > 0 && <div style={{ fontSize: 13, color: THEME.muted, marginTop: 4 }}>☑ {next.checklist.filter((c) => c.done).length}/{next.checklist.length} tekshiruv</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
                    {next.address && <a href={mapsUrl(next.address)} target="_blank" rel="noreferrer" style={{ ...btn, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text }}><Navigation size={17} /> Yo'l</a>}
                    {!next.address && next.phone && <a href={`tel:${next.phone.replace(/[^\d+]/g, "")}`} style={{ ...btn, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text }}><Phone size={17} /> Qo'ng'iroq</a>}
                    {next.status === "new"
                      ? <button type="button" disabled={busy} onClick={() => setStatus(next, "doing")} data-myjob-start={next.id} style={{ ...btn, border: 0, background: k.c, color: "#fff" }}><Play size={17} /> Boshlash</button>
                      : <button type="button" disabled={busy} onClick={() => setConfirm(next)} data-myjob-finish={next.id} style={{ ...btn, border: 0, background: THEME.greenSolid, color: "#fff" }}><Check size={18} /> Bajarildi</button>}
                  </div>
                </div>
              </>
            );
          })()}
          {next && rest.length > 0 && <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted, marginTop: 6 }}>Keyin</div>}
          {rest.map((j) => <SwipeCard key={j.id} j={j} onOpen={() => setOpenId(j.id)} onDone={() => setConfirm(j)} />)}
          <div style={{ fontSize: 12, color: THEME.dim, textAlign: "center", marginTop: 2 }}>Kartani o'ngga suring — «Bajarildi»</div>
        </div>
      )}
      {opened && <JobDrawer job={opened} canManage={false} isMobile onClose={() => setOpenId(null)} onChanged={(nj) => setJobs((l) => l.map((x) => (x.id === nj.id ? nj : x)))} onDone={(j) => setConfirm(j)} />}
      {confirm && <ConfirmDialog title="Bajarildimi?" message={`«${confirm.title}» bajarildi deb belgilansinmi?`} confirmLabel="Ha, bajarildi" tone="primary" icon={Check} onCancel={() => setConfirm(null)} onConfirm={() => setStatus(confirm, "done")} />}
    </section>
  );
}

function DoneCircle({ j, onDone }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }} data-myjob-done={j.id} aria-label="Bajarildi" title="Bajarildi"
      style={{ width: 34, height: 34, borderRadius: "50%", border: `2px solid ${THEME.border2}`, background: THEME.card, color: THEME.greenText, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
      <Check size={17} />
    </button>
  );
}

// O'ngga surish → «Bajarildi» (yashil fon ochiladi)
function SwipeCard({ j, onOpen, onDone }) {
  const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
  const [dx, setDx] = useState(0);
  const st = useRef(null);
  const swiped = useRef(false);
  const late = isLate(j);
  const down = (e) => { st.current = { x: e.clientX, y: e.clientY, moved: false, lock: null }; };
  const move = (e) => {
    const s = st.current; if (!s) return;
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (s.lock == null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) s.lock = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y";
    if (s.lock === "x") { s.moved = true; setDx(Math.max(0, Math.min(140, ddx))); }
  };
  const up = () => {
    const s = st.current; st.current = null;
    if (s?.moved) { swiped.current = true; setTimeout(() => { swiped.current = false; }, 300); if (dx > 90) onDone(); setDx(0); return; }
    setDx(0);
  };
  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: THEME.greenSolid, color: "#fff", display: "flex", alignItems: "center", paddingLeft: 18, gap: 6, fontWeight: 700, fontSize: 14, opacity: dx > 10 ? 1 : 0 }}><Check size={18} /> Bajarildi</div>
      <div data-myjob={j.id} role="button" tabIndex={0} onClick={() => { if (!swiped.current) onOpen(); }} onKeyDown={(e) => e.key === "Enter" && onOpen()}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { st.current = null; setDx(0); }}
        style={{ position: "relative", transform: `translateX(${dx}px)`, transition: st.current ? "none" : "transform .18s", touchAction: "pan-y", background: THEME.card, border: `1px solid ${late ? THEME.roseBorder : THEME.border}`, borderLeft: `4px solid ${late ? THEME.rose : k.c}`, borderRadius: 14, padding: "11px 12px", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <KindBadge kind={j.kind} small suffix={late ? `kechikdi · ${whenText(j)}` : j.time || (j.date && j.date !== today() ? whenText(j) : null)} />
          <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3, marginTop: 5 }}>{j.title}</div>
          {j.address && <div style={{ fontSize: 13.5, color: THEME.muted, marginTop: 3, display: "flex", gap: 5, alignItems: "center" }}><MapPin size={13} />{j.address}</div>}
          {j.assignees?.length > 1 && <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>Brigada: {j.assignees.map((a) => a.name.split(" ")[0]).join(", ")}</div>}
        </div>
        <DoneCircle j={j} onDone={onDone} />
      </div>
    </div>
  );
}
