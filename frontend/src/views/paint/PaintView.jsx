// PaintView.jsx — Bo'yoq ombori: qoldiq va prognoz, haftalik sanash, oylik kunma-kun hisobot, sozlamalar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, Info, Plus, RefreshCw, Send, Trash2, TrendingDown } from "lucide-react";
import { Button, Card, ConfirmDialog, Field, Modal, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { deletePaintCount, fetchPaint, fetchPaintCounts, fetchPaintMonth, savePaintConfig, savePaintCount, sendPaintTest } from "../../storage.js";
import { exportRows } from "../../lib/excel.js";
import { TelegramLinkCard } from "../../components/TelegramLinkCard.jsx";
import { setPaintCache } from "../../lib/paintStore.js";
import { TransactionForm } from "../expenses/TransactionForm.jsx";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const MONTHS_CAP = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));
const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dLabel = (s) => { const [, m, d] = s.split("-").map(Number); return `${d}-${MONTHS[m - 1]}`; };
const L = (x, digits = 1) => `${(Number(x) || 0).toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} L`;
const nfmt = (x, digits = 1) => (Number(x) || 0).toLocaleString("ru-RU", { maximumFractionDigits: digits });
const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const parseNum = (s) => { const n = Number(String(s ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

const STATUS = {
  ok: { label: "Yetarli", color: "#10B981" },
  low: { label: "Kam qoldi", color: "#F59E0B" },
  empty: { label: "Tugagan", color: "#EF4444" },
  unknown: { label: "Sanalmagan", color: "#94A3B8" },
};

function Swatch({ color, size = 14 }) {
  return <span style={{ width: size, height: size, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: color, flexShrink: 0, boxShadow: `inset 0 0 0 1px ${THEME.isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)"}`, display: "inline-block" }} />;
}
function Tabs({ tabs, tab, setTab }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: THEME.surface, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
      {tabs.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} data-painttab={k} onClick={() => setTab(k)}
          style={{ padding: "8px 14px", borderRadius: 10, border: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap",
            background: tab === k ? THEME.card : "transparent", color: tab === k ? THEME.text : THEME.muted, boxShadow: tab === k ? THEME.shadowSm : "none" }}>{l}</button>
      ))}
    </div>
  );
}

