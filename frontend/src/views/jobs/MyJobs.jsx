// MyJobs.jsx — ishchi telefoni: «Mening kunim». Bitta savol — «bugun nima qilaman?»
// Tepada «Keyingisi» katta kartasi (Yo'l / Boshlash / Bajarildi), pastda qolganlari. Kartani o'ngga sursa — «Bajarildi».
// Karta bosilsa — pastdan vazifa varag'i (tekshiruv ro'yxati, rasm, izoh).
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Lightbulb, LocateFixed, MapPin, Navigation, Phone, Play, Sparkles } from "lucide-react";
import { fetchJobs, updateJob } from "../../storage.js";
import { THEME } from "../../theme.js";
import { JobDrawer } from "./JobDrawer.jsx";
import { KindBadge } from "./JobParts.jsx";
import { SlideToDone, UndoToast } from "./SlideToDone.jsx";
import { CustomValue } from "./CustomFields.jsx";
import { fieldsFor } from "./jobsPrefs.js";
import { usePosition } from "./GeoTracker.jsx";
import { LeafletMap, meHtml, pinHtml } from "./LeafletMap.jsx";
import { fmtKm, okGeo, planDay, roadKm, travelMin, yandexRoute } from "./geoLib.js";
import { JOB_KINDS, MONTHS, WD_FULL, addDays, byWhen, isLate, isOpen, mapsUrl, today, untilText, weekdayOf, whenText } from "./jobsLib.js";

