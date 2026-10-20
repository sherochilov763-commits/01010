// BottomNav.jsx — telefon uchun pastki menyu (iOS tab bar uslubi, eskiz 61): 4 ta tanlangan bo'lim + «Yana», hammasi teng.
// «+» (yangi qo'shish) endi sarlavhaning o'ng tomonida — HeaderPlus / QuickAddSheet.
import { useEffect, useState } from "react";
import { Banknote, Package, Plus, ScanLine, TrendingDown, UserPlus, Menu, X } from "lucide-react";
import { NAV } from "../constants.js";
import { NAV_SHORT } from "./Nav.jsx";
import { THEME } from "../theme.js";
import { useBackToClose } from "../lib/history.js";
import { MoreSheet } from "./MoreSheet.jsx";

// «‹ Yana» va boshqa joylardan «Yana» varag'ini ochish
export const OPEN_MORE_EVT = "uvix:open-more";
export const openMore = () => window.dispatchEvent(new Event(OPEN_MORE_EVT));

// Pastki panel: xodim tanlagan 4 ta bo'lim va «Yana» — iOS qoidasi: 5 tadan ko'p emas
function buildTabs(keys) {
  const tabs = (keys && keys.length ? keys : ["dashboard", "orders", "crm", "operations"]).slice(0, 4)
    .map((k) => NAV.find((n) => n.key === k)).filter(Boolean)
    .map((n) => ({ key: n.key, label: NAV_SHORT[n.key] === "Asosiy" ? "Dashboard" : NAV_SHORT[n.key] || n.label, icon: n.icon }));
  return [...tabs, { key: "__more", label: "Yana", icon: Menu }];
}

