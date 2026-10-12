// PriceListSection.jsx — narxlar ro'yxati (kalkulyator narxni shu yerdan oladi) va avans foizi. Faqat admin.
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { fmt } from "../../lib/format.js";
import { saveSalesConfig } from "../../storage.js";
import { loadSales, setSalesCache } from "../quotes/useSales.js";
import { useDirty } from "./saveBar.jsx";

const rid = () => Math.random().toString(36).slice(2, 10);
const n = (v) => String(v ?? "").replace(",", ".");

export function PriceListSection({ categories }) {
  const [rows, setRows] = useState(null);
  const [pct, setPct] = useState(50);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reloadN, setReloadN] = useState(0);
  useEffect(() => {
    loadSales(true).then((c) => { setRows((c.prices || []).map((p) => ({ ...p, cur: p.cur || "uzs", price: p.cur === "usd" ? String(p.price).replace(".", ",") : String(p.price), minArea: p.minArea ? String(p.minArea).replace(".", ",") : "", inkUsd: p.inkUsd ? String(p.inkUsd).replace(".", ",") : "" }))); setPct(c.advancePct ?? 50); setDirty(false); }).catch((e) => setMsg(e.message));
  }, [reloadN]);
  const withBar = useDirty("prices", { dirty, label: "Narxlar", save: () => save(true), reset: () => setReloadN((n) => n + 1) });
  if (!rows) return null;

  const materials = (categories && categories.Material) || [];
  const upd = (i, patch) => { setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r))); setDirty(true); };
  async function save(throwErr) {
    setBusy(true); setMsg("");
    try {
      const cfg = await saveSalesConfig({ advancePct: Number(pct) || 0, prices: rows.filter((r) => r.material.trim()).map((r) => ({ id: r.id, material: r.material.trim(), unit: r.unit, cur: r.cur, price: r.cur === "usd" ? Number(n(r.price)) || 0 : Number(String(r.price).replace(/\s/g, "")) || 0, minArea: Number(n(r.minArea)) || 0, inkUsd: Number(n(r.inkUsd)) || 0 })) });
      setSalesCache(cfg); setDirty(false); if (!withBar) setMsg("Saqlandi");
    } catch (e) { setMsg(e.message); if (throwErr) throw e; } finally { setBusy(false); }
  }
  const inp = { ...getInputStyle(), minHeight: 34, height: 34 };
  const head = { fontSize: 11.5, color: THEME.muted, fontWeight: 500 };
  return (
    <Card data-testid="price-list">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>Narxlar va smeta</div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2, lineHeight: 1.45 }}>Kalkulyatorda material tanlanganda narx shu yerdan olinadi (menejer qo'lda o'zgartira oladi). Narx so'mda yoki dollarda bo'lishi mumkin — dollar narx kalkulyatorda kurs bo'yicha so'mga o'giriladi. Minimal maydon — kichik ishlar shu maydon bo'yicha hisoblanadi. Kraska $/m² — buyurtmadagi kraska summasi avtomatik hisoblanishi uchun (ixtiyoriy).</div>
        </div>
        <Button variant="ghost" onClick={() => { setRows((l) => [...l, { id: rid(), material: "", unit: "m2", cur: "uzs", price: "", minArea: "", inkUsd: "" }]); setDirty(true); }}><Plus size={14} /> Qo'shish</Button>
      </div>
      <datalist id="uvix-price-materials">{materials.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="uvix-scroll" style={{ overflowX: "auto", marginTop: 12 }}>
        <div style={{ minWidth: 660, display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.8fr 0.8fr 34px", gap: 8 }}>
            <span style={head}>Material</span><span style={head}>Birlik</span><span style={head}>Narx</span><span style={head}>Min. m²</span><span style={head}>Kraska $/m²</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} data-price-row={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.8fr 0.8fr 34px", gap: 8 }}>
              <input value={r.material} onChange={(e) => upd(i, { material: e.target.value })} list="uvix-price-materials" placeholder="Shisha" aria-label="Material" style={inp} />
              <select value={r.unit} onChange={(e) => upd(i, { unit: e.target.value })} aria-label="Birlik" style={inp}><option value="m2">m²</option><option value="pcs">dona</option></select>
              <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
                {r.cur === "usd"
                  ? <input value={r.price} onChange={(e) => upd(i, { price: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="0" aria-label="Narx, dollar" style={{ ...inp, minWidth: 0, flex: 1 }} />
                  : <input value={r.price ? fmt(Number(String(r.price).replace(/\s/g, ""))) : ""} onChange={(e) => upd(i, { price: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="0" aria-label="Narx" style={{ ...inp, minWidth: 0, flex: 1 }} />}
                <select value={r.cur} onChange={(e) => upd(i, { cur: e.target.value, price: "" })} aria-label="Narx valyutasi" data-testid="price-cur" style={{ ...inp, width: 72, flexShrink: 0 }}><option value="uzs">so'm</option><option value="usd">$</option></select>
              </div>
              <input value={r.minArea} onChange={(e) => upd(i, { minArea: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="—" aria-label="Minimal maydon" disabled={r.unit === "pcs"} style={inp} />
              <input value={r.inkUsd} onChange={(e) => upd(i, { inkUsd: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="—" aria-label="Kraska dollar" style={inp} />
              <button type="button" onClick={() => { setRows((l) => l.filter((_, j) => j !== i)); setDirty(true); }} aria-label="O'chirish" className="uvix-iconbtn"
                style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.rose, display: "grid", placeItems: "center", cursor: "pointer" }}><Trash2 size={14} /></button>
            </div>
          ))}
          {!rows.length && <div style={{ fontSize: 13, color: THEME.dim }}>Hali narx kiritilmagan — kalkulyatorda narx qo'lda yoziladi.</div>}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${THEME.border}`, marginTop: 14, paddingTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 13 }}>
        <span style={{ fontWeight: 500 }}>Buyurtma yaratish uchun avans:</span>
        <select value={pct} onChange={(e) => { setPct(Number(e.target.value)); setDirty(true); }} aria-label="Avans foizi" style={{ ...inp, width: 150 }}>
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 100].map((v) => <option key={v} value={v}>{v ? `${v}%` : "Shart emas"}</option>)}
        </select>
        <span style={{ color: THEME.dim, fontSize: 12.5 }}>Kam bo'lsa «Buyurtmaga aylantirish» yopiq turadi; admin istisno qila oladi.</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        {!withBar && <Button onClick={() => save()} disabled={busy || !dirty} data-testid="price-save">Saqlash</Button>}
        {msg && <span role="status" style={{ fontSize: 12.5, color: msg === "Saqlandi" ? THEME.green : THEME.rose }}>{msg}</span>}
      </div>
    </Card>
  );
}