export function MyJobs({ currentUser, hideEmpty }) {
  const [jobs, setJobs] = useState(null);
  const [tab, setTab] = useState("today");
  const [pending, setPending] = useState(null); // «Bajarildi» — 5 soniya «Bekor qilish» kutadi, keyin serverga
  const pendRef = useRef(null);
  const commitRef = useRef(null);
  const [openId, setOpenId] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);
  const [hint, setHint] = useState(null); // ish tugagach: «eng yaqin keyingi ish»
  const pos = usePosition(!!jobs?.some((j) => isOpen(j) && okGeo(j.geo)));
  const load = useCallback(async () => { try { const r = await fetchJobs(); setConfig(r.config || null); setJobs((r.jobs || []).filter((j) => (j.assigneeIds || []).includes(currentUser.id))); } catch (e) { setErr(e.message); setJobs((x) => x || []); } }, [currentUser.id]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  // Ilova yopilsa / boshqa ilovaga o'tilsa — kutayotgan «Bajarildi» darhol yuboriladi (yo'qolmasin)
  useEffect(() => {
    const flush = () => { if (pendRef.current) commitRef.current?.(pendRef.current); };
    const vis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", vis); flush(); };
  }, []);
  if (jobs === null) return null;
  const open = jobs.filter((j) => isOpen(j) && j.id !== pending?.job.id);
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
  let sorted = [...cur[2]].sort((a, b) => (a.status === "doing" ? 0 : 1) - (b.status === "doing" ? 0 : 1) || byWhen(a, b));
  // Bugun: joriy joydan yaqinidan uzoqqa (vaqtli ish kechikmasligi hisobga olinadi)
  const nowD = new Date(); const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const plan = tab === "today" && pos ? planDay(pos, sorted.filter((j) => j.status !== "doing"), nowMin) : null;
  if (plan?.nearestId) sorted = [...sorted.filter((j) => j.status === "doing"), ...plan.order];
  const distOf = (j) => plan?.dist?.[j.id] || null;
  const next = tab === "today" ? sorted[0] : null;
  const rest = next ? sorted.slice(1) : sorted;
  const opened = openId ? jobs.find((j) => j.id === openId) : null;

  async function setStatus(j, status) {
    setBusy(true);
    try { await updateJob(j.id, { status }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  // «Bajarildi»: darhol ro'yxatdan ketadi, lekin serverga 5 soniyadan keyin yoziladi — shu orada «Bekor qilish»
  async function commit(p) {
    if (pendRef.current !== p) return;
    clearTimeout(p.timer); pendRef.current = null; setPending(null);
    try { await updateJob(p.job.id, { status: "done" }); } catch (e) { setErr(e.message); }
    load();
  }
  commitRef.current = commit;
  function markDone(j) {
    if (pendRef.current) commit(pendRef.current);
    const p = { job: j, timer: null };
    p.timer = setTimeout(() => commitRef.current(p), 5000);
    pendRef.current = p; setPending(p); setOpenId(null);
    if (jobs.some((x) => x.id !== j.id && isOpen(x) && okGeo(x.geo))) setHint({ done: j, from: pos || (okGeo(j.geo) ? j.geo : null) });
  }
  function undo() {
    const p = pendRef.current; if (!p) return;
    clearTimeout(p.timer); pendRef.current = null; setPending(null); setHint(null);
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
      {plan?.nearestId && <div style={{ fontSize: 12.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 5, margin: "-4px 0 10px" }}><LocateFixed size={13} /> Siz turgan joydan — yaqinidan uzoqqa</div>}
      {hint && <NextHint hint={hint} jobs={open.filter((j) => j.id !== hint.done.id && (j.date === t || !j.date || isLate(j)))} pos={pos} onClose={() => setHint(null)} onStart={(j) => { setHint(null); setStatus(j, "doing"); }} />}
      {hint ? null : sorted.length === 0 ? (
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
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3, marginTop: 8 }}>{next.title}</div>
                  {(next.address || distOf(next)) && <div style={{ fontSize: 14.5, color: THEME.muted, marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><MapPin size={15} />{next.address}{distOf(next) && <DistTag d={distOf(next)} near={plan.nearestId === next.id} />}</div>}
                  {next.phone && <div style={{ fontSize: 14.5, color: THEME.muted, marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}><Phone size={15} />{next.order?.customer ? `${next.order.customer} · ` : ""}{next.phone}</div>}
                  {next.checklist?.length > 0 && <div style={{ fontSize: 13, color: THEME.muted, marginTop: 4 }}>☑ {next.checklist.filter((c) => c.done).length}/{next.checklist.length} tekshiruv</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                    {(next.address || okGeo(next.geo)) && <a href={okGeo(next.geo) ? yandexRoute(pos, next.geo) : mapsUrl(next.address)} target="_blank" rel="noreferrer" style={{ ...btn, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text }}><Navigation size={17} /> Yo'l</a>}
                    {!next.address && next.phone && <a href={`tel:${next.phone.replace(/[^\d+]/g, "")}`} style={{ ...btn, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text }}><Phone size={17} /> Qo'ng'iroq</a>}
                    {next.status === "new"
                      ? <button type="button" disabled={busy} onClick={() => setStatus(next, "doing")} data-myjob-start={next.id} style={{ ...btn, border: 0, background: k.c, color: "#fff" }}><Play size={17} /> Boshlash</button>
                      : <div style={{ flexBasis: "100%", marginTop: 10, display: "flex" }}><SlideToDone key={next.id} jobId={next.id} disabled={busy} onDone={() => markDone(next)} /></div>}
                  </div>
                </div>
              </>
            );
          })()}
          {plan?.hint && <div data-testid="day-hint" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: THEME.amberText || "#B45309", background: THEME.amberBg || "#FFFBEB", borderRadius: 11, padding: "9px 11px" }}><Lightbulb size={15} style={{ flexShrink: 0 }} />{plan.hint.time} gacha vaqt bor — avval {(JOB_KINDS[plan.hint.job.kind] || JOB_KINDS.other).l.toLowerCase()}ga boring</div>}
          {next && rest.length > 0 && <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted, marginTop: 6 }}>Keyin</div>}
          {rest.map((j) => <SwipeCard key={j.id} j={j} dist={distOf(j)} near={plan?.nearestId === j.id} onOpen={() => setOpenId(j.id)} onDone={() => markDone(j)} />)}
          <div style={{ fontSize: 12, color: THEME.dim, textAlign: "center", marginTop: 2 }}>Kartani o'ngga suring — «Bajarildi»</div>
        </div>
      )}
      {opened && <JobDrawer job={opened} canManage={false} isMobile onClose={() => setOpenId(null)} onChanged={(nj) => setJobs((l) => l.map((x) => (x.id === nj.id ? nj : x)))} onDone={(j) => markDone(j)} slideDone
        stages={config?.stages || []} customFields={fieldsFor(config, opened.kind)} renderCustom={(f, j, patch) => <CustomValue f={f} j={j} onSave={(c) => patch({ custom: c })} align="right" />} />}
      {pending && <UndoToast key={pending.job.id} title={pending.job.title} onUndo={undo} />}
    </section>
  );
}

