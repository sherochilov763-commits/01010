// Brigade.jsx — «Brigada jadvali»: kim, qachon, qayerda. Kun bo'yicha soat jadvali (09–19), har xodim — bitta qator.
// Chapda «Rejalashtirilmagan» — kartani jadvalga sudrab qo'ysa sana, vaqt va mas'ul o'zi yoziladi.
// Bo'sh vaqt — shtrixli; qizil chiziq — hozir; ustma-ust tushsa — ogohlantirish. Hafta: xodim × kun.
// Telefonda: xodimni tanlash → uning kuni soat tartibida, bo'sh joyga bir bosishda vazifa berish.
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { roleLabel } from "../../constants.js";
import { THEME } from "../../theme.js";
import { Avatar, KindBadge } from "./JobParts.jsx";
import { JOB_KINDS, WD, WD_FULL, addDays, byWhen, dayText, hm2min, isLate, isOpen, min2hm, mondayOf, today, weekdayOf } from "./jobsLib.js";

const H0 = 8 * 60, H1 = 20 * 60; // jadval oralig'i
const DAY0 = 9 * 60, DAY1 = 18 * 60; // ish kuni (bo'sh vaqt hisobi)
const LEFT = 190;
const durOf = (j) => j.duration || (j.kind === "install" ? 120 : j.kind === "deliver" ? 40 : 60);

// Xodimning kuni: band oraliqlar va bo'sh vaqtlar
export function dayPlan(jobs, personId, date) {
  const mine = jobs.filter((j) => j.date === date && j.time && (j.assigneeIds || []).includes(personId) && j.status !== "cancelled" && !j.ro)
    .map((j) => ({ j, s: hm2min(j.time), e: hm2min(j.time) + durOf(j) })).sort((a, b) => a.s - b.s);
  const free = []; let cur = DAY0;
  for (const b of mine) { if (b.s - cur >= 60) free.push({ s: cur, e: b.s }); cur = Math.max(cur, b.e); }
  if (DAY1 - cur >= 60) free.push({ s: cur, e: DAY1 });
  const overlaps = new Set();
  for (let i = 1; i < mine.length; i++) for (let k = 0; k < i; k++) if (mine[i].s < mine[k].e) { overlaps.add(mine[i].j.id); overlaps.add(mine[k].j.id); }
  // Ustma-ust bloklar — bir qatorda ikki qavat bo'lib chiziladi
  const ends = [];
  for (const b of mine) { let l = ends.findIndex((e) => e <= b.s); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = b.e; b.lane = l; }
  for (const b of mine) b.lanes = Math.max(1, ...mine.filter((x) => x.s < b.e && b.s < x.e).map((x) => x.lane + 1));
  return { blocks: mine, free, overlaps };
}

