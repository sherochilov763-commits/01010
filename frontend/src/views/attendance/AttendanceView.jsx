// AttendanceView.jsx — Davomat: admin uchun Bugun / Hafta / Oy / Sozlamalar, xodim uchun o'z tarixi.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, Clock, Download, MapPin, Pencil, RefreshCw, Send, X } from "lucide-react";
import { Button, Card, Field, Modal, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { roleLabel } from "../../constants.js";
import { THEME } from "../../theme.js";
import { authListEmployees, fetchAttendancePhoto, fetchAttendanceConfig, fetchAttendanceReport, fetchMyAttendance, saveAttendanceConfig, saveAttendanceManual, sendAttendanceReport } from "../../storage.js";
import { exportRows } from "../../lib/excel.js";
import { getPosition } from "../../lib/geo.js";

// ---------- yordamchilar ----------
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WD_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(`${s}T00:00:00`);
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const todayStr = () => ymd(new Date());
const weekStart = (s) => { const d = parse(s); const wd = d.getDay() || 7; d.setDate(d.getDate() - (wd - 1)); return ymd(d); };
const monthStart = (s) => `${s.slice(0, 7)}-01`;
const monthEnd = (s) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return ymd(d); };
const dLabel = (s) => { const d = parse(s); return `${d.getDate()}-${MONTHS[d.getMonth()]}`; };
const fmtDur = (min) => { if (!min) return "—"; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} s${m ? ` ${m} daq` : ""}` : `${m} daq`; };
const fmtH = (min) => (min ? `${(min / 60).toFixed(1).replace(".", ",")} s` : "—");

const STATUS = {
  ontime: { label: "O'z vaqtida", color: "#10B981" },
  late: { label: "Kechikdi", color: "#F59E0B" },
  absent: { label: "Kelmadi", color: "#EF4444" },
  notyet: { label: "Hali kelmadi", color: "#EF4444" },
  pending: { label: "Kutilmoqda", color: "#94A3B8" },
  dayoff: { label: "Dam olish", color: "#64748B" },
  extra: { label: "Dam kuni keldi", color: "#3B82F6" },
};
function StatusBadge({ day }) {
  const s = STATUS[day.status] || STATUS.pending;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: s.color, background: `${s.color}1F`, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />{s.label}{day.lateMin ? ` · ${day.lateMin} daq` : ""}
  </span>;
}
function Avatar({ name }) {
  return <span style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, color: "#fff", fontWeight: 700, fontSize: 13 }}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}

// Selfi: avtorizatsiya bilan yuklanadi (to'g'ridan-to'g'ri havola bilan ochilmaydi)
const photoCache = new Map();
function useSelfie(id) {
  const [url, setUrl] = useState(photoCache.get(id) || null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!id || photoCache.has(id)) return;
    let alive = true;
    fetchAttendancePhoto(id).then((u) => { photoCache.set(id, u); alive && setUrl(u); }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id]);
  return { url, err };
}
function SelfieThumb({ id, name, onOpen, size = 34 }) {
  const { url } = useSelfie(id);
  if (!id) return <Avatar name={name} />;
  return (
    <button type="button" onClick={() => onOpen(id)} title="Selfini ko'rish" data-testid="selfie-thumb"
      style={{ width: size, height: size, borderRadius: "50%", padding: 0, border: `2px solid ${THEME.green}`, overflow: "hidden", cursor: "pointer", background: THEME.surface, flexShrink: 0 }}>
      {url ? <img src={url} alt={`${name} selfi`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Camera size={14} color={THEME.muted} />}
    </button>
  );
}
function SelfieLightbox({ id, title, onClose }) {
  const { url, err } = useSelfie(id);
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,6,16,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(380px, 100%)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", fontWeight: 700 }}>
          <span>{title}</span>
          <button type="button" onClick={onClose} aria-label="Yopish" style={{ border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", width: 34, height: 34, borderRadius: 10, cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ aspectRatio: "3 / 4", borderRadius: 18, overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFB4B6", fontSize: 13, padding: err ? 20 : 0 }}>
          {url ? <img src={url} alt="Selfi" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : err || "Yuklanmoqda…"}
        </div>
      </div>
    </div>
  );
}

// ================================================================
export function AttendanceView({ currentUser, isAdmin }) {
  const [tab, setTab] = useState(isAdmin ? "today" : "mine");
  const [config, setConfig] = useState(null);
  const reloadConfig = useCallback(() => isAdmin && fetchAttendanceConfig().then(setConfig).catch(() => {}), [isAdmin]);
  useEffect(() => { reloadConfig(); }, [reloadConfig]);

  const tabs = isAdmin ? [["today", "Bugun"], ["week", "Hafta"], ["month", "Oy"], ["mine", "Mening davomatim"], ["settings", "Sozlamalar"]] : [["mine", "Mening davomatim"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tabs.length > 1 && (
        <div role="tablist" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: THEME.surface, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
          {tabs.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-atttab={k} onClick={() => setTab(k)}
              style={{ padding: "8px 14px", borderRadius: 10, border: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap",
                background: tab === k ? THEME.card : "transparent", color: tab === k ? THEME.text : THEME.muted, boxShadow: tab === k ? THEME.shadowSm : "none" }}>{l}</button>
          ))}
        </div>
      )}
      {isAdmin && config && !config.office && tab !== "settings" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 14, borderRadius: 14, background: THEME.amberBg, color: THEME.amber, fontSize: 13 }}>
          <MapPin size={18} />
          <div style={{ flex: 1 }}><b>Sex joylashuvi belgilanmagan.</b> Xodimlar "Keldim" bosishi uchun avval sex manzilini belgilang.</div>
          <Button onClick={() => setTab("settings")}>Belgilash</Button>
        </div>
      )}
      {tab === "today" && <TodayTab />}
      {tab === "week" && <PeriodTab kind="week" />}
      {tab === "month" && <PeriodTab kind="month" />}
      {tab === "mine" && <MineTab />}
      {tab === "settings" && isAdmin && config && <SettingsTab config={config} onSaved={setConfig} />}
    </div>
  );
}

// ---------------- Bugun ----------------
function TodayTab() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [photo, setPhoto] = useState(null);
  const today = todayStr();
  const load = useCallback(() => fetchAttendanceReport(today, today).then(setData).catch(() => setData({ rows: [] })), [today]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  if (!data) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>;
  const rows = data.rows.map((r) => ({ ...r, day: r.days[0] || { status: "pending" } }));
  const count = (f) => rows.filter(f).length;
  const chips = [
    ["Keldi", count((r) => r.day.in), "#10B981"],
    ["Kechikdi", count((r) => r.day.status === "late"), "#F59E0B"],
    ["Kelmadi", count((r) => ["absent", "notyet"].includes(r.day.status)), "#EF4444"],
    ["Dam olishda", count((r) => r.day.status === "dayoff"), "#64748B"],
  ];
  const order = { notyet: 0, absent: 0, late: 1, pending: 2, ontime: 3, extra: 4, dayoff: 5 };
  rows.sort((a, b) => (order[a.day.status] ?? 9) - (order[b.day.status] ?? 9) || a.employee.name.localeCompare(b.employee.name));
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginRight: 6 }}>{dLabel(today)}</div>
        {chips.map(([l, n, c]) => <span key={l} style={{ fontSize: 12.5, fontWeight: 700, color: c, background: `${c}1A`, padding: "5px 11px", borderRadius: 20 }}>{l}: {n}</span>)}
        <button type="button" onClick={load} title="Yangilash" style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.muted, cursor: "pointer" }}><RefreshCw size={16} /></button>
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 && <div style={{ padding: 20, color: THEME.muted, fontSize: 13 }}>Kuzatiladigan xodim yo'q. Sozlamalarda xodimlarni belgilang.</div>}
        {rows.map((r, i) => (
          <div key={r.employee.id} data-testid="att-today-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: i ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap" }}>
            <SelfieThumb id={r.day.photo} name={r.employee.name} onOpen={(id) => setPhoto({ id, title: `${r.employee.name} · ${r.day.in}` })} size={40} />
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.employee.name}</div>
              <div style={{ fontSize: 11.5, color: THEME.muted }}>{roleLabel(r.employee.role)} · {r.schedule.start}–{r.schedule.end}</div>
            </div>
            <StatusBadge day={r.day} />
            <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: THEME.muted, minWidth: 190 }}>
              <span>Keldi: <b style={{ color: THEME.text }}>{r.day.in || "—"}</b>{r.day.inDist != null && <span title="Sexdan masofa"> · {r.day.inDist} m</span>}</span>
              <span>Ketdi: <b style={{ color: THEME.text }}>{r.day.out || "—"}</b></span>
            </div>
            {r.day.manual && <span title={`${r.day.manual.by}: ${r.day.manual.reason}`} style={{ fontSize: 11, color: THEME.muted }}>✎ qo'lda</span>}
            <button type="button" onClick={() => setEdit({ employee: r.employee, day: { ...r.day, date: today } })} aria-label={`${r.employee.name} davomatini to'g'rilash`} style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 4 }}><Pencil size={15} /></button>
          </div>
        ))}
      </Card>
      {edit && <ManualModal edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {photo && <SelfieLightbox id={photo.id} title={photo.title} onClose={() => setPhoto(null)} />}
    </>
  );
}

// ---------------- Hafta / Oy ----------------
function PeriodTab({ kind }) {
  const isMobile = useIsMobile();
  const [anchor, setAnchor] = useState(todayStr());
  const from = kind === "week" ? weekStart(anchor) : monthStart(anchor);
  const to = kind === "week" ? addDays(from, 6) : monthEnd(anchor);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const [photo, setPhoto] = useState(null);
  const load = useCallback(() => { setData(null); fetchAttendanceReport(from, to).then(setData).catch(() => setData({ rows: [] })); }, [from, to]);
  useEffect(() => { load(); }, [load]);
  const shift = (dir) => setAnchor(kind === "week" ? addDays(from, dir * 7) : (() => { const d = parse(from); d.setMonth(d.getMonth() + dir); return ymd(d); })());
  const title = kind === "week" ? `${dLabel(from)} — ${dLabel(to)}` : `${MONTHS[parse(from).getMonth()][0].toUpperCase()}${MONTHS[parse(from).getMonth()].slice(1)} ${from.slice(0, 4)}`;
  const allDays = useMemo(() => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }, [from, to]);

  function exportExcel() {
    const rows = [];
    data.rows.forEach((r) => r.days.forEach((d) => rows.push({
      "Xodim": r.employee.name, "Sana": d.date, "Holat": STATUS[d.status]?.label || d.status, "Keldi": d.in || "", "Ketdi": d.out || "",
      "Kechikish (daq)": d.lateMin || 0, "Erta ketish (daq)": d.earlyMin || 0, "Qo'shimcha (daq)": d.overMin || 0,
      "Ishlagan (soat)": d.workedMin ? +(d.workedMin / 60).toFixed(2) : 0, "Izoh": d.manual ? `Qo'lda (${d.manual.by}): ${d.manual.reason}` : d.missingOut ? "Ketdim belgilanmagan" : "",
    })));
    exportRows(rows, "Davomat", `UVIX_davomat_${from}_${to}.xlsx`);
  }

  const cell = (d) => {
    if (!d) return { bg: "transparent", border: `1px dashed ${THEME.border}` };
    const c = STATUS[d.status]?.color || THEME.border;
    return { bg: ["dayoff", "pending"].includes(d.status) ? `${c}33` : c, border: d.missingOut ? `2px solid ${THEME.text}` : "none" };
  };
  const th = { fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.3, padding: "10px 10px", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "10px 10px", textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => shift(-1)} aria-label="Oldingi" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronLeft size={16} /></button>
        <div data-testid="att-period-title" style={{ fontWeight: 800, fontSize: 15, minWidth: 180, textAlign: "center" }}>{title}</div>
        <button type="button" onClick={() => shift(1)} disabled={to >= todayStr()} aria-label="Keyingi" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer", display: "grid", placeItems: "center", opacity: to >= todayStr() ? 0.4 : 1 }}><ChevronRight size={16} /></button>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={exportExcel} disabled={!data?.rows?.length}><Download size={14} /> Excel</Button>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: THEME.muted }}>
        {["ontime", "late", "absent", "extra", "dayoff"].map((k) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: k === "dayoff" ? `${STATUS[k].color}33` : STATUS[k].color }} />{STATUS[k].label}</span>)}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `2px solid ${THEME.text}` }} />"Ketdim" belgilanmagan</span>
      </div>
      <Card style={{ padding: 0, overflowX: "auto" }}>
        {!data ? <div style={{ padding: 20, color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <th style={{ ...th, textAlign: "left", paddingLeft: 16 }}>Xodim</th>
              <th style={{ ...th, textAlign: "left" }}>Kunlar</th>
              <th style={th}>Keldi</th><th style={th}>Kechikish</th><th style={th}>Erta ketish</th><th style={th}>Qo'shimcha</th><th style={th}>Kelmadi</th><th style={{ ...th, paddingRight: 16 }}>Ishladi</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => {
                const s = r.sum;
                const byDate = Object.fromEntries(r.days.map((d) => [d.date, d]));
                const isOpen = open === r.employee.id;
                return [
                  <tr key={r.employee.id} data-testid="att-period-row" onClick={() => setOpen(isOpen ? null : r.employee.id)} style={{ borderTop: `1px solid ${THEME.border}`, cursor: "pointer", background: isOpen ? THEME.surface : "transparent" }}>
                    <td style={{ ...td, textAlign: "left", paddingLeft: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={r.employee.name} /><div><div style={{ fontWeight: 700 }}>{r.employee.name}</div><div style={{ fontSize: 11, color: THEME.muted }}>{r.schedule.start}–{r.schedule.end}</div></div></div>
                    </td>
                    <td style={{ ...td, textAlign: "left" }}>
                      <div style={{ display: "flex", gap: kind === "week" ? 4 : 2, flexWrap: "nowrap" }}>
                        {allDays.map((d) => { const c = cell(byDate[d]); return <span key={d} title={`${dLabel(d)}: ${byDate[d] ? STATUS[byDate[d].status]?.label : "—"}${byDate[d]?.in ? ` · ${byDate[d].in}–${byDate[d].out || "?"}` : ""}`} style={{ width: kind === "week" ? 18 : 9, height: kind === "week" ? 18 : 16, borderRadius: kind === "week" ? 5 : 3, background: c.bg, boxSizing: "border-box", border: c.border, flexShrink: 0 }} />; })}
                      </div>
                    </td>
                    <td style={td}>{s.present}/{s.workdays}</td>
                    <td style={{ ...td, color: s.late ? "#F59E0B" : THEME.muted, fontWeight: s.late ? 700 : 400 }}>{s.late ? `${s.late}× · ${fmtDur(s.lateMin)}` : "—"}</td>
                    <td style={{ ...td, color: s.early ? "#F97316" : THEME.muted }}>{s.early ? `${s.early}× · ${fmtDur(s.earlyMin)}` : "—"}</td>
                    <td style={{ ...td, color: s.overMin ? "#3B82F6" : THEME.muted }}>{fmtDur(s.overMin)}</td>
                    <td style={{ ...td, color: s.absent ? "#EF4444" : THEME.muted, fontWeight: s.absent ? 700 : 400 }}>{s.absent || "—"}</td>
                    <td style={{ ...td, paddingRight: 16, fontWeight: 700 }}>{fmtH(s.workedMin)}</td>
                  </tr>,
                  isOpen && (
                    <tr key={r.employee.id + "-d"}><td colSpan={8} style={{ padding: "4px 16px 14px", background: THEME.surface }}>
                      {r.days.filter((d) => d.status !== "dayoff" || d.in).slice().reverse().map((d) => (
                        <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: `1px solid ${THEME.border}`, fontSize: 12.5, flexWrap: "wrap" }}>
                          <span style={{ width: 120, fontWeight: 600 }}>{dLabel(d.date)}, {WD_SHORT[parse(d.date).getDay()]}</span>
                          <StatusBadge day={d} />
                          <span style={{ color: THEME.muted }}>{d.in || "—"} → {d.out || (d.missingOut ? "belgilanmagan" : "—")}</span>
                          {d.earlyMin > 0 && <span style={{ color: "#F97316" }}>↩ {fmtDur(d.earlyMin)} erta</span>}
                          {d.overMin > 0 && <span style={{ color: "#3B82F6" }}>+ {fmtDur(d.overMin)}</span>}
                          {d.manual && <span title={d.manual.reason} style={{ color: THEME.muted }}>✎ {d.manual.by}: {d.manual.reason}</span>}
                          {d.photo && <button type="button" onClick={(e) => { e.stopPropagation(); setPhoto({ id: d.photo, title: `${r.employee.name} · ${dLabel(d.date)} ${d.in}` }); }} style={{ border: 0, background: "none", color: THEME.green, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "inherit" }}><Camera size={13} /> selfi</button>}
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEdit({ employee: r.employee, day: d }); }} style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.muted, cursor: "pointer" }} aria-label="To'g'rilash"><Pencil size={14} /></button>
                        </div>
                      ))}
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </Card>
      {isMobile && <div style={{ fontSize: 11.5, color: THEME.muted }}>Jadvalni chapga suring · qatorni bosib kunlarni oching</div>}
      {edit && <ManualModal edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {photo && <SelfieLightbox id={photo.id} title={photo.title} onClose={() => setPhoto(null)} />}
    </>
  );
}

