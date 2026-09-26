import { useEffect, useState } from "react";
import { AlertTriangle, FolderTree, Plus, X } from "lucide-react";
import { PAGE_SIZE, PAYMENT_TYPES } from "../constants.js";
import { fmt, money, uid } from "../lib/format.js";
import { THEME, mixColors, shadeColor } from "../theme.js";
import { useBackToClose } from "../lib/history.js";

/* ---------------- SHARED UI ---------------- */
export function Card({ children, style, className, onClick, ...rest }) {
  return (
    <div className={`uvix-card ${className || ""}`} onClick={onClick} style={{ background: THEME.card, border: `1px solid ${THEME.borderSoft}`, boxShadow: THEME.shadowSm, borderRadius: THEME.radius, padding: 18, ...style }} {...rest}>
      {children}
    </div>
  );
}
export function MetricCard({ label, value, sub, accent, bg, icon: Icon, onClick, pctBadge, progressPct, trendPct, goodDirection = "up", variant = "default" }) {
  const trendGood = goodDirection === "up" ? trendPct >= 0 : trendPct <= 0;
  const isFilled = variant === "filled";
  return (
    <Card
      className="uvix-metric uvix-dash-card"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 12, cursor: onClick ? "pointer" : "default",
        borderRadius: 22, border: isFilled ? "none" : `1px solid ${THEME.border}`,
        background: isFilled ? `linear-gradient(135deg, ${accent || THEME.violet}, ${shadeColor(accent || THEME.violet, -18)})` : THEME.card,
        boxShadow: isFilled ? `0 10px 28px ${accent || THEME.violet}55` : "0 1px 2px rgba(20,16,40,0.04)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, color: isFilled ? "rgba(255,255,255,0.85)" : THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
        {Icon && (
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: isFilled ? "rgba(255,255,255,0.22)" : (bg || THEME.violetSoft), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={15} color={isFilled ? "#fff" : (accent || THEME.violet)} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: THEME.isDark ? 21 : 25, fontFamily: THEME.fontNum, fontWeight: THEME.isDark ? 500 : 700, color: isFilled ? "#fff" : THEME.text, letterSpacing: THEME.isDark ? -0.3 : -0.5, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 20 }}>
        {pctBadge && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: isFilled ? "#fff" : (accent || THEME.violet), background: isFilled ? "rgba(255,255,255,0.22)" : (bg || THEME.violetSoft), padding: "3px 9px", borderRadius: 20 }}>{pctBadge}</span>
        )}
        {trendPct !== undefined && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: isFilled ? "#fff" : (trendGood ? THEME.green : THEME.rose), background: isFilled ? "rgba(255,255,255,0.22)" : (trendGood ? THEME.greenBg : THEME.roseBg), padding: "3px 9px", borderRadius: 20, display: "flex", alignItems: "center", gap: 2 }}>
            {trendPct >= 0 ? "↑" : "↓"} {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
        {sub && !pctBadge && trendPct === undefined && <span style={{ fontSize: 11.5, color: isFilled ? "rgba(255,255,255,0.75)" : THEME.muted }}>{sub}</span>}
      </div>
      {progressPct !== undefined && (
        <div style={{ height: 7, borderRadius: 10, background: isFilled ? "rgba(255,255,255,0.25)" : THEME.surface, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, progressPct))}%`, background: isFilled ? "#fff" : (accent || THEME.violet), borderRadius: 10, transition: "width 0.3s ease" }} />
        </div>
      )}
      {sub && (pctBadge || trendPct !== undefined) && <div style={{ fontSize: 11, color: isFilled ? "rgba(255,255,255,0.7)" : THEME.muted, marginTop: -4 }}>{sub}</div>}
    </Card>
  );
}
export function Button({ children, onClick, variant = "primary", style, type = "button", disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: Math.max(6, THEME.radius - 7),
    fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none",
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: THEME.violet, color: "#fff" },
    ghost: { background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border}` },
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
      <label style={{ fontSize: 12, fontWeight: 600, color: THEME.mutedDark }}>{label}</label>
      {children}
    </div>
  );
}
export function getInputStyle() {
  return {
    padding: "10px 12px", borderRadius: Math.max(6, THEME.radius - 7), border: `1.5px solid ${THEME.border}`, fontSize: 13.5,
    outline: "none", background: THEME.isDark ? mixColors(THEME.card, "#000000", 0.18) : "#FCFCFE", width: "100%", color: THEME.text,
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
    <div className="uvix-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(16,14,26,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }} onClick={handleBackdropClick}>
      <div className={`uvix-modal-panel${shake ? " uvix-modal-shake" : ""}`} style={{ background: THEME.card, borderRadius: THEME.radius + 4, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", boxShadow: THEME.shadowLg }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2, color: THEME.text }}>{title}</div>
          <button onClick={onClose} className="uvix-iconbtn" style={{ background: THEME.surface, border: "none", cursor: "pointer", color: THEME.muted, borderRadius: 9, padding: 6, display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}
export function ConfirmDialog({ message, onConfirm, onCancel, title = "Tasdiqlash", confirmLabel = "O'chirish", tone = "danger", icon: Icon = AlertTriangle }) {
  const danger = tone === "danger";
  return (
    <Modal title={title} onClose={onCancel} width={360}>
      <div style={{ fontSize: 13.5, color: THEME.text, marginBottom: 18, display: "flex", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: danger ? THEME.roseBg : THEME.greenBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, color, background: bg }}>
      {children}
    </span>
  );
}
export function EmptyState({ text }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: THEME.muted, fontSize: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: THEME.surface, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
        <FolderTree size={17} color={THEME.muted} />
      </div>
      {text}
    </div>
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
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.card, color: page <= 1 ? THEME.muted : THEME.text, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 600, opacity: page <= 1 ? 0.5 : 1 }}
        >
          &larr; Oldingi
        </button>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.card, color: page >= totalPages ? THEME.muted : THEME.text, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 600, opacity: page >= totalPages ? 0.5 : 1 }}
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
    <div style={{ display: "flex", gap: 4, background: THEME.surface, borderRadius: 11, padding: 3 }}>
      {PAYMENT_TYPES.map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: pad, borderRadius: 9, border: "none", cursor: "pointer", fontSize, fontWeight: 700,
            background: value === opt.v ? THEME.card : "transparent",
            color: value === opt.v ? THEME.violet : THEME.muted,
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: -4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: THEME.violetSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={13} color={THEME.violet} />
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: THEME.text, letterSpacing: -0.2 }}>{text}</span>
      </div>
      {action}
    </div>
  );
}
export function getIconBtn() {
  return { background: THEME.surface, border: "none", borderRadius: Math.max(5, THEME.radius - 9), padding: 7, cursor: "pointer", display: "flex" };
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
