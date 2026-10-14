import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Wallet, Download, FileBarChart2, FileText, Landmark, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Pagination, getIconBtn, getInputStyle, usePagination, useIsMobile, MobileRow } from "../../components/ui.jsx";
import { exportWorkbook, loadXLSX } from "../../lib/excel.js";
import { generateOrderNumber, orderBrakSum, orderDebt, orderTotalPaid } from "../../lib/finance.js";
import { fmt, money, todayStr, uid, usd, shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { OrderForm } from "./OrderForm.jsx";
import { PaymentsModal } from "./PaymentsModal.jsx";
import { buildCustomers, custKey } from "../../lib/customers.js";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";
import { OrderPanel } from "./OrderPanel.jsx";
import { Avatar } from "../../components/ui.jsx";
import { QuoteModal } from "../quotes/QuoteModal.jsx";
import { BatchPayModal } from "./BatchPayModal.jsx";
import { PROD_LABEL, PROD_STAGES, legacyLeadIndex, orderStage, prodColors, stageHint } from "../../lib/production.js";
import { assignOrderTask, setOrderStage } from "../../storage.js";

const VIEW_KEY = "uvix_orders_view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === "customers" ? "customers" : "list"; } catch { return "list"; } };
function StageChip({ stage, hint }) {
  if (!stage) return <span style={{ color: THEME.dim }}>—</span>;
  const c = prodColors(stage);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span data-stage={stage} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: 11, fontSize: 12, fontWeight: 600, color: c.color, background: c.bg, whiteSpace: "nowrap" }}>
        {stage === "delivered" ? "✓" : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />}{PROD_LABEL[stage]}
      </span>
      {hint && <span style={{ fontSize: 11.5, color: THEME.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</span>}
    </span>
  );
}
function StageBar({ counts }) {
  const total = PROD_STAGES.reduce((s, k) => s + (counts[k] || 0), 0);
  if (!total) return <span style={{ color: THEME.dim, fontSize: 12 }}>—</span>;
  const parts = PROD_STAGES.filter((k) => counts[k]);
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ display: "flex", gap: 2, height: 6 }}>{parts.map((k) => <span key={k} style={{ flex: counts[k], borderRadius: 3, background: k === "delivered" ? THEME.border2 : prodColors(k).color }} />)}</span>
      <span style={{ fontSize: 12, color: THEME.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{parts.map((k) => `${counts[k]} ${PROD_LABEL[k].toLowerCase()}`).join(" · ")}</span>
    </span>
  );
}