// ---------------- Qo'lda to'g'rilash ----------------
function ManualModal({ edit, onClose, onSaved }) {
  const [inHm, setIn] = useState(edit.day.in || "");
  const [outHm, setOut] = useState(edit.day.out || "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    if (!reason.trim()) return setErr("Sababini yozing (masalan: telefoni o'chib qolgan)");
    try { await saveAttendanceManual({ employeeId: edit.employee.id, date: edit.day.date, in: inHm, out: outHm, reason }); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <Modal title={`${edit.employee.name} — ${dLabel(edit.day.date)}`} onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Keldi"><input type="time" value={inHm} onChange={(e) => setIn(e.target.value)} style={getInputStyle()} /></Field>
          <Field label="Ketdi"><input type="time" value={outHm} onChange={(e) => setOut(e.target.value)} style={getInputStyle()} /></Field>
        </div>
        <Field label="Sabab (majburiy)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Telefoni o'chib qolgan, ruxsat bilan ketgan..." style={getInputStyle()} /></Field>
        <div style={{ fontSize: 11.5, color: THEME.muted }}>O'zgartirish kim tomonidan va nima sababdan qilingani saqlanadi. Vaqtni o'chirish uchun maydonni bo'shating.</div>
        {err && <div style={{ fontSize: 12.5, color: THEME.rose }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={save}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Mening davomatim ----------------
function MineTab() {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); fetchMyAttendance(month).then(setData).catch((e) => setData({ error: e.message })); }, [month]);
  const shift = (dir) => { const d = parse(`${month}-01`); d.setMonth(d.getMonth() + dir); setMonth(ymd(d).slice(0, 7)); };
  if (!data) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>;
  if (data.error) return <Card><div style={{ color: THEME.rose, fontSize: 13 }}>{data.error}</div></Card>;
  const s = data.sum || {};
  const m = parse(`${month}-01`);
  const stat = (l, v, c) => <div style={{ flex: "1 1 130px", padding: "11px 14px", borderRadius: 14, background: THEME.card, border: `1px solid ${THEME.border}` }}><div style={{ fontSize: 11, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: c || THEME.text, marginTop: 3 }}>{v}</div></div>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => shift(-1)} aria-label="Oldingi oy" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 800, fontSize: 15, minWidth: 150, textAlign: "center" }}>{MONTHS[m.getMonth()][0].toUpperCase() + MONTHS[m.getMonth()].slice(1)} {m.getFullYear()}</div>
        <button type="button" onClick={() => shift(1)} disabled={month >= todayStr().slice(0, 7)} aria-label="Keyingi oy" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer", display: "grid", placeItems: "center", opacity: month >= todayStr().slice(0, 7) ? 0.4 : 1 }}><ChevronRight size={16} /></button>
        <div style={{ marginLeft: "auto", fontSize: 12.5, color: THEME.muted }}><Clock size={13} style={{ verticalAlign: -2 }} /> Jadvalingiz: {data.schedule?.start}–{data.schedule?.end}</div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {stat("Keldi", `${s.present || 0}/${s.workdays || 0}`)}
        {stat("Kechikish", s.late ? `${s.late}× · ${fmtDur(s.lateMin)}` : "—", s.late ? "#F59E0B" : undefined)}
        {stat("Erta ketish", s.early ? `${s.early}×` : "—", s.early ? "#F97316" : undefined)}
        {stat("Qo'shimcha", fmtDur(s.overMin), s.overMin ? "#3B82F6" : undefined)}
        {stat("Ishlagan", fmtH(s.workedMin))}
      </div>
      <Card style={{ padding: 0 }}>
        {(data.days || []).length === 0 && <div style={{ padding: 20, color: THEME.muted, fontSize: 13 }}>Bu oy uchun yozuv yo'q</div>}
        {(data.days || []).slice().reverse().filter((d) => d.status !== "dayoff" || d.in).map((d, i) => (
          <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i ? `1px solid ${THEME.border}` : "none", fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ width: 120, fontWeight: 600 }}>{dLabel(d.date)}, {WD_SHORT[parse(d.date).getDay()]}</span>
            <StatusBadge day={d} />
            <span style={{ color: THEME.muted }}>{d.in || "—"} → {d.out || (d.missingOut ? "belgilanmagan" : "—")}</span>
            {d.workedMin > 0 && <span style={{ marginLeft: "auto", fontWeight: 700 }}>{fmtDur(d.workedMin)}</span>}
          </div>
        ))}
      </Card>
    </>
  );
}

