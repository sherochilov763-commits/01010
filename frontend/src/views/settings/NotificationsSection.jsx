// NotificationsSection.jsx — har xodimning o'z bildirishnoma sozlamalari:
// qaysi turkum ilovada / push'da keladi, qaysi ovoz chalinadi, sokin soatlar, ushbu qurilmada push.
import { useEffect, useState } from "react";
import { Bell, BellOff, Lock, Play, Send } from "lucide-react";
import { Button, Card, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { SOUND_LABELS, currentPushSubscription, disablePush, enablePush, playSound, pushSupport } from "../../lib/notify.js";
import { sendTestNotification } from "../../storage.js";

export function NotificationsSection({ n, onOpenTelegramRoutes }) {
  const [draft, setDraft] = useState(n.prefs);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [thisDevice, setThisDevice] = useState(false);
  useEffect(() => { setDraft(n.prefs); }, [n.prefs]);
  useEffect(() => { currentPushSubscription().then((s) => setThisDevice(!!s)).catch(() => {}); }, [n.push?.devices]);

  if (!draft) return null;
  const sup = pushSupport();
  const cats = Object.entries(n.cats || {});
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setCat = (c, patch) => setDraft((d) => ({ ...d, matrix: { ...d.matrix, [c]: { ...d.matrix[c], ...patch } } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(n.prefs);

  async function save() {
    setBusy(true); setMsg("");
    try { await n.savePrefs(draft); setMsg("Saqlandi"); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function togglePush() {
    setBusy(true); setMsg("");
    try {
      if (thisDevice) { await disablePush(); setThisDevice(false); setMsg("Bu qurilmada push o'chirildi"); }
      else { await enablePush(n.push.publicKey); setThisDevice(true); setMsg("Bu qurilmada push yoqildi"); }
      n.refresh();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function test() {
    setMsg("");
    try { await sendTestNotification(); setTimeout(n.refresh, 400); setMsg("Sinov bildirishnomasi yuborildi"); } catch (e) { setMsg(e.message); }
  }

  const th = { padding: "8px 10px", fontSize: 12.5, fontWeight: 500, color: THEME.muted, textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", borderTop: `1px solid ${THEME.border}`, fontSize: 13 };
  const check = (on, onChange, disabled, label) => (
    <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label}
      style={{ width: 17, height: 17, accentColor: THEME.violet, cursor: disabled ? "not-allowed" : "pointer" }} />
  );

  return (
    <Card data-testid="notify-settings">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>Bildirishnomalar</div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>Faqat siz uchun. Qo'ng'iroqcha (ilovada), telefon/kompyuter ekrani (push) va ovoz.</div>
        </div>
        <Button variant="ghost" onClick={test}><Send size={14} /> Sinash</Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${THEME.border}`, borderRadius: 8, margin: "14px 0" }}>
        {thisDevice ? <Bell size={18} color={THEME.green} /> : <BellOff size={18} color={THEME.dim} />}
        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{thisDevice ? "Bu qurilmada push yoqilgan" : "Bu qurilmada push o'chiq"}</div>
          <div style={{ fontSize: 12.5, color: THEME.muted }}>
            {!n.push?.available ? "Serverda push sozlanmagan"
              : !sup.ok ? (sup.reason === "ios-install" ? "iPhone: «Ulashish → Bosh ekranga qo'shish», keyin ilovani bosh ekrandan oching" : "Bu brauzer push'ni qo'llamaydi")
              : sup.permission === "denied" ? "Brauzerda ruxsat bloklangan — sayt sozlamalaridan «Bildirishnomalar»ga ruxsat bering"
              : `Ulangan qurilmalar: ${n.push.devices || 0}`}
          </div>
        </div>
        {n.push?.available && sup.ok && sup.permission !== "denied" && (
          <Button variant={thisDevice ? "ghost" : "primary"} onClick={togglePush} disabled={busy}>{thisDevice ? "O'chirish" : "Yoqish"}</Button>
        )}
      </div>

      <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflowX: "auto" }} className="uvix-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
          <thead>
            <tr><th style={th}>Turkum</th><th style={{ ...th, textAlign: "center" }}>Ilovada</th><th style={{ ...th, textAlign: "center" }}>Push</th><th style={th}>Ovoz</th></tr>
          </thead>
          <tbody>
            {cats.map(([c, meta]) => {
              const m = draft.matrix[c] || {};
              return (
                <tr key={c} data-cat={c}>
                  <td style={td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {meta.label}
                      {meta.critical && <span title="Muhim xabar: ilovada doim ko'rinadi, sokin soatlarda ham keladi" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: THEME.rose, background: THEME.roseBg, padding: "0 6px", borderRadius: 5, lineHeight: "18px" }}><Lock size={10} /> Muhim</span>}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{check(m.app !== false, (v) => setCat(c, { app: v }), meta.critical, `${meta.label} — ilovada`)}</td>
                  <td style={{ ...td, textAlign: "center" }}>{check(!!m.push, (v) => setCat(c, { push: v }), false, `${meta.label} — push`)}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select value={m.sound || "none"} onChange={(e) => { setCat(c, { sound: e.target.value }); playSound(e.target.value, draft.volume); }} aria-label={`${meta.label} — ovoz`}
                        style={{ ...getInputStyle(), minHeight: 32, height: 32, padding: "0 8px", width: 140, fontSize: 13 }}>
                        {(n.sounds || Object.keys(SOUND_LABELS)).map((sn) => <option key={sn} value={sn}>{SOUND_LABELS[sn] || sn}</option>)}
                      </select>
                      <button type="button" onClick={() => playSound(m.sound, draft.volume)} disabled={!m.sound || m.sound === "none"} aria-label="Eshitib ko'rish" title="Eshitib ko'rish" className="uvix-iconbtn"
                        style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.muted, display: "grid", placeItems: "center", cursor: "pointer", opacity: !m.sound || m.sound === "none" ? 0.4 : 1 }}><Play size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginTop: 14 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={!!draft.quiet?.on} onChange={(e) => set({ quiet: { ...draft.quiet, on: e.target.checked } })} style={{ width: 17, height: 17, accentColor: THEME.violet }} />
          Sokin soatlar
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: draft.quiet?.on ? 1 : 0.5 }}>
          <input type="time" value={draft.quiet?.from || "22:00"} disabled={!draft.quiet?.on} onChange={(e) => set({ quiet: { ...draft.quiet, from: e.target.value } })} style={{ ...getInputStyle(), width: 110, minHeight: 32, height: 32 }} aria-label="Sokin soat boshlanishi" />
          <span style={{ color: THEME.muted }}>—</span>
          <input type="time" value={draft.quiet?.to || "08:00"} disabled={!draft.quiet?.on} onChange={(e) => set({ quiet: { ...draft.quiet, to: e.target.value } })} style={{ ...getInputStyle(), width: 110, minHeight: 32, height: 32 }} aria-label="Sokin soat tugashi" />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          Ovoz balandligi
          <input type="range" min={0} max={1} step={0.1} value={draft.volume ?? 0.8} onChange={(e) => set({ volume: Number(e.target.value) })} onMouseUp={() => playSound("marimba", draft.volume)} onTouchEnd={() => playSound("marimba", draft.volume)} style={{ accentColor: THEME.violet, width: 120 }} />
        </label>
      </div>
      <div style={{ fontSize: 12, color: THEME.dim, marginTop: 10, lineHeight: 1.5 }}>
        Ovoz ilova ochiq bo'lganda chalinadi. Ilova yopiq bo'lsa, push telefonning o'z bildirishnoma ovozi bilan keladi. Sokin soatlarda faqat «Muhim» xabarlar keladi.
        {onOpenTelegramRoutes && <> Telegram'ga qaysi xabar borishi — <button type="button" onClick={onOpenTelegramRoutes} style={{ border: 0, background: "none", padding: 0, color: THEME.violet, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Telegram xabarlari yo'nalishi</button>da.</>}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        <Button onClick={save} disabled={!dirty || busy}>Saqlash</Button>
        {msg && <span style={{ fontSize: 12.5, color: /xato|ruxsat|qo'llamaydi|sozlanmagan|bloklangan/i.test(msg) ? THEME.rose : THEME.green }} role="status">{msg}</span>}
      </div>
    </Card>
  );
}
