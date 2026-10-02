import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FolderTree, Plus, X } from "lucide-react";
import { PAGE_SIZE, PAYMENT_TYPES } from "../constants.js";
import { fmt, money, uid } from "../lib/format.js";
import { THEME, mixColors } from "../theme.js";
import { useBackToClose } from "../lib/history.js";
import { readableOn, useCardStyle } from "./CardStyleMenu.jsx";

/* ---------------- SHARED UI ---------------- */
export function BrandMark({ size = 30 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ color: THEME.card, fontWeight: 700, fontSize: Math.round(size * 0.38), letterSpacing: -0.2 }}>UV</span>
    </div>
  );
}
export function Avatar({ name, size = 28 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: THEME.chip, border: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.mutedDark, fontWeight: 600, fontSize: Math.round(size * 0.4), flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}
export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
}

export function Card({ children, style, className, onClick, ...rest }) {
  return (
    <div className={`uvix-card ${className || ""}`} onClick={onClick} style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius, padding: 18, ...style }} {...rest}>
      {children}
    </div>
  );
}
export function MetricCard({ label, value, sub, accent: accentProp, bg: bgProp, icon: Icon, onClick, pctBadge, progressPct, trendPct, goodDirection = "up", variant = "default" }) {
  const trendGood = goodDirection === "up" ? trendPct >= 0 : trendPct <= 0;
  // Administrator shesterenka orqali tanlagan rang va ko'rinish (Sozlamalar → cardStyles)
  const styleCtx = useCardStyle();
  const custom = styleCtx?.style;
  const gearPad = styleCtx?.editing ? 34 : 0; // shesterenka pastki o'ng burchakda — chiziq va izoh unga tegmasin
  const isFilled = custom ? !!custom.filled : false; // standart: neytral karta (rangli to'liq fon faqat administrator tanlasa)
  const accent = custom?.color || accentProp;
  const bg = custom?.color && !isFilled ? `${custom.color}22` : bgProp;
  const fg = isFilled ? readableOn(accent || THEME.violet) : null; // to'liq rangli kartochkadagi yozuv rangi
  const onDark = fg === "#fff";
  const soft = (a) => (onDark ? `rgba(255,255,255,${a})` : `rgba(24,24,27,${a})`);
  return (
    <Card
      className="uvix-metric uvix-dash-card"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 12, cursor: onClick ? "pointer" : "default",
        borderRadius: THEME.radius + 2, border: isFilled ? `1px solid ${accent || THEME.violet}` : `1px solid ${THEME.border}`,
        background: isFilled ? (accent || THEME.violet) : THEME.card,
        boxShadow: "none",
        padding: 16, gap: 10, position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: isFilled ? soft(0.85) : THEME.muted, fontWeight: 500 }}>{label}</span>
        {Icon && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: isFilled ? soft(0.16) : (custom?.color ? bg : THEME.chip), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={15} color={isFilled ? fg : (custom?.color || THEME.muted)} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontFamily: THEME.fontNum, fontWeight: 600, color: isFilled ? fg : THEME.text, letterSpacing: -0.4, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 20 }}>
        {pctBadge && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: isFilled ? fg : THEME.mutedDark, background: isFilled ? soft(0.16) : THEME.chip, padding: "2px 8px", borderRadius: 6 }}>{pctBadge}</span>
        )}
        {trendPct !== undefined && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: isFilled ? fg : (trendGood ? THEME.green : THEME.rose), background: isFilled ? soft(0.16) : (trendGood ? THEME.greenBg : THEME.roseBg), padding: "2px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 2 }}>
            {trendPct >= 0 ? "↑" : "↓"} {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
        {sub && !pctBadge && trendPct === undefined && <span style={{ fontSize: 12, color: isFilled ? soft(0.75) : THEME.dim }}>{sub}</span>}
      </div>
      {progressPct !== undefined && (
        <div style={{ height: 6, borderRadius: 4, background: isFilled ? soft(0.22) : THEME.chip, overflow: "hidden", marginRight: gearPad }}>
          <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, progressPct))}%`, background: isFilled ? fg : (accent || THEME.violet), borderRadius: 4, transition: "width 0.3s ease" }} />
        </div>
      )}
      {sub && (pctBadge || trendPct !== undefined) && <div style={{ fontSize: 12, color: isFilled ? soft(0.7) : THEME.dim, marginTop: -4, paddingRight: gearPad }}>{sub}</div>}
    </Card>
  );
}
export function Button({ children, onClick, variant = "primary", style, type = "button", disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 36, padding: "0 14px", borderRadius: Math.max(6, THEME.radius - 2),
    fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid transparent", lineHeight: 1.2,
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: THEME.violet, color: THEME.onPrimary, borderColor: THEME.violet },
    ghost: { background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border2}` },
    danger: { background: THEME.roseBg, color: THEME.rose, border: `1px solid ${THEME.roseBorder}` },
  };
  const classNames = { primary: "uvix-btn-primary", ghost: "uvix-btn-ghost", danger: "uvix-btn-danger" };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={classNames[variant]} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}
