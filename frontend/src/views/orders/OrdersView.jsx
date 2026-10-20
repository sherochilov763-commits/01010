import { usePerms } from "../../lib/perms.jsx";
import { ExportMenu } from "../../components/ExportMenu.jsx";
import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, MoreHorizontal, Wallet, Download, FileBarChart2, FileText, Landmark, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Field, Pagination, getIconBtn, getInputStyle, usePagination, useIsMobile } from "../../components/ui.jsx";
import { exportWorkbook, loadXLSX } from "../../lib/excel.js";
import { generateOrderNumber, orderBrakSum, orderDebt, orderTotalPaid } from "../../lib/finance.js";
import { lineColor, lineOfOrder, useLine } from "../../lib/lines.js";
import { fmt, money, todayStr, uid, usd, shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { OrderForm } from "./OrderForm.jsx";
import { PaymentsModal } from "./PaymentsModal.jsx";
import { buildCustomers, custKey, telLink, tgLink } from "../../lib/customers.js";
import { MobileOrderRow } from "./MobileOrderRow.jsx";
import { useApprovals } from "../../lib/approvals.jsx";
import { ApprovalRequestModal } from "../../components/ApprovalRequestModal.jsx";
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

// Mijoz bo'yicha: 7 bosqich bitta chiziqda (Amazon/Uzum buyurtma kuzatuvi kabi); buyurtma turgan bosqichda — rangli doira va soni
const SHORT = { new: "Navbat", design: "Dizayn", material: "Material", printing: "Pechat", ready: "Tayyor", install: "O'rnat", delivered: "Berildi" };
function MetroLine({ counts, orders, stageOf, onPick, compact }) {
  const W = compact ? 168 : 250;
  const tip = (k) => (orders || []).filter((o) => stageOf(o) === k).map((o) => `${o.orderNumber} · ${o.title || o.materialType || ""}`).join("\n");
  return (
    <span data-metro style={{ position: "relative", display: "block", width: W + 20, height: 40 }}>
      <span style={{ position: "absolute", left: 10, right: 10, top: 12, height: 3, background: THEME.border, borderRadius: 2 }} />
      {PROD_STAGES.map((k, i) => {
        const x = 10 + (i * W) / 6; const n = counts[k] || 0; const c = k === "delivered" ? THEME.muted : prodColors(k).color;
        return n ? (
          <span key={k} title={`${PROD_LABEL[k]} (${n})\n${tip(k)}`} data-metro-stage={k}>
            <button type="button" onClick={(e) => { e.stopPropagation(); onPick?.(k); }} aria-label={`${PROD_LABEL[k]}: ${n}`}
              style={{ position: "absolute", left: x - 11, top: 3, width: 22, height: 22, borderRadius: "50%", border: 0, background: c, color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", boxShadow: `0 0 0 3px ${THEME.card}`, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{n}</button>
            {!compact && <span style={{ position: "absolute", left: x - 21, width: 42, top: 27, textAlign: "center", fontSize: 10, fontWeight: 700, color: c, whiteSpace: "nowrap", overflow: "hidden" }}>{SHORT[k] || PROD_LABEL[k]}</span>}
          </span>
        ) : <span key={k} title={PROD_LABEL[k]} style={{ position: "absolute", left: x - 4, top: 9, width: 9, height: 9, borderRadius: "50%", background: THEME.card, border: `2px solid ${THEME.border2}` }} />;
      })}
    </span>
  );
}
// Bitta buyurtma uchun kichik metro (o'tilgan bosqichlar to'q, joriy — katta)
function MiniMetro({ stage }) {
  const idx = PROD_STAGES.indexOf(stage);
  if (idx < 0) return null;
  const c = stage === "delivered" ? THEME.muted : prodColors(stage).color;
  const W = 120;
  return (
    <span style={{ position: "relative", display: "block", width: W + 12, height: 12 }}>
      <span style={{ position: "absolute", left: 6, right: 6, top: 5, height: 2, background: THEME.border }} />
      <span style={{ position: "absolute", left: 6, width: (idx * W) / 6, top: 5, height: 2, background: c }} />
      {PROD_STAGES.map((k, i) => {
        const x = 6 + (i * W) / 6;
        return i === idx
          ? <span key={k} style={{ position: "absolute", left: x - 5, top: 1, width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: `0 0 0 3px ${c}33` }} />
          : <span key={k} style={{ position: "absolute", left: x - 3, top: 3, width: 6, height: 6, borderRadius: "50%", background: i < idx ? c : THEME.card, border: i < idx ? 0 : `1.5px solid ${THEME.border2}` }} />;
      })}
    </span>
  );
}
// To'lov: kichik chiziq + foiz + qoldiq (qizil → sariq → yashil)
function PayBar({ pct, left, wide }) {
  const col = pct >= 100 ? THEME.green : pct >= 75 ? "#84CC16" : pct > 0 ? (THEME.amber || "#F59E0B") : THEME.rose;
  return (
    <span data-pay={pct} style={{ display: "block", width: wide ? "100%" : 140, minWidth: 0 }}>
      <span style={{ display: "block", height: 6, borderRadius: 3, background: THEME.chip, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${Math.max(pct, pct > 0 ? 3 : 2)}%`, background: col, borderRadius: 3 }} /></span>
      <span style={{ display: "block", fontSize: 11.5, marginTop: 3, color: THEME.muted, whiteSpace: "nowrap" }}>
        {pct >= 100 && !(left > 0) ? <b style={{ color: THEME.green }}>To'liq to'langan</b> : <><b style={{ color: THEME.text }}>{pct}%</b>{left > 0 ? <span style={{ color: THEME.rose }}> · qoldi {left >= 1e6 ? `${(Math.round(left / 1e4) / 100).toLocaleString("ru-RU")} mln` : fmt(left)}</span> : null}</>}
      </span>
    </span>
  );
}

/* ---------------- ORDERS VIEW ---------------- */
const LabelModal = lazy(() => import("./LabelModal.jsx"));

export function OrdersView({ quickAddNonce, onQuickAddHandled, orders, allOrders, transactions, currentUser, isAdmin, categories, employees, settings, initialFilter, onAddSubcategory, onSaveOrder, onImportOrders, onDeleteOrder, onAddPayment, onDeletePayment, onUploadPhotos, onDeletePhoto, pendingLead, onPendingLeadHandled, onServerChange, showToast, leads, customerProfiles, onOpenChat }) {
  // Rollar va huquqlar: o'chirish — «Ha» (so'rovsiz) / «So'rov» (rahbar tasdiqlaydi) / «Yo'q»
  const { can, scope } = usePerms();
  const directDel = isAdmin || can("orders.delete", "direct");
  const canEdit = (o) => !!o && (isAdmin || scope("orders.edit") === "all" || scope("orders.edit") === "line" || (scope("orders.edit") === "own" && o.createdBy === currentUser.name));
  const canDel = (o) => !!o && (isAdmin || (can("orders.delete") && (scope("orders.edit") === "all" || scope("orders.edit") === "line" || (scope("orders.edit") === "own" && o.createdBy === currentUser.name))));
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null); // {edit} — faqat tahrirlash (yangi buyurtma smeta orqali)
  const [quote, setQuote] = useState(null); // {lead?} — «Yangi buyurtma» (smeta → to'lov → buyurtmalar)
  const [viewMode, setViewModeState] = useState(readView);
  const setViewMode = (v) => { setViewModeState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } };
  const [stageF, setStageF] = useState(null);
  // Ochilgan mijozlar — sahifa davomida eslab qolinadi (boshqa bo'limga o'tib qaytganda ham)
  const [expanded, setExpandedRaw] = useState(() => { try { return new Set(JSON.parse(sessionStorage.getItem("uvix:custOpen") || "[]")); } catch { return new Set(); } });
  const setExpanded = (v) => setExpandedRaw((prev) => { const n = typeof v === "function" ? v(prev) : v; try { sessionStorage.setItem("uvix:custOpen", JSON.stringify([...n])); } catch { /* shart emas */ } return n; });
  const [custSort, setCustSort] = useState("last");
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
  const [labelFor, setLabelFor] = useState(null); // QR yorliq oynasi
  const [search, setSearch] = useState(initialFilter?.search || "");
  // Ctrl+K yoki boshqa bo'limdan qayta kelinganda filtrni yangilaymiz
  useEffect(() => {
    if (initialFilter?.search !== undefined) setSearch(initialFilter.search || "");
    if (initialFilter?.onlyDebt !== undefined) setOnlyDebt(!!initialFilter.onlyDebt);
    if (initialFilter?.stage !== undefined) setStageF(initialFilter.stage || null);
    // «Bugun» ekrani yoki QR yorliqdan — aniq buyurtmani ochamiz (telefonda pastki varaq, kompyuterda o'ng panel)
    if (initialFilter?.openId) {
      const o = orders.find((x) => x.id === initialFilter.openId);
      if (!o) showToast?.((allOrders || []).some((x) => x.id === initialFilter.openId && !x.deletedAt) ? "Bu buyurtma sizga tegishli emas" : "Buyurtma topilmadi");
      else if (isMobile) setSheetId(o.id);
      else setSelectedId(o.id);
    }
  }, [initialFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pendingLead) setQuote({ lead: pendingLead });
  }, [pendingLead]);
  const [onlyDebt, setOnlyDebt] = useState(!!initialFilter?.onlyDebt);
  const [onlyPaid, setOnlyPaid] = useState(false);
  // Yo'nalish — umumiy tanlovdan (menyu tepasida); bu yerda alohida tugma yo'q
  const globalLine = useLine();
  const line = globalLine.line;
  const setLine = (v) => { if (globalLine.canSwitch) globalLine.setLine(v); };
  const [selectedId, setSelectedId] = useState(null); // o'ng paneldagi buyurtma (kompyuterda)
  const [sheetId, setSheetId] = useState(null); // telefonda pastki varaqdagi buyurtma
  const [swiped, setSwiped] = useState(null); // telefonda surib ochilgan qator: { id, side }
  const blockTap = useRef(false);
  const ap = useApprovals();
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
    .sort((a, b) => (globalLine.split && lineOfOrder(a) !== lineOfOrder(b) ? (lineOfOrder(a) === "UVIXPRINT" ? -1 : 1) : a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.orderNumber).localeCompare(String(a.orderNumber))));
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
    }).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
      .sort((a, b) => (globalLine.split ? (lineOfOrder(a.orders[0]) === lineOfOrder(b.orders[0]) ? 0 : lineOfOrder(a.orders[0]) === "UVIXPRINT" ? -1 : 1) : 0));
  }, [list, custByKey, orders, legacyIdx, globalLine.split]);
  const customerMode = viewMode === "customers";
  const { page, setPage, totalPages, pageItems } = usePagination(list, [search, onlyDebt, onlyPaid, line, stageF, orders.length]);
  const gp = usePagination(groups, [search, onlyDebt, onlyPaid, line, stageF, orders.length]);
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function changeStage(o, st) { const r = await setOrderStage(o.id, st); await onServerChange?.({ orders: [r.order], lead: r.lead || undefined }); }
  async function assign(o, kind, id) { const r = await assignOrderTask(o.id, { kind, assigneeId: id }); await onServerChange?.({ orders: [r.order], lead: r.lead || undefined }); }
  const selected = !isMobile && selectedId ? orders.find((o) => o.id === selectedId) || null : null;
  const sheetOrder = isMobile && sheetId ? orders.find((o) => o.id === sheetId) || null : null;
  // Mijoz bilan bog'lanish: ilovadagi Telegram chat, Telegram foydalanuvchi nomi yoki telefon
  const contactOf = (o) => {
    const c = o ? custByKey.get(custKey(o.customer)) : null;
    const tg = c?.chatLead && onOpenChat ? () => onOpenChat(c.chatLead) : c?.telegram ? () => window.open(tgLink(c.telegram), "_blank", "noopener") : null;
    return { phone: c?.phone || "", phoneHref: c?.phone ? telLink(c.phone) : null, onTelegram: tg };
  };
  const openSheet = (o) => { setSwiped(null); setSheetId(o.id); };
  const listSum = useMemo(() => list.reduce((sum, o) => sum + (o.agreementUzs || 0), 0), [list]);
  const selectedPhone = useMemo(() => {
    if (!selected) return "";
    const k = custKey(selected.customer);
    const c = buildCustomers(allOrders || orders, leads || [], customerProfiles || []).find((x) => x.keys.includes(k));
    return c?.phone || "";
  }, [selected?.id, selected?.customer, allOrders, orders, leads, customerProfiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportExcel(kind = "xlsx") {
    return exportWorkbook(list, [], categories, "Buyurtmalar", `UVIX_buyurtmalar_${todayStr()}.xlsx`, { kind, split: globalLine.split, user: currentUser?.name, meta: [`Yo'nalish: ${globalLine.split ? "yonma-yon" : globalLine.line === "all" ? "barchasi" : globalLine.line}`, `Buyurtmalar: ${list.length} ta`] });
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
            orderNumber: generateOrderNumber([...allOrders, ...newOrders], dateStr, bizLine === "UVONYX" ? "UVONYX" : "UVIXPRINT"),
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
  // Yo'nalish chiplari — faqat «Ikkalasi» rejimida (aks holda butun ilova bitta yo'nalishda)
  const lineChips = [];
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
    // O'ng panel ochiq bo'lsa — ixchamroq ustunlar; juda tor ekranda jadval gorizontal suriladi (mijoz nomi doim ko'rinadi)
    const GRID = selected ? "24px minmax(150px,1.4fr) 200px 128px 100px 92px 36px" : "28px minmax(180px,1.5fr) 290px 150px 118px 118px 46px";
    const payOf = (paid, total) => (total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : paid > 0 ? 100 : 0);
    const row = (o, last) => {
      const st = stageOf(o); const debt = orderDebt(o); const isSel = selected?.id === o.id; const paid = orderTotalPaid(o);
      if (isMobile) return (
        <div key={o.id} role="button" tabIndex={0} data-order-row={o.orderNumber} onClick={() => openSheet(o)} onKeyDown={(e) => e.key === "Enter" && openSheet(o)}
          className="uvix-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "9px 14px 9px 30px", borderTop: `1px dashed ${THEME.border}`, cursor: "pointer" }}>
          <span style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{o.orderNumber}</b><span style={{ color: THEME.muted }}> · {o.title || o.materialType || "—"}</span>
            <span style={{ display: "block", marginTop: 4 }}><StageChip stage={st} /></span>
          </span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: debt > 0 ? THEME.rose : THEME.dim }}>{debt > 0 ? fmt(debt) : "—"}</span>
        </div>
      );
      return (
        <div key={o.id} role="button" tabIndex={0} data-order-row={o.orderNumber} onClick={() => setSelectedId(isSel ? null : o.id)} onKeyDown={(e) => e.key === "Enter" && setSelectedId(o.id)}
          className="uvix-row" style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "8px 16px", borderTop: `1px solid ${THEME.border}`, cursor: "pointer", background: isSel ? THEME.navActiveBg : undefined, position: "relative" }}>
          <span />
          <span style={{ minWidth: 0, position: "relative", paddingLeft: 34 }}>
            <span aria-hidden style={{ position: "absolute", left: 14, top: -9, bottom: last ? "50%" : -9, width: 2, background: THEME.border2 }} />
            <span aria-hidden style={{ position: "absolute", left: 14, top: "50%", width: 14, height: 2, background: THEME.border2 }} />
            <b style={{ display: "block", fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title || o.materialType || o.orderNumber}</b>
            <span style={{ display: "block", fontSize: 12, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{o.orderNumber} · {shortDateUz(o.date)}{st ? ` · ${stageHint(o, empById) || ""}` : ""}</span>
          </span>
          <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}><StageChip stage={st} /><MiniMetro stage={st} /></span>
          <PayBar pct={payOf(paid, o.agreementUzs || 0)} left={debt} />
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(o.agreementUzs || 0)}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: debt > 0 ? THEME.rose : THEME.dim }}>{debt > 0 ? fmt(debt) : "—"}</span>
          <span style={{ textAlign: "right" }}><span className="uvix-iconbtn" style={{ ...getIconBtn(), display: "inline-grid", placeItems: "center", width: 30, height: 30 }} title="Tafsilot"><MoreHorizontal size={15} /></span></span>
        </div>
      );
    };
    const sorted = [...gp.pageItems];
    if (custSort === "debt") sorted.sort((a, b) => b.debt - a.debt);
    else if (custSort === "sum") sorted.sort((a, b) => b.total - a.total);
    const allOpen = gp.pageItems.length > 0 && gp.pageItems.every((g) => expanded.has(g.id));
    return (
      <div data-testid="customer-groups" style={{ minWidth: isMobile ? 0 : selected ? 800 : 980 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>{groups.length} mijoz</b>
          <span style={{ fontSize: 13, color: THEME.muted }}>· {money(groups.reduce((s0, g) => s0 + g.total, 0))} · qarz <b style={{ color: THEME.rose }}>{fmt(groups.reduce((s0, g) => s0 + g.debt, 0))}</b></span>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="expand-all" onClick={() => setExpanded(allOpen ? new Set() : new Set(gp.pageItems.map((g) => g.id)))} style={{ border: 0, background: "none", color: THEME.violet, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{allOpen ? "Hammasini yopish" : "Hammasini ochish"}</button>
          <select value={custSort} onChange={(e) => setCustSort(e.target.value)} aria-label="Saralash" data-testid="cust-sort" style={{ ...getInputStyle(), width: "auto", height: 32, padding: "0 8px", fontSize: 12.5 }}>
            <option value="last">Oxirgi buyurtma</option><option value="debt">Qarz ↓</option><option value="sum">Summa ↓</option>
          </select>
        </div>
        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "9px 16px", background: THEME.isDark ? THEME.hover : "#FAFAFA", borderBottom: `1px solid ${THEME.border}`, fontSize: 12, color: THEME.muted }}>
            <span /><span>Mijoz</span><span>Ish bosqichi</span><span>To'lov</span><span style={{ textAlign: "right" }}>Summa</span><span style={{ textAlign: "right" }}>Qarz</span><span />
          </div>
        )}
        {sorted.map((g) => {
          const open = expanded.has(g.id) || !!stageF;
          const paid = g.orders.reduce((s0, o) => s0 + orderTotalPaid(o), 0);
          const lines = [...new Set(g.orders.map((o) => (o.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT")))];
          const lineTxt = lines.length > 1 ? "2 yo'nalish" : lines[0];
          const sub = g.orders.length === 1 ? `1 buyurtma · ${g.orders[0].title || g.orders[0].materialType || g.orders[0].orderNumber}` : `${g.orders.length} buyurtma`;
          const payBtn = g.debt > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setBatchFor({ name: g.name, orders: g.payable }); }} data-testid="batch-open" title="Umumiy to'lov" aria-label={`${g.name}: umumiy to'lov`}
              className="uvix-batch-btn"
              style={open && !isMobile
                ? { height: 30, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", borderRadius: 8, border: 0, background: THEME.greenSolid, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }
                : { width: 30, height: 30, display: "inline-grid", placeItems: "center", borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.green, cursor: "pointer", padding: isMobile ? "0 10px" : 0, ...(isMobile ? { width: "auto", display: "inline-flex", gap: 6, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit" } : {}) }}>
              <Wallet size={14} />{(open && !isMobile) || isMobile ? " To'lov" : null}
            </button>
          );
          const visibleOrders = stageF ? g.orders.filter((o) => stageOf(o) === stageF) : g.orders;
          return (
            <Fragment key={g.id}>
              <div role="button" tabIndex={0} aria-expanded={open} data-customer={g.name} onClick={() => toggle(g.id)} onKeyDown={(e) => e.key === "Enter" && toggle(g.id)}
                style={isMobile
                  ? { padding: "12px 14px", borderTop: `1px solid ${THEME.border}`, cursor: "pointer", background: open ? THEME.hover : undefined }
                  : { display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${THEME.border}`, cursor: "pointer", background: open ? THEME.hover : undefined }}>
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
                    <div style={{ marginTop: 6 }}><PayBar pct={payOf(paid, g.total)} left={g.debt} wide /></div>
                    {payBtn && <div style={{ marginTop: 8 }}>{payBtn}</div>}
                  </>
                ) : (
                  <>
                    {open ? <ChevronDown size={16} color={THEME.muted} /> : <ChevronRight size={16} color={THEME.muted} />}
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Avatar name={g.name} size={32} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: THEME.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub} · <b style={{ color: lines.length > 1 ? THEME.muted : lineColor(lines[0], THEME.isDark) }}>{lineTxt}</b></span>
                      </span>
                    </span>
                    <MetroLine counts={g.stages} orders={g.orders} stageOf={stageOf} compact={!!selected} onPick={(st) => setStageF(stageF === st ? null : st)} />
                    <PayBar pct={payOf(paid, g.total)} left={g.debt} />
                    <span style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(g.total)}</span>
                    <span style={{ textAlign: "right", fontWeight: g.debt ? 600 : 400, color: g.debt ? THEME.rose : THEME.dim, fontVariantNumeric: "tabular-nums" }}>{g.debt ? fmt(g.debt) : "—"}</span>
                    <span style={{ textAlign: "right" }}>{payBtn}</span>
                  </>
                )}
              </div>
              {open && visibleOrders.map((o, i) => row(o, i === visibleOrders.length - 1))}
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
        <>
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
          {/* Filtrlar aylantirganda tepada yopishib turadi (ota — butun bo'lim, shuning uchun alohida) */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "4px -16px", padding: "6px 16px", position: "sticky", top: 0, zIndex: 20, background: THEME.surface }} role="group" aria-label="Holat bo'yicha filtr" className="uvix-noscrollbar uvix-m-filters" data-testid="m-filters">
            {statusChips.map((c) => chip(c.on, c.set, <>{c.l} <b style={{ fontWeight: 600, opacity: 0.75 }}>{c.n}</b></>, c.k))}
            {stageChips.map(stageChip)}
            {lineChips.map((c) => chip(line === c.v, () => setLine(line === c.v ? "all" : c.v), c.l, c.v))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
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
        </>
      ) : (
      <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: THEME.dim, fontVariantNumeric: "tabular-nums", marginRight: 4 }} data-testid="orders-summary">{list.length} ta · {money(listSum)}</div>
          <div style={{ flex: 1 }} />
          {viewToggle}
          {fileInput}
          <Button variant="ghost" onClick={downloadImportTemplate} title="Excel namunasini yuklab olish"><FileBarChart2 size={14} /> Namuna</Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Excel yuklash</Button>
          <ExportMenu onExport={exportExcel} disabled={list.length === 0} />
          {(isAdmin || can("orders.create")) && <Button onClick={() => setQuote({})} data-testid="new-order"><Plus size={15} /> Yangi buyurtma</Button>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} role="group" aria-label="Filtrlar">
          {statusChips.map((c) => chip(c.on, c.set, <>{c.l} <b style={{ fontWeight: 600, opacity: 0.75 }}>{c.n}</b></>, c.k))}
          {stageChips.length > 0 && <span style={{ width: 1, height: 20, background: THEME.border2, margin: "0 4px" }} />}
          {stageChips.map(stageChip)}
          <span style={{ width: 1, height: 20, background: THEME.border2, margin: "0 4px" }} />
          {lineChips.map((c) => chip(line === c.v, () => setLine(line === c.v ? "all" : c.v), c.l, c.v))}
          {(search || onlyDebt || onlyPaid || stageF) && (
            <button type="button" onClick={() => { setSearch(""); setOnlyDebt(false); setOnlyPaid(false); setStageF(null); }} style={{ background: "none", border: 0, color: THEME.violet, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "0 6px" }}>Tozalash</button>
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
              const total = Math.max(0, (o.agreementUzs || 0) - orderBrakSum(o, transactions));
              const st = stageOf(o);
              const ct = contactOf(o);
              return (
                <MobileOrderRow key={o.id} order={o} stage={st} paid={paid} debt={debt} total={total}
                  open={swiped?.id === o.id ? swiped.side : null}
                  onOpenChange={(side) => setSwiped(side ? { id: o.id, side } : null)}
                  onTouch={() => { blockTap.current = !!swiped && swiped.id !== o.id; if (blockTap.current) setSwiped(null); }}
                  onTap={() => { if (blockTap.current) { blockTap.current = false; return; } openSheet(o); }}
                  onPay={() => setPaymentsFor(o)}
                  onDeliver={() => changeStage(o, "delivered").then(() => showToast?.(`${o.orderNumber} — mijozga topshirildi`)).catch((e) => showToast?.(e.message))}
                  onTelegram={ct.onTelegram} phoneHref={ct.phoneHref} />
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
              {pageItems.map((o, i) => {
                const paid = orderTotalPaid(o);
                const debt = orderDebt(o);
                const brakSum = orderBrakSum(o, transactions);
                // «Yonma-yon»: yo'nalishlar aralashmaydi — har yo'nalish o'z sarlavhasi ostida
                const lineHead = globalLine.split && (i === 0 || lineOfOrder(pageItems[i - 1]) !== lineOfOrder(o));
                const isSel = selected?.id === o.id;
                const mat = [o.materialType, o.area ? `${String(o.area).replace(".", ",")} m²` : ""].filter(Boolean).join(" · ");
                const st = stageOf(o);
                return (<Fragment key={o.id}>
                  {lineHead && <tr data-line-group={lineOfOrder(o)}><td colSpan={8} style={{ padding: "9px 16px", fontWeight: 800, fontSize: 13, color: lineColor(lineOfOrder(o), THEME.isDark), background: lineColor(lineOfOrder(o), THEME.isDark) + "12", borderTop: `3px solid ${lineColor(lineOfOrder(o), THEME.isDark)}` }}>● {lineOfOrder(o)} · {list.filter((x) => lineOfOrder(x) === lineOfOrder(o)).length} ta</td></tr>}
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
                        {canEdit(o) && <button onClick={() => setModal({ edit: o })} title="Tahrirlash" aria-label="Tahrirlash" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>}
                        {canDel(o) && (
                          <button onClick={() => setConfirmDel(o)} title="O'chirish" aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>);
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
            canDelete={canDel(selected)}
            onClose={() => setSelectedId(null)}
            onPayments={() => setPaymentsFor(selected)}
            onInvoice={() => setInvoiceFor(selected)}
            onEdit={canEdit(selected) ? () => setModal({ edit: selected }) : null}
            onDelete={() => setConfirmDel(selected)}
            stage={stageOf(selected)}
            employees={employees}
            siblings={selected.groupId ? (allOrders || orders).filter((o) => o.groupId === selected.groupId && !o.deletedAt).sort((a, b) => (a.groupIdx || 0) - (b.groupIdx || 0)) : null}
            onStage={(st) => changeStage(selected, st)}
            onAssign={(kind, id) => assign(selected, kind, id)}
            onSelectOrder={(id) => setSelectedId(id)}
            pending={ap?.forOrder(selected.id)}
            onLabel={() => setLabelFor(selected)}
          />
        </>
      )}
      </div>
      {sheetOrder && (() => {
        const ct = contactOf(sheetOrder);
        return (
          <OrderPanel
            variant="sheet"
            order={sheetOrder}
            transactions={transactions}
            phone={ct.phone}
            phoneHref={ct.phoneHref}
            onTelegram={ct.onTelegram}
            canDelete={canDel(sheetOrder)}
            onClose={() => setSheetId(null)}
            onPayments={() => setPaymentsFor(sheetOrder)}
            onInvoice={() => setInvoiceFor(sheetOrder)}
            onEdit={canEdit(sheetOrder) ? () => setModal({ edit: sheetOrder }) : null}
            onDelete={() => setConfirmDel(sheetOrder)}
            stage={stageOf(sheetOrder)}
            employees={employees}
            siblings={sheetOrder.groupId ? (allOrders || orders).filter((o) => o.groupId === sheetOrder.groupId && !o.deletedAt).sort((a, b) => (a.groupIdx || 0) - (b.groupIdx || 0)) : null}
            onStage={(st) => changeStage(sheetOrder, st)}
            onAssign={(kind, id) => assign(sheetOrder, kind, id)}
            onSelectOrder={(id) => setSheetId(id)}
            pending={ap?.forOrder(sheetOrder.id)}
            onLabel={() => setLabelFor(sheetOrder)}
          />
        );
      })()}
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
          onSave={(order, linkedExpenseTx, extra) => {
            onSaveOrder(order, !!modal.edit, linkedExpenseTx, extra);
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
      {confirmDel && !directDel && ap && (
        <ApprovalRequestModal kind="order_delete" order={confirmDel} onClose={() => setConfirmDel(null)}
          onSubmit={async (b) => { await ap.request(b); showToast?.("O'chirish so'rovi adminga yuborildi"); }} />
      )}
      {labelFor && (
        <Suspense fallback={null}>
          <LabelModal order={labelFor} onClose={() => setLabelFor(null)}
            group={labelFor.groupId ? (allOrders || orders).filter((o) => o.groupId === labelFor.groupId && !o.deletedAt).sort((a, b) => (a.groupIdx || 0) - (b.groupIdx || 0)) : null} />
        </Suspense>
      )}
      {confirmDel && (directDel || !ap) && (
        <ConfirmDialog
          message={`${confirmDel.orderNumber} buyurtmasini (${money(confirmDel.agreementUzs)}) o'chirmoqchimisiz? Unga tegishli barcha to'lovlar tarixi ham o'chadi.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeleteOrder(confirmDel); if (selectedId === confirmDel.id) setSelectedId(null); if (sheetId === confirmDel.id) setSheetId(null); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}
