// chatExtras.jsx — Chatlar bo'limining qo'shimcha qismlari:
// holat (mas'ul, mahkamlash, arxiv, tayyor javoblar), mijoz kartasi, menejer tanlash. Smeta — ../quotes/ChatQuote.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, FileText, Package, Palette, Pin, PinOff, UserRound, Wallet } from "lucide-react";
import { C } from "./chatPalette.js";
import { readableOn } from "../../theme.js";
import { fetchChatTools, saveChatMeta } from "../../storage.js";
import { buildCustomers, custKey, phoneKey } from "../../lib/customers.js";
import { orderDebt } from "../../lib/finance.js";
import { fmt, shortDateUz } from "../../lib/format.js";
import { initials } from "../../components/ui.jsx";
import { isWorkerRole } from "../../constants.js";

// ---------- Holat ----------
export function useChatTools(openChatId) {
  const [st, setSt] = useState({ meta: {}, noteCount: {}, replies: [], config: { slaMinutes: 15 }, typing: {}, me: null, ready: false });
  const load = useCallback(() => fetchChatTools().then((d) => setSt({ ...d, ready: true })).catch(() => {}), []);
  useEffect(() => {
    load();
    // Suhbat ochiq bo'lsa tezroq (kim yozyapti belgisi uchun), aks holda sekinroq
    const t = setInterval(() => document.visibilityState === "visible" && load(), openChatId ? 4000 : 15000);
    return () => clearInterval(t);
  }, [load, openChatId]);
  async function setMeta(chatId, patch) {
    setSt((s) => {
      const cur = { ...(s.meta[chatId] || {}) };
      if ("assignee" in patch) { if (patch.assignee) cur.assignee = patch.assignee; else delete cur.assignee; }
      if ("pinned" in patch) { if (patch.pinned) cur.pinned = new Date().toISOString(); else delete cur.pinned; }
      if ("archived" in patch) { if (patch.archived) { cur.archived = new Date().toISOString(); delete cur.pinned; } else delete cur.archived; }
      return { ...s, meta: { ...s.meta, [chatId]: cur } };
    });
    try { await saveChatMeta(chatId, patch); } catch { load(); }
  }
  return { ...st, reload: load, setMeta };
}

