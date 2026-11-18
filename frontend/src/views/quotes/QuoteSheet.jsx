// QuoteSheet.jsx — «Smeta / Buyurtma» (138–140-eskizlar, C varianti): pastdan suzib chiqadigan panel.
// Kompyuterda: chapda pozitsiyalar (jadval qatorlari, m² qatorida «Detallar» ochiladi), o'ngda xulosa
// (yo'nalish, dollar kursi, turlar bo'yicha summa, jami, avans, qarz, tugmalar). Telefonda: kartalar ro'yxati,
// qator bosilsa pastdan tahrir varag'i; pastda doim jami, avans va tugmalar.
// Hisob — lib/quoteCalc.js (server bilan aynan bir xil kod); server baribir qayta hisoblaydi.
// Mijozga hech narsa ketmaydi. Avans foizdan kam bo'lsa: rahbar o'zi ochadi, xodim — rahbarga Telegram so'rovi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, FileText, Layers, Loader2, Package, PenTool, Plus, Printer, Save, Scissors, Send, Trash2, Wrench, X } from "lucide-react";
import { THEME } from "../../theme.js";
import { useIsMobile } from "../../components/ui.jsx";
import { useBackToClose } from "../../lib/history.js";
import { useLine } from "../../lib/lines.js";
import { computeQuote, KIND_LABEL, KINDS } from "../../lib/quoteCalc.js";
import { quoteToRows } from "../../lib/quoteLegacy.js";
import { convertQuote, createQuote, decideQuoteRequest, requestQuoteOrder, saveQuote } from "../../storage.js";
import { useSales } from "./useSales.js";

const rid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/[ ,]/g, " ");
const fmtUsd = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",");
const fmtArea = (n) => String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ",");
const digits = (v) => String(v || "").replace(/[^\d]/g, "");
const decimal = (v) => String(v || "").replace(/[^\d.,]/g, "").replace(/,/g, ".").replace(/(\..*)\./g, "$1");
const KIND_ICON = { material: Layers, pechat: Printer, ish: Scissors, montaj: Wrench, dizayn: PenTool };
const kindColor = (k) => ({
  material: [THEME.blue, THEME.blueBg], pechat: [THEME.cyan || "#0E7490", THEME.cyanBg || "#E0F4F8"], ish: [THEME.violet, THEME.violetSoft || THEME.chip],
  montaj: [THEME.amber, THEME.amberBg], dizayn: [THEME.green, THEME.greenBg],
}[k]);
// Yangi qator: tur bo'yicha odatiy hisob usuli
const DEFAULT_CALC = { material: "m2", pechat: "m2", ish: "pcs", montaj: "lump", dizayn: "lump" };
function newRow(kind, rows) {
  const r = { id: rid(), kind, name: "", calc: DEFAULT_CALC[kind], cur: "uzs", price: "" };
  if (r.calc === "pcs") r.qty = "1";
  if (r.calc === "m2") {
    // Pechat — oxirgi o'z o'lchamli m² qatoridan (material) maydon oladi
    const src = kind === "pechat" ? [...(rows || [])].reverse().find((x) => x.calc === "m2" && x.parts) : null;
    if (src) r.areaFrom = src.id; else r.parts = [{ w: "", h: "", n: "1" }];
  }
  return r;
}
// Qator summasi (alohida): «… qatordan» bo'lsa — manbasi bilan birga hisoblanadi
function rowCalc(row, rows, rate) {
  const src = row.calc === "m2" && row.areaFrom ? rows.find((x) => x.id === row.areaFrom) : null;
  const r = computeQuote(src ? [src, row] : [row], rate || 0);
  if (r.error) return null;
  return r.items[r.items.length - 1];
}

