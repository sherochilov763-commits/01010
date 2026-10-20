// CustMsgQueue.jsx — «Mijozga xabarlar navbati»: kvitansiya, «tayyor», qarz eslatmasi avtomatik ketmaydi.
// Xodim matnni ko'radi → «Yuborish» yoki «Bekor». Shubhali xabar (ortiqcha to'lov, kelishuv 0, katta summa,
// yaqinda to'lagan mijozga qarz eslatmasi) qizil belgi bilan; yuborishdan oldin server matnni qayta tekshiradi.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, PauseCircle, Send, X } from "lucide-react";
import { Button, Card, Modal } from "./ui.jsx";
import { cancelQueuedMsg, fetchCustMsgQueue, sendQueuedMsg } from "../storage.js";
import { money } from "../lib/format.js";
import { THEME } from "../theme.js";

export const QTYPE = { receipt: "To'lov qabul qilindi", ready: "Buyurtma tayyor", debt: "Qarz eslatmasi" };
const TG = "#2B5278";
const when = (iso) => { try { return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

// Kutilayotgan xabarlar soni (Dashboard «Diqqat» va menyu uchun) — har daqiqada yangilanadi
export function useCustMsgQueue(enabled = true) {
  const [data, setData] = useState(null);
  const reload = useCallback(() => (enabled ? fetchCustMsgQueue().then(setData).catch(() => {}) : Promise.resolve()), [enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    const t = setInterval(reload, 60000);
    const onChange = () => reload();
    window.addEventListener("uvix:custmsg-changed", onChange);
    return () => { clearInterval(t); window.removeEventListener("uvix:custmsg-changed", onChange); };
  }, [enabled, reload]);
  return { data, pending: data?.pending || [], reload };
}

function Item({ x, onDone }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [text, setText] = useState(x.text);
  useEffect(() => setText(x.text), [x.text]);
  const risky = (x.flags || []).length > 0;
  const [confirm, setConfirm] = useState(false);
  async function send() {
    if (risky && !confirm) { setConfirm(true); return; }
    setBusy("send"); setErr("");
    try { await sendQueuedMsg(x.id, text); onDone(); }
    catch (e) { setErr(e.message); if (e.data?.text) setText(e.data.text); if (e.status === 409 && e.data?.error === "stale") onDone(); }
    finally { setBusy(""); setConfirm(false); }
  }
  async function cancel() {
    setBusy("cancel"); setErr("");
    try { await cancelQueuedMsg(x.id); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }
  return (
    <div data-queue-item={x.id} data-qtype={x.type} style={{ border: `1px solid ${risky ? THEME.rose : THEME.border}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10, background: risky ? THEME.roseBg + "55" : THEME.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{QTYPE[x.type] || x.type}</b>
        <span style={{ fontSize: 13 }}>· {x.customer}</span>
        {x.orderNumbers && <span style={{ fontSize: 12, color: THEME.muted }}>{x.orderNumbers}</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: THEME.muted }}>{x.to} · {when(x.updatedAt || x.createdAt)}</span>
      </div>
      {risky && (
        <div data-testid="queue-flags" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: THEME.rose, lineHeight: 1.45 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div><b>Tekshiring:</b> {x.flags.join(" · ")}</div>
        </div>
      )}
      <div style={{ fontSize: 13, background: TG, color: "#fff", padding: "10px 12px", borderRadius: "14px 14px 4px 14px", whiteSpace: "pre-wrap", lineHeight: 1.45, maxWidth: 460 }}>{text}</div>
      {err && <div style={{ fontSize: 12.5, color: THEME.rose }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        {confirm && <span style={{ fontSize: 12.5, color: THEME.rose, fontWeight: 600, marginRight: "auto" }}>Shubhali xabar — baribir yuborilsinmi? Yana bir marta bosing.</span>}
        <Button variant="ghost" onClick={cancel} disabled={!!busy} data-testid="queue-cancel">{busy === "cancel" ? <Loader2 size={14} className="uvix-spin" /> : <X size={14} />} Bekor</Button>
        <Button onClick={send} disabled={!!busy} data-testid="queue-send" style={confirm ? { background: THEME.rose } : undefined}>{busy === "send" ? <Loader2 size={14} className="uvix-spin" /> : <Send size={14} />} {confirm ? "Baribir yuborish" : "Yuborish"}</Button>
      </div>
    </div>
  );
}

export function CustMsgQueuePanel({ q }) {
  const { data, pending, reload } = q;
  const done = () => { reload(); window.dispatchEvent(new Event("uvix:custmsg-changed")); };
  if (!data) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>;
  const recent = data.recent || [];
  return (
    <div data-testid="custmsg-queue" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.paused && (
        <div data-testid="custmsg-paused" style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, background: THEME.amberBg, fontSize: 13, alignItems: "center" }}>
          <PauseCircle size={18} color={THEME.amber} /> Mijozga xabarlar <b>to'xtatilgan</b> — navbatdagilar ham yuborilmaydi (Xabarlar sozlamasida yoqiladi).
        </div>
      )}
      <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5 }}>Mijozga hech narsa avtomatik ketmaydi. Matnni tekshirib «Yuborish»ni bosing. To'lov o'chirilsa yoki o'zgarsa — xabar ham yangilanadi.</div>
      {pending.length === 0 ? (
        <Card style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 13 }}><Check size={18} style={{ verticalAlign: -4 }} color={THEME.green} /> Navbat bo'sh</Card>
      ) : pending.map((x) => <Item key={x.id} x={x} onDone={done} />)}
      {recent.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13.5, borderBottom: `1px solid ${THEME.border}` }}>Oxirgilari</div>
          {recent.slice(0, 15).map((x) => (
            <div key={x.id} data-queue-done={x.status} style={{ display: "flex", gap: 10, padding: "8px 16px", borderBottom: `1px solid ${THEME.border}`, fontSize: 12.5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: THEME.muted, width: 92 }}>{when(x.doneAt)}</span>
              <span style={{ fontWeight: 600, width: 140 }}>{QTYPE[x.type]}</span>
              <span style={{ flex: "1 1 140px" }}>{x.customer} <span style={{ color: THEME.muted }}>{x.amount ? `· ${money(x.amount)}` : ""}</span></span>
              {x.status === "sent" ? <span style={{ color: THEME.green, fontWeight: 700 }}>✓ yuborildi · {x.by}</span> : <span style={{ color: THEME.muted }}>✗ {x.reason || "bekor"}{x.by ? ` · ${x.by}` : ""}</span>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function CustMsgQueueModal({ onClose }) {
  const q = useCustMsgQueue(true);
  return (
    <Modal title={`Mijozga xabarlar navbati${q.pending.length ? ` (${q.pending.length})` : ""}`} onClose={onClose} width={620}>
      <CustMsgQueuePanel q={q} />
    </Modal>
  );
}