// Mijoz kutayotgan daqiqalar (oxirgi xabar mijozdan bo'lsa)
export function waitingMinutes(chat, slaMinutes, nowMs = Date.now()) {
  if (!chat || chat.lastOut || !chat.lastDate || !slaMinutes) return 0;
  const mins = Math.floor((nowMs - new Date(chat.lastDate).getTime()) / 60000);
  return mins >= slaMinutes && mins < 60 * 24 * 3 ? mins : 0;
}
export function waitLabel(mins) {
  if (mins < 60) return `${mins} daq javobsiz`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} soat javobsiz` : `${Math.floor(h / 24)} kun javobsiz`;
}

const AV = ["#1F5FD6", "#0E7490", "#B45309", "#15803D", "#6D28D9", "#BE185D", "#C2410C", "#475569"];
export function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}

export const staffOf = (employees) => (employees || []).filter((e) => !isWorkerRole(e.role));

// ---------- Menejer tanlash ----------
export function AssigneePicker({ value, employees, onChange, typingNames = [], compact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const people = staffOf(employees);
  const cur = people.find((e) => e.id === value);
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} data-testid="assignee-btn" aria-expanded={open} title="Mas'ul menejer"
        style={{ height: 30, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px 0 4px", borderRadius: 15, border: `1px solid ${C.border}`, background: C.panel, color: C.text, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: cur ? `${avatarColor(cur.name)}22` : C.hover, color: cur ? readableOn(avatarColor(cur.name)) : C.muted, display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700 }}>
          {cur ? initials(cur.name) : <UserRound size={12} />}
        </span>
        {compact ? null : cur ? `Mas'ul: ${cur.name.split(" ")[0]}` : "Mas'ul tanlang"} ▾
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 260, zIndex: 320, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: C.shadow, padding: 6 }}>
          <div style={{ fontSize: 12, color: C.muted, padding: "4px 8px 6px" }}>Mas'ul menejer</div>
          {people.map((e) => (
            <button key={e.id} type="button" role="menuitemradio" aria-checked={value === e.id} onClick={() => { onChange(e.id); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px", border: 0, borderRadius: 7, background: value === e.id ? C.hover : "transparent", color: C.text, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: `${avatarColor(e.name)}22`, color: readableOn(avatarColor(e.name)), display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}>{initials(e.name)}</span>
              <span style={{ flex: 1 }}>{e.name}</span>
              {value === e.id && <Check size={15} color={C.link} />}
            </button>
          ))}
          <button type="button" role="menuitemradio" aria-checked={!value} onClick={() => { onChange(null); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px", border: 0, borderRadius: 7, background: !value ? C.hover : "transparent", color: C.muted, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.hover, display: "grid", placeItems: "center" }}>—</span> Biriktirilmagan
          </button>
          {typingNames.length > 0 && (
            <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: C.noteBg, color: C.noteText, fontSize: 12.5, lineHeight: 1.45 }}>
              ⚠️ <b>{typingNames.join(", ")}</b> hozir shu mijozga yozyapti. Ikki kishi bir vaqtda javob bermasligi uchun kelishib oling.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Chat qatori menyusi (mahkamlash / arxiv) ----------
export function RowMenu({ x, y, meta, onClose, onPin, onArchive }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const item = { width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 40, padding: "0 12px", border: 0, borderRadius: 8, background: "none", color: C.text, fontSize: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
  const left = Math.max(8, Math.min(x, window.innerWidth - 228));
  const top = Math.max(8, Math.min(y, window.innerHeight - 110));
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
      <div role="menu" data-testid="row-menu" style={{ position: "fixed", left, top, width: 220, zIndex: 401, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: C.shadow, padding: 6 }}>
        {!meta?.archived && <button type="button" role="menuitem" className="uc-menuitem" style={item} onClick={onPin}>{meta?.pinned ? <PinOff size={17} color={C.muted} /> : <Pin size={17} color={C.muted} />}{meta?.pinned ? "Mahkamlashni olish" : "Tepaga mahkamlash"}</button>}
        <button type="button" role="menuitem" className="uc-menuitem" style={item} onClick={onArchive}>{meta?.archived ? <ArchiveRestore size={17} color={C.muted} /> : <Archive size={17} color={C.muted} />}{meta?.archived ? "Arxivdan qaytarish" : "Arxivga"}</button>
      </div>
    </>
  );
}

// ---------- Mijoz (buyurtmalar, qarz) ----------
export function useChatCustomer({ orders, leads, customerProfiles, lead, name, phone, username }) {
  const all = useMemo(() => buildCustomers(orders || [], leads || [], customerProfiles || []), [orders, leads, customerProfiles]);
  return useMemo(() => {
    const ph = phoneKey(phone), tg = String(username || "").replace(/^@/, "").toLowerCase(), k = custKey(lead?.customer || name);
    return all.find((c) => (lead && c.leads.some((l) => l.id === lead.id)))
      || (tg && all.find((c) => c.telegram === tg))
      || (ph && all.find((c) => phoneKey(c.phone) === ph))
      || (k && all.find((c) => c.keys.includes(k)))
      || null;
  }, [all, lead, name, phone, username]);
}

export function CustomerBox({ customer, onNewOrder, onInvoice, onPayment, onDesigner, busy }) {
  const debtOrder = customer?.debtOrders?.[0]?.order || null;
  const lastOrder = customer?.orders?.[0] || null;
  const btn = (label, Icon, onClick, primary, disabled, testid) => (
    <button type="button" onClick={onClick} disabled={disabled || busy} data-testid={testid}
      style={{ height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
        border: `1px solid ${primary ? C.blue : C.border}`, background: primary ? C.blue : C.panel, color: primary ? "#fff" : C.text, opacity: disabled ? 0.45 : 1 }}>
      <Icon size={14} /> {label}
    </button>
  );
  return (
    <div data-testid="chat-customer" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {customer ? (
        <>
          <div style={{ fontSize: 12, color: C.muted }}>{customer.count ? `Mijoz · ${customer.count} ta buyurtma` : "Mijoz · hali buyurtma yo'q"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ padding: "8px 10px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Qarz</div><div style={{ fontWeight: 600, fontSize: 15, color: customer.debt > 0 ? C.red : C.text, fontVariantNumeric: "tabular-nums" }}>{customer.debt > 0 ? fmt(customer.debt) : "—"}</div></div>
            <div style={{ padding: "8px 10px", borderLeft: `1px solid ${C.border}` }}><div style={{ fontSize: 11.5, color: C.muted }}>Jami aylanma</div><div style={{ fontWeight: 600, fontSize: 15, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmt(customer.total)}</div></div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: C.muted }}>Bu mijozning buyurtmalari topilmadi.</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {btn("Buyurtma", Package, onNewOrder, true, false, "chat-new-order")}
        {btn("Faktura", FileText, () => onInvoice(debtOrder || lastOrder), false, !lastOrder, "chat-invoice")}
        {btn("To'lov", Wallet, () => onPayment(debtOrder || lastOrder), false, !lastOrder, "chat-payment")}
        {btn("Dizaynerga", Palette, onDesigner, false, false, "chat-designer")}
      </div>
      {customer?.orders?.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 2 }}>Oxirgi buyurtmalar</div>
          {customer.orders.slice(0, 3).map((o) => {
            const d = orderDebt(o);
            return (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.orderNumber} · {[o.materialType, o.area ? `${String(o.area).replace(".", ",")} m²` : shortDateUz(o.date)].filter(Boolean).join(" ")}</span>
                <b style={{ color: d > 0 ? C.red : C.green, whiteSpace: "nowrap", fontWeight: 600 }}>{d > 0 ? fmt(d) : "to'langan"}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