export function QuoteSheet({ lead = null, prefill = null, payment = null, currentUser, isAdmin, customers = [], onClose, onSaved, onConverted, onRequested }) {
  const isMobile = useIsMobile();
  const sales = useSales();
  const lineCtx = useLine();
  const [shown, setShown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r); }, []);
  const close = useCallback(() => { setShown(false); setTimeout(onClose, 220); }, [onClose]);
  useBackToClose(true, close);

  const q = lead?.quote?.status === "open" ? lead.quote : null;
  const pending = q?.request?.status === "pending" ? q.request : null;
  const rejected = q?.request?.status === "rejected" ? q.request : null;
  const init = useMemo(() => (q ? quoteToRows(q) : { rows: prefill?.rows || [], rate: 0 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const firstRows = useMemo(() => (init.rows.length ? init.rows : [newRow("material", [])]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(firstRows);
  // Yangi smetada birinchi (material) qatorning «Detallar»i ochiq turadi
  const [open, setOpen] = useState(() => new Set(init.rows.length ? [] : [firstRows[0].id]));
  const [editId, setEditId] = useState(null); // telefon: tahrir varag'i
  const [customer, setCustomer] = useState(lead?.customer || prefill?.customer || "");
  const [phone, setPhone] = useState(lead?.phone || prefill?.phone || "");
  const fixedLine = !lineCtx.canSwitch ? lineCtx.line : null;
  const [line, setLine] = useState(fixedLine || q?.subcategory || lead?.line || (lineCtx.line === "UVONYX" ? "UVONYX" : "UVIXPRINT"));
  // Kurs: Markaziy bank (bugungi) · qo'lda · smetadagi (smeta oldin saqlangan va kurs farq qilsa)
  const fx = sales.fx || null;
  const todayRate = fx?.cbu?.rate || fx?.rate || 0;
  const oldRate = init.rate || 0;
  const [rateMode, setRateMode] = useState(q?.rateSrc === "manual" && oldRate ? "manual" : "cbu");
  const [manualRate, setManualRate] = useState(q?.rateSrc === "manual" && oldRate ? String(oldRate) : "");
  const rate = rateMode === "manual" ? Number(decimal(manualRate)) || 0 : rateMode === "quote" ? oldRate : todayRate;
  const [adv, setAdv] = useState(payment ? String(Math.round(payment.amount)) : "");
  const [payType, setPayType] = useState(payment?.paymentType || "naqd");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [confirmForce, setConfirmForce] = useState(false);
  const firstNameRef = useRef(null);

  const usdUsed = rows.some((r) => r.cur === "usd");
  const calc = useMemo(() => computeQuote(rows, rate), [rows, rate]);
  const rowTotals = useMemo(() => new Map(rows.map((r) => [r.id, rowCalc(r, rows, rate)])), [rows, rate]);
  const total = calc.error ? null : calc.total;
  const byKind = useMemo(() => KINDS.map((k) => [k, rows.filter((r) => r.kind === k).reduce((s, r) => s + (rowTotals.get(r.id)?.total || 0), 0)]).filter(([, v]) => v > 0), [rows, rowTotals]);
  const advNum = Number(digits(adv)) || 0;
  const pct = sales.advancePct ?? 50;
  const need = total ? Math.ceil((total * pct) / 100) : 0;
  const short = total != null && advNum < need;
  const over = total != null && advNum > total;
  const locked = !!pending;

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !confirmForce && !editId) { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [close, confirmForce, editId]);

  const upd = (id, patch) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  function setCalcOf(r, c) {
    if (c === r.calc) return;
    const patch = { calc: c, parts: undefined, areaFrom: undefined, qty: undefined };
    if (c === "pcs") patch.qty = r.qty || "1";
    if (c === "m2") patch.parts = [{ w: "", h: "", n: "1" }];
    upd(r.id, patch);
    if (c === "m2") setOpen((s) => new Set([...s, r.id]));
  }
  function setKindOf(r, k) { upd(r.id, { kind: k }); }
  function remove(id) {
    setRows((cur) => cur.filter((r) => r.id !== id).map((r) => (r.areaFrom === id ? { ...r, areaFrom: undefined, parts: [{ w: "", h: "", n: "1" }] } : r)));
    if (editId === id) setEditId(null);
  }
  function add(kind) {
    const r = newRow(kind, rows);
    setRows((cur) => [...cur, r]);
    if (isMobile) setEditId(r.id);
    else if (r.calc === "m2" && r.parts) setOpen((s) => new Set([...s, r.id]));
  }
  const body = () => ({
    leadId: lead?.id || undefined, customer: customer.trim(), phone: phone.trim(), manager: lead?.manager || currentUser?.name || "",
    subcategory: line, items: rows, rate: usdUsed ? rate : undefined, rateSrc: rateMode === "manual" ? "manual" : "cbu",
    payments: advNum > 0 ? [{ amount: advNum, paymentType: payType }] : [],
  });
  function check() {
    if (!lead && !customer.trim()) { setErr("Mijoz nomini kiriting"); return false; }
    if (calc.error) { setErr(calc.error); return false; }
    if (over) { setErr("Avans jami summadan ko'p"); return false; }
    setErr("");
    return true;
  }
  async function run(kind, fn) {
    setBusy(kind); setErr("");
    try { await fn(); } catch (e) {
      if (e.data?.error === "advance_required" && e.data.canForce) setConfirmForce(true);
      else setErr(e.message);
    } finally { setBusy(""); }
  }
  const saveDraft = () => { if (!check()) return; run("save", async () => { const r = lead ? await saveQuote(lead.id, body()) : await createQuote(body()); onSaved?.(r.lead); close(); }); };
  const create = (force = false) => {
    if (!check()) return;
    if (short && !force) { if (isAdmin) { setConfirmForce(true); return; } return run("req", async () => { const r = await requestQuoteOrder(body()); onRequested?.(r.lead); close(); }); }
    run("order", async () => { const r = await convertQuote({ ...body(), force }); setConfirmForce(false); onConverted?.(r); close(); });
  };
  const decide = (action) => run(action, async () => { const r = await decideQuoteRequest(pending.id, action); if (r.order) onConverted?.(r); else onSaved?.(r.lead || null); close(); });

  // ---------- kichik qismlar ----------
  const inp = (extra = {}) => ({ height: isMobile ? 42 : 34, boxSizing: "border-box", padding: "0 10px", border: `1px solid ${THEME.border}`, borderRadius: 8, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: isMobile ? 16 : 13.5, minWidth: 0, ...extra });
  const seg = (opts, val, onPick, testid, small) => (
    <span role="radiogroup" data-testid={testid} style={{ display: "inline-flex", background: THEME.chip, borderRadius: 8, padding: 2, gap: 2, flexShrink: 0 }}>
      {opts.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={val === v} disabled={locked} onClick={() => onPick(v)} data-v={v}
          style={{ height: small ? 26 : isMobile ? 34 : 28, padding: `0 ${small ? 7 : 9}px`, border: 0, borderRadius: 6, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: locked ? "default" : "pointer",
            background: val === v ? THEME.card : "transparent", color: val === v ? THEME.text : THEME.muted, boxShadow: val === v ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{label}</button>
      ))}
    </span>
  );
  const KindTag = ({ r }) => {
    const [c, bg] = kindColor(r.kind); const Ic = KIND_ICON[r.kind];
    return (
      <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 8px", borderRadius: 7, background: bg, color: c, fontSize: 12.5, fontWeight: 600, flexShrink: 0, cursor: locked ? "default" : "pointer" }}>
        <Ic size={13} />{KIND_LABEL[r.kind]}
        <select value={r.kind} disabled={locked} onChange={(e) => setKindOf(r, e.target.value)} aria-label="Turi" data-testid="qs-kind"
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
      </label>
    );
  };
  const curSeg = (r) => seg([["uzs", "so'm"], ["usd", "$"]], r.cur, (v) => upd(r.id, { cur: v }), "qs-cur", true);
  const priceInput = (r, w) => (
    <input value={r.cur === "usd" ? r.price : r.price ? fmt(r.price) : ""} disabled={locked} inputMode="decimal" placeholder={r.calc === "lump" ? "Summa" : "Narx"} aria-label="Narx" data-testid="qs-price"
      onChange={(e) => upd(r.id, { price: r.cur === "usd" ? decimal(e.target.value) : digits(e.target.value) })} style={inp({ width: w, textAlign: "right" })} />
  );
  const m2Sources = (r) => rows.filter((x) => x.id !== r.id && x.calc === "m2" && x.parts);
  const areaLabel = (r) => {
    const t = rowTotals.get(r.id);
    if (r.areaFrom) { const i = rows.findIndex((x) => x.id === r.areaFrom); return `${t ? fmtArea(t.area) : "—"} m² — ${i + 1}-qatordan`; }
    const n = (r.parts || []).length;
    return t ? `${fmtArea(t.area)} m²${n > 1 ? ` · ${n} xil detal` : ""}` : "O'lcham kiriting";
  };
  // Detallar (m²): eni × bo'yi × soni, har biri uchun m²; yoki boshqa qatordan maydon
  const details = (r) => {
    const srcs = m2Sources(r);
    const setPart = (i, patch) => upd(r.id, { parts: r.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
    return (
      <div data-testid="qs-details" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: THEME.muted }}>{r.areaFrom ? "MAYDON" : "DETALLAR (mm) — eni × bo'yi × soni"}</span>
          {srcs.length > 0 && (
            <select value={r.areaFrom || ""} disabled={locked} data-testid="qs-area-from" aria-label="Maydon qayerdan"
              onChange={(e) => upd(r.id, e.target.value ? { areaFrom: e.target.value, parts: undefined } : { areaFrom: undefined, parts: [{ w: "", h: "", n: "1" }] })}
              style={inp({ height: 30, fontSize: 12.5, width: "auto" })}>
              <option value="">O'z o'lchami</option>
              {srcs.map((x) => <option key={x.id} value={x.id}>{rows.indexOf(x) + 1}-qatordan ({x.name || KIND_LABEL[x.kind]})</option>)}
            </select>
          )}
        </div>
        {!r.areaFrom && (r.parts || []).map((p, i) => {
          const a = (Number(digits(p.w)) * Number(digits(p.h)) * (Number(digits(p.n)) || 1)) / 1e6;
          return (
            <div key={i} data-part="" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 10px 1fr 10px 58px 62px 22px" : "20px 96px 10px 96px 10px 72px 1fr 22px", gap: 5, alignItems: "center" }}>
              {!isMobile && <span style={{ color: THEME.muted, fontSize: 12.5 }}>{i + 1}</span>}
              <input value={p.w} disabled={locked} inputMode="numeric" placeholder="Eni" aria-label="Eni, mm" data-testid="qs-w" onChange={(e) => setPart(i, { w: digits(e.target.value) })} style={inp({ textAlign: "right" })} />
              <span style={{ color: THEME.muted, textAlign: "center" }}>×</span>
              <input value={p.h} disabled={locked} inputMode="numeric" placeholder="Bo'yi" aria-label="Bo'yi, mm" data-testid="qs-h" onChange={(e) => setPart(i, { h: digits(e.target.value) })} style={inp({ textAlign: "right" })} />
              <span style={{ color: THEME.muted, textAlign: "center" }}>×</span>
              <input value={p.n} disabled={locked} inputMode="numeric" placeholder="1" aria-label="Soni" data-testid="qs-n" onChange={(e) => setPart(i, { n: digits(e.target.value) })} style={inp({ textAlign: "right" })} />
              <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600, color: a ? THEME.text : THEME.muted, whiteSpace: "nowrap" }}>{a ? `${fmtArea(Math.round(a * 100) / 100)} m²` : "—"}</span>
              <button type="button" disabled={locked || r.parts.length < 2} onClick={() => upd(r.id, { parts: r.parts.filter((_, j) => j !== i) })} aria-label="Detalni olib tashlash"
                style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 0, opacity: r.parts.length < 2 ? 0.3 : 1, display: "grid", placeItems: "center" }}><X size={14} /></button>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!r.areaFrom ? (
            <button type="button" disabled={locked} data-testid="qs-add-part" onClick={() => upd(r.id, { parts: [...(r.parts || []), { w: "", h: "", n: "1" }] })}
              style={{ border: 0, background: "none", color: THEME.blue, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}><Plus size={14} />Detal qo'shish</button>
          ) : <span />}
          {rowTotals.get(r.id) && <span data-testid="qs-area-sum" style={{ fontSize: 12.5, color: THEME.muted }}>Jami maydon: <b style={{ color: THEME.text }}>{fmtArea(rowTotals.get(r.id).area)} m²</b></span>}
        </div>
      </div>
    );
  };
  const sumCell = (r) => {
    const t = rowTotals.get(r.id);
    if (!t) return <span style={{ color: THEME.muted }}>—</span>;
    return (
      <span style={{ textAlign: "right", lineHeight: 1.2 }}>
        <b style={{ fontSize: 14 }} data-testid="qs-row-total">{fmt(t.total)}</b>
        {r.cur === "usd" && <div style={{ fontSize: 11.5, color: THEME.muted }}>$ {fmtUsd(t.totalUsd)}</div>}
      </span>
    );
  };
  const calcSeg = (r) => seg([["m2", "m²"], ["pcs", "dona"], ["lump", "summa"]], r.calc, (v) => setCalcOf(r, v), "qs-calc");

  // ---------- kompyuter: qator ----------
  const deskRow = (r, i) => {
    const isOpen = open.has(r.id) && r.calc === "m2";
    return (
      <div key={r.id} data-testid="qs-row" data-kind={r.kind} style={{ borderTop: i ? `1px solid ${THEME.border}` : 0, padding: isOpen ? "10px 12px" : "8px 0", margin: isOpen ? "6px -12px" : 0, border: isOpen ? `1.5px solid ${THEME.blue}` : undefined, borderRadius: isOpen ? 12 : 0, background: isOpen ? THEME.card : "transparent" }}>
        <div style={{ display: "grid", gridTemplateColumns: "22px 108px minmax(80px,1fr) 150px 170px 196px 100px 22px", gap: 8, alignItems: "center" }}>
          <span style={{ color: THEME.muted, fontSize: 13, textAlign: "center" }}>{i + 1}</span>
          <KindTag r={r} />
          <input ref={i === 0 ? firstNameRef : undefined} value={r.name} disabled={locked} placeholder={KIND_LABEL[r.kind]} aria-label="Nomi" data-testid="qs-name" onChange={(e) => upd(r.id, { name: e.target.value })} style={inp({ width: "100%" })} />
          {calcSeg(r)}
          <span>
            {r.calc === "m2" && (
              <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} data-testid="qs-area-btn"
                style={{ ...inp({ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 6, cursor: "pointer" }) }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: rowTotals.get(r.id) ? 600 : 400, color: rowTotals.get(r.id) ? THEME.text : THEME.muted }}>{areaLabel(r)}</span>
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            {r.calc === "pcs" && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input value={r.qty || ""} disabled={locked} inputMode="numeric" aria-label="Soni" data-testid="qs-qty" onChange={(e) => upd(r.id, { qty: digits(e.target.value) })} style={inp({ width: "100%", textAlign: "right" })} />
                <span style={{ color: THEME.muted, fontSize: 12.5 }}>dona</span>
              </span>
            )}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{r.calc !== "lump" && <span style={{ color: THEME.muted }}>×</span>}{priceInput(r, "100%")}{curSeg(r)}</span>
          {sumCell(r)}
          <button type="button" disabled={locked} onClick={() => remove(r.id)} aria-label="Qatorni o'chirish" data-testid="qs-del" style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}><Trash2 size={15} /></button>
        </div>
        {isOpen && <div style={{ marginTop: 10, marginLeft: 30 }}>{details(r)}</div>}
      </div>
    );
  };
  const addBar = (
    <div style={{ display: isMobile ? "grid" : "flex", gridTemplateColumns: "1fr 1fr", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }} data-testid="qs-add">
      {!isMobile && <span style={{ fontSize: 13, color: THEME.muted, marginRight: 2, display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={14} />Qo'shish:</span>}
      {KINDS.map((k) => { const [c] = kindColor(k); const Ic = KIND_ICON[k]; return (
        <button key={k} type="button" disabled={locked} onClick={() => add(k)} data-add={k}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: isMobile ? 40 : 30, padding: "0 10px", borderRadius: isMobile ? 10 : 8, border: `1px dashed ${c}88`, background: "transparent", color: c, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {isMobile ? <Plus size={13} /> : <Ic size={13} />}{KIND_LABEL[k]}
        </button>
      ); })}
    </div>
  );

  // ---------- xulosa (o'ng ustun / telefonda pastda) ----------
  const lineSw = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13, color: THEME.muted }}>Yo'nalish</span>
      {fixedLine ? <b style={{ fontSize: 13 }}>{fixedLine === "UVONYX" ? "ONYX" : "UVIX"}</b> : seg([["UVIXPRINT", "UVIX"], ["UVONYX", "ONYX"]], line, setLine, "qs-line")}
    </div>
  );
  const rateBox = usdUsed && (
    <div data-testid="qs-rate" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Dollar kursi</span>
        {seg([["cbu", fx?.cbu ? "Markaziy bank" : "Sozlamadagi"], ["manual", "Qo'lda"], ...(oldRate && oldRate !== todayRate ? [["quote", "Smetadagi"]] : [])], rateMode, setRateMode, "qs-rate-mode")}
      </div>
      {rateMode === "manual"
        ? <input value={manualRate} disabled={locked} inputMode="decimal" placeholder="1 $ = ? so'm" aria-label="Kurs" data-testid="qs-rate-input" onChange={(e) => setManualRate(decimal(e.target.value))} style={inp({ width: "100%", textAlign: "right" })} />
        : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}><b style={{ fontSize: 17 }} data-testid="qs-rate-value">1 $ = {fmt(rate)} so'm</b><span style={{ fontSize: 12, color: THEME.muted }}>{rateMode === "quote" ? "smeta saqlangan kun" : fx?.cbu ? `cbu.uz · ${(fx.cbu.date || "").split("-").reverse().join(".")}` : "Sozlamalar"}</span></div>}
      {oldRate > 0 && oldRate !== todayRate && (
        <div data-testid="qs-rate-diff" style={{ fontSize: 12, color: THEME.amberText || THEME.amber, background: THEME.amberBg, borderRadius: 8, padding: "6px 8px", lineHeight: 1.4 }}>
          Smetada kurs {fmt(oldRate)} edi, bugun {fmt(todayRate)}. Qaysi biri bilan hisoblashni tanlang.
        </div>
      )}
      <div style={{ fontSize: 11.5, color: THEME.muted, lineHeight: 1.4 }}>Kurs buyurtmaga yoziladi — keyin o'zgarsa ham summa o'zgarmaydi. $ summa 1 000 so'mgacha yaxlitlanadi.</div>
    </div>
  );
  const payBox = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ color: THEME.muted, fontSize: 14 }}>Jami</span>
        <b data-testid="quote-total" style={{ fontSize: isMobile ? 20 : 21 }}>{total != null ? `${fmt(total)} so'm` : "—"}</b>
      </div>
      {calc.usd && !calc.error && <div style={{ textAlign: "right", fontSize: 12, color: THEME.muted, marginTop: -6 }}>shundan $ {fmtUsd(calc.totalUsd)}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: THEME.muted, width: 52, flexShrink: 0 }}>Avans</span>
        <input value={adv ? fmt(adv) : ""} disabled={locked || payment?.locked} inputMode="numeric" placeholder="0" aria-label="Avans" data-testid="qs-adv" onChange={(e) => setAdv(digits(e.target.value))} style={inp({ flex: 1, textAlign: "right" })} />
        {payment?.locked ? <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.muted }}>Karta</span> : seg([["naqd", "Naqd"], ["karta", "Karta"], ["bank", "Bank"]], payType, setPayType, "qs-paytype")}
      </div>
      {total != null && !short && !over && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: THEME.muted }}>Qoldiq — mijoz qarzi</span><b data-testid="qs-debt" style={{ color: total - advNum > 0 ? THEME.rose : THEME.green }}>{fmt(total - advNum)} so'm</b></div>
          {total - advNum > 0 && <div style={{ fontSize: 11.5, color: THEME.muted, lineHeight: 1.4 }}>Buyurtma qarzi bo'lib turadi; keyingi to'lovlar shundan ayiriladi.</div>}
        </>
      )}
      {over && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose }}>Avans jami summadan ko'p</div>}
      {short && !locked && (
        <div data-testid="qs-short" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: THEME.amberBg, color: THEME.amberText || THEME.amber, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, lineHeight: 1.4 }}>
          <Send size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Avans kamida <b>{fmt(need)} so'm</b> ({pct}%). {isAdmin ? "Kam bo'lsa ham — tasdiqlab ochasiz." : "Kam bo'lsa — rahbar Telegram'da tasdiqlaydi, tasdiqlangach buyurtma o'zi ochiladi."}</span>
        </div>
      )}
    </div>
  );
  const btn = (primary, color) => ({ height: isMobile ? 46 : 40, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
    border: primary ? 0 : `1px solid ${THEME.border}`, background: primary ? color || THEME.blue : THEME.card, color: primary ? "#fff" : THEME.text });
  const spin = <Loader2 size={15} className="uvix-spin" />;
  const actions = pending ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div data-testid="qs-pending" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: THEME.amberBg, color: THEME.amberText || THEME.amber, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, lineHeight: 1.4 }}>
        <Send size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>Rahbar tasdig'ini kutmoqda</b> — {pending.by} so'radi. Tasdiqlansa buyurtma o'zi ochiladi.</span>
      </div>
      {isAdmin ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btn(false)} onClick={() => decide("reject")} disabled={!!busy} data-testid="qs-reject">{busy === "reject" ? spin : <X size={15} />}Rad etish</button>
          <button type="button" style={btn(true, THEME.green)} onClick={() => decide("approve")} disabled={!!busy} data-testid="qs-approve">{busy === "approve" ? spin : <Check size={15} />}Tasdiqlash</button>
        </div>
      ) : <button type="button" style={btn(false)} onClick={() => decide("cancel")} disabled={!!busy} data-testid="qs-cancel-req">So'rovni bekor qilish</button>}
    </div>
  ) : (
    <div style={{ display: isMobile ? "flex" : "flex", flexDirection: isMobile ? "row-reverse" : "column", gap: 8 }}>
      {short && !isAdmin
        ? <button type="button" style={btn(true, THEME.amber)} onClick={() => create()} disabled={!!busy} data-testid="qs-request">{busy === "req" ? spin : <Send size={15} />}{isMobile ? "Tasdiqqa" : "Rahbarga tasdiqqa yuborish"}</button>
        : <button type="button" style={btn(true)} onClick={() => create()} disabled={!!busy} data-testid="qs-create">{busy === "order" ? spin : <Package size={15} />}{isMobile ? "Buyurtma" : "Buyurtma yaratish"}</button>}
      {!payment && <button type="button" style={btn(false)} onClick={saveDraft} disabled={!!busy} data-testid="qs-save">{busy === "save" ? spin : <Save size={15} />}{isMobile ? "Smeta" : "Smeta qilib saqlash"}</button>}
    </div>
  );
  const errBox = err && <div role="alert" data-testid="qs-error" style={{ fontSize: 13, color: THEME.rose, background: THEME.roseBg, borderRadius: 8, padding: "8px 10px" }}>{err}</div>;
  const rejectedBox = rejected && <div data-testid="qs-rejected" style={{ fontSize: 12.5, color: THEME.rose, background: THEME.roseBg, borderRadius: 8, padding: "8px 10px" }}>Rahbar avanssiz ochishni rad etdi ({rejected.decidedBy}). Avans oling yoki smetani o'zgartiring.</div>;
  const custFields = !lead && (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 200px", gap: 8 }}>
      <input value={customer} onChange={(e) => setCustomer(e.target.value)} list="uvix-qs-cust" placeholder="Mijoz ismi" aria-label="Mijoz" data-testid="quote-customer" style={inp({ width: "100%" })} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Telefon (ixtiyoriy)" aria-label="Telefon" data-testid="qs-phone" style={inp({ width: "100%" })} />
      <datalist id="uvix-qs-cust">{(customers || []).slice(0, 300).map((c) => <option key={c.name} value={c.name} />)}</datalist>
    </div>
  );
  const title = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: isMobile ? 18 : 19, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><FileText size={18} style={{ color: THEME.muted }} />Smeta / Buyurtma{q?.no ? <span style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>{q.no}</span> : null}</div>
        {lead && <div style={{ fontSize: 13, color: THEME.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.customer}{lead.phone ? ` · ${lead.phone}` : ""}{lead.jobTitle ? ` · ${lead.jobTitle}` : ""}</div>}
        {payment && <div style={{ fontSize: 13, color: THEME.green, marginTop: 2, fontWeight: 600 }}>Kartaga tushgan {fmt(payment.amount)} so'm — avans bo'ladi</div>}
      </div>
      {isMobile && <button type="button" onClick={close} aria-label="Yopish" data-testid="qs-close" style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 4, display: "flex" }}><X size={20} /></button>}
    </div>
  );

  // ---------- telefon: qator kartasi va tahrir varag'i ----------
  const phoneCard = (r, i) => {
    const t = rowTotals.get(r.id);
    const sub = r.calc === "m2" ? `${areaLabel(r)}${r.price ? ` × ${r.cur === "usd" ? `$${r.price}` : fmt(r.price)}` : ""}` : r.calc === "pcs" ? `${r.qty || 0} dona × ${r.price ? (r.cur === "usd" ? `$${r.price}` : fmt(r.price)) : "—"}` : "kelishilgan summa";
    return (
      <button key={r.id} type="button" onClick={() => !locked && setEditId(r.id)} data-testid="qs-row" data-kind={r.kind}
        style={{ textAlign: "left", border: `1px solid ${t ? THEME.border : THEME.amber}`, borderRadius: 12, padding: 10, background: THEME.card, color: THEME.text, fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 8px", borderRadius: 7, background: kindColor(r.kind)[1], color: kindColor(r.kind)[0], fontSize: 12.5, fontWeight: 600 }}>{(() => { const Ic = KIND_ICON[r.kind]; return <Ic size={13} />; })()}{KIND_LABEL[r.kind]}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || `${i + 1}-qator`}</span>
          <b style={{ fontSize: 14 }}>{t ? fmt(t.total) : "—"}</b>
        </span>
        <span style={{ fontSize: 12.5, color: THEME.muted }}>{t ? sub : "To'ldiring — bosing"}</span>
      </button>
    );
  };
  const editRow = editId && rows.find((r) => r.id === editId);
  const editSheet = editRow && (
    <div style={{ position: "fixed", inset: 0, zIndex: 230 }} data-testid="qs-edit">
      <div onClick={() => setEditId(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "92vh", overflowY: "auto", background: THEME.card, borderRadius: "18px 18px 0 0", padding: "12px 14px calc(16px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: THEME.border, alignSelf: "center" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {KINDS.map((k) => { const [c, bg] = kindColor(k); const on = editRow.kind === k; const Ic = KIND_ICON[k]; return (
            <button key={k} type="button" onClick={() => setKindOf(editRow, k)} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 10px", borderRadius: 8, border: on ? 0 : `1px solid ${THEME.border}`, background: on ? bg : THEME.card, color: on ? c : THEME.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}><Ic size={13} />{KIND_LABEL[k]}</button>
          ); })}
        </div>
        <input value={editRow.name} placeholder={`Nomi (${KIND_LABEL[editRow.kind]})`} aria-label="Nomi" data-testid="qs-name" onChange={(e) => upd(editRow.id, { name: e.target.value })} style={inp({ width: "100%" })} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>{calcSeg(editRow)}{curSeg(editRow)}</div>
        {editRow.calc === "m2" && details(editRow)}
        {editRow.calc === "pcs" && <div><div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 5 }}>Soni</div><input value={editRow.qty || ""} inputMode="numeric" data-testid="qs-qty" onChange={(e) => upd(editRow.id, { qty: digits(e.target.value) })} style={inp({ width: "100%", textAlign: "right" })} /></div>}
        <div><div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 5 }}>{editRow.calc === "lump" ? "Summa" : editRow.calc === "m2" ? "Narx, 1 m²" : "Narx, 1 dona"}{editRow.cur === "usd" ? " ($)" : " (so'm)"}</div>{priceInput(editRow, "100%")}</div>
        {(() => { const t = rowTotals.get(editRow.id); return (
          <div style={{ background: THEME.surface, borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: THEME.muted }}>{t && editRow.cur === "usd" ? `$ ${fmtUsd(t.totalUsd)} · kurs ${fmt(rate)}` : t && editRow.calc === "m2" ? `${fmtArea(t.area)} m²` : ""}</span>
            <b style={{ fontSize: 18 }}>{t ? `${fmt(t.total)} so'm` : "—"}</b>
          </div>
        ); })()}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => remove(editRow.id)} style={{ ...btn(false), width: "auto", padding: "0 14px" }} data-testid="qs-del"><Trash2 size={15} />O'chirish</button>
          <button type="button" onClick={() => setEditId(null)} style={btn(true)} data-testid="qs-edit-done"><Check size={15} />Tayyor</button>
        </div>
      </div>
    </div>
  );

  const confirmBox = confirmForce && (
    <div style={{ position: "fixed", inset: 0, zIndex: 240, display: "grid", placeItems: "center", padding: 16 }} data-testid="qs-force">
      <div onClick={() => setConfirmForce(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} />
      <div role="alertdialog" aria-label="Avans kam" style={{ position: "relative", width: 380, maxWidth: "100%", background: THEME.card, color: THEME.text, borderRadius: 14, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Avans kam</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>Avans {fmt(advNum)} so'm — kerakli {fmt(need)} so'mdan ({pct}%) kam. Baribir buyurtma ochilsinmi?</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={{ ...btn(false), width: "auto", padding: "0 14px" }} onClick={() => setConfirmForce(false)}>Bekor qilish</button>
          <button type="button" style={{ ...btn(true), width: "auto", padding: "0 14px" }} onClick={() => create(true)} disabled={!!busy} data-testid="qs-force-ok">{busy === "order" ? spin : <Package size={15} />}Ha, ochilsin</button>
        </div>
      </div>
    </div>
  );

  const summary = (
    <>
      {lineSw}
      {rateBox}
      {byKind.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13.5 }} data-testid="qs-bykind">
          {byKind.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: THEME.muted }}>{KIND_LABEL[k]}</span><span>{fmt(v)}</span></div>)}
        </div>
      )}
      <div style={{ height: 1, background: THEME.border }} />
      {payBox}
    </>
  );

  return (
    <>
      <div className={`uvix-qs-scrim${shown ? " is-in" : ""}`} onClick={close} />
      {!isMobile && <button type="button" onClick={close} aria-label="Yopish" data-testid="qs-close" className={`uvix-qs-x${shown ? " is-in" : ""}`}><X size={19} /></button>}
      <section className={`uvix-qs${isMobile ? " is-phone" : ""}${shown ? " is-in" : ""}`} role="dialog" aria-modal="true" aria-label="Smeta / Buyurtma" data-testid="quote-sheet2">
        {isMobile ? (
          <>
            <div style={{ padding: "12px 14px 10px", background: THEME.card, borderBottom: `1px solid ${THEME.border}`, display: "flex", flexDirection: "column", gap: 10 }}>{title}{custFields}{lineSw}</div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {rejectedBox}
              {rows.map(phoneCard)}
              {!locked && addBar}
              {rateBox}
              {byKind.length > 1 && <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, padding: "4px 2px" }}>{byKind.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: THEME.muted }}>{KIND_LABEL[k]}</span><span>{fmt(v)}</span></div>)}</div>}
            </div>
            <div style={{ padding: "12px 14px calc(12px + env(safe-area-inset-bottom, 0px))", background: THEME.card, borderTop: `1px solid ${THEME.border}`, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 -6px 20px rgba(0,0,0,.05)" }}>{payBox}{errBox}{actions}</div>
            {editSheet}
          </>
        ) : (
          <>
            <div className="uvix-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
              {title}
              {custFields}
              {rejectedBox}
              <div>{rows.map(deskRow)}</div>
              {!locked && addBar}
              <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: "auto", paddingTop: 12 }}>m² — «Detallar»da eni × bo'yi × soni (mm) yoziladi, maydon o'zi hisoblanadi. Summa har doim formula bilan. Mijozga hech narsa ketmaydi.</div>
            </div>
            <div className="uvix-scroll" style={{ width: 380, flexShrink: 0, borderLeft: `1px solid ${THEME.border}`, background: THEME.surface, padding: 22, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: THEME.muted }}>XULOSA</div>
              {summary}
              {errBox}
              <div style={{ marginTop: "auto" }}>{actions}</div>
            </div>
          </>
        )}
      </section>
      {confirmBox}
      <style>{QS_CSS()}</style>
    </>
  );
}