export function Brigade({ list, employees, isMobile, canManage, onOpen, onPatch, onPlan }) {
  const [date, setDate] = useState(today());
  const [span, setSpan] = useState("day");
  const [drag, setDrag] = useState(null);
  const [hint, setHint] = useState(null);
  const [warn, setWarn] = useState("");
  const [pick, setPick] = useState(null);
  const gridRef = useRef(null);
  const field = useMemo(() => list.filter((j) => !j.ro), [list]);
  // Qatorlar: montajchilar + shu kuni ishi bor xodimlar
  const people = useMemo(() => {
    const active = new Set(field.filter((j) => j.date === date || span === "week").flatMap((j) => j.assigneeIds || []));
    return (employees || []).filter((e) => !e.deletedAt && e.role !== "admin" && (e.role === "installer" || active.has(e.id)))
      .sort((a, b) => (a.role === "installer" ? 0 : 1) - (b.role === "installer" ? 0 : 1) || a.name.localeCompare(b.name));
  }, [employees, field, date, span]);
  const unplanned = useMemo(() => field.filter((j) => isOpen(j) && (!j.date || !j.time || !(j.assigneeIds || []).length)).sort(byWhen), [field]);
  const t = today();
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const pct = (m) => ((Math.max(H0, Math.min(H1, m)) - H0) / (H1 - H0)) * 100;

  async function dropOn(person, clientX) {
    const j = drag?.j; if (!j || !gridRef.current) return;
    const r = gridRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left - LEFT) / (r.width - LEFT)));
    let m = Math.round((H0 + x * (H1 - H0)) / 15) * 15;
    m = Math.max(H0, Math.min(H1 - 15, m));
    const from = drag.from;
    let ids = j.assigneeIds || [];
    if (from && from !== person.id) ids = ids.map((id) => (id === from ? person.id : id));
    else if (!ids.length) ids = [person.id];
    else if (!ids.includes(person.id)) ids = [...ids, person.id];
    ids = [...new Set(ids)];
    const time = min2hm(m);
    const others = field.filter((x) => x.id !== j.id && x.date === date && x.time && (x.assigneeIds || []).includes(person.id) && x.status !== "cancelled");
    const clash = others.find((x) => hm2min(x.time) < m + durOf(j) && m < hm2min(x.time) + durOf(x));
    setWarn(clash ? `Ustma-ust: ${person.name.split(" ")[0]} ${clash.time}–${min2hm(hm2min(clash.time) + durOf(clash))} band («${clash.title}»)` : "");
    setDrag(null); setHint(null);
    await onPatch(j, { date, time, assigneeIds: ids });
  }
  const navBtn = { width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" };
  const dLabel = `${WD_FULL[weekdayOf(date)]}, ${dayText(date)}`;
  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <button type="button" style={navBtn} onClick={() => setDate(addDays(date, span === "week" ? -7 : -1))} aria-label="Oldingi"><ChevronLeft size={16} /></button>
      <b style={{ fontSize: 15.5, minWidth: isMobile ? 0 : 170, textAlign: "center" }} data-testid="brigade-date">{span === "week" ? `${dayText(mondayOf(date))} — ${dayText(addDays(mondayOf(date), 6))}` : dLabel}</b>
      <button type="button" style={navBtn} onClick={() => setDate(addDays(date, span === "week" ? 7 : 1))} aria-label="Keyingi"><ChevronRight size={16} /></button>
      {date !== t && <button type="button" onClick={() => setDate(t)} style={{ ...navBtn, width: "auto", padding: "0 12px", fontFamily: "inherit", fontWeight: 600 }}>Bugun</button>}
      <div style={{ flex: 1 }} />
      {!isMobile && (
        <div role="group" style={{ display: "inline-flex", background: THEME.chip, borderRadius: 10, padding: 3 }}>
          {[["day", "Kun"], ["week", "Hafta"]].map(([k, l]) => <button key={k} type="button" onClick={() => setSpan(k)} aria-pressed={span === k} data-brigade-span={k}
            style={{ height: 30, padding: "0 14px", border: 0, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, background: span === k ? THEME.card : "transparent", color: span === k ? THEME.text : THEME.muted, boxShadow: span === k ? THEME.shadowSm : "none" }}>{l}</button>)}
        </div>
      )}
    </div>
  );

  // ---------- Telefon ----------
  if (isMobile) {
    const sel = people.find((p) => p.id === pick) || people[0];
    const plan = sel ? dayPlan(field, sel.id, date) : null;
    const items = sel ? [...plan.blocks.map((b) => ({ s: b.s, b })), ...plan.free.map((f) => ({ s: f.s, f }))].sort((a, c) => a.s - c.s) : [];
    const noTime = sel ? field.filter((j) => j.date === date && !j.time && (j.assigneeIds || []).includes(sel.id) && isOpen(j)) : [];
    return (
      <div data-testid="jobs-brigade">
        {header}
        {!people.length ? <div style={{ color: THEME.muted, fontSize: 14, padding: 20, textAlign: "center" }}>Montajchi yoki ishi bor xodim yo'q</div> : <>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }} className="uvix-scroll">
            {people.map((p) => {
              const on = p.id === sel?.id;
              return <button key={p.id} type="button" onClick={() => setPick(p.id)} aria-pressed={on} data-brigade-person={p.id}
                style={{ border: 0, background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit", color: THEME.text, minWidth: 58 }}>
                <span style={{ borderRadius: "50%", padding: 2, border: `2.5px solid ${on ? THEME.text : "transparent"}` }}><Avatar id={p.id} name={p.name} size={48} /></span>
                <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 500 }}>{p.name.split(" ")[0]}</span>
              </button>;
            })}
          </div>
          {sel && <div style={{ fontSize: 13, color: THEME.muted, margin: "6px 0 10px" }}>{sel.name.split(" ")[0]} · {date === t ? "bugun" : dayText(date)} {plan.blocks.length} ta ish · {Math.round(plan.free.reduce((s, f) => s + f.e - f.s, 0) / 60)} soat bo'sh</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: 10, alignItems: "start" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted, paddingTop: 12, fontVariantNumeric: "tabular-nums" }}>{min2hm(it.s)}</span>
                {it.b ? (
                  <div onClick={() => onOpen(it.b.j)} role="button" tabIndex={0} data-brigade-job={it.b.j.id}
                    style={{ background: THEME.card, border: `1px solid ${plan.overlaps.has(it.b.j.id) ? THEME.rose : THEME.border}`, borderLeft: `4px solid ${(JOB_KINDS[it.b.j.kind] || JOB_KINDS.other).c}`, borderRadius: 13, padding: "10px 12px", cursor: "pointer", opacity: isOpen(it.b.j) ? 1 : 0.55 }}>
                    <KindBadge kind={it.b.j.kind} small />
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5 }}>{it.b.j.title}</div>
                    <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>{min2hm(it.b.s)}–{min2hm(Math.min(it.b.e, 1439))}{(it.b.j.assignees || []).length > 1 ? ` · ${it.b.j.assignees.filter((a) => a.id !== sel.id).map((a) => a.name.split(" ")[0]).join(", ")} bilan` : ""}</div>
                  </div>
                ) : (
                  <button type="button" disabled={!canManage} onClick={() => onPlan(null, { date, time: min2hm(it.f.s), assigneeIds: [sel.id] })} data-brigade-free={min2hm(it.f.s)}
                    style={{ height: 46, borderRadius: 13, border: `1.5px dashed ${THEME.border2}`, background: `repeating-linear-gradient(135deg, transparent 0 8px, ${THEME.chip} 8px 16px)`, color: THEME.muted, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, textAlign: "left", padding: "0 12px", cursor: canManage ? "pointer" : "default" }}>
                    Bo'sh {min2hm(it.f.s)}–{min2hm(it.f.e)}{canManage ? " · + vazifa berish" : ""}
                  </button>
                )}
              </div>
            ))}
            {noTime.map((j) => <div key={j.id} onClick={() => onOpen(j)} style={{ fontSize: 13.5, color: THEME.muted, padding: "8px 12px", border: `1px solid ${THEME.border}`, borderRadius: 12, cursor: "pointer" }}>Vaqtsiz: <b style={{ color: THEME.text }}>{j.title}</b></div>)}
          </div>
        </>}
      </div>
    );
  }

  // ---------- Hafta: xodim × kun ----------
  if (span === "week") {
    const mon = mondayOf(date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return (
      <div data-testid="jobs-brigade">
        {header}
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, overflow: "auto" }} className="uvix-scroll">
          <div style={{ display: "grid", gridTemplateColumns: `${LEFT}px repeat(7, minmax(120px, 1fr))`, minWidth: LEFT + 7 * 120 }}>
            <div style={{ ...cellHead }} />
            {days.map((d, i) => <div key={d} style={{ ...cellHead, color: d === t ? THEME.blue : THEME.muted }}>{WD[i]} {Number(d.slice(8))}</div>)}
            {people.map((p) => (
              <WeekRow key={p.id} p={p} days={days} field={field} onOpen={onOpen} t={t} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Kun: soat jadvali ----------
  const hours = []; for (let m = H0; m < H1; m += 60) hours.push(m);
  return (
    <div data-testid="jobs-brigade">
      {header}
      {warn && <div role="alert" data-testid="brigade-warn" style={{ padding: "9px 14px", borderRadius: 12, background: THEME.amberBg, color: THEME.amberText, fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>⚠ {warn}</div>}
      <div style={{ display: "grid", gridTemplateColumns: canManage ? "250px minmax(0,1fr)" : "minmax(0,1fr)", gap: 12, alignItems: "start" }}>
        {canManage && (
          <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 12 }} data-testid="brigade-unplanned">
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, color: THEME.muted, textTransform: "uppercase", marginBottom: 10 }}>Rejalashtirilmagan · {unplanned.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }} className="uvix-scroll">
              {unplanned.map((j) => {
                const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
                return (
                  <div key={j.id} draggable data-unplanned={j.id} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", j.id); } catch { /* */ } setDrag({ j, from: null }); }} onDragEnd={() => { setDrag(null); setHint(null); }} onClick={() => onOpen(j)}
                    style={{ border: `1px solid ${THEME.border}`, borderLeft: `4px solid ${k.c}`, borderRadius: 12, padding: "9px 10px", cursor: "grab", background: THEME.card, opacity: drag?.j.id === j.id ? 0.45 : 1 }}>
                    <KindBadge kind={j.kind} small />
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 5, lineHeight: 1.3 }}>{j.title}</div>
                    <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3 }}>≈ {durOf(j) < 60 ? `${durOf(j)} daq` : `${durOf(j) / 60} soat`}{j.address ? ` · ${j.address}` : ""}{(j.assignees || []).length ? ` · ${j.assignees.map((a) => a.name.split(" ")[0]).join(", ")}` : ""}</div>
                  </div>
                );
              })}
              {!unplanned.length && <div style={{ fontSize: 13, color: THEME.dim, padding: 8 }}>Hammasi rejalashtirilgan 👍</div>}
            </div>
            {unplanned.length > 0 && <div style={{ fontSize: 12, color: THEME.dim, marginTop: 8 }}>↗ jadvalga sudrab qo'ying</div>}
          </div>
        )}
        <div ref={gridRef} style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, overflow: "hidden", position: "relative" }} data-testid="brigade-grid">
          <div style={{ display: "grid", gridTemplateColumns: `${LEFT}px 1fr`, borderBottom: `1px solid ${THEME.border}` }}>
            <div />
            <div style={{ position: "relative", height: 34 }}>
              {hours.map((m) => <span key={m} style={{ position: "absolute", left: `${pct(m)}%`, top: 9, fontSize: 12, fontWeight: 600, color: THEME.muted, paddingLeft: 6, borderLeft: `1px solid ${THEME.border}`, height: 25 }}>{String(m / 60).padStart(2, "0")}</span>)}
            </div>
          </div>
          {!people.length && <div style={{ padding: 30, color: THEME.muted, textAlign: "center", fontSize: 14 }}>Montajchi xodim yo'q — «Xodimlar»da rolni «Montajchi» qiling</div>}
          {people.map((p) => {
            const plan = dayPlan(field, p.id, date);
            const done = plan.blocks.filter((b) => b.j.status === "done").length;
            return (
              <div key={p.id} data-brigade-row={p.id} style={{ display: "grid", gridTemplateColumns: `${LEFT}px 1fr`, borderBottom: `1px solid ${THEME.border}`, minHeight: 76 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}>
                  <Avatar id={p.id} name={p.name} size={34} />
                  <div style={{ minWidth: 0 }}><b style={{ fontSize: 14 }}>{p.name.split(" ")[0]}</b>
                    <div style={{ fontSize: 12, color: THEME.muted }}>{roleLabel(p.role).toLowerCase()} · {done}/{plan.blocks.length}</div></div>
                </div>
                <div onDragOver={drag ? (e) => { e.preventDefault(); const r = gridRef.current.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left - LEFT) / (r.width - LEFT))); setHint({ p: p.id, m: Math.round((H0 + x * (H1 - H0)) / 15) * 15 }); } : undefined}
                  onDragLeave={() => setHint(null)} onDrop={drag ? (e) => { e.preventDefault(); dropOn(p, e.clientX); } : undefined} data-brigade-lane={p.id}
                  style={{ position: "relative", background: hint?.p === p.id ? THEME.blueBg : "transparent" }}>
                  {hours.map((m) => <span key={m} style={{ position: "absolute", left: `${pct(m)}%`, top: 0, bottom: 0, borderLeft: `1px solid ${THEME.border}`, opacity: 0.6 }} />)}
                  {plan.free.map((f, i) => (
                    <button key={i} type="button" disabled={!canManage} onClick={() => onPlan(null, { date, time: min2hm(f.s), assigneeIds: [p.id] })} title="Bo'sh vaqt — vazifa berish" data-free={`${p.id}@${min2hm(f.s)}`}
                      style={{ position: "absolute", left: `calc(${pct(f.s)}% + 3px)`, width: `calc(${pct(f.e) - pct(f.s)}% - 6px)`, top: 8, bottom: 8, borderRadius: 10, border: `1.5px dashed ${THEME.border2}`, background: `repeating-linear-gradient(135deg, transparent 0 7px, ${THEME.chip} 7px 14px)`, color: THEME.muted, fontFamily: "inherit", fontSize: 12, textAlign: "left", padding: "4px 8px", cursor: canManage ? "pointer" : "default", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {pct(f.e) - pct(f.s) > 9 ? <><b>Bo'sh vaqt</b><br />{min2hm(f.s)}–{min2hm(f.e)}</> : null}
                    </button>
                  ))}
                  {plan.blocks.map((b) => {
                    const k = JOB_KINDS[b.j.kind] || JOB_KINDS.other;
                    const late = isLate(b.j); const ov = plan.overlaps.has(b.j.id);
                    return (
                      <div key={b.j.id} draggable={canManage} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", b.j.id); } catch { /* */ } setDrag({ j: b.j, from: p.id }); }} onDragEnd={() => { setDrag(null); setHint(null); }}
                        onClick={() => onOpen(b.j)} data-block={b.j.id} title={`${b.j.title} · ${min2hm(b.s)}–${min2hm(Math.min(b.e, 1439))}`}
                        style={{ position: "absolute", left: `calc(${pct(b.s)}% + 2px)`, width: `calc(${Math.max(pct(b.e) - pct(b.s), 3)}% - 4px)`, top: `calc(7px + (100% - 14px) * ${b.lane / b.lanes})`, height: `calc((100% - 14px) / ${b.lanes} - ${b.lanes > 1 ? 2 : 0}px)`, borderRadius: 10, padding: "5px 8px", overflow: "hidden", cursor: canManage ? "grab" : "pointer",
                          background: late ? THEME.roseBg : k.c + "1F", border: `1.5px solid ${ov ? THEME.rose : late ? THEME.roseBorder : k.c + "55"}`, color: late ? THEME.roseText : k.c, opacity: b.j.status === "done" ? 0.55 : 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{late ? "Kechikdi · " : ""}{k.l} · {b.j.title}</div>
                        <div style={{ fontSize: 11.5, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 3 }}>{b.j.address ? <><MapPin size={11} />{b.j.address}</> : `${min2hm(b.s)}–${min2hm(Math.min(b.e, 1439))}`}</div>
                      </div>
                    );
                  })}
                  {hint?.p === p.id && <span style={{ position: "absolute", left: `${pct(hint.m)}%`, top: 2, bottom: 2, borderLeft: `2px solid ${THEME.blue}`, pointerEvents: "none" }}><span style={{ position: "absolute", top: -2, left: 4, fontSize: 11, fontWeight: 800, color: THEME.blue, background: THEME.card, padding: "0 3px", borderRadius: 4 }}>{min2hm(hint.m)}</span></span>}
                </div>
              </div>
            );
          })}
          {date === t && nowMin > H0 && nowMin < H1 && <span style={{ position: "absolute", top: 34, bottom: 0, left: `calc(${LEFT}px + (100% - ${LEFT}px) * ${pct(nowMin) / 100})`, borderLeft: `2px solid ${THEME.rose}`, pointerEvents: "none" }} data-testid="now-line" />}
        </div>
      </div>
      {canManage && <div style={{ fontSize: 12.5, color: THEME.dim, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><Plus size={13} />Bo'sh (shtrixli) joyni bossangiz — o'sha xodimga, o'sha vaqtga vazifa ochiladi</div>}
    </div>
  );
}
const cellHead = { padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: THEME.muted, borderBottom: `1px solid ${THEME.border}` };

function WeekRow({ p, days, field, onOpen, t }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${THEME.border}` }}><Avatar id={p.id} name={p.name} size={30} /><b style={{ fontSize: 13.5 }}>{p.name.split(" ")[0]}</b></div>
      {days.map((d) => {
        const js = field.filter((j) => j.date === d && (j.assigneeIds || []).includes(p.id) && j.status !== "cancelled").sort(byWhen);
        return (
          <div key={d} style={{ padding: 6, borderBottom: `1px solid ${THEME.border}`, borderLeft: `1px solid ${THEME.border}`, background: d === t ? THEME.blueBg : "transparent", display: "flex", flexDirection: "column", gap: 4, minHeight: 56 }}>
            {js.map((j) => { const k = JOB_KINDS[j.kind] || JOB_KINDS.other; return <button key={j.id} type="button" onClick={() => onOpen(j)} style={{ textAlign: "left", border: 0, borderLeft: `3px solid ${k.c}`, borderRadius: 7, background: k.c + "14", padding: "4px 6px", fontFamily: "inherit", fontSize: 11.5, color: THEME.text, cursor: "pointer", opacity: isOpen(j) ? 1 : 0.5, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><b>{j.time || ""}</b> {j.title}</button>; })}
          </div>
        );
      })}
    </>
  );
}
