// Calendar.jsx — haftalik kalendar (kompyuterda 7 ustun, telefonda kunlar ro'yxati).
import { ChevronLeft, ChevronRight } from "lucide-react";
import { THEME } from "../../theme.js";
import { JOB_KINDS, WD, addDays, dayText, isOpen, mondayOf, today } from "./jobsLib.js";

export function WeekCalendar({ list, week, setWeek, isMobile, onOpen, showLine }) {
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

