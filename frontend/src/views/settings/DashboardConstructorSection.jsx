import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Card } from "../../components/ui.jsx";
import { DASHBOARD_GROUPS, DASHBOARD_SIZE_LABELS, DASHBOARD_SIZE_SPANS, DASHBOARD_WIDGET_CATALOG, DEFAULT_DASHBOARD_LAYOUT } from "../../constants.js";
import { getEffectiveDashboardLayout } from "../../lib/finance.js";
import { THEME } from "../../theme.js";

export function DashboardConstructorSection({ settings, onSaveSettings }) {
  const [layout, setLayout] = useState(() => getEffectiveDashboardLayout(settings));
  const [savedMsg, setSavedMsg] = useState("");

  function groupItems(groupId) {
    return layout.filter((w) => DASHBOARD_WIDGET_CATALOG.find((c) => c.id === w.id)?.group === groupId);
  }

  function moveItem(id, dir) {
    const catalogItem = DASHBOARD_WIDGET_CATALOG.find((c) => c.id === id);
    const groupId = catalogItem?.group;
    const groupList = groupItems(groupId);
    const posInGroup = groupList.findIndex((w) => w.id === id);
    const targetPos = posInGroup + dir;
    if (targetPos < 0 || targetPos >= groupList.length) return;
    const newGroupList = groupList.slice();
    [newGroupList[posInGroup], newGroupList[targetPos]] = [newGroupList[targetPos], newGroupList[posInGroup]];
    const next = [];
    DASHBOARD_GROUPS.forEach((g) => {
      if (g.id === groupId) next.push(...newGroupList);
      else next.push(...groupItems(g.id));
    });
    setLayout(next);
    setSavedMsg("");
  }
  function toggleVisible(id) {
    setLayout(layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
    setSavedMsg("");
  }
  function changeSize(id, size) {
    setLayout(layout.map((w) => (w.id === id ? { ...w, size } : w)));
    setSavedMsg("");
  }
  function saveLayout() {
    onSaveSettings({ ...settings, dashboardLayout: layout });
    setSavedMsg("Saqlandi — Dashboard shu tartib va o'lchamlarda ko'rsatiladi (barcha foydalanuvchilar uchun)");
  }
  function resetLayout() {
    const next = DEFAULT_DASHBOARD_LAYOUT.map((w) => ({ ...w }));
    setLayout(next);
    onSaveSettings({ ...settings, dashboardLayout: next });
    setSavedMsg("Standart tartibga qaytarildi");
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Dashboard konstruktori</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>
        Har bir ko'rsatkichning tartibi, o'lchami va ko'rinishini boshqaring — har biri faqat o'z bo'limi ichida suriladi, boshqa bo'limga o'tib ketmaydi. O'zgarish barcha foydalanuvchilar uchun bir xil bo'ladi.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: 500, overflowY: "auto", paddingRight: 4 }} className="uvix-scroll">
        {DASHBOARD_GROUPS.map((g) => {
          const items = groupItems(g.id);
          if (items.length === 0) return null;
          return (
            <div key={g.id}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.violet, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((w, i) => {
                  const meta = DASHBOARD_WIDGET_CATALOG.find((c) => c.id === w.id);
                  return (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: w.visible ? THEME.surface : THEME.chip, borderRadius: 10, opacity: w.visible ? 1 : 0.55, flexWrap: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                        <button onClick={() => moveItem(w.id, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", padding: 0, opacity: i === 0 ? 0.3 : 1, color: THEME.muted }}>
                          <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} />
                        </button>
                        <button onClick={() => moveItem(w.id, 1)} disabled={i === items.length - 1} style={{ background: "none", border: "none", cursor: i === items.length - 1 ? "not-allowed" : "pointer", padding: 0, opacity: i === items.length - 1 ? 0.3 : 1, color: THEME.muted }}>
                          <ChevronDown size={12} />
                        </button>
                      </div>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{meta?.label || w.id}</span>
                      <select
                        value={w.size || "md"}
                        onChange={(e) => changeSize(w.id, e.target.value)}
                        style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "4px 6px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer" }}
                      >
                        {Object.keys(DASHBOARD_SIZE_SPANS).map((s) => (
                          <option key={s} value={s}>{DASHBOARD_SIZE_LABELS[s]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => toggleVisible(w.id)}
                        style={{
                          flexShrink: 0, padding: "5px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                          background: w.visible ? THEME.greenBg : THEME.roseBg,
                          color: w.visible ? THEME.green : THEME.rose,
                        }}
                      >
                        {w.visible ? "Ko'rinadi" : "Yashirilgan"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {savedMsg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 10 }}>{savedMsg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button onClick={saveLayout}>Saqlash</Button>
        <Button variant="ghost" onClick={resetLayout}>Standartga qaytarish</Button>
      </div>
    </Card>
  );
}
