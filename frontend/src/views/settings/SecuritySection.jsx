// SecuritySection.jsx — Sozlamalar → Profil: ekran qulfi muddati (shu qurilma) va ochiq qurilmalar (A2).
import { useEffect, useState } from "react";
import { Laptop, Lock, LogOut, Smartphone } from "lucide-react";
import { Button, Card } from "../../components/ui.jsx";
import { fetchSessions, revokeSession } from "../../storage.js";
import { LOCK_OPTIONS, lockMinutes, setLockMinutes } from "../../lib/lock.js";
import { THEME } from "../../theme.js";

const MON = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const when = (t) => { const d = new Date(t); return `${d.getDate()}-${MON[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 2) return "hozir faol";
  if (m < 60) return `${m} daq oldin`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} soat oldin` : `${Math.round(h / 24)} kun oldin`;
};

export function SecuritySection({ isAdmin }) {
  const [min, setMin] = useState(lockMinutes);
  const [all, setAll] = useState(false);
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const load = () => fetchSessions(all).then((l) => { setList(l); setErr(""); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = (on) => ({ height: 34, padding: "0 12px", borderRadius: 8, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: on ? THEME.card : "transparent", color: on ? THEME.text : THEME.muted, boxShadow: on ? THEME.shadowSm : "none" });
  return (
    <Card>
      <div data-testid="security-section" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}><Lock size={16} /> Xavfsizlik</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4, lineHeight: 1.45 }}>
        Kirish 12 soat saqlanadi — sahifa yangilansa yoki ilova qayta ochilsa, PIN qayta so'ralmaydi. Harakatsiz qolsa ekran qulflanadi va PIN yoki Face ID bilan ochiladi.
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 14 }}>Ekran qulfi (shu qurilmada)</div>
      <div role="group" aria-label="Ekran qulfi muddati" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: THEME.chip, marginTop: 6, flexWrap: "wrap" }}>
        {LOCK_OPTIONS.map((m) => (
          <button key={m} type="button" aria-pressed={min === m} data-lockmin={m} style={seg(min === m)} onClick={() => { setLockMinutes(m); setMin(m); }}>
            {m ? `${m} daq` : "O'chiq"}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={() => window.dispatchEvent(new Event("uvix:lock-now"))} data-testid="lock-now"><Lock size={14} /> Hozir qulflash</Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>Ochiq qurilmalar</div>
        {isAdmin && (
          <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: THEME.chip }}>
            <button type="button" style={seg(!all)} onClick={() => setAll(false)}>Meniki</button>
            <button type="button" style={seg(all)} onClick={() => setAll(true)} data-testid="sessions-all">Barcha xodimlar</button>
          </div>
        )}
      </div>
      {err && <div role="alert" style={{ color: THEME.rose, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div data-testid="sessions" style={{ marginTop: 8, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden" }}>
        {list === null && <div style={{ padding: 12, fontSize: 13, color: THEME.muted }}>Yuklanmoqda…</div>}
        {list?.length === 0 && <div style={{ padding: 12, fontSize: 13, color: THEME.muted }}>Boshqa ochiq qurilma yo'q</div>}
        {list?.map((s, i) => {
          const phone = /iPhone|Android|iPad/.test(s.dev || "");
          const I = phone ? Smartphone : Laptop;
          return (
            <div key={s.id} data-session={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderTop: i ? `1px solid ${THEME.border}` : "none" }}>
              <I size={18} color={THEME.muted} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{all ? `${s.name} · ` : ""}{s.dev || "Qurilma"}{s.current && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: THEME.greenText, background: THEME.greenBg, borderRadius: 8, padding: "1px 7px" }}>shu qurilma</span>}</div>
                <div style={{ fontSize: 12, color: THEME.dim }}>{ago(s.lastSeen)} · kirgan: {when(s.createdAt)}</div>
              </div>
              {!s.current && (
                <button type="button" onClick={() => revokeSession(s.id).then(load).catch((e) => setErr(e.message))} data-testid="session-revoke"
                  style={{ height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.rose, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                  <LogOut size={13} /> Chiqarish
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
