// ChatQuote.jsx — chat yon panelidagi smeta va kalkulyator (E varianti, 108/111-eskizlar).
// view="quote" — «Smeta» vositasi: pozitsiyalar, jami, «Mijozga…» (sarlavhada, ichki tugmalardan uzoqda), pastda yolg'iz «To'lov va buyurtma».
// view="calc"  — «Kalkulyator» vositasi: natija FAQAT smetaga tushadi, xabarga avtomatik qo'shilmaydi.
// Mijozga hech narsa to'g'ridan-to'g'ri ketmaydi: faqat oldindan ko'rish oynasidagi ko'k «Yuborish» bilan.
// Smeta mijozning CRM lidiga saqlanadi (boshqa menejer ham ko'radi).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check, CreditCard, FileText, Loader2, Plus, Send, X } from "lucide-react";
import { C } from "../crm/chatPalette.js";
import { saveQuote } from "../../storage.js";
import { quoteText } from "../../lib/production.js";
import { QuoteBuilder } from "./QuoteBuilder.jsx";
import { useSales } from "./useSales.js";

export const ChatQuote = forwardRef(function ChatQuote({ chatId, lead, ensureLead, onLeadSaved, onConvert, onSendText, onSendDirect, customerName = "Mijoz", customerSub = "", view = "quote", onView }, ref) {
  const [preview, setPreview] = useState(null); // { text, busy, err, done } — yuborishdan oldin ko'rib chiqish
  const [added, setAdded] = useState(""); // kalkulyatordan smetaga qo'shilgani haqida qisqa xabar
  const sales = useSales();
  const openQuote = lead?.quote?.status === "open" ? lead.quote : null;
  const [items, setItems] = useState(openQuote?.items || []);
  const [status, setStatus] = useState("");
  const timer = useRef(null);
  const addedTimer = useRef(null);
  const titleRef = useRef(null);
  const leadId = lead?.id || null;
  // Boshqa chat ochilganda — o'sha mijozning smetasi. Shu chatda lid endi yaratilgan yoki yangi bitim ochilgan bo'lsa,
  // qo'lda kiritilayotgan pozitsiyalar saqlanib qoladi (ro'yxat bo'sh bo'lsagina serverdagisi olinadi).
  const prevChat = useRef(chatId);
  useEffect(() => {
    const fromLead = lead?.quote?.status === "open" ? lead.quote.items || [] : [];
    if (prevChat.current !== chatId) { prevChat.current = chatId; setItems(fromLead); setStatus(""); setAdded(""); clearTimeout(timer.current); return; }
    setItems((cur) => (cur.length ? cur : fromLead));
  }, [chatId, leadId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(addedTimer.current); }, []);
  useImperativeHandle(ref, () => ({ focus: () => { titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); titleRef.current?.focus(); }, items, clear: () => setItems([]) }), [items]);
  // Oyna ochiq bo'lsa Esc — bekor qilish
  useEffect(() => {
    if (!preview || preview.busy) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setPreview(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview]);

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
  const statusText = status === "saving" ? "Saqlanmoqda..." : status === "saved" ? "Saqlandi" : status.startsWith("error") ? status.slice(6) : items.length ? "to'lov kutilmoqda" : "";
  const isCalc = view === "calc";

  return (
    <div data-testid="chat-quote" data-view={view} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Sarlavha: nomi, holati va «Mijozga…» — mijozga ketadigan yagona tugma shu yerda, ichki tugmalardan uzoqda */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7 }}>
          <FileText size={16} color={C.muted} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{isCalc ? "Kalkulyator" : `Smeta${no && openQuote ? ` ${no}` : ""}`}</div>
            <div data-testid="quote-status" style={{ fontSize: 11.5, color: status.startsWith("error") ? C.red : status ? C.muted : C.noteHead, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {isCalc ? <span style={{ color: C.muted }}>Natija faqat smetaga tushadi</span> : statusText}
            </div>
          </div>
        </div>
        {!isCalc && items.length > 0 && (
          <button type="button" onClick={() => setPreview({ text: quoteText(items, { no, advancePct: sales.advancePct }) })} data-testid="chat-quote-send" title="Smetani mijozga yuborish — avval ko'rib chiqasiz"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 8, border: `1.5px solid ${C.link}`, background: `${C.link}14`, color: C.link, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            <Send size={13} /> Mijozga…
          </button>
        )}
      </div>
      {!isCalc && lastConverted && !items.length && (
        <div style={{ fontSize: 12, color: C.muted, background: C.hover, borderRadius: 8, padding: "8px 10px", lineHeight: 1.45 }}>
          Oxirgi smeta {lastConverted.no} → {lastConverted.orderIds?.length || 0} ta buyurtma. Yangi pozitsiya qo'shsangiz — yangi bitim ochiladi.
        </div>
      )}
      {!isCalc && !items.length && !lastConverted && (
        <div data-testid="quote-empty" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>Smeta bo'sh. Pozitsiyalarni kalkulyatorda hisoblang — ular shu yerga tushadi.</div>
      )}
      <QuoteBuilder items={items} onChange={change} prices={sales.prices || []} fx={sales.fx} P={P} advancePct={sales.advancePct} titleRef={titleRef} compact
        view={isCalc ? "calc" : "items"}
        onEdit={() => onView?.("calc")}
        onAdded={(edited) => { setAdded(edited ? "Smetada yangilandi" : "Smetaga qo'shildi"); clearTimeout(addedTimer.current); addedTimer.current = setTimeout(() => setAdded(""), 6000); }} />
      {isCalc && added && (
        <div role="status" data-testid="calc-added" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.green, whiteSpace: "nowrap" }}>
          <Check size={15} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{added} · {items.length} ta</span>
          {onView && <button type="button" onClick={() => onView("quote")} style={{ marginLeft: "auto", border: 0, background: "none", color: C.link, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0, flexShrink: 0 }}>Smeta →</button>}
        </div>
      )}
      {!isCalc && onView && (
        <button type="button" onClick={() => onView("calc")} data-testid="quote-add-pos"
          style={{ height: 40, borderRadius: 9, border: `1.5px dashed ${C.border}`, background: "transparent", color: C.link, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Plus size={16} /> Pozitsiya (kalkulyator)
        </button>
      )}
      {!isCalc && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={async () => { clearTimeout(timer.current); try { const l = await ensureLead(); if (l) onConvert(l, items); } catch (e) { setStatus(`error:${e.message}`); } }} style={{ ...btn(true, C.greenSolid), height: 44 }} data-testid="chat-convert">
            <CreditCard size={16} /> To'lov va buyurtma
          </button>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", lineHeight: 1.45 }}>Ichki amal — mijozga hech narsa ketmaydi{sales.advancePct ? ` · buyurtma avans ${sales.advancePct}% to'langach yaratiladi` : ""}</div>
        </div>
      )}
      {preview && (
        <div role="dialog" aria-modal="true" aria-label="Mijozga yuborish" data-testid="send-preview" onClick={(e) => { if (e.target === e.currentTarget && !preview.busy) setPreview(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "min(460px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.panel, color: C.text, borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <b style={{ fontSize: 15.5 }}>Mijozga yuborish</b>
              <button type="button" onClick={() => !preview.busy && setPreview(null)} aria-label="Yopish" style={{ marginLeft: "auto", border: 0, background: "none", color: C.muted, cursor: "pointer", display: "inline-flex", padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.link}55`, background: `${C.link}12` }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.blue, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{(customerName || "?").slice(0, 2).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.muted }}>Kimga: <b data-testid="send-to" style={{ color: C.text }}>{customerName}</b></div>
                  <div style={{ fontSize: 12, color: C.muted }}>{customerSub || "Telegram"}</div>
                </div>
              </div>
              {preview.done ? (
                <div data-testid="send-done" style={{ display: "flex", alignItems: "center", gap: 8, color: C.green, fontSize: 14, fontWeight: 600, padding: "18px 0" }}><Check size={18} /> Yuborildi</div>
              ) : (
                <textarea value={preview.text} onChange={(e) => setPreview((p) => ({ ...p, text: e.target.value }))} rows={Math.min(14, preview.text.split("\n").length + 1)} data-testid="send-text" aria-label="Xabar matni"
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${C.border}`, borderRadius: 9, background: C.bg, color: C.text, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5, fontFamily: "inherit", outline: "none" }} />
              )}
              {!preview.done && <div data-testid="send-warn" style={{ fontSize: 12, color: C.muted }}>Matnni o'zgartirish mumkin. Yuborilgach — qaytarib bo'lmaydi.</div>}
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
