// MobileOrderRow.jsx — telefonda buyurtma qatori: ixcham ko'rinish + surish (swipe) amallari.
// O'ngga surish — «To'lov»; chapga — «Topshirildi» (tayyor bo'lsa), «Telegram», «Qo'ng'iroq».
// Bir vaqtda faqat bitta qator ochiq turadi (ota komponent boshqaradi). Bosilganda — tafsilot varag'i.
import { useEffect, useRef, useState } from "react";
import { CheckCheck, CreditCard, Phone, Send } from "lucide-react";
import { Avatar } from "../../components/ui.jsx";
import { fmt } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { PROD_LABEL, prodColors } from "../../lib/production.js";

const LW = 88; // chap amal kengligi
const AW = 78; // o'ng amallarning har biri
const TG_SOLID = "#176FA3";
const CALL_SOLID = "#3F3F46";

export function MobileOrderRow({ order: o, stage, paid, debt, total, open, onOpenChange, onTap, onTouch, onPay, onDeliver, onTelegram, phoneHref }) {
  const fg = useRef(null);
  const st = useRef(null);
  const suppress = useRef(false);
  const [reveal, setReveal] = useState(open || null);
  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  const right = [
    stage === "ready" && onDeliver ? { k: "deliver", l: "Topshirildi", icon: CheckCheck, bg: THEME.greenSolid, on: onDeliver, testid: "m-deliver" } : null,
    onTelegram ? { k: "tg", l: "Telegram", icon: Send, bg: TG_SOLID, on: onTelegram, testid: "swipe-tg" } : null,
    phoneHref ? { k: "call", l: "Qo'ng'iroq", icon: Phone, bg: CALL_SOLID, href: phoneHref, testid: "swipe-call" } : null,
  ].filter(Boolean);
  const RW = right.length * AW;
  const offsetFor = (side) => (side === "left" ? LW : side === "right" ? -RW : 0);

  const place = (x, animate) => {
    const el = fg.current;
    if (!el) return;
    el.style.transition = animate ? "transform .24s cubic-bezier(.16,1,.3,1)" : "none";
    el.style.transform = x ? `translateX(${x}px)` : "";
  };
  // Tashqaridan ochildi/yopildi (masalan, boshqa qator surildi)
  useEffect(() => {
    place(offsetFor(open), true);
    if (open) { setReveal(open); return undefined; }
    const t = setTimeout(() => setReveal(null), 240);
    return () => clearTimeout(t);
  }, [open, RW]); // eslint-disable-line react-hooks/exhaustive-deps

  function down(e) {
    if (e.button > 0) return;
    suppress.current = false;
    onTouch?.();
    st.current = { x: e.clientX, y: e.clientY, base: offsetFor(open), mode: null, last: offsetFor(open), t: Date.now() };
  }
  function move(e) {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { s.mode = "h"; e.currentTarget.setPointerCapture?.(e.pointerId); }
      else if (Math.abs(dy) > 8) { s.mode = "v"; return; }
      else return;
    }
    if (s.mode !== "h") return;
    const max = LW, min = -RW;
    let x = s.base + dx;
    if (x > max) x = max + (x - max) * 0.25;
    if (x < min) x = min + (x - min) * 0.25;
    s.last = x;
    place(x, false);
    const side = x > 0 ? "left" : x < 0 ? "right" : null;
    if (side !== revealRef.current && side) setReveal(side);
  }
  function up() {
    const s = st.current;
    st.current = null;
    if (!s || s.mode !== "h") return;
    suppress.current = true;
    const x = s.last;
    const fast = Math.abs(x - s.base) / Math.max(1, Date.now() - s.t) > 0.5;
    let next = null;
    if (x > LW * 0.45 || (fast && x > s.base && x > 20)) next = "left";
    else if (RW && (x < -RW * 0.4 || (fast && x < s.base && x < -20))) next = "right";
    if (next === open) {
      place(offsetFor(next), true);
      if (next) setReveal(next); else setTimeout(() => { if (!st.current) setReveal(null); }, 240);
      return;
    }
    onOpenChange(next);
  }
  function click() {
    if (suppress.current) { suppress.current = false; return; }
    if (open) { onOpenChange(null); return; }
    onTap();
  }
  const act = (fn) => (e) => { e.stopPropagation(); onOpenChange(null); fn?.(); };

  const c = prodColors(stage);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const meta = [o.orderNumber, o.title || o.materialType].filter(Boolean).join(" · ");
  const btn = { height: "100%", border: 0, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", textDecoration: "none", padding: 0 };

  return (
    <div className="uvix-swipe" data-order-row={o.orderNumber} data-open={open || undefined} style={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${THEME.border}` }}>
      {reveal === "left" && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: LW, display: "flex" }}>
          <button type="button" onClick={act(onPay)} data-testid="swipe-pay" tabIndex={open === "left" ? 0 : -1} style={{ ...btn, width: "100%", background: THEME.greenSolid }}>
            <CreditCard size={20} /> To'lov
          </button>
        </div>
      )}
      {reveal === "right" && RW > 0 && (
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: RW, display: "flex" }}>
          {right.map((a) => {
            const I = a.icon;
            const content = <><I size={20} /> {a.l}</>;
            return a.href
              ? <a key={a.k} href={a.href} onClick={(e) => { e.stopPropagation(); onOpenChange(null); }} data-testid={a.testid} tabIndex={open === "right" ? 0 : -1} style={{ ...btn, width: AW, background: a.bg }}>{content}</a>
              : <button key={a.k} type="button" onClick={act(a.on)} data-testid={a.testid} tabIndex={open === "right" ? 0 : -1} style={{ ...btn, width: AW, background: a.bg }}>{content}</button>;
          })}
        </div>
      )}
      <div ref={fg} role="button" tabIndex={0} aria-label={`${o.customer || "Mijoz"}, ${o.orderNumber}${debt > 0 ? `, qarz ${fmt(debt)}` : ""}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        className="uvix-swipe-fg"
        style={{ position: "relative", background: THEME.card, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer" }}>
        <Avatar name={o.customer} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "Mijoz ko'rsatilmagan"}</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(total)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>
            {debt > 0
              ? <span style={{ fontSize: 12.5, fontWeight: 700, color: THEME.rose, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>qarz {fmt(debt)}</span>
              : <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.green, whiteSpace: "nowrap" }}>to'langan</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
            {stage && <span data-stage={stage} style={{ flexShrink: 0, height: 20, padding: "0 8px", borderRadius: 10, fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", color: c.color, background: c.bg }}>{PROD_LABEL[stage]}</span>}
            {o.groupId && o.groupSize > 1 && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: THEME.violet, background: THEME.violetSoft, padding: "1px 7px", borderRadius: 8 }}>{o.groupIdx}/{o.groupSize}</span>}
            <span aria-hidden="true" style={{ flex: 1, height: 4, borderRadius: 2, background: THEME.chip, overflow: "hidden" }}>
              <span style={{ display: "block", width: `${pct}%`, height: "100%", borderRadius: 2, background: THEME.green }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
