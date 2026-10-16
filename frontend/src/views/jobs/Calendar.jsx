// Calendar.jsx — haftalik kalendar (kompyuterda 7 ustun, telefonda kunlar ro'yxati).
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { THEME } from "../../theme.js";
import { JOB_KINDS, MONTHS_CAP, WD, WD_FULL, addDays, dayText, isOpen, mondayOf, today, weekdayOf } from "./jobsLib.js";

export function WeekCalendar(props) {
  return props.isMobile ? <MobileCalendar {...props} /> : <DesktopCalendar {...props} />;
}

// Telefon: tepada hafta tasmasi (nuqta — ish bor kun), pastda tanlangan kun soat tartibida. Chapga/o'ngga surib hafta almashadi.
function MobileCalendar({ list, week, setWeek, onOpen }) {
  const t = today();
  const [day, setDay] = useState(() => (mondayOf(t) === week ? t : week));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const cur = days.includes(day) ? day : days[0];
  const items = list.filter((j) => j.date === cur).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  let sx = null;
  const go = (n) => { const w = addDays(week, n * 7); setWeek(w); setDay(n > 0 ? w : addDays(w, 6)); };
  return (
    <div data-testid="jobs-calendar" onTouchStart={(e) => { sx = e.touches[0].clientX; }} onTouchEnd={(e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); sx = null; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 20, flex: 1 }}>{MONTHS_CAP[Number(cur.slice(5, 7)) - 1]}</b>
        <button type="button" onClick={() => go(-1)} aria-label="Oldingi hafta" style={navB}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => go(1)} aria-label="Keyingi hafta" style={navB}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 12 }}>
        {days.map((d, i) => {
          const on = d === cur; const has = list.some((j) => j.date === d && isOpen(j));
          return (
            <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={on} data-cal-day={d}
              style={{ height: 60, borderRadius: 12, border: `1px solid ${on ? THEME.text : THEME.border}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.text, fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: 0 }}>
              <span style={{ fontSize: 11.5, opacity: 0.7 }}>{WD[i]}</span><b style={{ fontSize: 17 }}>{Number(d.slice(8))}</b>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: has ? (on ? THEME.card : THEME.blue) : "transparent" }} />
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5, color: THEME.muted, textTransform: "uppercase", marginBottom: 8 }}>{WD_FULL[weekdayOf(cur)]} · {items.length} ta ish</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!items.length && <div style={{ color: THEME.muted, fontSize: 14, padding: 18, textAlign: "center", border: `1.5px dashed ${THEME.border}`, borderRadius: 14 }}>Bu kunga ish yo'q</div>}
        {items.map((j) => {
          const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
          return (
            <div key={j.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted, paddingTop: 12 }}>{j.time || "—"}</span>
              <button type="button" onClick={() => !j.ro && onOpen(j)} data-cal-job={j.id}
                style={{ textAlign: "left", border: `1px solid ${THEME.border}`, borderLeft: `4px solid ${k.c}`, borderRadius: 13, background: THEME.card, color: THEME.text, padding: "10px 12px", fontFamily: "inherit", cursor: j.ro ? "default" : "pointer", opacity: isOpen(j) ? 1 : 0.55 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: k.c, background: k.c + "1A", borderRadius: 6, padding: "2px 6px", textTransform: "uppercase" }}>{k.l}</span>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5 }}>{j.title}</div>
                <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>{(j.assignees || []).map((a) => a.name.split(" ")[0]).join(", ") || "mas'ulsiz"}</div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const navB = { width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" };

function DesktopCalendar({ list, week, setWeek, isMobile, onOpen, showLine }) {
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

