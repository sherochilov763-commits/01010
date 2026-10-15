// LockScreen.jsx — ekran qulfi (A2): ish joyi o'z holatida qoladi, faqat PIN yoki Face ID bilan ochiladi.
// Ochilgach xodim qaysi sahifada bo'lsa, o'sha yerda davom etadi. «Boshqa xodim» — tizimdan chiqish.
import { useEffect, useMemo, useRef, useState } from "react";
import { Delete, Fingerprint, Lock, LogOut, ScanFace } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { authUnlock } from "../storage.js";
import { THEME } from "../theme.js";
import { roleLabel } from "../constants.js";
import { biometricLabel, canUseBiometrics, confirmWithPrepared, isCancel, isEnrolledMe, makePreparer, prepareConfirm } from "../auth/passkey.js";

export function LockScreen({ user, onUnlock, onLogout }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [bio, setBio] = useState(false);
  const prep = useMemo(() => makePreparer(prepareConfirm), []);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const bl = biometricLabel();

  useEffect(() => {
    let alive = true;
    if (isEnrolledMe()) canUseBiometrics().then((ok) => { if (alive && ok) { setBio(true); prep.refresh(); } });
    return () => { alive = false; };
  }, [prep]);

  async function submit(p = pinRef.current) {
    if (p.length < 4 || busy) return;
    setBusy(true); setErr("");
    try {
      await authUnlock(p);
      onUnlock();
    } catch (e) {
      if (e.status === 401 && e.code !== "invalid_pin") { onLogout(); return; } // seans tugagan
      setErr(e.message); setPin(""); setShake(true); setTimeout(() => setShake(false), 400);
    }
    setBusy(false);
  }
  async function withBio() {
    setErr("");
    try {
      const p = await prep.get();
      if (!p) throw new Error("Face ID hozir ishlamadi — PIN kiriting");
      await confirmWithPrepared(p);
      onUnlock();
    } catch (e) {
      prep.invalidate(); prep.refresh();
      if (!isCancel(e)) setErr(e.message || "Tasdiqlab bo'lmadi — PIN kiriting");
    }
  }
  const press = (d) => { if (busy) return; setErr(""); setPin((v) => { const n = (v + d).slice(0, 6); if (n.length === 6) setTimeout(() => submit(n), 0); return n; }); };
  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); setPin((v) => v.slice(0, -1)); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }); // har renderda — eng so'nggi holat bilan

  const slots = Math.max(4, pin.length);
  const key = { height: 62, borderRadius: 18, border: 0, background: THEME.chip, color: THEME.text, fontSize: 24, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div className="uvix-lock" role="dialog" aria-modal="true" aria-label="Ekran qulflangan" data-testid="lock-screen"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: THEME.surface, color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: THEME.font }}>
      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Avatar name={user.name} size={72} />
          <span style={{ position: "absolute", right: -4, bottom: -4, width: 28, height: 28, borderRadius: "50%", background: THEME.text, color: THEME.card, display: "flex", alignItems: "center", justifyContent: "center", border: `3px solid ${THEME.surface}` }}><Lock size={13} /></span>
        </div>
        <div style={{ fontSize: 21, fontWeight: 700, marginTop: 14 }}>{user.name}</div>
        <div style={{ fontSize: 13.5, color: THEME.muted, marginTop: 2 }}>{roleLabel(user.role)} · ekran qulflangan</div>
        <div className={shake ? "uvix-lock-shake" : ""} role="status" aria-label={`${pin.length} ta raqam kiritildi`} style={{ display: "flex", gap: 14, margin: "26px 0 8px", minHeight: 16 }}>
          {Array.from({ length: slots }).map((_, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < pin.length ? THEME.text : "transparent", border: `2px solid ${i < pin.length ? THEME.text : THEME.border2}` }} />)}
        </div>
        <div role="alert" style={{ minHeight: 20, fontSize: 13, color: THEME.rose, textAlign: "center" }}>{err}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, width: "100%", marginTop: 8 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" style={key} onClick={() => press(d)} aria-label={d} data-key={d}>{d}</button>)}
          {bio ? <button type="button" style={{ ...key, background: "transparent", color: THEME.violet }} onClick={withBio} aria-label={bl.name} data-testid="lock-bio">{bl.kind === "face" ? <ScanFace size={28} /> : <Fingerprint size={28} />}</button> : <span />}
          <button type="button" style={key} onClick={() => press("0")} aria-label="0" data-key="0">0</button>
          <button type="button" style={{ ...key, background: "transparent" }} onClick={() => setPin((v) => v.slice(0, -1))} aria-label="O'chirish"><Delete size={24} /></button>
        </div>
        <button type="button" onClick={() => submit()} disabled={pin.length < 4 || busy} data-testid="lock-open"
          style={{ width: "100%", height: 52, marginTop: 16, borderRadius: 16, border: 0, background: THEME.primarySolid, color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", opacity: pin.length < 4 || busy ? 0.5 : 1 }}>
          Ochish
        </button>
        <button type="button" onClick={onLogout} data-testid="lock-logout"
          style={{ marginTop: 14, background: "none", border: 0, color: THEME.muted, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          <LogOut size={15} /> Boshqa xodim sifatida kirish
        </button>
      </div>
    </div>
  );
}

export const LOCK_CSS = `
  @keyframes uvixLockShake { 0%,100% { transform: none; } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
  .uvix-lock-shake { animation: uvixLockShake .35s ease; }
  @media (prefers-reduced-motion: reduce) { .uvix-lock-shake { animation: none; } }
`;
