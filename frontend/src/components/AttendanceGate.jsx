// AttendanceGate.jsx — ish kuni "Keldim" bosilmaguncha ilova yopiq (admin bundan mustasno).
// Faqat ish kunida, ish boshlanishidan 2 soat oldin — tugaguncha. Ish tugagach va dam kunlari ilova ochiq.
import { Camera, LogOut, MapPin } from "lucide-react";
import { gateActive, useMyAttendance } from "../lib/attendanceStore.js";
import { useCheckIn, useTick } from "./CheckInButton.jsx";
import { THEME } from "../theme.js";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + m; };

export function AttendanceGate({ user, onLogout, children }) {
  const { loaded, data } = useMyAttendance();
  const active = !!user && user.role !== "admin" && loaded && gateActive(data);
  useTick(active ? 1000 : 60000); // soat faqat yopuvchi ekranda har soniya yangilanadi
  const { busy, msg, run, selfieModal } = useCheckIn();
  if (!active) return children; // admin, ma'lumot kelmagan yoki vaqt emas — ilova ochiq

  const now = new Date();
  const sch = data.schedule;
  const nowM = now.getHours() * 60 + now.getMinutes();
  const start = toMin(sch.start);
  const lateBy = nowM - start;
  const isLate = lateBy > (data.config.grace || 0);
  const hour = now.getHours();
  const greet = hour < 11 ? "Xayrli tong" : hour < 17 ? "Xayrli kun" : "Xayrli kech";
  const first = String(user.name || "").split(" ")[0];

  return (
    <div data-testid="attendance-gate" style={{ fontFamily: THEME.font, minHeight: "100vh", background: THEME.surface, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(420px, 100%)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 14, color: THEME.muted }}>{now.getDate()}-{MONTHS[now.getMonth()]}, {DAYS[now.getDay()]}</div>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1, fontFamily: THEME.fontNum, fontVariantNumeric: "tabular-nums", color: THEME.text, lineHeight: 1 }}>
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}<span style={{ fontSize: 26, color: THEME.muted }}>:{String(now.getSeconds()).padStart(2, "0")}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: THEME.text }}>{greet}, {first}!</div>
        <div style={{ fontSize: 14, color: isLate ? THEME.rose : THEME.muted, fontWeight: isLate ? 700 : 500 }}>
          {isLate ? `Ish ${sch.start} da boshlangan — ${lateBy} daqiqa kechikyapsiz` : nowM < start ? `Ish ${sch.start} da boshlanadi` : `Ish boshlandi (${sch.start})`}
        </div>
        <button type="button" data-testid="gate-checkin" onClick={() => run("in")} disabled={busy}
          style={{ marginTop: 10, width: 200, height: 200, borderRadius: "50%", border: 0, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
            background: `radial-gradient(circle at 50% 35%, ${isLate ? "#F87171" : "#34D399"}, ${isLate ? THEME.rose : THEME.green})`, color: "#fff",
            boxShadow: `0 20px 50px ${isLate ? THEME.rose : THEME.green}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            animation: busy ? "none" : "uvixGatePulse 2s ease-in-out infinite" }}>
          {data.config.photo ? <Camera size={46} strokeWidth={1.8} /> : <MapPin size={46} strokeWidth={1.8} />}
          <span style={{ fontSize: 24, fontWeight: 800 }}>{busy ? "Tekshirilmoqda…" : "Keldim"}</span>
        </button>
        <div style={{ fontSize: 12.5, color: THEME.muted, maxWidth: 320, lineHeight: 1.5 }}>
          {data.config.photo ? "Joylashuv tekshiriladi va selfi olinadi." : "Joylashuv tekshiriladi."} Belgilagandan so'ng ilova ochiladi.
        </div>
        {msg && <div data-testid="gate-msg" style={{ fontSize: 13.5, color: msg.ok ? THEME.green : THEME.rose, background: msg.ok ? THEME.greenBg : THEME.roseBg, padding: "10px 14px", borderRadius: 12, lineHeight: 1.45 }}>{msg.text}</div>}
        <div style={{ fontSize: 12, color: THEME.muted }}>Muammo bo'lsa (GPS ishlamasa va h.k.) — administratorga murojaat qiling, u qo'lda belgilaydi.</div>
        <button type="button" onClick={onLogout} style={{ marginTop: 6, border: 0, background: "none", color: THEME.muted, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}><LogOut size={14} /> Chiqish</button>
      </div>
      <style>{`@keyframes uvixGatePulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }`}</style>
      {selfieModal}
    </div>
  );
}