export function PaintView({ currentUser, isAdmin, orders, categories, onAddCategory, onAddSubcategory, onSaveTx }) {
  const [tab, setTab] = useState("stock");
  const [state, setState] = useState(null);
  const [err, setErr] = useState("");
  const [counting, setCounting] = useState(false);
  const [buying, setBuying] = useState(false);
  const load = useCallback(() => fetchPaint().then((s) => { setState(s); setPaintCache(s); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const tabs = [["stock", "Qoldiq"], ["month", "Oylik hisobot"], ["counts", "Sanashlar"], ...(isAdmin ? [["settings", "Sozlamalar"]] : [])];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Tabs tabs={tabs} tab={tab} setTab={setTab} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => setBuying(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={15} /> Kirim</Button>
        <Button onClick={() => setCounting(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }} data-testid="paint-count-btn"><ClipboardCheck size={15} /> Sanash</Button>
      </div>
      {err && <Card><div style={{ color: THEME.rose, fontSize: 13 }}>{err}</div></Card>}
      {!state && !err && <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>}
      {state && tab === "stock" && <StockTab state={state} onCount={() => setCounting(true)} onReload={load} />}
      {state && tab === "month" && <MonthTab state={state} />}
      {state && tab === "counts" && <CountsTab isAdmin={isAdmin} onChanged={load} />}
      {state && tab === "settings" && isAdmin && <SettingsTab state={state} onSaved={(s) => { setState(s); setPaintCache(s); }} />}
      {buying && (
        <TransactionForm preset={{ category: "Kraska", subcategory: "UV kraska" }} currentUser={currentUser} categories={categories} orders={orders}
          onAddCategory={onAddCategory} onAddSubcategory={onAddSubcategory} onClose={() => setBuying(false)}
          onSave={(tx) => { onSaveTx(tx, false); setBuying(false); [1500, 4000].forEach((ms) => setTimeout(load, ms)); }} />
      )}
      {counting && state && <CountModal state={state} onClose={() => setCounting(false)} onSaved={(s) => { setState(s); setPaintCache(s); setCounting(false); }} />}
    </div>
  );
}

// ---------------- Qoldiq va prognoz ----------------
function StockTab({ state, onCount, onReload }) {
  const items = state.items.filter((i) => i.active);
  const low = items.filter((i) => i.status === "low" || i.status === "empty");
  const lead = state.settings.leadDays;
  const noCount = !state.lastCount;
  return (
    <>
      {noCount ? (
        <Banner tone="violet" icon={Info} action={<Button onClick={onCount}>Boshlang'ich sanash</Button>}>
          <b>Boshlash uchun ombordagi bo'yoqlarni bir marta o'lchab kiriting.</b> Keyin qoldiq avtomatik hisoblanadi: buyurtmalardagi m² bo'yicha sarf ayiriladi, Rasxod → Kraska'dagi kirim qo'shiladi.
        </Banner>
      ) : state.countDue ? (
        <Banner tone="amber" icon={ClipboardCheck} action={<Button onClick={onCount}>Sanash</Button>}>
          <b>Haftalik sanash vaqti keldi.</b> Oxirgi sanash: {dLabel(state.lastCount.date)}. Sanash prognozni aniqlashtiradi va sarf normasini o'rgatadi.
        </Banner>
      ) : null}
      {low.length > 0 && (
        <Banner tone="rose" icon={AlertTriangle}>
          <b>{low.length} ta bo'yoq {lead} kundan kamroqqa yetadi:</b> {low.map((i) => i.name).join(", ")}. Buyurtma berishni rejalashtiring.
        </Banner>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: THEME.muted }}>
        <span style={{ fontWeight: 700, color: THEME.text, background: THEME.chip, padding: "5px 11px", borderRadius: 20 }}>O'rtacha {nfmt(state.m2PerDay)} m²/kun</span>
        <span>oxirgi {state.windowDays} kun buyurtmalari bo'yicha · ogohlantirish {lead} kun oldin</span>
        <button type="button" onClick={onReload} title="Yangilash" style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.muted, cursor: "pointer" }}><RefreshCw size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {items.map((it) => <PaintCard key={it.id} it={it} lead={lead} />)}
      </div>
      <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.55, display: "flex", gap: 8 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Qoldiq = oxirgi sanash + kirim − sarf. Sarf = buyurtmadagi m² × norma (ml/m²). Norma avval taxminiy; har ikki sanash orasidagi haqiqiy sarfdan o'zi aniqlashadi (<b>o'rganilgan</b> belgisi).</span>
      </div>
    </>
  );
}

function Banner({ tone, icon: Icon, children, action }) {
  const c = { amber: [THEME.amber, THEME.amberBg], rose: [THEME.rose, THEME.roseBg], violet: [THEME.violet, THEME.violetSoft] }[tone];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, borderRadius: 14, background: c[1], color: THEME.text, fontSize: 13, lineHeight: 1.5, flexWrap: "wrap" }}>
      <Icon size={18} style={{ color: c[0], flexShrink: 0 }} />
      <div style={{ flex: "1 1 240px" }}>{children}</div>
      {action}
    </div>
  );
}

function PaintCard({ it, lead }) {
  const s = STATUS[it.status];
  const scale = Math.max(lead * 3, 60); // shkala: ogohlantirish muddatining 3 barobari
  const pct = it.daysLeft == null ? (it.stock > 0 ? 100 : 0) : Math.min(100, (it.daysLeft / scale) * 100);
  const leadPct = Math.min(100, (lead / scale) * 100);
  return (
    <Card data-paint={it.id} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, borderTop: `3px solid ${it.color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Swatch color={it.color} />
        <div style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: `${s.color}1F`, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{s.label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: THEME.fontNum, letterSpacing: -0.5, color: it.stock <= 0 ? THEME.rose : THEME.text }}>{nfmt(Math.max(0, it.stock))}</div>
        <div style={{ fontSize: 14, color: THEME.muted, fontWeight: 600 }}>litr</div>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 6, background: THEME.chip, overflow: "hidden" }} title={`Shkala: ${scale} kun`}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: s.color, borderRadius: 6 }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${leadPct}%`, width: 2, background: THEME.text, opacity: 0.35 }} />
      </div>
      <div style={{ fontSize: 13, color: it.status === "ok" ? THEME.text : s.color, fontWeight: 600 }}>
        {it.status === "unknown" ? "Qoldiq noma'lum — «Sanash»da kiriting" : it.status === "empty" ? "Tugagan — darhol to'ldiring" : it.daysLeft == null ? "Sarf yo'q (oxirgi 30 kunda buyurtma yo'q)" : `~${it.daysLeft} kunga yetadi · ${dLabel(it.runOut)} atrofida`}
      </div>
      <div style={{ fontSize: 12, color: THEME.muted, display: "flex", flexDirection: "column", gap: 3 }}>
        <span>Sarf: <b style={{ color: THEME.text }}>{nfmt(it.dailyL, 2)} L/kun</b> · {nfmt(it.rate, 1)} ml/m²{" "}
          {it.rateSource === "learned"
            ? <span title={`${it.samples.length} ta sanash oralig'idan`} style={{ color: THEME.green, fontWeight: 700 }}>✓ o'rganilgan</span>
            : <span title="Ikki sanashdan keyin aniqlashadi">(taxminiy)</span>}
        </span>
        {it.lastCount && <span>Sanash {dLabel(it.lastCount.date)}: {L(it.lastCount.value)}{it.intakeSince ? ` · +${L(it.intakeSince)} kirim` : ""}{it.usedSince >= 0.05 ? ` · −${L(it.usedSince)} sarf` : ""}</span>}
      </div>
      {it.recommend > 0 && (it.status === "low" || it.status === "empty") && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, background: THEME.chip, padding: "7px 10px", borderRadius: 10 }}>Tavsiya: {L(it.recommend)} buyurtma qiling</div>
      )}
    </Card>
  );
}

