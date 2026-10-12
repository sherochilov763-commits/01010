// ChatQuote.jsx — chat o'ng panelidagi smeta: kalkulyator ish quroli sifatida (mijozga avtomatik ketmaydi).
// Smeta mijozning CRM lidiga saqlanadi (boshqa menejer ham ko'radi); «To'lov va buyurtma» — aylantirish oynasi.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CreditCard, Send } from "lucide-react";
import { C } from "../crm/chatPalette.js";
import { saveQuote } from "../../storage.js";
import { quoteText } from "../../lib/production.js";
import { QuoteBuilder } from "./QuoteBuilder.jsx";
import { useSales } from "./useSales.js";

export const ChatQuote = forwardRef(function ChatQuote({ chatId, lead, ensureLead, onLeadSaved, onConvert, onSendText }, ref) {
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
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Smeta{openQuote?.no ? ` · ${openQuote.no}` : ""}</div>
        <span data-testid="quote-status" style={{ fontSize: 11.5, color: status.startsWith("error") ? C.red : C.muted }}>
          {status === "saving" ? "Saqlanmoqda..." : status === "saved" ? "Saqlandi" : status.startsWith("error") ? status.slice(6) : items.length ? "To'lov kutilmoqda" : ""}
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
          <button type="button" onClick={async () => { clearTimeout(timer.current); try { const l = await ensureLead(); if (l) onConvert(l, items); } catch (e) { setStatus(`error:${e.message}`); } }} style={btn(true, C.green)} data-testid="chat-convert">
            <CreditCard size={16} /> To'lov va buyurtma
          </button>
          <button type="button" onClick={() => onSendText(quoteText(items, { no, advancePct: sales.advancePct }))} style={btn(false)} data-testid="chat-quote-send">
            <Send size={15} /> Mijozga yuborish (matn)
          </button>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center" }}>Buyurtmalar avans {sales.advancePct || 0}% to'langach yaratiladi</div>
        </div>
      )}
    </div>
  );
});