// ---------------- Sozlamalar ----------------
function SettingsTab({ config, onSaved }) {
  const [c, setC] = useState(config);
  const [emps, setEmps] = useState([]);
  const [msg, setMsg] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    // Barcha xodimlar ro'yxati — kuzatilmaydiganlari ham (admin tanlashi uchun)
    authListEmployees().then((list) => setEmps(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);
  const set = (patch) => setC((p) => ({ ...p, ...patch }));
  const setSch = (patch) => setC((p) => ({ ...p, schedule: { ...p.schedule, ...patch } }));
  const setOv = (id, patch) => setC((p) => ({ ...p, overrides: { ...p.overrides, [id]: { ...(p.overrides[id] || {}), ...patch } } }));

  async function useMyLocation() {
    setLocBusy(true); setMsg(null);
    try { const pos = await getPosition(); set({ office: { lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6), radius: c.office?.radius || 150 } }); setMsg({ ok: true, text: `Joylashuv olindi (aniqlik ±${Math.round(pos.accuracy)} m). "Saqlash"ni bosing.` }); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setLocBusy(false); }
  }
  async function save() {
    try { const saved = await saveAttendanceConfig(c); setC(saved); onSaved(saved); setMsg({ ok: true, text: "Saqlandi" }); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  async function trySend(type) {
    try { const r = await sendAttendanceReport(type); setPreview(r.text || r.message); setMsg({ ok: r.ok, text: r.message }); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  const dayChips = (days, onChange) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = days.includes(d);
        return <button key={d} type="button" onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])}
          style={{ width: 36, height: 32, borderRadius: 9, border: `1px solid ${on ? THEME.violet : THEME.border}`, background: on ? THEME.violet : "transparent", color: on ? "#fff" : THEME.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{WD_SHORT[d]}</button>;
      })}
    </div>
  );
  const sect = { fontWeight: 800, fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 };

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", alignItems: "start" }}>
      <Card>
        <div style={sect}><MapPin size={16} color={THEME.violet} /> Sex joylashuvi</div>
        <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10, lineHeight: 1.5 }}>Sexda turib "Hozirgi joylashuvim" tugmasini bosing. Xodimlar shu nuqtadan belgilangan radius ichida "Keldim" bosa oladi. Joylashuv faqat tugma bosilgan lahzada tekshiriladi.</div>
        <Button onClick={useMyLocation} disabled={locBusy}><MapPin size={14} /> {locBusy ? "Aniqlanmoqda…" : "Hozirgi joylashuvim — sex"}</Button>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Field label="Kenglik (lat)"><input value={c.office?.lat ?? ""} onChange={(e) => set({ office: { ...(c.office || { radius: 150 }), lat: parseFloat(e.target.value) || 0 } })} style={getInputStyle()} inputMode="decimal" data-testid="att-lat" /></Field>
          <Field label="Uzunlik (lng)"><input value={c.office?.lng ?? ""} onChange={(e) => set({ office: { ...(c.office || { radius: 150 }), lng: parseFloat(e.target.value) || 0 } })} style={getInputStyle()} inputMode="decimal" data-testid="att-lng" /></Field>
          <Field label="Radius (m)"><input value={c.office?.radius ?? 150} onChange={(e) => set({ office: { ...(c.office || { lat: 0, lng: 0 }), radius: parseInt(e.target.value, 10) || 150 } })} style={{ ...getInputStyle(), width: 90 }} inputMode="numeric" /></Field>
        </div>
        {c.office?.lat ? <a href={`https://www.openstreetmap.org/?mlat=${c.office.lat}&mlon=${c.office.lng}#map=17/${c.office.lat}/${c.office.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: THEME.violet, display: "inline-block", marginTop: 8 }}>Xaritada tekshirish ↗</a> : null}
      </Card>

      <Card>
        <div style={sect}><Clock size={16} color={THEME.violet} /> Ish jadvali (umumiy)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="Boshlanishi"><input type="time" value={c.schedule.start} onChange={(e) => setSch({ start: e.target.value })} style={getInputStyle()} /></Field>
          <Field label="Tugashi"><input type="time" value={c.schedule.end} onChange={(e) => setSch({ end: e.target.value })} style={getInputStyle()} /></Field>
          <Field label="Imtiyoz (daq)"><input value={c.grace} onChange={(e) => set({ grace: parseInt(e.target.value, 10) || 0 })} style={{ ...getInputStyle(), width: 90 }} inputMode="numeric" /></Field>
        </div>
        <div style={{ fontSize: 12, color: THEME.muted, margin: "8px 0 6px" }}>Ish kunlari</div>
        {dayChips(c.schedule.days, (days) => setSch({ days }))}
        <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 8 }}>{c.schedule.start} dan {c.grace} daqiqagacha kelsa — o'z vaqtida. Kechikish {c.schedule.start} dan hisoblanadi.</div>
        <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 12, paddingTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flex: "1 1 200px" }}>
            <input type="checkbox" checked={!!c.photo} onChange={(e) => set({ photo: e.target.checked })} /> <Camera size={15} /> "Keldim"da selfi majburiy
          </label>
          <span style={{ fontSize: 12, color: THEME.muted }}>Saqlash:</span>
          <input value={c.photoDays ?? 60} onChange={(e) => set({ photoDays: parseInt(e.target.value, 10) || 60 })} style={{ ...getInputStyle(), width: 70 }} inputMode="numeric" aria-label="Selfi saqlash muddati (kun)" />
          <span style={{ fontSize: 12, color: THEME.muted }}>kun</span>
        </div>
        <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>Selfi faqat jonli kameradan olinadi (galereyadan emas), ustiga vaqt yoziladi. Faqat admin ko'radi, muddat o'tgach o'zi o'chadi.</div>
      </Card>

      <Card>
        <div style={sect}>Xodimlar</div>
        <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 8 }}>Kim kuzatiladi va kimga alohida jadval (bo'sh qoldirilsa — umumiy jadval).</div>
        {emps.length === 0 && <div style={{ fontSize: 12.5, color: THEME.muted }}>Yuklanmoqda…</div>}
        {emps.map((e) => {
          const o = c.overrides[e.id] || {};
          const track = o.track !== undefined ? o.track : e.role !== "admin";
          return (
            <div key={e.id} style={{ padding: "9px 0", borderTop: `1px solid ${THEME.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 160px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={track} onChange={(ev) => setOv(e.id, { track: ev.target.checked })} />
                  {e.name} <span style={{ fontWeight: 400, color: THEME.muted, fontSize: 11.5 }}>{roleLabel(e.role)}</span>
                </label>
                {track && <>
                  <input type="time" value={o.start || ""} onChange={(ev) => setOv(e.id, { start: ev.target.value })} title="Alohida boshlanish" style={{ ...getInputStyle(), width: 110, padding: "6px 8px" }} />
                  <input type="time" value={o.end || ""} onChange={(ev) => setOv(e.id, { end: ev.target.value })} title="Alohida tugash" style={{ ...getInputStyle(), width: 110, padding: "6px 8px" }} />
                </>}
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <div style={sect}><Send size={16} color={THEME.violet} /> Telegram hisobotlari</div>
        {[["daily", `Har ish kuni ${c.dailyAt} da — kim keldi / kechikdi / kelmadi`], ["weekly", "Har dushanba 09:00 — o'tgan hafta xulosasi"], ["monthly", "Har oyning 1-sanasi — o'tgan oy xulosasi"]].map(([k, l]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "5px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={!!c.reports[k]} onChange={(e) => set({ reports: { ...c.reports, [k]: e.target.checked } })} /> {l}
          </label>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <Field label="Kunlik hisobot vaqti"><input type="time" value={c.dailyAt} onChange={(e) => set({ dailyAt: e.target.value })} style={getInputStyle()} /></Field>
          <Field label="Chat ID (ixtiyoriy)"><input value={c.reportChatId || ""} onChange={(e) => set({ reportChatId: e.target.value })} placeholder="Bo'sh — bot chati" style={getInputStyle()} /></Field>
        </div>
        <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>Hisobotlar Sozlamalardagi Telegram bot orqali yuboriladi. Faqat sizga kelishi uchun o'z chat ID'ingizni yozing.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <Button variant="ghost" onClick={() => trySend("daily")}>Bugungi — sinash</Button>
          <Button variant="ghost" onClick={() => trySend("weekly")}>Haftalik — sinash</Button>
          <Button variant="ghost" onClick={() => trySend("monthly")}>Oylik — sinash</Button>
        </div>
        {preview && <pre data-testid="att-preview" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: THEME.surface, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: 260, overflowY: "auto" }} >{String(preview).replace(/<[^>]+>/g, "")}</pre>}
      </Card>

      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={save}>Saqlash</Button>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!c.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Davomat yoqilgan</label>
        {msg && <span style={{ fontSize: 12.5, color: msg.ok ? THEME.green : THEME.rose, display: "inline-flex", alignItems: "center", gap: 6 }}>{!msg.ok && <AlertTriangle size={14} />}{msg.text}</span>}
      </div>
    </div>
  );
}
