// CardPrompt.jsx — 137-eskiz, A: kartaga pul tushishi (yoki chiqim) bilan rahbarga qaysi sahifada bo'lsa ham kichik oyna.
// «Buyurtmaga bog'lash · Yangi buyurtma · Shaxsiy» (chiqimda — «Rasxodga yozish · Shaxsiy»). Hech narsa o'zi yozilmaydi:
// tugma bosilsa — «Karta» bo'limida tegishli oyna ochiladi («Shaxsiy» — darhol belgilanadi). Yopilsa — «Belgilanmagan»da kutib turadi.
// Faqat yangi yozuvlar: oyna birinchi marta ochilganda mavjudlari «ko'rilgan» deb olinadi (eski to'lovlar bilan bezovta qilmaydi).
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Link2, Package, User, X } from "lucide-react";
import { THEME } from "../../theme.js";
import { fetchCardTx, markCardTx } from "../../storage.js";
import { useIsMobile } from "../../components/ui.jsx";

const SEEN_KEY = "uvix:cardSeenAt";
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ""; } catch { return ""; } };
const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* brauzer xotirasi yopiq */ } };
const isOpen = (t) => !t.personal && !t.txId && !t.orderId;
const stampOf = (t) => t.receivedAt || t.msgAt || t.at || "";
const sum = (n) => (Number(n) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });

export function CardPrompt({ hidden = false, onAction }) {
  const isMobile = useIsMobile();
  const [items, setItems] = useState([]);
  const seenRef = useRef(readSeen());
  const load = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    fetchCardTx().then((d) => {
      const list = d?.items || [];
      const newest = list.reduce((m, t) => (stampOf(t) > m ? stampOf(t) : m), "");
      // Birinchi marta: hammasi ko'rilgan — faqat bundan keyin keladiganlar so'raladi
      if (!seenRef.current) { seenRef.current = newest || new Date().toISOString(); writeSeen(seenRef.current); return; }
      setItems(list.filter((t) => isOpen(t) && stampOf(t) > seenRef.current).sort((a, b) => stampOf(a).localeCompare(stampOf(b))));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const t = items[0];
  if (!t || hidden) return null;
  const done = (x) => {
    // Shu yozuv ko'rildi — keyingisi (bo'lsa) chiqadi
    if (stampOf(x) > seenRef.current) { seenRef.current = stampOf(x); writeSeen(seenRef.current); }
    setItems((cur) => cur.filter((y) => y.id !== x.id));
  };
  const go = (mode) => { done(t); onAction?.({ id: t.id, mode, n: Date.now() }); };
  const inc = t.dir === "in";
  const btn = (primary) => ({ height: isMobile ? 42 : 36, padding: "0 12px", borderRadius: 10, border: primary ? 0 : `1px solid ${THEME.border}`, background: primary ? THEME.blue : THEME.card,
    color: primary ? "#fff" : THEME.text, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" });
  return (
    <div role="alertdialog" aria-label="Kartada yangi yozuv" data-testid="card-prompt" data-uvix-overlay=""
      style={{ position: "fixed", zIndex: 600, ...(isMobile ? { left: 10, right: 10, top: "calc(10px + env(safe-area-inset-top, 0px))" } : { right: 24, top: 84, width: 500 }),
        background: THEME.card, color: THEME.text, borderRadius: 14, border: `1px solid ${THEME.border}`, boxShadow: "0 16px 48px rgba(0,0,0,.18)", padding: "14px 16px", fontFamily: THEME.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: inc ? THEME.greenBg : THEME.roseBg, color: inc ? THEME.greenText : THEME.roseText }}>
          {inc ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: THEME.muted }}>{inc ? "Kartaga pul tushdi" : "Kartadan pul chiqdi"}{t.card ? ` · ••${t.card}` : ""}{items.length > 1 ? ` · yana ${items.length - 1} ta` : ""}</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: inc ? THEME.greenText : THEME.roseText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {inc ? "+" : "−"}{sum(t.amount)} so'm <span style={{ fontSize: 13, fontWeight: 500, color: THEME.muted }}>· {t.merchant || t.kind || "Karta"}</span>
          </div>
        </div>
        <button type="button" onClick={() => done(t)} aria-label="Keyinroq" title="Keyinroq — «Belgilanmagan»da kutib turadi" data-testid="card-prompt-close"
          style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : inc ? "repeat(3, minmax(0,1fr))" : "repeat(2, minmax(0,1fr))", gap: 8, marginTop: 12 }}>
        {inc ? (
          <>
            <button type="button" style={btn(true)} onClick={() => go("order")} data-testid="cp-link"><Link2 size={15} />Buyurtmaga bog'lash</button>
            <button type="button" style={btn(false)} onClick={() => go("new")} data-testid="cp-new"><Package size={15} />Yangi buyurtma</button>
          </>
        ) : <button type="button" style={btn(true)} onClick={() => go("expense")} data-testid="cp-expense">Rasxodga yozish</button>}
        <button type="button" style={btn(false)} data-testid="cp-personal" onClick={async () => { done(t); await markCardTx(t.id, { personal: true }).catch(() => {}); }}><User size={15} />Shaxsiy</button>
      </div>
      {!isMobile && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 8, textAlign: "center" }}>Yopsangiz — «Karta → Belgilanmagan»da kutib turadi</div>}
    </div>
  );
}