const QS_CSS = () => `
  .uvix-qs-scrim { position: fixed; inset: 0; z-index: 210; background: rgba(0,0,0,0); transition: background .22s ease; }
  .uvix-qs-scrim.is-in { background: rgba(0,0,0,${THEME.isDark ? 0.55 : 0.38}); }
  .uvix-qs { position: fixed; z-index: 211; left: 64px; right: 16px; top: 24px; bottom: 0; border-radius: 16px 16px 0 0; overflow: hidden;
    background: ${THEME.card}; color: ${THEME.text}; box-shadow: 0 -12px 48px rgba(0,0,0,.22); display: flex; font-family: ${THEME.font};
    transform: translateY(100%); transition: transform .3s cubic-bezier(.2,.8,.2,1); }
  .uvix-qs.is-in { transform: translateY(0); }
  .uvix-qs.is-phone { left: 0; right: 0; top: 0; border-radius: 0; flex-direction: column; background: ${THEME.surface}; padding-top: env(safe-area-inset-top, 0px); }
  .uvix-qs-x { position: fixed; z-index: 212; left: 14px; top: 34px; width: 38px; height: 38px; border-radius: 50%; border: 0; background: ${THEME.blue}; color: #fff; cursor: pointer;
    display: grid; place-items: center; box-shadow: 0 4px 14px rgba(0,0,0,.25); opacity: 0; transition: opacity .2s; }
  .uvix-qs-x.is-in { opacity: 1; }
  .uvix-qs input:disabled, .uvix-qs select:disabled { opacity: .75; }
  .uvix-spin { animation: uvix-spin 0.9s linear infinite; }
  @keyframes uvix-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .uvix-qs, .uvix-qs-scrim { transition: none; } }
`;
