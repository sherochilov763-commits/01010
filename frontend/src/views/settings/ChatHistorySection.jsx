// ChatHistorySection.jsx — chat tarixi (118-eskiz):
//   • Sozlamalar → Ma'lumotlar → «Chat tarixi»: serverda necha kun saqlanadi (30/60/90), buyurtmali chat — to'liq,
//     hozirgi holat va tasdiq bilan tozalash; keyin har kecha o'zi.
//   • LineDataBox — Telegram akkaunt kartasida: uzilgan akkaunt ma'lumotlari, «Hozir tozalash…», 7 kundan keyin o'zi.
// Server: backend/chat-history.js. Telegram'dagi asl yozishmaga tegilmaydi.
import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { Button, Card } from "../../components/ui.jsx";
import { fetchChatHistory, fetchLineData, pruneChatHistory, purgeLineData, saveChatHistoryConfig } from "../../storage.js";
import { THEME } from "../../theme.js";
import { fmtBytes } from "./StorageSection.jsx";
import { Switch } from "./ChatFilesSection.jsx";

const KEEP = [[30, "30 kun"], [60, "60 kun"], [90, "90 kun"]];
const num = (n) => Number(n || 0).toLocaleString("ru-RU").replace(/,/g, " ");
const Row = ({ k, v, color, testid }) => (
  <div data-testid={testid} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 12.5 }}>
    <span style={{ color: THEME.muted }}>{k}</span><b style={{ color: color || THEME.text, fontVariantNumeric: "tabular-nums" }}>{v}</b>
  </div>
);

// Tasdiq oynasi: nima o'chadi, nima qoladi, «qaytarib bo'lmaydi»
export function ConfirmSheet({ title, rows, note, action, busy, err, done, onConfirm, onClose, testid }) {
  useEffect(() => {
    if (busy) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-testid={testid} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(440px, 100%)", background: THEME.card, color: THEME.text, borderRadius: 16, boxShadow: THEME.shadowLg, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ fontSize: 16, flex: 1 }}>{title}</b>
          <button type="button" aria-label="Yopish" disabled={busy} onClick={onClose} style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
        </div>
        {done ? (
          <div data-testid={`${testid}-done`} style={{ padding: "18px 0 6px", fontSize: 14 }}>
            <b style={{ color: THEME.green }}>✓ {done}</b>
            <div style={{ marginTop: 14 }}><Button onClick={onClose} style={{ width: "100%" }}>Yopish</Button></div>
          </div>
        ) : (<>
          <div style={{ marginTop: 12, background: THEME.surface, borderRadius: 10, padding: "8px 12px" }}>
            {rows.map((r) => <Row key={r.k} {...r} />)}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>{note}</div>
          {err && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${THEME.border}`, background: "none", color: THEME.text, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>Bekor qilish</button>
            <button type="button" onClick={onConfirm} disabled={busy} data-testid={`${testid}-confirm`}
              style={{ flex: 1.4, height: 42, borderRadius: 11, border: 0, background: THEME.rose, color: "#fff", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit" }}>
              {busy ? "Tozalanmoqda…" : action}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: THEME.muted, textAlign: "center", marginTop: 6 }}>Serverdan qaytarib bo'lmaydi · Esc — bekor</div>
        </>)}
      </div>
    </div>
  );
}

export function ChatHistorySection() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [sheet, setSheet] = useState(null); // { busy, err, done }
  const load = () => fetchChatHistory().then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message || "Yuklab bo'lmadi"));
  useEffect(() => { load(); }, []);
  if (err && !d) return <Card><div style={{ fontSize: 12.5, color: THEME.rose }}>{err}</div></Card>;
  if (!d) return null;
  const cfg = d.config;
  async function setCfg(patch) {
    setErr("");
    try { setD(await saveChatHistoryConfig({ ...cfg, ...patch })); } catch (e) { setErr(e.message); }
  }
  async function doPrune() {
    setSheet((s) => ({ ...s, busy: true, err: "" }));
    try {
      const r = await pruneChatHistory();
      setD(r);
      setSheet({ done: `${num(r.count)} ta xabar o'chirildi${r.files?.count ? `, ${fmtBytes(r.files.size)} fayl bo'shatildi` : ""}` });
      window.dispatchEvent(new Event("uvix:storage-refresh"));
    } catch (e) { setSheet((s) => ({ ...s, busy: false, err: e.message })); }
  }
  return (
    <Card data-testid="chat-history">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <History size={16} color={THEME.muted} />
        <div style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>Chat tarixi</div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Serverda saqlanadi</div>
          <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>Eskisi o'chadi, Telegram'da qoladi — chatda «↑ Eskisini ko'rish»</div>
          <div role="group" aria-label="Chat tarixi muddati" style={{ display: "flex", background: THEME.chip, borderRadius: 9, padding: 3, marginTop: 8 }}>
            {KEEP.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={cfg.keepDays === v} data-hkeep={v} onClick={() => setCfg({ keepDays: v })}
                style={{ flex: 1, border: 0, borderRadius: 7, padding: "6px 0", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: cfg.keepDays === v ? THEME.card : "transparent", color: cfg.keepDays === v ? THEME.text : THEME.muted }}>{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>Buyurtmasi bor mijoz — to'liq</div><div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>buyurtma, smeta yoki bitim bog'langan chat o'chmaydi</div></div>
            <Switch on={cfg.keepLinked} label="Buyurtmasi bor mijoz — to'liq" testid="ch-linked" onChange={(v) => setCfg({ keepLinked: v })} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>Har kecha avtomatik</div><div style={{ fontSize: 12, color: THEME.muted }}>03:00 da, jurnalga yoziladi</div></div>
            <Switch on={cfg.autoPrune} label="Har kecha avtomatik" testid="ch-auto" onChange={(v) => setCfg({ autoPrune: v })} />
          </div>
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0, background: THEME.surface, borderRadius: 12, padding: "10px 14px" }} data-testid="ch-stats">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Hozir</div>
          <Row k="Jami xabar" v={num(d.total)} />
          <Row k={`${cfg.keepDays} kundan eski`} v={num(d.old)} color={d.old ? THEME.rose : undefined} />
          <Row k="buyurtmali (qoladi)" v={num(d.oldLinked)} color={THEME.green} />
          <Row k="O'chadi" v={num(d.willDelete)} testid="ch-will" />
          <Button onClick={() => setSheet({})} disabled={!d.willDelete} data-testid="ch-prune-open" style={{ width: "100%", marginTop: 10 }}>
            {d.willDelete ? `${num(d.willDelete)} xabarni tozalash…` : "Tozalanadigan xabar yo'q"}
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 10, lineHeight: 1.45 }}>Chat ochilganda faqat so'nggi 50 xabar yuklanadi. Telegram'dagi asl yozishmaga tegilmaydi.</div>
      {err && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose, marginTop: 6 }}>{err}</div>}
      {sheet && (
        <ConfirmSheet testid="ch-sheet" title="Eski chat xabarlarini tozalash" busy={sheet.busy} err={sheet.err} done={sheet.done}
          rows={[{ k: `${cfg.keepDays} kundan eski xabar`, v: num(d.old) }, { k: "Buyurtmali chatlardagi (qoladi)", v: num(d.oldLinked), color: THEME.green }, { k: "O'chadi", v: num(d.willDelete), color: THEME.rose }]}
          note="Telegram'dagi asl yozishmaga tegilmaydi — chatda «↑ Eskisini ko'rish» bilan ko'rinadi. Shu xabarlardagi fayllar ham o'chadi (buyurtmaga biriktirilganlari qoladi)."
          action={`${num(d.willDelete)} xabarni tozalash`} onConfirm={doPrune} onClose={() => { setSheet(null); load(); }} />
      )}
    </Card>
  );
}