// more: { items, badges, user, onToggleBar, onEditMenu, onLogout } — berilsa «Yana» ro'yxat varag'ini ochadi, aks holda onMore()
export function BottomNav({ view, tabs: tabKeys, onNavigate, onMore, badges, more }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const TABS = buildTabs(tabKeys);
  const mainKeys = TABS.map((t) => t.key).filter((k) => !k.startsWith("__"));
  const moreActive = !mainKeys.includes(view);
  // Pastki menyuda faqat yangi chat xabarlari soni; «Chatlar» panelda bo'lmasa — «Yana» ustida
  const tabBadge = (k) => (k === "chats" || (k === "__more" && !mainKeys.includes("chats")) ? badges?.chats || 0 : 0);

  useEffect(() => {
    const on = () => { if (more) setMoreOpen(true); else onMore?.(); };
    window.addEventListener(OPEN_MORE_EVT, on);
    return () => window.removeEventListener(OPEN_MORE_EVT, on);
  }, [more, onMore]);

  return (
    <>
      <nav className="uvix-bottomnav no-print" aria-label="Asosiy menyu">
        {TABS.map((t) => {
          const active = t.key === "__more" ? moreActive : view === t.key;
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" className="uvix-tab" aria-current={active ? "page" : undefined}
              onClick={() => { if (t.key !== "__more") onNavigate(t.key); else if (more) setMoreOpen(true); else onMore(); }}
              data-tab={t.key} aria-label={tabBadge(t.key) ? `${t.label}, ${tabBadge(t.key)} ta yangi xabar` : undefined}
              style={{ color: active ? THEME.violet : THEME.dim, fontWeight: active ? 650 : 500 }}>
              <span style={{ position: "relative", display: "flex" }}>
                <Icon size={24} strokeWidth={active ? 2.1 : 1.8} />
                {tabBadge(t.key) ? <span className="uvix-tab-badge" data-testid={`tab-badge-${t.key}`} style={{ background: THEME.roseSolid, border: `2px solid ${THEME.card}` }}>{tabBadge(t.key) > 99 ? "99+" : tabBadge(t.key)}</span> : null}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {moreOpen && more && (
        <MoreSheet {...more} barKeys={mainKeys} view={view} onNavigate={onNavigate} onClose={() => setMoreOpen(false)}
          onEditMenu={more.onEditMenu ? () => { setMoreOpen(false); setTimeout(() => more.onEditMenu(), 220); } : null} />
      )}
    </>
  );
}

// Sarlavhadagi ko'k «+» (faqat telefonda) — bosilsa pastdan «Yangi qo'shish» varag'i
export function HeaderPlus({ onPick, canExpense = true, canLead = false }) {
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const items = [
    { k: "order", icon: Package, c: THEME.violet, t: "Yangi buyurtma", s: "Mijoz, material, summa, avans" },
    { k: "pay", icon: Banknote, c: THEME.green, t: "To'lov qabul qilish", s: "Qarzdor buyurtmaga" },
    canExpense ? { k: "expense", icon: TrendingDown, c: THEME.amber || "#B45309", t: "Rasxod", s: "Material, ish haqi, ijara…" } : null,
    canLead ? { k: "lead", icon: UserPlus, c: "#7C3AED", t: "Yangi lid", s: "CRM'ga" } : null,
    { k: "scan", icon: ScanLine, c: THEME.text, t: "Skaner", s: "QR yorliq yoki buyurtma kodi" },
  ].filter(Boolean);
  return (
    <>
      <button type="button" className="uvix-hplus" aria-label="Yangi qo'shish" aria-expanded={open} data-testid="header-plus"
        onClick={() => setOpen((v) => !v)} style={{ background: THEME.violet, color: THEME.onPrimary || "#fff" }}>
        {open ? <X size={20} strokeWidth={2.4} /> : <Plus size={21} strokeWidth={2.4} />}
      </button>
      {open && (
        <>
          <div className="uvix-more-backdrop" onClick={() => setOpen(false)} />
          <div className="uvix-more-sheet uvix-add-sheet" role="menu" aria-label="Yangi qo'shish" data-testid="add-sheet"
            style={{ background: THEME.card, borderTop: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg, color: THEME.text }}>
            <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "8px auto 0" }} />
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, padding: "12px 18px 4px" }}>Yangi qo'shish</div>
            <div style={{ padding: "0 10px" }}>
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <button key={it.k} type="button" role="menuitem" data-add={it.k} className="uvix-sheet-item" style={{ color: THEME.text }}
                    onClick={() => { setOpen(false); onPick(it.k); }}>
                    <span className="uvix-sheet-icon" style={{ background: `color-mix(in srgb, ${it.c} 13%, transparent)`, color: it.c }}><Icon size={20} /></span>
                    <span><b>{it.t}</b><small style={{ color: THEME.muted }}>{it.s}</small></span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// App'ning <style> blokiga qo'shiladigan CSS (faqat telefon/planshetda ko'rinadi)
export const BOTTOM_NAV_CSS = `
  .uvix-bottomnav { display: none; }
  .uvix-hplus { display: none; }
  @media (max-width: 860px) {
    .uvix-bottomnav {
      display: flex; align-items: flex-start; gap: 0;
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;
      padding: 6px 4px calc(4px + env(safe-area-inset-bottom, 0px));
      background: color-mix(in srgb, ${THEME.card} 86%, transparent);
      -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
      border-top: 0.5px solid ${THEME.border2};
    }
    .uvix-hamburger { display: none !important; }
    .uvix-main-pad { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; }
    /* iPhone 16px'dan kichik maydonga bosilganda ekranni kattalashtirib yuboradi — oldini olamiz */
    input, select, textarea { font-size: 16px !important; }
    .uvix-hplus {
      display: flex; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer; flex-shrink: 0;
      align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent;
      box-shadow: 0 4px 10px color-mix(in srgb, ${THEME.violet} 35%, transparent); transition: transform .15s ease;
    }
    .uvix-hplus:active { transform: scale(.92); }
  }
  .uvix-tab {
    flex: 1 1 0; min-width: 0; height: 52px; border: 0; background: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    font-size: 10.5px; letter-spacing: -0.1px; padding: 0 1px; -webkit-tap-highlight-color: transparent; font-family: inherit;
    transition: color .15s ease;
  }
  .uvix-tab:active > span:first-child { transform: scale(.9); }
  .uvix-tab > span:first-child { transition: transform .12s ease; }
  .uvix-tab > span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .uvix-tab-badge { position: absolute; top: -6px; left: 14px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; color: #fff; font-size: 10px; font-weight: 700; line-height: 1; display: flex; align-items: center; justify-content: center; letter-spacing: 0; }
  .uvix-add-sheet { padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
  .uvix-sheet-item {
    width: 100%; display: flex; align-items: center; gap: 14px; padding: 11px 8px; border: 0; background: none;
    border-radius: 12px; cursor: pointer; text-align: left; font-family: inherit; min-height: 60px;
  }
  .uvix-sheet-item:active { background: rgba(127,127,127,0.1); }
  .uvix-sheet-item b { display: block; font-size: 15.5px; font-weight: 600; }
  .uvix-sheet-item small { display: block; font-size: 12.5px; margin-top: 2px; }
  .uvix-sheet-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  @media (prefers-reduced-motion: reduce) { .uvix-hplus, .uvix-tab, .uvix-tab > span:first-child { transition: none; } }
`;