// ---------------- Sanash ----------------
function CountModal({ state, onClose, onSaved }) {
  const items = state.items.filter((i) => i.active);
  const [date, setDate] = useState(todayStr());
  const [vals, setVals] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit() {
    const values = {};
    for (const it of items) {
      const raw = vals[it.id];
      if (raw == null || String(raw).trim() === "") continue;
      const n = parseNum(raw);
      if (!Number.isFinite(n) || n < 0) return setErr(`${it.name}: litrni to'g'ri kiriting`);
      values[it.id] = n;
    }
    if (!Object.keys(values).length) return setErr("Kamida bitta bo'yoq qoldig'ini kiriting");
    setBusy(true); setErr("");
    try { onSaved(await savePaintCount({ date, values, note })); } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="Ombordagi bo'yoqlarni sanash" onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5 }}>Har bir bo'yoqning haqiqiy qoldig'ini litrda kiriting (ochiq idishlar ham). Bo'sh qoldirilganlar o'zgarmaydi.</div>
        <Field label="Sana"><input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} /></Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => {
            const n = parseNum(vals[it.id]);
            const has = vals[it.id] != null && String(vals[it.id]).trim() !== "" && Number.isFinite(n);
            const diff = has ? n - it.stock : 0;
            return (
              <div key={it.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}><Swatch color={it.color} size={12} />{it.name}</div>
                  <div style={{ fontSize: 11.5, color: has && Math.abs(diff) >= 0.1 ? (diff < 0 ? THEME.rose : THEME.green) : THEME.muted, marginTop: 2, marginLeft: 20 }}>
                    Hisobda: {L(Math.max(0, it.stock))}{has && Math.abs(diff) >= 0.1 ? ` · farq ${diff > 0 ? "+" : ""}${nfmt(diff)} L` : ""}
                  </div>
                </div>
                <div style={{ position: "relative" }}>
                  <input data-count={it.id} value={vals[it.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [it.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                    inputMode="decimal" placeholder={nfmt(Math.max(0, it.stock))} style={{ ...getInputStyle(), paddingRight: 26, textAlign: "right", fontWeight: 700 }} />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: THEME.muted }}>L</span>
                </div>
              </div>
            );
          })}
        </div>
        <Field label="Izoh"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ixtiyoriy" style={getInputStyle()} /></Field>
        {err && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit} disabled={busy} data-testid="paint-count-save">{busy ? "Saqlanmoqda…" : "Saqlash"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CountsTab({ isAdmin, onChanged }) {
  const [list, setList] = useState(null);
  const [del, setDel] = useState(null);
  const [items, setItems] = useState([]);
  const load = useCallback(() => Promise.all([fetchPaintCounts(), fetchPaint()]).then(([c, s]) => { setList(c); setItems(s.items); }).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>;
  if (!list.length) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Hali sanash kiritilmagan.</div></Card>;
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((c) => (
          <Card key={c.id} style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <ClipboardCheck size={16} style={{ color: THEME.violet }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{dLabel(c.date)}</div>
              <div style={{ fontSize: 12, color: THEME.muted }}>{c.by}{c.note ? ` · ${c.note}` : ""}</div>
              <div style={{ flex: 1 }} />
              {isAdmin && <button type="button" onClick={() => setDel(c)} title="O'chirish" style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer" }}><Trash2 size={15} /></button>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(c.values).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, background: THEME.chip, padding: "4px 10px", borderRadius: 20 }}>
                  <Swatch color={byId[k]?.color || "#999"} size={10} />{byId[k]?.name || k}: <b>{L(v, 2)}</b>
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {del && <ConfirmDialog message={`${dLabel(del.date)} dagi sanash o'chirilsinmi? Qoldiq va o'rganilgan norma qayta hisoblanadi.`}
        onCancel={() => setDel(null)} onConfirm={async () => { await deletePaintCount(del.id).catch(() => {}); setDel(null); load(); onChanged(); }} />}
    </>
  );
}

// ---------------- Oylik hisobot ----------------
function MonthTab({ state }) {
  const isMobile = useIsMobile();
  const [ym, setYm] = useState(todayStr().slice(0, 7));
  const [data, setData] = useState(null);
  const [focus, setFocus] = useState("all");
  useEffect(() => { setData(null); fetchPaintMonth(ym).then(setData).catch(() => setData({ days: [], summary: [], items: [], intakes: [], counts: [] })); }, [ym]);
  const items = useMemo(() => (data?.items || []).filter((i) => i.active), [data]);
  const shown = focus === "all" ? items : items.filter((i) => i.id === focus);
  const max = useMemo(() => Math.max(0.0001, ...(data?.days || []).map((d) => shown.reduce((s, i) => s + (d.used[i.id] || 0), 0))), [data, shown]);
  const curYm = todayStr().slice(0, 7);
  const [y, m] = ym.split("-").map(Number);

  function exportExcel() {
    const rows = data.days.map((d) => {
      const r = { Sana: d.date, "m²": d.m2 };
      items.forEach((i) => { r[`${i.name} sarf (L)`] = d.used[i.id] || 0; r[`${i.name} kirim (L)`] = d.intake[i.id] || 0; });
      r.Sanash = d.counted ? "ha" : "";
      return r;
    });
    rows.push({});
    data.summary.forEach((s) => { const i = items.find((x) => x.id === s.id); if (i) rows.push({ Sana: i.name, "m²": "", "Oy boshida": s.start, Kirim: s.intake, Sarf: s.used, Tuzatish: s.correction, "Oy oxirida": s.end }); });
    exportRows(rows, "Bo'yoq", `UVIX_boyoq_${ym}.xlsx`);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setYm(shiftYm(ym, -1))} style={navBtn} aria-label="Oldingi oy"><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 130, textAlign: "center" }}>{MONTHS_CAP[m - 1]} {y}</div>
        <button type="button" onClick={() => setYm(shiftYm(ym, 1))} disabled={ym >= curYm} style={{ ...navBtn, opacity: ym >= curYm ? 0.4 : 1 }} aria-label="Keyingi oy"><ChevronRight size={16} /></button>
        <div style={{ flex: 1 }} />
        {data && data.days.length > 0 && <Button variant="ghost" onClick={exportExcel} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={15} /> Excel</Button>}
      </div>
      {!data ? <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card> : !data.days.length ? <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Bu oy uchun ma'lumot yo'q.</div></Card> : (
        <>
          {/* Oy bo'yicha jamlanma */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead><tr style={{ background: THEME.surface, color: THEME.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {["Bo'yoq", "Oy boshida", "Kirim", "Sarf", "Sanash tuzatishi", "Oy oxirida"].map((h, i) => <th key={h} style={{ padding: "10px 14px", textAlign: i ? "right" : "left", fontWeight: 700 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.summary.filter((s) => items.some((i) => i.id === s.id)).map((s) => {
                    const it = items.find((i) => i.id === s.id);
                    return (
                      <tr key={s.id} style={{ borderTop: `1px solid ${THEME.border}` }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Swatch color={it.color} size={11} />{it.name}</span></td>
                        <td style={td}>{L(s.start, 2)}</td>
                        <td style={{ ...td, color: s.intake ? THEME.green : THEME.muted }}>{s.intake ? `+${L(s.intake, 2)}` : "—"}</td>
                        <td style={{ ...td, color: s.used >= 0.005 ? THEME.text : THEME.muted }}>{s.used >= 0.005 ? `−${L(s.used, 2)}` : "—"}</td>
                        <td style={{ ...td, color: Math.abs(s.correction) < 0.05 ? THEME.muted : s.correction < 0 ? THEME.rose : THEME.green }}>{Math.abs(s.correction) < 0.05 ? "—" : `${s.correction > 0 ? "+" : ""}${L(s.correction, 2)}`}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{L(Math.max(0, s.end), 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Kunma-kun sarf grafigi */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <TrendingDown size={16} style={{ color: THEME.violet }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>Kunma-kun sarf</div>
              <div style={{ flex: 1 }} />
              <select value={focus} onChange={(e) => setFocus(e.target.value)} style={{ ...getInputStyle(), width: "auto", padding: "6px 10px", fontSize: 12.5 }}>
                <option value="all">Barcha bo'yoqlar</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: data.days.length < 12 ? "flex-start" : "space-between", gap: isMobile ? 2 : 4, height: 150, borderBottom: `1px solid ${THEME.border}` }}>
              {data.days.map((d) => {
                const total = shown.reduce((s, i) => s + (d.used[i.id] || 0), 0);
                const inSum = shown.reduce((s, i) => s + (d.intake[i.id] || 0), 0);
                return (
                  <div key={d.date} title={`${dLabel(d.date)}: ${nfmt(d.m2)} m² · ${nfmt(total, 2)} L sarf${inSum ? ` · +${nfmt(inSum, 2)} L kirim` : ""}${d.counted ? " · sanash" : ""}`}
                    style={{ flex: 1, minWidth: 0, maxWidth: 28, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative" }}>
                    {inSum > 0 && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 6, height: 6, borderRadius: "50%", background: THEME.green }} />}
                    {d.counted && <div style={{ position: "absolute", top: inSum > 0 ? 9 : 0, left: "50%", transform: "translateX(-50%)", width: 6, height: 6, borderRadius: 2, background: THEME.violet }} />}
                    <div style={{ display: "flex", flexDirection: "column-reverse", height: `${(total / max) * 82}%`, borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                      {shown.map((i) => d.used[i.id] ? <div key={i.id} style={{ height: `${(d.used[i.id] / total) * 100}%`, background: i.color }} /> : null)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: THEME.muted, marginTop: 6 }}>
              <span>{dLabel(data.from)}</span><span>{dLabel(data.to)}</span>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: THEME.muted, marginTop: 10 }}>
              {shown.map((i) => <span key={i.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: i.color }} />{i.name}</span>)}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: THEME.green }} />kirim</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: THEME.violet }} />sanash</span>
            </div>
          </Card>

          {/* Kunlik jadval */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto", maxHeight: 420 }} className="uvix-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 140 + items.length * 78 }}>
                <thead style={{ position: "sticky", top: 0, background: THEME.surface, zIndex: 1 }}><tr style={{ color: THEME.muted, fontSize: 11 }}>
                  <th style={{ padding: "9px 12px", textAlign: "left" }}>Sana</th>
                  <th style={{ padding: "9px 12px", textAlign: "right" }}>m²</th>
                  {items.map((i) => <th key={i.id} style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Swatch color={i.color} size={9} />{i.name.replace(/ \(.+\)$/, "")}</span></th>)}
                </tr></thead>
                <tbody>
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.date} style={{ borderTop: `1px solid ${THEME.border}` }}>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{dLabel(d.date)}{d.counted && <ClipboardCheck size={12} style={{ color: THEME.violet, marginLeft: 6, verticalAlign: -1 }} />}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: d.m2 ? THEME.text : THEME.muted }}>{d.m2 ? nfmt(d.m2) : "—"}</td>
                      {items.map((i) => (
                        <td key={i.id} style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: d.used[i.id] ? THEME.text : THEME.muted }}>{d.used[i.id] ? nfmt(d.used[i.id], 2) : "—"}</span>
                          {d.intake[i.id] ? <div style={{ color: THEME.green, fontWeight: 700, fontSize: 11.5 }}>+{nfmt(d.intake[i.id], 2)}</div> : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div style={{ fontSize: 12, color: THEME.muted }}>Sarf litrda: kun m² × joriy norma. «Sanash tuzatishi» — hisob bilan haqiqiy qoldiq orasidagi farq (sanashda aniqlangan).</div>
        </>
      )}
    </>
  );
}
const navBtn = { width: 34, height: 34, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const td = { padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ---------------- Sozlamalar (admin) ----------------
function SettingsTab({ state, onSaved }) {
  const [items, setItems] = useState(() => state.items.map(({ id, name, color, norm, active, learned }) => ({ id, name, color, norm: String(norm), active, learned })));
  const [leadDays, setLeadDays] = useState(String(state.settings.leadDays));
  const [alerts, setAlerts] = useState(state.settings.alerts);
  const [countWeekday, setCountWeekday] = useState(state.settings.countWeekday);
  const [countAt, setCountAt] = useState(state.settings.countAt);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const upd = (i, k, v) => setItems((list) => list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const s = await savePaintConfig({ items: items.map((i) => ({ ...i, norm: parseNum(i.norm) || 0 })), leadDays: Number(leadDays), alerts, countWeekday, countAt });
      onSaved(s); setMsg({ ok: true, text: "Saqlandi" });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  }
  async function test() {
    setMsg(null);
    try { const r = await sendPaintTest(); setMsg({ ok: r.ok, text: r.message }); } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Bo'yoqlar va sarf normasi</div>
        <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>Norma — 1 m² bosma uchun taxminiy sarf (ml). Ikki sanashdan keyin tizim haqiqiy sarfni o'zi hisoblaydi va o'shani ishlatadi.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) => (
            <div key={it.id} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 92px 40px", gap: 8, alignItems: "center", opacity: it.active ? 1 : 0.55 }}>
              <input type="color" value={it.color} onChange={(e) => upd(i, "color", e.target.value)} style={{ width: 34, height: 34, padding: 0, border: 0, background: "none", cursor: "pointer" }} title="Rang" />
              <div style={{ minWidth: 0 }}>
                <input value={it.name} onChange={(e) => upd(i, "name", e.target.value)} style={getInputStyle()} />
                {it.learned != null && <div style={{ fontSize: 11, color: THEME.green, marginTop: 3 }}>✓ O'rganilgan: {nfmt(it.learned)} ml/m²</div>}
              </div>
              <div style={{ position: "relative" }}>
                <input value={it.norm} onChange={(e) => upd(i, "norm", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" style={{ ...getInputStyle(), paddingRight: 40, textAlign: "right" }} title="ml/m²" />
                <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10.5, color: THEME.muted }}>ml/m²</span>
              </div>
              <label title={it.active ? "Hisobda" : "O'chirilgan"} style={{ display: "flex", justifyContent: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={it.active} onChange={(e) => upd(i, "active", e.target.checked)} style={{ width: 18, height: 18, accentColor: THEME.violet }} />
              </label>
            </div>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setItems((l) => [...l, { id: `p${Date.now().toString(36)}`, name: "Yangi bo'yoq", color: "#9CA3AF", norm: "2", active: true }])} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Bo'yoq qo'shish</Button>
      </Card>

      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Ogohlantirish va sanash</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Field label="Necha kun oldin ogohlantirsin">
            <input value={leadDays} onChange={(e) => setLeadDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={getInputStyle()} />
          </Field>
          <Field label="Haftalik sanash kuni">
            <select value={countWeekday} onChange={(e) => setCountWeekday(Number(e.target.value))} style={getInputStyle()}>
              {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
            </select>
          </Field>
          <Field label="Sanash eslatmasi vaqti">
            <input type="time" value={countAt} onChange={(e) => setCountAt(e.target.value)} style={getInputStyle()} />
          </Field>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, cursor: "pointer", lineHeight: 1.45 }}>
          <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} style={{ width: 18, height: 18, accentColor: THEME.violet, marginTop: 1 }} />
          <span><b>Telegram'ga ogohlantirish</b> — bo'yoq {leadDays || "30"} kundan kamroqqa yetadigan bo'lsa (har bo'yoq uchun bir marta) va sanash kuni eslatma. Administratorning shaxsiy Telegram'iga keladi.</span>
        </label>
        <TelegramLinkCard compact />
      </Card>

      {msg && <div style={{ fontSize: 13, color: msg.ok ? THEME.green : THEME.rose, background: msg.ok ? THEME.greenBg : THEME.roseBg, padding: "10px 14px", borderRadius: 12 }}>{msg.ok ? <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> : null}{msg.text}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={test} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Send size={14} /> Sinov xabari</Button>
        <Button onClick={save} disabled={busy} data-testid="paint-settings-save">{busy ? "Saqlanmoqda…" : "Saqlash"}</Button>
      </div>
    </div>
  );
}
