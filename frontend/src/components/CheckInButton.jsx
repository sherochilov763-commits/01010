// CheckInButton.jsx — "Keldim" (joylashuv + selfi) / "Ketdim". Kelgandan keyin tugmaning o'zida jonli ish vaqti taymeri.
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Clock, Loader2, LogOut, MapPin, X } from "lucide-react";
import { checkAttendance } from "../storage.js";
import { getPosition } from "../lib/geo.js";
import { refreshAttendance, useMyAttendance } from "../lib/attendanceStore.js";
import { SelfieCapture } from "./SelfieCapture.jsx";
import { THEME } from "../theme.js";

const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, "0");
const hmNow = (iso) => new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false });
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
// Kelgan paytdan (aniq vaqt; bo'lmasa "HH:MM") hozirgacha o'tgan soniya
function sinceIn(today) {
  const d = new Date();
  let start = today.inAt ? new Date(today.inAt) : null;
  if (!start || isNaN(start)) { const [h, m] = String(today.in).split(":").map(Number); start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0); }
  return Math.max(0, Math.floor((d - start) / 1000));
}
export const fmtClock = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;

// Keldim/Ketdim jarayoni: joylashuv → (oldindan tekshiruv) → selfi → yozish
export function useCheckIn() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [selfie, setSelfie] = useState(null); // { resolve }
  const hide = useRef(null);
  function flash(text, ok) {
    setMsg({ text, ok });
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setMsg(null), ok ? 4000 : 8000);
  }
  const askSelfie = () => new Promise((resolve) => setSelfie({ resolve }));
  async function run(type) {
    setBusy(true); setMsg(null);
    try {
      const pos = await getPosition();
      const pre = await checkAttendance(type, { ...pos, dryRun: true });
      let photo;
      if (pre.needPhoto) {
        setBusy(false);
        photo = await askSelfie();
        if (!photo) return; // bekor qilindi
        setBusy(true);
      }
      const r = await checkAttendance(type, { ...pos, photo });
      navigator.vibrate?.(30);
      await refreshAttendance();
      const t = type === "in" ? r.record?.in : r.record?.out;
      if (type === "in") flash(r.already ? `Bugun ${hmNow(t)} da belgilangansiz` : r.today?.status === "late" ? `Keldingiz: ${hmNow(t)} — ${r.today.lateMin} daqiqa kechikish` : `Keldingiz: ${hmNow(t)}. Ishingizga omad!`, true);
      else flash(`Ketdingiz: ${hmNow(t)}. Yaxshi dam oling!`, true);
      return true;
    } catch (e) {
      flash(e.message || "Belgilab bo'lmadi", false);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const selfieModal = selfie ? (
    <SelfieCapture onDone={(img) => { selfie.resolve(img); setSelfie(null); }} onCancel={() => { selfie.resolve(null); setSelfie(null); }} />
  ) : null;
  return { busy, msg, setMsg, run, selfieModal };
}

export function CheckInButton({ compact = false }) {
  const { data } = useMyAttendance();
  const { busy, msg, setMsg, run, selfieModal } = useCheckIn();
  const [confirmOut, setConfirmOut] = useState(false);
  const today = data?.today || {};
  const working = !!today.in && !today.out;
  useTick(working ? 1000 : 30000);

  if (!data || !data.config?.enabled || !data.schedule?.track || !data.config?.officeSet) return null;
  const sch = data.schedule;
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const planMin = Math.max(1, toMin(sch.end) - toMin(sch.start));

  let content, style, onClick, title;
  if (!today.in) {
    const late = nowM > toMin(sch.start) + (data.config.grace || 0) && today.workday;
    title = "Ishga kelganingizni belgilang";
    onClick = () => run("in");
    style = { background: late ? THEME.rose : THEME.green, color: "#fff", border: "none", boxShadow: `0 6px 18px ${late ? THEME.rose : THEME.green}55` };
    content = <>{data.config.photo ? <Camera size={16} /> : <MapPin size={16} />} Keldim{late && !compact ? ` · ${nowM - toMin(sch.start)} daq kech` : ""}</>;
  } else if (working) {
    const sec = sinceIn(today);
    const pct = Math.min(100, (sec / 60 / planMin) * 100);
    const over = nowM >= toMin(sch.end);
    title = `Bugun ${today.in} da keldingiz · ish ${sch.end} da tugaydi`;
    onClick = () => (nowM < toMin(sch.end) ? setConfirmOut(true) : run("out"));
    style = { background: THEME.card, color: THEME.text, border: `1px solid ${over ? THEME.green : THEME.border}`, position: "relative", overflow: "hidden" };
    content = <>
      <Clock size={15} color={today.status === "late" ? THEME.amber : THEME.green} />
      <span data-testid="work-timer" style={{ fontFamily: THEME.fontNum, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{fmtClock(sec)}</span>
      {!compact && <span style={{ color: THEME.muted, fontWeight: 600 }}>· {sch.end} gacha</span>}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 4, paddingLeft: 9, borderLeft: `1px solid ${THEME.border}` }}><LogOut size={14} /> Ketdim</span>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${pct}%`, background: over ? THEME.green : today.status === "late" ? THEME.amber : THEME.violet, transition: "width 1s linear" }} />
    </>;
  } else {
    title = "Bugun belgilandi (qayta bosilsa — ketish vaqti yangilanadi)";
    onClick = () => run("out");
    style = { background: THEME.greenBg, color: THEME.green, border: "none" };
    content = <><Check size={16} /> {today.in}–{today.out}</>;
  }

  return (
    <div style={{ position: "relative" }} className="no-print">
      <style>{`@keyframes uvixCheckPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,.45) } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,0) } }`}</style>
      <button type="button" data-testid="checkin-btn" onClick={onClick} disabled={busy} title={title}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 42, padding: compact ? "0 12px" : "0 15px", borderRadius: 12, cursor: busy ? "default" : "pointer",
          fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap", ...style, animation: !today.in && !busy ? "uvixCheckPulse 1.8s ease-in-out infinite" : "none" }}>
        {busy ? <><Loader2 size={16} className="uvix-spin" /> Tekshirilmoqda…</> : content}
      </button>

      {(msg || confirmOut) && (
        <div role="status" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 160, width: 290, padding: 12, borderRadius: 14, background: THEME.card, border: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg, fontSize: 13, color: THEME.text }}>
          {confirmOut ? (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Clock size={16} color={THEME.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>Ish vaqti <b>{sch.end}</b> da tugaydi. Hozir ketyapsizmi? Bu erta ketish sifatida yoziladi.</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button type="button" onClick={() => setConfirmOut(false)} style={{ flex: 1, height: 34, borderRadius: 9, border: `1px solid ${THEME.border}`, background: "none", color: THEME.text, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Yo'q</button>
                <button type="button" onClick={() => { setConfirmOut(false); run("out"); }} style={{ flex: 1, height: 34, borderRadius: 9, border: 0, background: THEME.amber, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Ha, ketyapman</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {msg.ok ? <Check size={16} color={THEME.green} style={{ flexShrink: 0, marginTop: 1 }} /> : <MapPin size={16} color={THEME.rose} style={{ flexShrink: 0, marginTop: 1 }} />}
              <div style={{ flex: 1, lineHeight: 1.45 }} data-testid="checkin-msg">{msg.text}</div>
              <button type="button" onClick={() => setMsg(null)} aria-label="Yopish" style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 0 }}><X size={14} /></button>
            </div>
          )}
        </div>
      )}
      {selfieModal}
    </div>
  );
}
