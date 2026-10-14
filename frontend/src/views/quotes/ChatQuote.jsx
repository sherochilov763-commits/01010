// ChatQuote.jsx — chat o'ng panelidagi smeta: kalkulyator ish quroli sifatida (mijozga avtomatik ketmaydi).
// Smeta mijozning CRM lidiga saqlanadi (boshqa menejer ham ko'radi); «To'lov va buyurtma» — aylantirish oynasi.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check, CreditCard, Loader2, Send, X } from "lucide-react";
import { C } from "../crm/chatPalette.js";
import { saveQuote } from "../../storage.js";
import { quoteText } from "../../lib/production.js";
import { QuoteBuilder } from "./QuoteBuilder.jsx";
import { useSales } from "./useSales.js";

export const ChatQuote = forwardRef(function ChatQuote({ chatId, lead, ensureLead, onLeadSaved, onConvert, onSendText, onSendDirect, customerName = "Mijoz" }, ref) {
  const [preview, setPreview] = useState(null); // { text, busy, err, done } — yuborishdan oldin ko'rib chiqish
  const sales = useSales();
  const openQuote = lead?.quote?.status === "open" ? lead.quote : null;
  const [items, setItems] = useState(openQuote?.items || []);
  const [status, setStatus] = useState("");
  const timer = useRef(null);
  const titleRef = useRef(null);
  const leadId = lead?.id || null;
  // Boshqa chat ochilganda — o'sha mijozning smetasi. Shu chatda lid endi yaratilgan yoki yangi bitim ochilgan bo'lsa,
  // qo'lda kiritilayotgan pozitsiyalar saqlanib qoladi (ro'yxat bo'sh bo'lsagina serverdagisi olinadi).
  const prevChat = useRef(chatId);
  useEffect(() => {
    const fromLead = lead?.quote?.status === "open" ? lead.quote.items || [] : [];
    if (prevChat.current !== chatId) { prevChat.current = chatId; setItems(fromLead); setStatus(""); clearTimeout(timer.current); return; }
    setItems((cur) => (cur.length ? cur : fromLead));
  }, [chatId, leadId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  useImperativeHandle(ref, () => ({ focus: () => { titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); titleRef.current?.focus(); }, items, clear: () => setItems([]) }), [items]);

  function change(next) {
    setItems(next);
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const l = await ensureLead();
        if (!l) return setStatus("");
        const r = await saveQuote(l.id, { items: next });
        onLeadSaved?.(r.lead);
        setStatus("saved");
      } catch (e) { setStatus(`error:${e.message}`); }
    }, 700);
  }
  const P = { text: C.text, muted: C.muted, border: C.border, inputBg: C.bg, panel: C.panel, primary: C.blue, onPrimary: "#fff", green: C.green, red: C.red, hover: C.hover, link: C.link, shadow: C.shadow };
  const lastConverted = lead?.quote?.status === "converted" ? lead.quote : null;
  const btn = (primary, color) => ({ height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${primary ? color : C.border}`, background: primary ? color : C.panel, color: primary ? "#fff" : C.text });
  const no = openQuote?.no || lead?.quote?.no;

  return (
    <div data-testid="chat-quote" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>Smeta{openQuote?.no ? ` · ${openQuote.no}` : ""}</div>
          <div data-testid="quote-status" style={{ fontSize: 11.5, color: status.startsWith("error") ? C.red : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {status === "saving" ? "Saqlanmoqda..." : status === "saved" ? "Saqlandi" : status.startsWith("error") ? status.slice(6) : items.length ? "To'lov kutilmoqda" : ""}
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Mijozga yuborish — «To'lov va buyurtma»dan uzoqda, tepada; bosilganda avval ko'rib chiqish oynasi */}
          {items.length > 0 && (
            <button type="button" onClick={() => setPreview({ text: quoteText(items, { no, advancePct: sales.advancePct }) })} data-testid="chat-quote-send" title="Smetani mijozga yuborish"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
              <Send size={13} /> Yuborish
            </button>
          )}
        </span>
      </div>
      {lastConverted && !items.length && (
        <div style={{ fontSize: 12, color: C.muted, background: C.hover, borderRadius: 8, padding: "8px 10px", lineHeight: 1.45 }}>
          Oxirgi smeta {lastConverted.no} → {lastConverted.orderIds?.length || 0} ta buyurtma. Yangi pozitsiya qo'shsangiz — yangi bitim ochiladi.
        </div>
      )}
      <QuoteBuilder items={items} onChange={change} prices={sales.prices || []} fx={sales.fx} P={P} advancePct={sales.advancePct} titleRef={titleRef} compact />
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={async () => { clearTimeout(timer.current); try { const l = await ensureLead(); if (l) onConvert(l, items); } catch (e) { setStatus(`error:${e.message}`); } }} style={btn(true, C.greenSolid)} data-testid="chat-convert">
            <CreditCard size={16} /> To'lov va buyurtma
          </button>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center" }}>Buyurtmalar avans {sales.advancePct || 0}% to'langach yaratiladi</div>
        </div>
      )}
      {preview && (
        <div role="dialog" aria-modal="true" aria-label="Mijozga yuborish" data-testid="send-preview" onClick={(e) => { if (e.target === e.currentTarget && !preview.busy) setPreview(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "min(440px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.panel, color: C.text, borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <b style={{ fontSize: 15 }}>Mijozga yuborish</b>
              <button type="button" onClick={() => !preview.busy && setPreview(null)} aria-label="Yopish" style={{ marginLeft: "auto", border: 0, background: "none", color: C.muted, cursor: "pointer", display: "inline-flex", padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
              <div style={{ fontSize: 13, color: C.muted }}>Kimga: <b data-testid="send-to" style={{ color: C.text }}>{customerName}</b></div>
              {preview.done ? (
                <div data-testid="send-done" style={{ display: "flex", alignItems: "center", gap: 8, color: C.green, fontSize: 14, fontWeight: 600, padding: "18px 0" }}><Check size={18} /> Yuborildi</div>
              ) : (
                <textarea value={preview.text} onChange={(e) => setPreview((p) => ({ ...p, text: e.target.value }))} rows={Math.min(14, preview.text.split("\n").length + 1)} data-testid="send-text" aria-label="Xabar matni"
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${C.border}`, borderRadius: 9, background: C.bg, color: C.text, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5, fontFamily: "inherit", outline: "none" }} />
              )}
              {preview.err && <div role="alert" style={{ fontSize: 12.5, color: C.red }}>{preview.err}</div>}
            </div>
            {!preview.done && (
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setPreview(null)} disabled={preview.busy} style={{ ...btn(false), flex: "1 1 110px" }} data-testid="send-cancel">Bekor qilish</button>
                <button type="button" onClick={() => { onSendText(preview.text); setPreview(null); }} disabled={preview.busy} style={{ ...btn(false), flex: "1 1 150px" }} data-testid="send-to-composer">Tahrirlash uchun</button>
                {onSendDirect && (
                  <button type="button" disabled={preview.busy || !preview.text.trim()} data-testid="send-confirm" style={{ ...btn(true, C.blue), flex: "1 1 110px" }}
                    onClick={async () => {
                      setPreview((p) => ({ ...p, busy: true, err: "" }));
                      try { await onSendDirect(preview.text.trim()); setPreview((p) => ({ ...p, busy: false, done: true })); setTimeout(() => setPreview(null), 1200); }
                      catch (e) { setPreview((p) => ({ ...p, busy: false, err: e?.message || "Yuborib bo'lmadi" })); }
                    }}>
                    {preview.busy ? <Loader2 size={15} className="uvix-spin" /> : <Send size={15} />} Yuborish
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