/* ---------------- ORDERS VIEW ---------------- */
export function OrdersView({ quickAddNonce, onQuickAddHandled, orders, allOrders, transactions, currentUser, isAdmin, categories, employees, settings, initialFilter, onAddSubcategory, onSaveOrder, onImportOrders, onDeleteOrder, onAddPayment, onDeletePayment, onUploadPhotos, onDeletePhoto, pendingLead, onPendingLeadHandled, onServerChange, showToast, leads, customerProfiles }) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null); // {edit} — faqat tahrirlash (yangi buyurtma smeta orqali)
  const [quote, setQuote] = useState(null); // {lead?} — «Yangi buyurtma» (smeta → to'lov → buyurtmalar)
  const [viewMode, setViewModeState] = useState(readView);
  const setViewMode = (v) => { setViewModeState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } };
  const [stageF, setStageF] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [batchFor, setBatchFor] = useState(null); // { name, orders }
  const [invoiceFor, setInvoiceFor] = useState(null);
  const invoiceCustomer = useMemo(() => {
    if (!invoiceFor) return null;
    const k = custKey(invoiceFor.customer);
    return buildCustomers(allOrders || orders, leads || [], customerProfiles || []).find((c) => c.keys.includes(k)) || null;
  }, [invoiceFor, allOrders, orders, leads, customerProfiles]);
  // Mijoz nomini tanlash/avto-to'ldirish uchun (faqat forma ochiqligida hisoblanadi)
  const customersAll = useMemo(() => buildCustomers(allOrders || orders, leads || [], customerProfiles || []), [allOrders, orders, leads, customerProfiles]);
  const customerList = customersAll;
  const custByKey = useMemo(() => { const m = new Map(); customersAll.forEach((c) => c.keys.forEach((k) => m.set(k, c))); return m; }, [customersAll]);
  const legacyIdx = useMemo(() => legacyLeadIndex(leads), [leads]);
  const empById = useMemo(() => new Map((employees || []).map((e) => [e.id, e])), [employees]);
  const stageOf = (o) => orderStage(o, legacyIdx);
  // Pastki menyudagi "+" tugmasidan kelinganda — formani darhol ochamiz
  useEffect(() => {
    if (!quickAddNonce) return;
    setQuote({});
    onQuickAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddNonce]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [paymentsFor, setPaymentsFor] = useState(null); // order object
  const [search, setSearch] = useState(initialFilter?.search || "");
  // Ctrl+K yoki boshqa bo'limdan qayta kelinganda filtrni yangilaymiz
  useEffect(() => {
    if (initialFilter?.search !== undefined) setSearch(initialFilter.search || "");
    if (initialFilter?.onlyDebt !== undefined) setOnlyDebt(!!initialFilter.onlyDebt);
  }, [initialFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pendingLead) setQuote({ lead: pendingLead });
  }, [pendingLead]);
  const [onlyDebt, setOnlyDebt] = useState(!!initialFilter?.onlyDebt);
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [line, setLine] = useState("all"); // UVIXPRINT / UVONYX bo'yicha ko'rinish filtri
  const [selectedId, setSelectedId] = useState(null); // o'ng paneldagi buyurtma (kompyuterda)
  const [toolsOpen, setToolsOpen] = useState(false);
  const [importErrors, setImportErrors] = useState(null);
  const fileInputRef = useRef(null);
  const byLine = line === "all" ? orders : orders.filter((o) => (o.subcategory || "") === line);
  const counts = useMemo(() => ({
    all: byLine.length,
    debt: byLine.filter((o) => orderDebt(o) > 0).length,
    paid: byLine.filter((o) => orderDebt(o) <= 0).length,
  }), [byLine]);
  const stageCounts = useMemo(() => { const m = {}; byLine.forEach((o) => { const st = orderStage(o, legacyIdx); if (st) m[st] = (m[st] || 0) + 1; }); return m; }, [byLine, legacyIdx]);
  const list = byLine
    .filter((o) => !stageF || stageOf(o) === stageF)
    .filter((o) => !onlyDebt || orderDebt(o) > 0)
    .filter((o) => !onlyPaid || orderDebt(o) <= 0)
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (o.customer || "").toLowerCase().includes(q) || (o.orderNumber || "").toLowerCase().includes(q) || (o.title || "").toLowerCase().includes(q) || (o.groupId || "").toLowerCase() === q;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.orderNumber).localeCompare(String(a.orderNumber))));
  // «Mijoz bo'yicha»: filtrdan o'tgan buyurtmalar mijoz kesimida (nomi birlashtirilganlar — bitta mijoz)
  const groups = useMemo(() => {
    const m = new Map();
    for (const o of list) {
      const c = custByKey.get(custKey(o.customer));
      const id = c?.id || `k:${custKey(o.customer)}`;
      let g = m.get(id);
      if (!g) { g = { id, name: c?.name || o.customer || "Noma'lum", phone: c?.phone || "", customer: c, orders: [] }; m.set(id, g); }
      g.orders.push(o);
    }
    const mine = new Set(orders.map((o) => o.id));
    return [...m.values()].map((g) => {
      const allMine = (g.customer?.orders || g.orders).filter((o) => mine.has(o.id) && !o.deletedAt);
      const st = {}; g.orders.forEach((o) => { const x = orderStage(o, legacyIdx); if (x) st[x] = (st[x] || 0) + 1; });
      return { ...g, stages: st, total: g.orders.reduce((s, o) => s + (o.agreementUzs || 0), 0), debt: allMine.reduce((s, o) => s + orderDebt(o), 0), payable: allMine, last: g.orders[0]?.date || "", manager: g.orders[0]?.manager || "" };
    }).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  }, [list, custByKey, orders, legacyIdx]);
  const customerMode = viewMode === "customers";
  const { page, setPage, totalPages, pageItems } = usePagination(list, [search, onlyDebt, onlyPaid, line, stageF, orders.length]);
  const gp = usePagination(groups, [search, onlyDebt, onlyPaid, line, stageF, orders.length]);
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function changeStage(o, st) { const r = await setOrderStage(o.id, st); await onServerChange?.({ orders: [r.order], lead: r.lead || undefined }); }
  async function assign(o, kind, id) { const r = await assignOrderTask(o.id, { kind, assigneeId: id }); await onServerChange?.({ orders: [r.order], lead: r.lead || undefined }); }
  const selected = !isMobile && selectedId ? orders.find((o) => o.id === selectedId) || null : null;
  const listSum = useMemo(() => list.reduce((sum, o) => sum + (o.agreementUzs || 0), 0), [list]);
  const selectedPhone = useMemo(() => {
    if (!selected) return "";
    const k = custKey(selected.customer);
    const c = buildCustomers(allOrders || orders, leads || [], customerProfiles || []).find((x) => x.keys.includes(k));
    return c?.phone || "";
  }, [selected?.id, selected?.customer, allOrders, orders, leads, customerProfiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportExcel() {
    exportWorkbook(list, [], categories, "Buyurtmalar", `UVIX_buyurtmalar_${todayStr()}.xlsx`);
  }

  async function downloadImportTemplate() {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const rows = [{
      "Sana": todayStr(), "Mijoz": "Namuna Mijoz", "Sub kategoriya": "UVIXPRINT", "Material turi": "Shisha",
      "Mas'ul menedjer": "", "Kv/m": 10, "1 kv/m narxi ($, ixtiyoriy)": 0, "USD kursi (ixtiyoriy)": 0,
      "Umumiy buyurtma summasi (so'm)": 5000000,
      "Kraska summasi (so'm)": 0, "Material summasi (so'm)": 0, "Avans (so'm)": 0, "To'lov turi (karta/naqd/bank)": "naqd",
      "Kommentariya": "",
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, "Buyurtmalar");
    XLSX.writeFile(wb, "UVIX_buyurtma_namunasi.xlsx");
  }

  function parseExcelDate(XLSX, val) {
    // Excel'dan kelgan Date obyektlari odatda UTC-asosli bo'ladi (XLSX kutubxonasi shunday hosil qiladi),
    // shuning uchun bu yerda getUTC* metodlari ishlatiladi — mahalliy vaqt bilan aralashtirilsa,
    // sana bir kun siljib ketishi mumkin edi.
    if (val instanceof Date) return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, "0")}-${String(val.getUTCDate()).padStart(2, "0")}`;
    if (typeof val === "number") {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    if (typeof val === "string" && val.trim()) {
      const m = val.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      return val.trim();
    }
    return todayStr();
  }
  function parseNum(v) {
    return parseInt(String(v ?? "0").replace(/[^\d]/g, ""), 10) || 0;
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await loadXLSX();
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const newOrders = [];
        const errors = [];
        rows.forEach((row, idx) => {
          const customer = String(row["Mijoz"] || "").trim();
          const agreementUzs = parseNum(row["Umumiy buyurtma summasi (so'm)"]);
          if (!customer || !agreementUzs) {
            errors.push(`${idx + 2}-qator: "Mijoz" yoki "Umumiy buyurtma summasi (so'm)" to'g'ri emas`);
            return;
          }
          const dateStr = parseExcelDate(XLSX, row["Sana"]);
          const kraskaSum = parseNum(row["Kraska summasi (so'm)"]);
          const materialSum = parseNum(row["Material summasi (so'm)"]);
          const advance = parseNum(row["Avans (so'm)"]);
          const rawMethod = String(row["To'lov turi (karta/naqd/bank)"] || "naqd").trim().toLowerCase();
          const paymentType = ["karta", "naqd", "bank"].includes(rawMethod) ? rawMethod : "naqd";
          const bizLine = String(row["Sub kategoriya"] || "UVIXPRINT").trim().toUpperCase();
          const areaNum = parseFloat(row["Kv/m"]) || 0;
          const priceUsdNum = parseFloat(row["1 kv/m narxi ($, ixtiyoriy)"]) || 0;
          const exchangeRateNum = parseNum(row["USD kursi (ixtiyoriy)"]);
          const agreementUsd = areaNum * priceUsdNum;
          const order = {
            id: uid(),
            orderNumber: generateOrderNumber([...allOrders, ...newOrders], dateStr),
            date: dateStr,
            customer,
            subcategory: bizLine === "UVONYX" ? "UVONYX" : "UVIXPRINT",
            materialType: String(row["Material turi"] || "").trim(),
            materialLines: agreementUsd > 0 ? [{ materialType: String(row["Material turi"] || "").trim(), area: areaNum, priceUsd: priceUsdNum, totalUsd: agreementUsd }] : [],
            manager: String(row["Mas'ul menedjer"] || "").trim(),
            area: areaNum,
            exchangeRate: exchangeRateNum,
            agreementUsd,
            agreementUzs,
            kraskaLines: kraskaSum > 0 ? [{ amount: kraskaSum }] : [],
            kraskaSum,
            materialSum,
            payments: advance > 0 ? [{
              id: uid(), amount: advance, date: dateStr, paymentType, comment: "Excel import",
              createdBy: currentUser.name, createdAt: new Date().toISOString(),
            }] : [],
            note: String(row["Kommentariya"] || "").trim(),
            createdBy: currentUser.name,
            createdAt: new Date().toISOString(),
          };
          newOrders.push(order);
        });
        if (newOrders.length > 0) onImportOrders(newOrders);
        setImportErrors(errors.length > 0 ? errors : null);
      } catch (err) {
        setImportErrors(["Faylni o'qib bo'lmadi. Excel formatini va namunani tekshiring."]);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  const importErrorsBox = importErrors && (

          <div style={{ marginTop: 12, padding: "10px 14px", background: THEME.roseBg, border: `1.5px solid ${THEME.roseBorder}`, borderRadius: 11 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.rose, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Ba'zi qatorlar import qilinmadi:</span>
              <button onClick={() => setImportErrors(null)} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.rose }}><X size={14} /></button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: THEME.roseText }}>
              {importErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
  );
  const statusChips = [
    { k: "all", l: "Hammasi", n: counts.all, on: !onlyDebt && !onlyPaid, set: () => { setOnlyDebt(false); setOnlyPaid(false); } },
    { k: "debt", l: "Qarzdorlar", n: counts.debt, on: onlyDebt, set: () => { setOnlyDebt(true); setOnlyPaid(false); } },
    { k: "paid", l: "To'langan", n: counts.paid, on: onlyPaid, set: () => { setOnlyDebt(false); setOnlyPaid(true); } },
  ];
  const lineChips = [{ v: "UVIXPRINT", l: "UVIXPRINT" }, { v: "UVONYX", l: "UVONYX" }];
  const stageChips = PROD_STAGES.filter((k) => stageCounts[k] || stageF === k);
  const stageChip = (k) => {
    const c = prodColors(k); const on = stageF === k;
    return (
      <button key={k} type="button" onClick={() => setStageF(on ? null : k)} aria-pressed={on} data-stage-filter={k} className="uvix-fchip"
        style={{ height: 32, padding: "0 12px", borderRadius: 16, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6,
          border: `1px solid ${on ? c.color : "transparent"}`, background: c.bg, color: c.color }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{PROD_LABEL[k]} <b style={{ fontWeight: 700 }}>{stageCounts[k] || 0}</b>
      </button>
    );
  };
  const viewToggle = (
    <div role="group" aria-label="Ko'rinish" style={{ display: "inline-flex", background: THEME.chip, borderRadius: 9, padding: 3, gap: 2, flexShrink: 0 }}>
      {[["list", "Ro'yxat"], ["customers", "Mijoz bo'yicha"]].map(([v, l]) => (
        <button key={v} type="button" onClick={() => setViewMode(v)} aria-pressed={viewMode === v} data-view={v}
          style={{ height: 30, padding: "0 12px", border: 0, borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap", background: viewMode === v ? THEME.card : "transparent", color: viewMode === v ? THEME.text : THEME.muted, boxShadow: viewMode === v ? THEME.shadowSm : "none" }}>{l}</button>
      ))}
    </div>
  );
  const chip = (on, onClick, children, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={on} className="uvix-fchip"
      style={{ height: 32, padding: "0 12px", borderRadius: 16, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6,
        border: `1px solid ${on ? THEME.text : THEME.border2}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.mutedDark }}>
      {children}
    </button>
  );
  function renderCustomers() {
    const row = (o, nested) => {
      const st = stageOf(o); const debt = orderDebt(o); const isSel = selected?.id === o.id;
      return (
        <div key={o.id} role="button" tabIndex={0} data-order-row={o.orderNumber} onClick={() => (isMobile ? setPaymentsFor(o) : setSelectedId(isSel ? null : o.id))} onKeyDown={(e) => e.key === "Enter" && (isMobile ? setPaymentsFor(o) : setSelectedId(o.id))}
          className="uvix-row" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr auto" : "minmax(0,1.6fr) minmax(0,1.2fr) 110px 110px", gap: 10, alignItems: "center", padding: isMobile ? "9px 14px 9px 30px" : "8px 16px 8px 60px", borderTop: `1px dashed ${THEME.border}`, cursor: "pointer", background: isSel ? THEME.navActiveBg : undefined }}>
          <span style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{o.orderNumber}</b>
            <span style={{ color: THEME.muted }}> · {o.title || o.materialType || "—"}{o.area ? ` · ${String(o.area).replace(".", ",")} m²` : ""}</span>
            {isMobile && <span style={{ display: "block", marginTop: 4 }}><StageChip stage={st} /></span>}
          </span>
          {!isMobile && <span style={{ minWidth: 0 }}><StageChip stage={st} hint={st ? stageHint(o, empById) : ""} /></span>}
          {!isMobile && <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(o.agreementUzs || 0)}</span>}
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: debt > 0 ? THEME.rose : THEME.dim }}>{debt > 0 ? fmt(debt) : "—"}</span>
        </div>
      );
    };
    return (
      <div data-testid="customer-groups">
        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1.6fr) minmax(0,1.2fr) 80px 120px 120px 150px", gap: 10, padding: "10px 16px", background: THEME.isDark ? THEME.hover : "#FAFAFA", borderBottom: `1px solid ${THEME.border}`, fontSize: 12.5, color: THEME.muted }}>
            <span /><span>Mijoz</span><span>Ish holati</span><span style={{ textAlign: "right" }}>Buyurtma</span><span style={{ textAlign: "right" }}>Summa</span><span style={{ textAlign: "right" }}>Qarz</span><span />
          </div>
        )}
        {gp.pageItems.map((g) => {
          const open = expanded.has(g.id);
          const byGroup = new Map();
          g.orders.forEach((o) => { const k = o.groupId && o.groupSize > 1 ? o.groupId : ""; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(o); });
          const sections = [...byGroup.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : String(b[1][0].date).localeCompare(String(a[1][0].date))));
          const payBtn = g.debt > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setBatchFor({ name: g.name, orders: g.payable }); }} data-testid="batch-open"
              className="uvix-batch-btn"
              style={{ height: 30, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 8, border: `1px solid ${open ? THEME.green : THEME.border2}`, background: open ? THEME.greenSolid : THEME.card, color: open ? "#fff" : THEME.green, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              <Wallet size={14} /> Umumiy to'lov
            </button>
          );
          return (
            <Fragment key={g.id}>
              <div role="button" tabIndex={0} aria-expanded={open} data-customer={g.name} onClick={() => toggle(g.id)} onKeyDown={(e) => e.key === "Enter" && toggle(g.id)}
                style={isMobile
                  ? { padding: "12px 14px", borderTop: `1px solid ${THEME.border}`, cursor: "pointer", background: open ? THEME.hover : undefined }
                  : { display: "grid", gridTemplateColumns: "28px minmax(0,1.6fr) minmax(0,1.2fr) 80px 120px 120px 150px", gap: 10, alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${THEME.border}`, cursor: "pointer", background: open ? THEME.hover : undefined }}>
                {isMobile ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {open ? <ChevronDown size={16} color={THEME.muted} /> : <ChevronRight size={16} color={THEME.muted} />}
                      <Avatar name={g.name} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: THEME.dim }}>{g.orders.length} ta · {fmt(g.total)}{g.debt > 0 ? <span style={{ color: THEME.rose }}> · qarz {fmt(g.debt)}</span> : ""}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}><StageBar counts={g.stages} /></div>
                    {payBtn && <div style={{ marginTop: 8 }}>{payBtn}</div>}
                  </>
                ) : (
                  <>
                    {open ? <ChevronDown size={16} color={THEME.muted} /> : <ChevronRight size={16} color={THEME.muted} />}
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Avatar name={g.name} size={30} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: THEME.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[g.phone, g.manager].filter(Boolean).join(" · ") || shortDateUz(g.last)}</span>
                      </span>
                    </span>
                    <StageBar counts={g.stages} />
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.orders.length} ta</span>
                    <span style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(g.total)}</span>
                    <span style={{ textAlign: "right", fontWeight: g.debt ? 600 : 400, color: g.debt ? THEME.rose : THEME.dim, fontVariantNumeric: "tabular-nums" }}>{g.debt ? fmt(g.debt) : "—"}</span>
                    <span style={{ textAlign: "right" }}>{payBtn}</span>
                  </>
                )}
              </div>
              {open && sections.map(([gid, arr]) => (
                <div key={gid || "solo"} style={{ background: THEME.isDark ? "transparent" : "#FCFCFD" }}>
                  <div style={{ padding: isMobile ? "8px 14px 4px 30px" : "8px 16px 4px 60px", fontSize: 11.5, fontWeight: 600, color: gid ? THEME.violet : THEME.dim }}>
                    {gid ? `${gid}${arr[0].quoteNo ? ` · smeta ${arr[0].quoteNo}` : ""} · ${shortDateUz(arr[0].date)} · ${arr.length} buyurtma` : "Alohida buyurtmalar"}
                  </div>
                  {arr.slice().sort((a, b) => (a.groupIdx || 0) - (b.groupIdx || 0)).map((o) => row(o, true))}
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>
    );
  }
  const fileInput = <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} style={{ display: "none" }} />;

  return (
    <div>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, position: "relative", display: "block" }}>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Qidirish</span>
              <Search size={17} style={{ position: "absolute", left: 13, top: 14, color: THEME.muted }} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz yoki buyurtma №"
                style={{ ...getInputStyle(), height: 46, paddingLeft: 38, fontSize: 15, background: THEME.card }} />
            </label>
            <button type="button" onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen} aria-label="Excel va boshqa amallar"
              style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 10, border: `1px solid ${toolsOpen ? THEME.text : THEME.border2}`, background: THEME.card, color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <SlidersHorizontal size={19} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -16px", padding: "0 16px" }} role="group" aria-label="Holat bo'yicha filtr" className="uvix-noscrollbar">
            {statusChips.map((c) => chip(c.on, c.set, <>{c.l} <b style={{ fontWeight: 600, opacity: 0.75 }}>{c.n}</b></>, c.k))}
            {stageChips.map(stageChip)}
            {lineChips.map((c) => chip(line === c.v, () => setLine(line === c.v ? "all" : c.v), c.l, c.v))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {viewToggle}
            <div style={{ flex: 1 }} />
            <Button onClick={() => setQuote({})} data-testid="new-order"><Plus size={15} /> Yangi</Button>
          </div>
          {toolsOpen && (
            <Card style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                { icon: Download, l: "Excel'ga yuklab olish", on: exportExcel, dis: list.length === 0 },
                { icon: Upload, l: "Excel'dan import qilish", on: () => fileInputRef.current?.click() },
                { icon: FileBarChart2, l: "Import namunasi", on: downloadImportTemplate },
              ].map(({ icon: Ic, l, on, dis }) => (
                <button key={l} type="button" disabled={dis} onClick={() => { setToolsOpen(false); on(); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 46, padding: "0 10px", border: 0, background: "none", color: THEME.text, fontSize: 14.5, borderRadius: 10, cursor: dis ? "default" : "pointer", opacity: dis ? 0.45 : 1, textAlign: "left" }}>
                  <Ic size={18} color={THEME.muted} /> {l}
                </button>
              ))}
            </Card>
          )}
          {fileInput}
          {importErrorsBox}
        </div>
      ) : (
      <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: THEME.dim, fontVariantNumeric: "tabular-nums", marginRight: 4 }} data-testid="orders-summary">{list.length} ta · {money(listSum)}</div>
          <div style={{ flex: 1 }} />
          {viewToggle}
          {fileInput}
          <Button variant="ghost" onClick={downloadImportTemplate} title="Excel namunasini yuklab olish"><FileBarChart2 size={14} /> Namuna</Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Excel yuklash</Button>
          <Button variant="ghost" onClick={exportExcel} disabled={list.length === 0}><Download size={14} /> Excel</Button>
          <Button onClick={() => setQuote({})} data-testid="new-order"><Plus size={15} /> Yangi buyurtma</Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} role="group" aria-label="Filtrlar">
          {statusChips.map((c) => chip(c.on, c.set, <>{c.l} <b style={{ fontWeight: 600, opacity: 0.75 }}>{c.n}</b></>, c.k))}
          {stageChips.length > 0 && <span style={{ width: 1, height: 20, background: THEME.border2, margin: "0 4px" }} />}
          {stageChips.map(stageChip)}
          <span style={{ width: 1, height: 20, background: THEME.border2, margin: "0 4px" }} />
          {lineChips.map((c) => chip(line === c.v, () => setLine(line === c.v ? "all" : c.v), c.l, c.v))}
          {(search || onlyDebt || onlyPaid || line !== "all" || stageF) && (
            <button type="button" onClick={() => { setSearch(""); setOnlyDebt(false); setOnlyPaid(false); setLine("all"); setStageF(null); }} style={{ background: "none", border: 0, color: THEME.violet, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "0 6px" }}>Tozalash</button>
          )}
          <div style={{ flex: 1 }} />
          <label style={{ position: "relative", display: "block" }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Qidiruv</span>
            <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: THEME.dim }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz yoki buyurtma №" style={{ ...getInputStyle(), minHeight: 36, height: 36, paddingLeft: 32, width: 240, borderRadius: 18 }} />
          </label>
        </div>
        {importErrorsBox}
      </div>
      )}
      <div className={selected ? "uvix-split uvix-split-open" : "uvix-split"}>
      <Card style={{ padding: 0, overflowX: "auto", minWidth: 0 }} className="uvix-scroll">
        {list.length === 0 ? <EmptyState text={stageF || search || onlyDebt || onlyPaid ? "Bu filtr bo'yicha buyurtma yo'q" : "Hali buyurtma kiritilmagan"} /> : customerMode ? renderCustomers() : isMobile ? (
          <div>
            {pageItems.map((o) => {
              const paid = orderTotalPaid(o);
              const debt = orderDebt(o);
              const brakSum = orderBrakSum(o, transactions);
              const total = Math.max(0, (o.agreementUzs || 0) - brakSum);
              const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
              const meta = [shortDateUz(o.date), o.title && o.title !== o.materialType ? o.title : null, o.materialType].filter(Boolean).join("  ·  ");
              const st = stageOf(o);
              return (
                <MobileRow key={o.id} onClick={() => setPaymentsFor(o)}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "Mijoz ko'rsatilmagan"}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                        <span style={{ color: THEME.mutedDark, fontWeight: 600, whiteSpace: "nowrap" }}>{o.orderNumber}</span>
                        {meta && <span style={{ whiteSpace: "nowrap" }}>{`  ·  ${meta}`}</span>}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      {debt > 0
                        ? <Badge color={THEME.rose} bg={THEME.roseBg}>Qarz {money(debt)}</Badge>
                        : <Badge color={THEME.green} bg={THEME.greenBg}>To'langan</Badge>}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12, fontSize: 12.5 }}>
                    <span style={{ color: THEME.muted }}>
                      <b style={{ color: THEME.green, fontWeight: 700 }}>{money(paid)}</b> / {money(total)}
                    </span>
                    {o.agreementUsd ? <span style={{ color: THEME.dim, fontWeight: 600 }}>{usd(o.agreementUsd)}</span> : null}
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: THEME.border, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: debt > 0 ? THEME.violet : THEME.green, borderRadius: 3 }} />
                  </div>
                  {brakSum > 0 && <div style={{ fontSize: 11.5, color: THEME.rose, fontWeight: 600, marginTop: 6 }}>Brak: −{money(brakSum)}</div>}
                  {(st || o.groupId) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {st && <StageChip stage={st} />}
                      {st && <span style={{ fontSize: 11.5, color: THEME.dim }}>{stageHint(o, empById)}</span>}
                      {o.groupId && o.groupSize > 1 && <span style={{ fontSize: 11, fontWeight: 600, color: THEME.violet, background: THEME.violetSoft, padding: "1px 7px", borderRadius: 8 }}>{o.groupId} · {o.groupIdx}/{o.groupSize}</span>}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setPaymentsFor(o)} className="uvix-iconbtn" style={{ ...getIconBtn(), width: "auto", padding: "0 12px", gap: 6, fontSize: 12.5, fontWeight: 600, color: THEME.text }}><Landmark size={14} /> To'lovlar</button>
                    {st === "ready" && <button onClick={() => changeStage(o, "delivered").catch((e) => showToast?.(e.message))} className="uvix-iconbtn" data-testid="m-deliver" style={{ ...getIconBtn(), width: "auto", padding: "0 10px", fontSize: 12.5, fontWeight: 600, color: THEME.green }}>Topshirildi</button>}
                    <button onClick={() => setInvoiceFor(o)} aria-label="Hisob-faktura" title="Hisob-faktura" className="uvix-iconbtn" style={getIconBtn()} data-invoice={o.id}><FileText size={14} /></button>
                    <button onClick={() => setModal({ edit: o })} aria-label="Tahrirlash" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                    {(isAdmin || o.createdBy === currentUser.name) && (
                      <button onClick={() => setConfirmDel(o)} aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    )}
                  </div>
                </MobileRow>
              );
            })}
          </div>
        ) : (
          <table className="uvix-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", background: THEME.isDark ? THEME.hover : "#FAFAFA", borderBottom: `1px solid ${THEME.border}` }}>
                {[["Buyurtma"], ["Mijoz"], ["Holat"], ["Ish / material"], ["Summa, so'm", "right"], ["To'langan", "right"], ["Qarz", "right"], [""]].map(([h, al]) => (
                  <th key={h || "act"} style={{ padding: "10px 16px", fontSize: 12.5, color: THEME.muted, fontWeight: 500, whiteSpace: "nowrap", textAlign: al || "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => {
                const paid = orderTotalPaid(o);
                const debt = orderDebt(o);
                const brakSum = orderBrakSum(o, transactions);
                const isSel = selected?.id === o.id;
                const mat = [o.materialType, o.area ? `${String(o.area).replace(".", ",")} m²` : ""].filter(Boolean).join(" · ");
                const st = stageOf(o);
                return (
                  <tr key={o.id} className={`uvix-row${isSel ? " uvix-row-selected" : ""}`} aria-selected={isSel}
                    style={{ borderBottom: `1px solid ${THEME.border}`, cursor: "pointer", background: isSel ? THEME.navActiveBg : undefined }}
                    onClick={() => setSelectedId(isSel ? null : o.id)}>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, color: THEME.text }}>{o.orderNumber}</div>
                      <div style={{ fontSize: 12, color: THEME.dim, display: "flex", gap: 6, alignItems: "center" }}>
                        {shortDateUz(o.date)}
                        {o.subcategory && <span style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, background: THEME.chip, padding: "0 5px", borderRadius: 4, lineHeight: "17px" }}>{o.subcategory}</span>}
                        {o.groupId && o.groupSize > 1 && <span data-group={o.groupId} style={{ fontSize: 11, fontWeight: 600, color: THEME.violet, background: THEME.violetSoft, padding: "0 6px", borderRadius: 4, lineHeight: "17px" }}>{o.groupId} · {o.groupIdx}/{o.groupSize}</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", maxWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Avatar name={o.customer} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "-"}</div>
                          {o.manager && <div style={{ fontSize: 12, color: THEME.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.manager}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", maxWidth: 190 }}><StageChip stage={st} hint={st ? stageHint(o, empById) : ""} /></td>
                    <td style={{ padding: "10px 16px", maxWidth: 230 }}>
                      {o.title && o.title !== o.materialType && <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</div>}
                      <div style={{ color: mat ? (o.title && o.title !== o.materialType ? THEME.dim : THEME.text) : THEME.dim, fontSize: o.title && o.title !== o.materialType ? 12 : 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mat || "—"}</div>
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap", textAlign: "right" }}>
                      {brakSum > 0 ? (
                        <>
                          <div style={{ fontWeight: 500 }}>{fmt((o.agreementUzs || 0) - brakSum)}</div>
                          <div style={{ fontSize: 12, color: THEME.rose }}>brak −{fmt(brakSum)}</div>
                        </>
                      ) : (
                        <div style={{ fontWeight: 500 }}>{fmt(o.agreementUzs || 0)}</div>
                      )}
                      {o.agreementUsd ? <div style={{ fontSize: 12, color: THEME.dim }}>{usd(o.agreementUsd)}</div> : null}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap", textAlign: "right", color: paid ? THEME.text : THEME.dim }}>{paid ? fmt(paid) : "—"}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap", textAlign: "right", fontWeight: debt > 0 ? 600 : 400, color: debt > 0 ? THEME.rose : THEME.dim }}>{debt > 0 ? fmt(debt) : "—"}</td>
                    <td style={{ padding: "6px 12px 6px 4px", width: 1 }} onClick={(e) => e.stopPropagation()}>
                      <div className="uvix-row-actions" style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button onClick={() => setPaymentsFor(o)} title="To'lovlar" aria-label="To'lovlar" className="uvix-iconbtn" style={getIconBtn()}><Landmark size={14} /></button>
                        <button onClick={() => setInvoiceFor(o)} title="Hisob-faktura" aria-label="Hisob-faktura" className="uvix-iconbtn" style={getIconBtn()} data-invoice={o.id}><FileText size={14} /></button>
                        <button onClick={() => setModal({ edit: o })} title="Tahrirlash" aria-label="Tahrirlash" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                        {(isAdmin || o.createdBy === currentUser.name) && (
                          <button onClick={() => setConfirmDel(o)} title="O'chirish" aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {customerMode
          ? <Pagination page={gp.page} totalPages={gp.totalPages} onChange={gp.setPage} totalCount={groups.length} />
          : <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={list.length} />}
      </Card>
      {selected && (
        <>
          <div className="uvix-split-backdrop" onClick={() => setSelectedId(null)} />
          <OrderPanel
            order={selected}
            transactions={transactions}
            phone={selectedPhone}
            canDelete={isAdmin || selected.createdBy === currentUser.name}
            onClose={() => setSelectedId(null)}
            onPayments={() => setPaymentsFor(selected)}
            onInvoice={() => setInvoiceFor(selected)}
            onEdit={() => setModal({ edit: selected })}
            onDelete={() => setConfirmDel(selected)}
            stage={stageOf(selected)}
            employees={employees}
            siblings={selected.groupId ? (allOrders || orders).filter((o) => o.groupId === selected.groupId && !o.deletedAt).sort((a, b) => (a.groupIdx || 0) - (b.groupIdx || 0)) : null}
            onStage={(st) => changeStage(selected, st)}
            onAssign={(kind, id) => assign(selected, kind, id)}
            onSelectOrder={(id) => setSelectedId(id)}
          />
        </>
      )}
      </div>
      {modal && (
        <OrderForm
          initial={modal.edit}
          currentUser={currentUser}
          categories={categories}
          employees={employees}
          settings={settings}
          allOrders={allOrders}
          transactions={transactions}
          customers={customerList}
          onAddSubcategory={onAddSubcategory}
          onClose={() => setModal(null)}
          onSave={(order, linkedExpenseTx) => {
            onSaveOrder(order, !!modal.edit, linkedExpenseTx);
            setModal(null);
          }}
          onUploadPhotos={onUploadPhotos}
          onDeletePhoto={onDeletePhoto}
          prefillCustomer={modal.prefillCustomer}
        />
      )}
      {invoiceFor && <InvoiceModal order={invoiceFor} customer={invoiceCustomer} isAdmin={isAdmin} onClose={() => setInvoiceFor(null)} />}
      {quote && (
        <QuoteModal lead={quote.lead || null} customers={customerList} employees={employees} allOrders={allOrders || orders} currentUser={currentUser} isAdmin={isAdmin}
          onClose={() => { setQuote(null); if (quote.lead) onPendingLeadHandled?.(); }}
          onSaved={(lead) => { setQuote(null); if (quote.lead) onPendingLeadHandled?.(); onServerChange?.({ lead }); showToast?.(`Smeta ${lead.quote?.no || ""} saqlandi — CRM'da «${lead.customer}»`); }}
          onConverted={(r) => {
            setQuote(null); if (quote.lead) onPendingLeadHandled?.();
            onServerChange?.({ lead: r.lead, orders: r.orders });
            setStageF(null); setOnlyDebt(false); setOnlyPaid(false); setSearch("");
            if (!isMobile && r.orders[0]) setSelectedId(r.orders[0].id);
            showToast?.(`${r.orders.length} ta buyurtma yaratildi: ${r.orders.map((o) => o.orderNumber).join(", ")}`);
          }} />
      )}
      {batchFor && (
        <BatchPayModal customerName={batchFor.name} orders={batchFor.orders} onClose={() => setBatchFor(null)}
          onDone={(r) => { setBatchFor(null); onServerChange?.({ orders: r.orders }); showToast?.(`To'lov ${r.orders.length} ta buyurtmaga taqsimlandi`); }} />
      )}
      {paymentsFor && (
        <PaymentsModal
          order={orders.find((o) => o.id === paymentsFor.id) || paymentsFor}
          transactions={transactions}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onClose={() => setPaymentsFor(null)}
          onAddPayment={onAddPayment}
          onDeletePayment={onDeletePayment}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`${confirmDel.orderNumber} buyurtmasini (${money(confirmDel.agreementUzs)}) o'chirmoqchimisiz? Unga tegishli barcha to'lovlar tarixi ham o'chadi.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeleteOrder(confirmDel); if (selectedId === confirmDel.id) setSelectedId(null); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}
