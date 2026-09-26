import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, FileBarChart2, Landmark, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Pagination, getIconBtn, getInputStyle, usePagination, useIsMobile, MobileRow } from "../../components/ui.jsx";
import { buildExcelWorkbook, downloadWorkbook } from "../../lib/excel.js";
import { generateOrderNumber, orderBrakSum, orderDebt, orderTotalPaid } from "../../lib/finance.js";
import { money, todayStr, uid, usd, shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { OrderForm } from "./OrderForm.jsx";
import { PaymentsModal } from "./PaymentsModal.jsx";

/* ---------------- ORDERS VIEW ---------------- */
export function OrdersView({ quickAddNonce, onQuickAddHandled, orders, allOrders, transactions, currentUser, isAdmin, categories, employees, settings, initialFilter, onAddSubcategory, onSaveOrder, onImportOrders, onDeleteOrder, onAddPayment, onDeletePayment, onUploadPhotos, onDeletePhoto, pendingLead, onOrderLinkedToLead }) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null); // {edit?}
  // Pastki menyudagi "+" tugmasidan kelinganda — formani darhol ochamiz
  useEffect(() => {
    if (!quickAddNonce) return;
    setModal({});
    onQuickAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddNonce]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [paymentsFor, setPaymentsFor] = useState(null); // order object
  const [search, setSearch] = useState(initialFilter?.search || "");

  useEffect(() => {
    if (pendingLead) setModal({ prefillCustomer: pendingLead.customer });
  }, [pendingLead]);
  const [onlyDebt, setOnlyDebt] = useState(!!initialFilter?.onlyDebt);
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [importErrors, setImportErrors] = useState(null);
  const fileInputRef = useRef(null);
  const list = orders
    .filter((o) => !onlyDebt || orderDebt(o) > 0)
    .filter((o) => !onlyPaid || orderDebt(o) <= 0)
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (o.customer || "").toLowerCase().includes(q) || (o.orderNumber || "").toLowerCase().includes(q);
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const { page, setPage, totalPages, pageItems } = usePagination(list, [search, onlyDebt, onlyPaid, orders.length]);

  function exportExcel() {
    const wb = buildExcelWorkbook(list, [], categories, "Buyurtmalar");
    downloadWorkbook(wb, `UVIX_buyurtmalar_${todayStr()}.xlsx`);
  }

  function downloadImportTemplate() {
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

  function parseExcelDate(val) {
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
    reader.onload = (evt) => {
      try {
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
          const dateStr = parseExcelDate(row["Sana"]);
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
    { k: "all", l: "Hammasi", on: !onlyDebt && !onlyPaid, set: () => { setOnlyDebt(false); setOnlyPaid(false); } },
    { k: "debt", l: "Qarzdorlar", on: onlyDebt, set: () => { setOnlyDebt(true); setOnlyPaid(false); } },
    { k: "paid", l: "To'langan", on: onlyPaid, set: () => { setOnlyDebt(false); setOnlyPaid(true); } },
  ];
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
              style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, border: `1px solid ${toolsOpen ? THEME.violet : THEME.border}`, background: toolsOpen ? THEME.violetSoft : THEME.card, color: toolsOpen ? THEME.violet : THEME.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <SlidersHorizontal size={19} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }} role="group" aria-label="Holat bo'yicha filtr">
            {statusChips.map((c) => (
              <button key={c.k} type="button" onClick={c.set} aria-pressed={c.on}
                style={{ height: 36, padding: "0 16px", borderRadius: 999, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13.5, fontWeight: c.on ? 600 : 500,
                  border: `1px solid ${c.on ? THEME.violet : THEME.border}`, background: c.on ? THEME.violet : THEME.card, color: c.on ? "#fff" : THEME.text }}>
                {c.l}
              </button>
            ))}
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
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label="Qidiruv">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: THEME.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz yoki buyurtma №..." style={{ ...getInputStyle(), paddingLeft: 30, width: 220 }} />
            </div>
          </Field>
          <button
            type="button"
            onClick={() => setOnlyDebt((v) => !v)}
            style={{
              padding: "9px 14px", borderRadius: 11, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${onlyDebt ? THEME.rose : THEME.border}`,
              background: onlyDebt ? THEME.roseBg : THEME.card, color: onlyDebt ? THEME.rose : THEME.text,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <AlertTriangle size={13} /> Faqat qarzdorlar
          </button>
          {(search || onlyDebt) && (
            <Button variant="ghost" onClick={() => { setSearch(""); setOnlyDebt(false); }}>Tozalash</Button>
          )}
          <div style={{ flex: 1 }} />
          {fileInput}
          <Button variant="ghost" onClick={downloadImportTemplate} title="Excel namunasini yuklab olish"><FileBarChart2 size={14} /> Namuna</Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Excel yuklash</Button>
          <Button variant="ghost" onClick={exportExcel} disabled={list.length === 0}><Download size={14} /> Excel</Button>
          <Button onClick={() => setModal({})}><Plus size={15} /> Yangi buyurtma</Button>
        </div>
        {importErrorsBox}
      </Card>
      )}
      <Card style={{ padding: 0, overflowX: "auto" }} className="uvix-scroll">
        {list.length === 0 ? <EmptyState text="Hali buyurtma kiritilmagan" /> : isMobile ? (
          <div>
            {pageItems.map((o) => {
              const paid = orderTotalPaid(o);
              const debt = orderDebt(o);
              const brakSum = orderBrakSum(o, transactions);
              const total = Math.max(0, (o.agreementUzs || 0) - brakSum);
              const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
              const meta = [shortDateUz(o.date), o.subcategory, o.materialType].filter(Boolean).join("  ·  ");
              return (
                <MobileRow key={o.id} onClick={() => setPaymentsFor(o)}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "Mijoz ko'rsatilmagan"}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                        <span style={{ color: THEME.violet, fontWeight: 600, whiteSpace: "nowrap" }}>{o.orderNumber}</span>
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
                    {o.agreementUsd ? <span style={{ color: THEME.violet, fontWeight: 700 }}>{usd(o.agreementUsd)}</span> : null}
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: THEME.border, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: debt > 0 ? THEME.violet : THEME.green, borderRadius: 3 }} />
                  </div>
                  {brakSum > 0 && <div style={{ fontSize: 11.5, color: THEME.rose, fontWeight: 600, marginTop: 6 }}>Brak: −{money(brakSum)}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setPaymentsFor(o)} className="uvix-iconbtn" style={{ ...getIconBtn(), width: "auto", padding: "0 12px", gap: 6, fontSize: 12.5, fontWeight: 600, color: THEME.text }}><Landmark size={14} /> To'lovlar</button>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                {["Buyurtma №", "Sana", "Mijoz", "Sub kategoriya", "Material turi", "Mas'ul menedjer", "Kv/m", "Umumiy buyurtma", "To'langan", "Qarzdorlik", ""].map((h) => (
                  <th key={h} style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => {
                const paid = orderTotalPaid(o);
                const debt = orderDebt(o);
                const brakSum = orderBrakSum(o, transactions);
                return (
                  <tr key={o.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}`, cursor: "pointer" }} onClick={() => setPaymentsFor(o)}>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap", fontWeight: 700, color: THEME.violet }}>{o.orderNumber}</td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>{o.date}</td>
                    <td style={{ padding: "13px 16px", fontWeight: 600 }}>{o.customer || "-"}</td>
                    <td style={{ padding: "13px 16px" }}>
                      {o.subcategory && <Badge color={THEME.violetDark} bg={THEME.violetSoft}>{o.subcategory}</Badge>}
                    </td>
                    <td style={{ padding: "13px 16px" }}>{o.materialType || "-"}</td>
                    <td style={{ padding: "13px 16px" }}>{o.manager || "-"}</td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>{o.area != null ? o.area : "-"}</td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 800, color: THEME.violet }}>{usd(o.agreementUsd)}</div>
                      {brakSum > 0 ? (
                        <>
                          <div style={{ fontSize: 11, color: THEME.muted, textDecoration: "line-through" }}>{money(o.agreementUzs || 0)}</div>
                          <div style={{ fontSize: 10.5, color: THEME.rose, fontWeight: 700 }}>Brak: −{money(brakSum)}</div>
                          <div style={{ fontSize: 11.5, color: THEME.text, fontWeight: 700 }}>Sof: {money((o.agreementUzs || 0) - brakSum)}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: THEME.muted }}>{money(o.agreementUzs || 0)}</div>
                      )}
                    </td>
                    <td style={{ padding: "13px 16px", fontWeight: 700, color: THEME.green, whiteSpace: "nowrap" }}>{money(paid)}</td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      {debt > 0 ? <Badge color={THEME.rose} bg={THEME.roseBg}>{money(debt)}</Badge> : <span style={{ color: THEME.muted }}>-</span>}
                    </td>
                    <td style={{ padding: "13px 16px" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setPaymentsFor(o)} title="To'lovlar" className="uvix-iconbtn" style={getIconBtn()}><Landmark size={14} /></button>
                        <button onClick={() => setModal({ edit: o })} title="Tahrirlash" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                        {(isAdmin || o.createdBy === currentUser.name) && (
                          <button onClick={() => setConfirmDel(o)} title="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={list.length} />
      </Card>
      {modal && (
        <OrderForm
          initial={modal.edit}
          currentUser={currentUser}
          categories={categories}
          employees={employees}
          settings={settings}
          allOrders={allOrders}
          transactions={transactions}
          onAddSubcategory={onAddSubcategory}
          onClose={() => setModal(null)}
          onSave={(order, linkedExpenseTx) => {
            onSaveOrder(order, !!modal.edit, linkedExpenseTx);
            if (pendingLead) onOrderLinkedToLead(pendingLead, order);
            setModal(null);
          }}
          onUploadPhotos={onUploadPhotos}
          onDeletePhoto={onDeletePhoto}
          prefillCustomer={modal.prefillCustomer}
        />
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
          onConfirm={() => { onDeleteOrder(confirmDel); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}