export function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark }}>{label}</label>
      {children}
    </div>
  );
}
export function getInputStyle() {
  return {
    padding: "9px 11px", minHeight: 38, borderRadius: Math.max(6, THEME.radius - 2), border: `1px solid ${THEME.border2}`, fontSize: 13.5,
    outline: "none", background: THEME.isDark ? mixColors(THEME.card, "#000000", 0.25) : "#FFFFFF", width: "100%", color: THEME.text,
  };
}
export function Modal({ title, onClose, children, width = 460 }) {
  const [shake, setShake] = useState(false);
  // Telefonning "orqaga" harakati oynani yopadi (bo'limdan chiqib ketmaydi)
  useBackToClose(true, onClose);
  function handleBackdropClick() {
    setShake(true);
    setTimeout(() => setShake(false), 350);
  }
  return (
    <div className="uvix-modal-backdrop" style={{ position: "fixed", inset: 0, background: THEME.isDark ? "rgba(0,0,0,0.6)" : "rgba(9,9,11,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }} onClick={handleBackdropClick}>
      <div className={`uvix-modal-panel${shake ? " uvix-modal-shake" : ""}`} style={{ background: THEME.card, borderRadius: THEME.radius + 4, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", boxShadow: THEME.shadowLg, border: `1px solid ${THEME.border}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2, color: THEME.text }}>{title}</div>
          <button onClick={onClose} aria-label="Yopish" className="uvix-iconbtn" style={{ background: "transparent", border: "none", cursor: "pointer", color: THEME.muted, borderRadius: 8, padding: 6, display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
export function ConfirmDialog({ message, onConfirm, onCancel, title = "Tasdiqlash", confirmLabel = "O'chirish", tone = "danger", icon: Icon = AlertTriangle }) {
  const danger = tone === "danger";
  return (
    <Modal title={title} onClose={onCancel} width={360}>
      <div style={{ fontSize: 13.5, color: THEME.text, marginBottom: 18, display: "flex", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: danger ? THEME.roseBg : THEME.greenBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={16} color={danger ? THEME.rose : THEME.green} />
        </div>
        <span style={{ paddingTop: 6, lineHeight: 1.5 }}>{message}</span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onCancel}>Bekor qilish</Button>
        <Button variant={danger ? "danger" : undefined} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
export function Badge({ children, color, bg }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, color, background: bg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
export function EmptyState({ text }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: THEME.muted, fontSize: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: THEME.chip, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
        <FolderTree size={17} color={THEME.muted} />
      </div>
      {text}
    </div>
  );
}
// Uzun ro'yxatlarni bo'lib chizish: avval `step` ta element, pastga yaqinlashganda yana qo'shiladi.
// 500 ta lid yoki chat bo'lsa ham sahifa bir zumda ochiladi va aylantirish qotmaydi.
export function Incremental({ list, step = 40, render, colSpan }) {
  const [count, setCount] = useState(step);
  const ref = useRef(null);
  const hasMore = count < list.length;
  useEffect(() => {
    if (!hasMore || !ref.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step);
    }, { rootMargin: "600px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [hasMore, count, step]);
  return (
    <>
      {list.slice(0, count).map(render)}
      {hasMore && (() => {
        const btn = (
          <button type="button" onClick={() => setCount((c) => c + step)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }}>
            Yana {Math.min(step, list.length - count)} ta ko'rsatish ({list.length - count} qoldi)
          </button>
        );
        const st = { padding: "10px 0", textAlign: "center", fontSize: 11.5, color: THEME.muted };
        // Jadval ichida (tbody) — qator sifatida
        return colSpan ? <tr ref={ref}><td colSpan={colSpan} style={st}>{btn}</td></tr> : <div ref={ref} style={st}>{btn}</div>;
      })()}
    </>
  );
}

export function usePagination(list, deps) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return { page: safePage, setPage, totalPages, pageItems };
}
export function Pagination({ page, totalPages, onChange, totalCount }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${THEME.border}`, flexWrap: "wrap", gap: 8 }}>
      <div style={{ fontSize: 12, color: THEME.muted }}>
        Jami <b style={{ color: THEME.text }}>{totalCount}</b> ta yozuv &middot; {page}/{totalPages}-sahifa
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: page <= 1 ? THEME.muted : THEME.text, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 600, opacity: page <= 1 ? 0.5 : 1 }}
        >
          &larr; Oldingi
        </button>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: page >= totalPages ? THEME.muted : THEME.text, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 600, opacity: page >= totalPages ? 0.5 : 1 }}
        >
          Keyingi &rarr;
        </button>
      </div>
    </div>
  );
}
export function PaymentTypeSelector({ value, onChange, size = "normal" }) {
  const pad = size === "small" ? "7px 0" : "8px 0";
  const fontSize = size === "small" ? 11.5 : 12.5;
  return (
    <div style={{ display: "flex", gap: 2, background: THEME.chip, borderRadius: 9, padding: 3 }}>
      {PAYMENT_TYPES.map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: pad, borderRadius: 7, border: "none", cursor: "pointer", fontSize, fontWeight: 600,
            background: value === opt.v ? THEME.card : "transparent",
            color: value === opt.v ? THEME.text : THEME.muted,
            boxShadow: value === opt.v ? THEME.shadowSm : "none",
            whiteSpace: "nowrap",
          }}
        >
          <opt.icon size={size === "small" ? 12 : 13} /> {opt.l}
        </button>
      ))}
    </div>
  );
}
export function MultiPaymentLines({ lines, onChange, bg }) {
  function update(id, field, val) {
    onChange(lines.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  }
  function add() {
    onChange([...lines, { id: uid(), methodType: "naqd", amountStr: "" }]);
  }
  function remove(id) {
    onChange(lines.length > 1 ? lines.filter((l) => l.id !== id) : lines);
  }
  const total = lines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map((line) => (
          <div key={line.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={line.methodType}
              onChange={(e) => update(line.id, "methodType", e.target.value)}
              style={{ ...getInputStyle(), background: bg || THEME.card, width: 150, flexShrink: 0 }}
            >
              {PAYMENT_TYPES.map((pt) => <option key={pt.v} value={pt.v}>{pt.l}</option>)}
            </select>
            <input
              value={line.amountStr}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                update(line.id, "amountStr", digits ? fmt(parseInt(digits, 10)) : "");
              }}
              placeholder="0"
              inputMode="numeric"
              style={{ ...getInputStyle(), background: bg || THEME.card }}
            />
            <button
              type="button"
              onClick={() => remove(line.id)}
              disabled={lines.length <= 1}
              className="uvix-iconbtn"
              style={{ ...getIconBtn(), background: bg || THEME.surface, opacity: lines.length <= 1 ? 0.35 : 1, flexShrink: 0 }}
            >
              <X size={14} color={THEME.rose} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, background: "none", border: "none", color: THEME.violet, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
        <Plus size={14} /> Yana to'lov usuli qo'shish
      </button>
      {lines.length > 1 && total > 0 && (
        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, textAlign: "right", color: THEME.text }}>
          Jami: {money(total)}
        </div>
      )}
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */
export function SectionTitle({ icon: Icon, text, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: -4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={15} color={THEME.dim} />}
        <span style={{ fontSize: 15, fontWeight: 600, color: THEME.text, letterSpacing: -0.2 }}>{text}</span>
      </div>
      {action}
    </div>
  );
}
export function getIconBtn() {
  return { background: THEME.chip, border: "none", borderRadius: Math.max(6, THEME.radius - 4), padding: 7, cursor: "pointer", display: "flex", color: THEME.muted };
}

// Ekran telefon o'lchamidami (jadval o'rniga kartochkalar ko'rsatish uchun)
export function useIsMobile(breakpoint = 720) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange));
  }, [query]);
  return isMobile;
}

// Telefon uchun ro'yxat elementi — jadval qatori o'rnida
export function MobileRow({ children, onClick, style }) {
  return (
    <div
      className="uvix-row"
      onClick={onClick}
      style={{ padding: "14px 16px", borderBottom: `1px solid ${THEME.border}`, cursor: onClick ? "pointer" : "default", ...style }}
    >
      {children}
    </div>
  );
}