// Telegram akkaunt kartasida: akkaunt uzilgan bo'lsa — uning chat ma'lumotlari va tozalash
export function LineDataBox({ line, connected }) {
  const [d, setD] = useState(null);
  const [sheet, setSheet] = useState(null);
  const load = () => fetchLineData(line).then(setD).catch(() => setD(null));
  useEffect(() => { if (!connected) load(); else setD(null); }, [line, connected]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sheet && (connected || !d || d.connected || (!d.chats && !d.messages))) return null;
  if (!d) return null;
  const left = Math.max(0, 7 - (d.days || 0));
  async function doPurge() {
    setSheet((s) => ({ ...s, busy: true, err: "" }));
    try {
      const r = await purgeLineData(line);
      setSheet({ done: `${num(r.chats)} chat, ${num(r.count)} xabar tozalandi${r.files?.count ? ` · ${fmtBytes(r.files.size)} bo'shatildi` : ""}` });
      setD(r.info);
      window.dispatchEvent(new Event("uvix:storage-refresh"));
    } catch (e) { setSheet((s) => ({ ...s, busy: false, err: e.message })); }
  }
  return (
    <div data-testid="line-data" data-line={line} style={{ marginBottom: 12, border: `1.5px solid ${THEME.rose}55`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: THEME.rose }} />
        <b style={{ fontSize: 13, flex: 1 }}>Uzilgan akkaunt ma'lumotlari</b>
        <span style={{ fontSize: 11.5, color: THEME.rose, fontWeight: 600 }}>uzilgan · {d.days} kun</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Row k="Chatlar" v={num(d.chats)} />
        <Row k="Xabarlar" v={num(d.messages)} />
        <Row k="Fayllar" v={fmtBytes(d.files?.size || 0)} />
        {d.linkedChats > 0 && <Row k="Buyurtmali chatlar (qoladi)" v={num(d.linkedChats)} color={THEME.green} />}
      </div>
      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 9, background: THEME.roseBg, color: THEME.rose, fontSize: 12, lineHeight: 1.4 }}>
        ⏳ Qayta ulanmasa, <b>{left ? `${left} kundan keyin` : "bugun"}</b> avtomatik tozalanadi. Saqlash uchun — pastdagi tugma bilan qayta ulang.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={() => setSheet({})} data-testid="line-purge-open" style={{ color: THEME.rose }}>Hozir tozalash…</Button>
      </div>
      <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 8 }}>🔒 Buyurtmaga biriktirilgan rasm va fayllar, mijoz kartasi va buyurtmalar qoladi.</div>
      {sheet && (
        <ConfirmSheet testid="line-sheet" title={`${line} ma'lumotlarini tozalash`} busy={sheet.busy} err={sheet.err} done={sheet.done}
          rows={[{ k: "Chatlar", v: num(d.chats) }, { k: "Xabarlar", v: num(d.messages) }, { k: "Fayllar", v: fmtBytes(d.files?.size || 0) }, { k: "Buyurtmali chatlar (qoladi)", v: num(d.linkedChats), color: THEME.green }]}
          note="Telegram'dagi asl yozishmaga tegilmaydi. Qayta ulansa, chat ochilganda so'nggi xabarlar qaytadan tortiladi."
          action={`${fmtBytes(d.files?.size || 0)} · ${num(d.messages)} xabarni tozalash`} onConfirm={doPurge} onClose={() => { setSheet(null); load(); }} />
      )}
    </div>
  );
}