// O'ngga surish → «Bajarildi» (yashil fon ochiladi)
function SwipeCard({ j, onOpen, onDone, dist, near }) {
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
          {(j.address || dist) && <div style={{ fontSize: 13.5, color: THEME.muted, marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}><MapPin size={13} />{j.address}{dist && <DistTag d={dist} near={near} />}</div>}
          {j.assignees?.length > 1 && <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>Brigada: {j.assignees.map((a) => a.name.split(" ")[0]).join(", ")}</div>}
        </div>
      </div>
    </div>
  );
}

function DistTag({ d, near }) {
  return <span data-dist={near ? "near" : ""} style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: near ? "#DCFCE7" : THEME.chip, color: near ? "#166534" : THEME.muted }}>{fmtKm(d.km)}{near ? " · eng yaqin" : ""}</span>;
}

// Ish tugagach — bitta karta: eng yaqin keyingi ish, masofa, vaqt, «Yo'lga chiqish»
function NextHint({ hint, jobs, pos, onClose, onStart }) {
  const from = pos || hint.from;
  const cands = jobs.filter((j) => okGeo(j.geo));
  const best = okGeo(from) ? [...cands].sort((a, b) => roadKm(from, a.geo) - roadKm(from, b.geo))[0] : null;
  const km = best ? roadKm(from, best.geo) : null;
  const k = best ? JOB_KINDS[best.kind] || JOB_KINDS.other : null;
  const big = { height: 48, borderRadius: 13, border: 0, fontFamily: "inherit", fontSize: 15, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, textDecoration: "none", cursor: "pointer" };
  return (
    <div data-testid="next-hint" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: THEME.greenBg, color: THEME.greenText, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}><CheckCircle2 size={17} /> Bajarildi · {hint.done.title}</div>
      {best ? (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted }}>Keyin qayerga?</div>
          <div style={{ background: THEME.card, border: "1.5px solid #0E7C6B", boxShadow: "0 0 0 4px #0E7C6B1A", borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.5, color: "#0B5F52", display: "flex", alignItems: "center", gap: 5 }}><Sparkles size={13} /> ENG YAQIN KEYINGI ISH</span>
            <b style={{ fontSize: 18, lineHeight: 1.3 }} data-hint-job={best.id}>{k.l} · {best.title}</b>
            <div style={{ fontSize: 14, color: THEME.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><MapPin size={14} />{best.address || "xaritada belgilangan"} · <b style={{ color: "#0B5F52" }} data-testid="hint-dist">{fmtKm(km)} · {travelMin(km)} daq</b>{best.time && <span>· {best.time}</span>}</div>
            <LeafletMap height={150} rounded={12} testid="hint-map" fitKey={best.id}
              markers={[{ id: "me", lat: from.lat, lng: from.lng, html: meHtml(), size: [18, 18], anchor: [9, 9] }, { id: best.id, lat: best.geo.lat, lng: best.geo.lng, html: pinHtml(k.c) }]}
              lines={[{ points: [[from.lat, from.lng], [best.geo.lat, best.geo.lng]], color: "#0E7C6B", dashed: true, weight: 5 }]} />
            <a href={yandexRoute(pos, best.geo)} target="_blank" rel="noreferrer" data-testid="hint-go" style={{ ...big, background: "#0E7C6B", color: "#fff" }}><Navigation size={17} /> Yo'lga chiqish</a>
            {best.status === "new" && <button type="button" onClick={() => onStart(best)} style={{ ...big, height: 40, fontSize: 14, background: THEME.chip, color: THEME.text }}><Play size={15} /> Yetib keldim — boshlash</button>}
            <button type="button" onClick={onClose} data-testid="hint-other" style={{ border: 0, background: "none", fontFamily: "inherit", fontSize: 13.5, color: THEME.muted, cursor: "pointer", padding: 4 }}>Boshqasini tanlash ›</button>
          </div>
        </>
      ) : (
        <button type="button" onClick={onClose} data-testid="hint-other" style={{ ...big, background: THEME.chip, color: THEME.text }}>{jobs.length ? "Keyingi ishlarni ko'rish" : "Bugungi ishlar tugadi 👍"}</button>
      )}
    </div>
  );
}
