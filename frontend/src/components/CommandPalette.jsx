// CommandPalette.jsx — Ctrl+K (Mac: ⌘K) tezkor qidiruv va buyruqlar oynasi.
// Bo'limlarga o'tish, yangi buyurtma/rasxod/lid, buyurtma, mijoz va lidlarni nomi yoki raqami bo'yicha topish.
// Faqat navigatsiya: ma'lumot o'zgartirmaydi, mavjud oynalarni ochadi.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Contact, CornerDownLeft, Package, Plus, Search, TrendingDown, Users2 } from "lucide-react";
import { THEME } from "../theme.js";
import { money, shortDateUz } from "../lib/format.js";
import { orderDebt } from "../lib/finance.js";
import { useBackToClose } from "../lib/history.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[ʻʼ'`‘’]/g, "'").trim();

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Global klaviatura yorlig'i
export function useCommandHotkey(onOpen, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K" || e.code === "KeyK")) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen, enabled]);
}

// Sidebar tepasidagi qidiruv tugmasi
export function SearchTrigger({ onClick, compact = false }) {
  const k = isMac() ? "⌘K" : "Ctrl K";
  if (compact) {
    return (
      <button type="button" onClick={onClick} aria-label="Qidirish (Ctrl+K)" title={`Qidirish (${k})`} className="uvix-iconbtn"
        style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
        <Search size={17} />
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} data-testid="cmdk-trigger" className="uvix-search-trigger"
      style={{ display: "flex", alignItems: "center", gap: 8, height: 34, width: "100%", padding: "0 8px 0 10px", margin: "0 0 10px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.isDark ? THEME.card : THEME.surface, color: THEME.dim, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
      <Search size={15} />
      <span style={{ flex: 1, textAlign: "left" }}>Qidirish</span>
      <kbd style={{ fontFamily: "inherit", fontSize: 11, color: THEME.muted, border: `1px solid ${THEME.border2}`, borderRadius: 5, padding: "0 5px", background: THEME.card, lineHeight: "18px" }}>{k}</kbd>
    </button>
  );
}

export function CommandPalette({ open, onClose, nav, orders, leads, customers, onNavigate, onSearchOrders, onQuickAdd, onNewLead }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  useBackToClose(open, onClose);

  useEffect(() => {
    if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const groups = useMemo(() => {
    if (!open) return [];
    const s = norm(q);
    const hit = (...xs) => !s || xs.some((x) => norm(x).includes(s));
    const out = [];
    const actions = [
      { id: "a-order", icon: Plus, label: "Yangi buyurtma", hint: "Buyurtmalar", run: () => onQuickAdd("order") },
      { id: "a-expense", icon: TrendingDown, label: "Yangi rasxod", hint: "Rasxod", run: () => onQuickAdd("expense") },
      onNewLead && { id: "a-lead", icon: Users2, label: "Yangi lid", hint: "CRM", run: onNewLead },
    ].filter(Boolean).filter((a) => hit(a.label, a.hint));
    if (actions.length) out.push({ title: "Amallar", items: actions });

    const pages = (nav || []).filter((n) => hit(n.label, n.key)).map((n) => ({ id: `n-${n.key}`, icon: n.icon, label: n.label, hint: "Bo'lim", run: () => onNavigate(n.key) }));
    if (pages.length) {
      const g = { title: "Bo'limlar", items: s ? pages : pages.slice(0, 6) };
      if (s) out.unshift(g); else out.push(g); // yozilganda bo'limlar birinchi
    }

    if (s.length >= 2) {
      const ords = (orders || []).filter((o) => !o.deletedAt && hit(o.orderNumber, o.customer)).slice(0, 6)
        .map((o) => {
          const debt = orderDebt(o);
          return { id: `o-${o.id}`, icon: Package, label: `${o.orderNumber} · ${o.customer || "—"}`, hint: `${shortDateUz(o.date)} · ${debt > 0 ? `qarz ${money(debt)}` : money(o.agreementUzs || 0)}`, run: () => onSearchOrders(o.orderNumber) };
        });
      if (ords.length) out.push({ title: "Buyurtmalar", items: ords });
      const custs = (customers || []).filter((c) => hit(c.name, c.phone, c.telegram)).slice(0, 5)
        .map((c) => ({ id: `c-${c.key || c.name}`, icon: Contact, label: c.name, hint: [c.phone, c.orders?.length ? `${c.orders.length} ta buyurtma` : ""].filter(Boolean).join(" · "), run: () => onSearchOrders(c.name) }));
      if (custs.length) out.push({ title: "Mijozlar", items: custs });
      const lds = (leads || []).filter((l) => hit(l.customer, l.phone, l.telegramUsername)).slice(0, 5)
        .map((l) => ({ id: `l-${l.id}`, icon: Users2, label: l.customer, hint: ["Lid", l.phone].filter(Boolean).join(" · "), run: () => onNavigate("crm") }));
      if (lds.length) out.push({ title: "Lidlar", items: lds });
    }
    return out;
  }, [open, q, nav, orders, leads, customers, onNavigate, onSearchOrders, onQuickAdd, onNewLead]);

  const flat = groups.flatMap((g) => g.items);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;
  // Avval o'tamiz (tarixdagi oyna yozuvi yangi bo'lim bilan almashtiriladi), keyin yopamiz — "orqaga" qaytib ketmasin
  const run = (item) => { if (!item) return; item.run(); onClose(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(flat[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let idx = -1;
  return (
    <div className="uvix-cmdk-backdrop" onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: THEME.isDark ? "rgba(0,0,0,0.55)" : "rgba(9,9,11,0.28)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "12vh 16px 16px" }}>
      <div role="dialog" aria-modal="true" aria-label="Qidirish va buyruqlar" data-testid="cmdk" className="uvix-modal-panel" onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 600, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, boxShadow: THEME.shadowLg, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: `1px solid ${THEME.border}` }}>
          <Search size={17} color={THEME.dim} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Buyurtma, mijoz, lid yoki bo'lim..." aria-label="Qidiruv so'zi" role="combobox" aria-expanded="true" aria-controls="uvix-cmdk-list"
            aria-activedescendant={flat[active] ? `cmdk-${flat[active].id}` : undefined}
            style={{ flex: 1, height: 52, border: 0, outline: "none", background: "transparent", color: THEME.text, fontSize: 15, fontFamily: "inherit", boxShadow: "none" }} />
          <kbd style={{ fontFamily: "inherit", fontSize: 11, color: THEME.muted, border: `1px solid ${THEME.border2}`, borderRadius: 5, padding: "0 5px", lineHeight: "18px" }}>Esc</kbd>
        </div>
        <div ref={listRef} id="uvix-cmdk-list" role="listbox" className="uvix-scroll" style={{ overflowY: "auto", padding: 6 }}>
          {flat.length === 0 && (
            <div style={{ padding: "28px 12px", textAlign: "center", color: THEME.muted, fontSize: 13.5 }}>
              {norm(q).length < 2 ? "Kamida 2 ta harf yozing" : "Hech narsa topilmadi"}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.title} role="group" aria-label={g.title}>
              <div style={{ fontSize: 12, color: THEME.dim, padding: "8px 10px 4px", fontWeight: 500 }}>{g.title}</div>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                const on = i === active;
                const Icon = it.icon;
                return (
                  <div key={it.id} id={`cmdk-${it.id}`} role="option" aria-selected={on} data-idx={i}
                    onMouseMove={() => active !== i && setActive(i)} onClick={() => run(it)}
                    style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 10px", borderRadius: 7, cursor: "pointer", background: on ? THEME.hover : "transparent" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 6, background: on ? THEME.card : THEME.chip, border: `1px solid ${on ? THEME.border : "transparent"}`, display: "grid", placeItems: "center", flexShrink: 0, color: THEME.muted }}>
                      {Icon ? <Icon size={14} /> : <ArrowRight size={14} />}
                    </span>
                    <span style={{ fontSize: 13.5, color: THEME.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{it.label}</span>
                    <span style={{ fontSize: 12.5, color: THEME.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{it.hint}</span>
                    {on && <CornerDownLeft size={14} color={THEME.dim} style={{ flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, padding: "8px 14px", borderTop: `1px solid ${THEME.border}`, fontSize: 12, color: THEME.dim }}>
          <span>↑↓ tanlash</span><span>Enter ochish</span><span>Esc yopish</span>
        </div>
      </div>
    </div>
  );
}
