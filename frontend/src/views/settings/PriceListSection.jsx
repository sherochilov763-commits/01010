// PriceListSection.jsx — Smeta / Buyurtma sozlamasi: minimal avans foizi. Faqat admin.
// Narxlar ro'yxati 2026-11 da olib tashlandi: narx har smetada qo'lda yoziladi, bo'yoq tannarxi esa
// buyurtmaga emas — hisobotda «Kraska» rasxodlaridan olinadi (qatlamlar har xil).
import { useEffect, useState } from "react";
import { Card, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { saveSalesConfig } from "../../storage.js";
import { loadSales, setSalesCache } from "../quotes/useSales.js";
import { useDirty } from "./saveBar.jsx";

export function PriceListSection() {
  const [pct, setPct] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [reloadN, setReloadN] = useState(0);
  useEffect(() => { loadSales(true).then((c) => { setPct(c.advancePct ?? 50); setDirty(false); }).catch(() => setPct(50)); }, [reloadN]);
  async function save(throwErr) {
    setMsg("");
    try { const cfg = await saveSalesConfig({ advancePct: Number(pct) || 0 }); setSalesCache(cfg); setDirty(false); if (!withBar) setMsg("Saqlandi"); }
    catch (e) { setMsg(e.message); if (throwErr) throw e; }
  }
  const withBar = useDirty("advance", { dirty, label: "Avans foizi", save: () => save(true), reset: () => setReloadN((n) => n + 1) });
  if (pct == null) return null;
  return (
    <Card data-testid="advance-card">
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Buyurtma — minimal avans</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10, lineHeight: 1.45 }}>
        «Smeta / Buyurtma» oynasida avans shu foizdan kam bo'lsa: rahbar tasdiqlab o'zi ochadi, xodim esa rahbarga so'rov yuboradi —
        Telegram'da «Tasdiqlash / Rad etish», tasdiqlansa buyurtma o'zi ochiladi. Narx har smetada qo'lda yoziladi.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <select value={pct} onChange={(e) => { setPct(Number(e.target.value)); setDirty(true); }} aria-label="Avans foizi" data-testid="advance-pct" style={{ ...getInputStyle(), width: 160, minHeight: 34, height: 34 }}>
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 100].map((v) => <option key={v} value={v}>{v === 0 ? "Avans shart emas" : `${v}% avans`}</option>)}
        </select>
        {!withBar && dirty && <button type="button" onClick={() => save(false)} style={{ height: 34, padding: "0 14px", border: 0, borderRadius: 8, background: THEME.blue, color: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>Saqlash</button>}
        {msg && <span style={{ fontSize: 12.5, color: THEME.muted }}>{msg}</span>}
      </div>
    </Card>
  );
}
