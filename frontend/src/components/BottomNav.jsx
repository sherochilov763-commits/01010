// BottomNav.jsx — telefon uchun pastki menyu (bank ilovalaridagidek) va "+" tezkor qo'shish
import { useEffect, useState } from "react";
import { LayoutDashboard, Package, Plus, TrendingDown, MoreHorizontal, X } from "lucide-react";
import { THEME } from "../theme.js";
import { useBackToClose } from "../lib/history.js";

const TABS = [
  { key: "dashboard", label: "Asosiy", icon: LayoutDashboard },
  { key: "orders", label: "Buyurtma", icon: Package },
  { key: "__add" },
  { key: "expense", label: "Rasxod", icon: TrendingDown },
  { key: "__more", label: "Yana", icon: MoreHorizontal },
];

export function BottomNav({ view, onNavigate, onMore, onQuickAdd }) {
  const [sheet, setSheet] = useState(false);
  useBackToClose(sheet, () => setSheet(false));
  const mainKeys = ["dashboard", "orders", "expense"];
  const moreActive = !mainKeys.includes(view);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  function quick(kind) {
    setSheet(false);
    onQuickAdd(kind);
  }

  return (
    <>
      <nav className="uvix-bottomnav no-print" aria-label="Asosiy menyu"
        style={{ background: THEME.card, borderTop: `1px solid ${THEME.border}` }}>
        {TABS.map((t) => {
          if (t.key === "__add") {
            return (
              <button key="add" type="button" className="uvix-fab" aria-label="Yangi qo'shish" aria-expanded={sheet}
                onClick={() => setSheet((v) => !v)}
                style={{ background: THEME.violet, boxShadow: `0 8px 22px ${THEME.violet}55` }}>
                {sheet ? <X size={24} color="#fff" strokeWidth={2.2} /> : <Plus size={26} color="#fff" strokeWidth={2.2} />}
              </button>
            );
          }
          const active = t.key === "__more" ? moreActive : view === t.key;
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" className="uvix-tab" aria-current={active ? "page" : undefined}
              onClick={() => { setSheet(false); t.key === "__more" ? onMore() : onNavigate(t.key); }}
              style={{ color: active ? THEME.violet : THEME.muted, fontWeight: active ? 600 : 500 }}>
              <Icon size={22} strokeWidth={active ? 2.1 : 1.7} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {sheet && (
        <>
          <div className="uvix-sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="uvix-sheet" role="menu" aria-label="Yangi qo'shish"
            style={{ background: THEME.card, border: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg }}>
            <button type="button" role="menuitem" onClick={() => quick("order")} className="uvix-sheet-item" style={{ color: THEME.text }}>
              <span className="uvix-sheet-icon" style={{ background: THEME.violetSoft, color: THEME.violet }}><Package size={20} /></span>
              <span><b>Yangi buyurtma</b><small style={{ color: THEME.muted }}>Mijoz, summa, avans</small></span>
            </button>
            <button type="button" role="menuitem" onClick={() => quick("expense")} className="uvix-sheet-item" style={{ color: THEME.text }}>
              <span className="uvix-sheet-icon" style={{ background: THEME.roseBg, color: THEME.rose }}><TrendingDown size={20} /></span>
              <span><b>Yangi rasxod</b><small style={{ color: THEME.muted }}>Material, ish haqi, ijara...</small></span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

// App'ning <style> blokiga qo'shiladigan CSS (faqat telefon/planshetda ko'rinadi)
export const BOTTOM_NAV_CSS = `
  .uvix-bottomnav { display: none; }
  @media (max-width: 860px) {
    .uvix-bottomnav {
      display: flex; align-items: flex-start; gap: 2px;
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    }
    .uvix-hamburger { display: none !important; }
    .uvix-main-pad { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; }
    /* iPhone 16px'dan kichik maydonga bosilganda ekranni kattalashtirib yuboradi — oldini olamiz */
    input, select, textarea { font-size: 16px !important; }
  }
  .uvix-tab {
    flex: 1 1 0; min-width: 0; height: 54px; border: 0; background: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    font-size: 11px; -webkit-tap-highlight-color: transparent; font-family: inherit;
  }
  .uvix-tab span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .uvix-fab {
    width: 56px; height: 56px; margin-top: -20px; flex-shrink: 0; border: 0; border-radius: 20px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s ease;
  }
  .uvix-fab:active { transform: scale(0.94); }
  .uvix-sheet-backdrop { position: fixed; inset: 0; z-index: 140; background: rgba(0,0,0,0.35); }
  .uvix-sheet {
    position: fixed; left: 12px; right: 12px; z-index: 145; border-radius: 20px; padding: 8px;
    bottom: calc(84px + env(safe-area-inset-bottom, 0px));
    animation: uvixSlideUp 0.2s cubic-bezier(0.16,1,0.3,1);
  }
  .uvix-sheet-item {
    width: 100%; display: flex; align-items: center; gap: 14px; padding: 12px; border: 0; background: none;
    border-radius: 14px; cursor: pointer; text-align: left; font-family: inherit; min-height: 60px;
  }
  .uvix-sheet-item:active { background: rgba(127,127,127,0.1); }
  .uvix-sheet-item b { display: block; font-size: 15px; font-weight: 600; }
  .uvix-sheet-item small { display: block; font-size: 12.5px; margin-top: 2px; }
  .uvix-sheet-icon { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  @media (prefers-reduced-motion: reduce) { .uvix-sheet { animation: none; } .uvix-fab { transition: none; } }
`;
