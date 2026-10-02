// InvoiceModal.jsx — hisob-fakturani ko'rib chiqish va mijozning Telegramiga yuborish (faqat qo'lda).
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Send } from "lucide-react";
import { Button, Field, Modal, getInputStyle } from "./ui.jsx";
import { THEME } from "../theme.js";
import { TG_BLUE } from "./LeadSource.jsx";
import { fetchCustMsgConfig, fetchInvoiceRecipient, sendInvoice } from "../storage.js";
import { drawInvoice, ensureInvoiceFonts, invoiceCaption } from "../lib/invoiceCanvas.js";

export function InvoiceModal({ order, customer, isAdmin, onClose }) {
  const [cfg, setCfg] = useState(null);
  const [rcp, setRcp] = useState(undefined); // undefined — yuklanmoqda, null — topilmadi
  const [connected, setConnected] = useState(true);
  const [img, setImg] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchCustMsgConfig().then((d) => { if (!alive) return; setCfg(d.config || {}); setConnected(d.connected); }).catch(() => alive && setCfg({}));
    fetchInvoiceRecipient(order.id).then((d) => { if (!alive) return; setRcp(d.recipient); setConnected(d.connected); }).catch(() => alive && setRcp(null));
    return () => { alive = false; };
  }, [order.id]);
  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    ensureInvoiceFonts().then(() => {
      if (!alive) return;
      const cv = drawInvoice({ order, customer: { name: customer?.name || order.customer, phone: customer?.phone || "" }, cfg });
      setImg(cv.toDataURL("image/jpeg", 0.92));
      setCaption((c) => c || invoiceCaption(order, cfg));
    });
    return () => { alive = false; };
  }, [cfg, order, customer]);

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const r = await sendInvoice(order.id, img, caption);
      setMsg({ ok: true, text: `Yuborildi: ${r.to}` });
      setTimeout(onClose, 1400);
    } catch (e) { setMsg({ ok: false, text: e.message }); setBusy(false); }
  }
  const noCard = cfg && !cfg.cardNumber;
  const canSend = img && rcp && connected && !busy;
  return (
    <Modal title={`Hisob-faktura · ${order.orderNumber || order.customer}`} onClose={onClose} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="invoice-modal">
        <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${THEME.border}`, background: "#fff", minHeight: 200, display: "grid", placeItems: "center" }}>
          {img ? <img src={img} alt="Hisob-faktura" style={{ display: "block", width: "100%" }} data-testid="invoice-img" /> : <span style={{ color: "#6B6880", fontSize: 13 }}>Tayyorlanmoqda…</span>}
        </div>
        <Field label="Xabar matni">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} style={{ ...getInputStyle(), resize: "vertical" }} />
        </Field>
        <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: THEME.muted }}>Kimga:</span>
          {rcp === undefined ? <span style={{ color: THEME.muted }}>tekshirilmoqda…</span>
            : rcp ? <b style={{ color: TG_BLUE }} data-testid="invoice-to">{rcp.label}</b>
            : <span style={{ color: THEME.rose }}>Telegrami topilmadi</span>}
          {rcp && <span style={{ color: THEME.muted }}>({rcp.via === "chat" ? "CRM'dagi chat" : "mijozlar bazasidagi nik"})</span>}
        </div>
        {rcp === null && <Note>Mijozlar bo'limida shu mijozning kartasiga @username kiriting yoki CRM'da uning Telegram chatini lidga bog'lang.</Note>}
        {!connected && <Note>Telegram akkaunt ulanmagan — Sozlamalar → Telegram akkaunt bo'limida ulang.</Note>}
        {noCard && <Note>Karta raqami kiritilmagan{isAdmin ? " — Mijozlar → Xabarlar bo'limida kiriting" : ""}. Hisob-faktura rekvizitsiz chiqadi.</Note>}
        {msg && <div style={{ fontSize: 13, color: msg.ok ? THEME.green : THEME.rose, display: "flex", gap: 6, alignItems: "center" }}>{msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{msg.text}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {img && <a href={img} download={`${order.orderNumber || "hisob-faktura"}.jpg`} style={{ textDecoration: "none" }}><Button variant="ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={14} /> Rasmni saqlash</Button></a>}
          <Button onClick={send} disabled={!canSend} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Send size={14} /> {busy ? "Yuborilmoqda…" : "Telegram'ga yuborish"}</Button>
        </div>
      </div>
    </Modal>
  );
}
function Note({ children }) {
  return <div style={{ fontSize: 12.5, color: THEME.text, background: THEME.amberBg, padding: "9px 12px", borderRadius: 10, lineHeight: 1.45, display: "flex", gap: 8 }}><AlertTriangle size={14} style={{ color: THEME.amber, flexShrink: 0, marginTop: 2 }} />{children}</div>;
}
