import { useMemo, useState } from "react";
import { Download, Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Pagination, getIconBtn, getInputStyle, usePagination, useIsMobile, MobileRow } from "../components/ui.jsx";
import { buildExcelWorkbook, downloadWorkbook } from "../lib/excel.js";
import { inRange, money, paymentTypeLabel, todayStr, shortDateUz } from "../lib/format.js";
import { THEME } from "../theme.js";

/* ---------------- OPERATIONS VIEW (to'lovlar + rasxodlar birlashtirilgan) ---------------- */
export function OperationsView({ orders, transactions, isAdmin, onDeletePayment, onDeleteExpense, currentUser, categories, initialFilter }) {
  const isMobile = useIsMobile();
  const catNames = Object.keys(categories || {});
  const [search, setSearch] = useState(initialFilter?.search || "");
  const [typeFilter, setTypeFilter] = useState(initialFilter?.typeFilter || "all");
  const [payFilter, setPayFilter] = useState(initialFilter?.payFilter || "all");
  const [catFilter, setCatFilter] = useState(initialFilter?.catFilter || "all");
  const [from, setFrom] = useState(initialFilter?.from || "");
  const [to, setTo] = useState(initialFilter?.to || "");
  const [confirmDel, setConfirmDel] = useState(null);

  const allOps = useMemo(() => {
    const paymentOps = [];
    orders.forEach((o) => {
      (o.payments || []).filter((p) => !p.deletedAt).forEach((p) => {
        paymentOps.push({
          opId: `pay-${p.id}`, type: "kirim", date: p.date, category: o.subcategory, customer: o.customer,
          orderNumber: o.orderNumber, orderId: o.id, paymentId: p.id, paymentType: p.paymentType,
          amount: p.amount, note: p.comment, createdBy: p.createdBy,
        });
      });
    });
    const expenseOps = transactions.map((t) => ({
      opId: `exp-${t.id}`, type: "chiqim", date: t.date, category: t.category, customer: "",
      orderNumber: "", txId: t.id, paymentType: t.paymentType, amount: t.amount, note: t.note, createdBy: t.createdBy,
    }));
    return [...paymentOps, ...expenseOps];
  }, [orders, transactions]);

  const filtered = useMemo(() => {
    return allOps
      .filter((t) => typeFilter === "all" || t.type === typeFilter)
      .filter((t) => payFilter === "all" || t.paymentType === payFilter)
      .filter((t) => catFilter === "all" || t.category === catFilter)
      .filter((t) => inRange(t.date, from, to) || (!from && !to))
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (t.customer || "").toLowerCase().includes(q) ||
          (t.orderNumber || "").toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q);
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [allOps, typeFilter, payFilter, catFilter, from, to, search]);
  const { page, setPage, totalPages, pageItems } = usePagination(filtered, [typeFilter, payFilter, catFilter, from, to, search]);

  function exportExcel() {
    const filteredOrderIds = new Set(filtered.filter((o) => o.type === "kirim").map((o) => o.orderId));
    const relatedOrders = orders.filter((o) => filteredOrderIds.has(o.id));
    const filteredExpenses = transactions.filter((t) => filtered.some((f) => f.type === "chiqim" && f.txId === t.id));
    const wb = buildExcelWorkbook(relatedOrders, filteredExpenses, categories, "Operatsiyalar");
    downloadWorkbook(wb, `UVIX_operatsiyalar_${todayStr()}.xlsx`);
  }

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label="Qidiruv">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: THEME.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz, buyurtma №, izoh..." style={{ ...getInputStyle(), paddingLeft: 30, width: 200 }} />
            </div>
          </Field>
          <Field label="Turi">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...getInputStyle(), width: 130 }}>
              <option value="all">Barchasi</option>
              <option value="kirim">Kirim (to'lov)</option>
              <option value="chiqim">Chiqim</option>
            </select>
          </Field>
          <Field label="To'lov turi">
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} style={{ ...getInputStyle(), width: 120 }}>
              <option value="all">Barchasi</option>
              <option value="karta">Karta</option>
              <option value="naqd">Naqd</option>
            </select>
          </Field>
          <Field label="Kategoriya">
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...getInputStyle(), width: 160 }}>
              <option value="all">Barchasi</option>
              {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Sanadan">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...getInputStyle(), width: 140 }} />
          </Field>
          <Field label="Sanagacha">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...getInputStyle(), width: 140 }} />
          </Field>
          {(search || typeFilter !== "all" || payFilter !== "all" || catFilter !== "all" || from || to) && (
            <Button variant="ghost" onClick={() => { setSearch(""); setTypeFilter("all"); setPayFilter("all"); setCatFilter("all"); setFrom(""); setTo(""); }}>
              Tozalash
            </Button>
          )}
          <Button variant="ghost" onClick={exportExcel} disabled={filtered.length === 0}><Download size={14} /> Excel</Button>
        </div>
      </Card>

      <Card style={{ padding: 0, overflowX: "auto" }} className="uvix-scroll">
        {filtered.length === 0 ? <EmptyState text="Natija topilmadi" /> : isMobile ? (
          <div>
            {pageItems.map((t) => {
              const inc = t.type === "kirim";
              const title = inc ? (t.customer || "Mijoz") : (t.category || "Rasxod");
              return (
                <MobileRow key={t.opId}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3 }}>
                        {[shortDateUz(t.date), inc && t.orderNumber, paymentTypeLabel(t.paymentType)].filter(Boolean).join("  ·  ")}
                      </div>
                      {t.note && <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: inc ? THEME.green : THEME.rose, whiteSpace: "nowrap" }}>{inc ? "+" : "−"}{money(t.amount)}</div>
                      {(isAdmin || t.createdBy === currentUser.name) && (
                        <button onClick={() => setConfirmDel(t)} aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                      )}
                    </div>
                  </div>
                </MobileRow>
              );
            })}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                {["Sana", "Turi", "Kategoriya", "Mijoz / Buyurtma", "To'lov turi", "Summa", "Izoh", ""].map((h) => (
                  <th key={h} style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.opId} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={t.type === "kirim" ? THEME.greenText : THEME.roseText} bg={t.type === "kirim" ? THEME.greenBg : THEME.roseBg}>
                      {t.type === "kirim" ? "KIRIM" : "CHIQIM"}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px" }}>{t.category || "-"}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {t.type === "kirim" ? `${t.customer || "-"} ${t.orderNumber ? `(${t.orderNumber})` : ""}` : "-"}
                  </td>
                  <td style={{ padding: "13px 16px" }}>{paymentTypeLabel(t.paymentType)}</td>
                  <td style={{ padding: "13px 16px", fontWeight: 700, color: t.type === "kirim" ? THEME.green : THEME.rose, whiteSpace: "nowrap" }}>
                    {t.type === "kirim" ? "+" : "-"}{money(t.amount)}
                  </td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "-"}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {(isAdmin || t.createdBy === currentUser.name) && (
                      <button onClick={() => setConfirmDel(t)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} />
      </Card>
      {confirmDel && (
        <ConfirmDialog
          message={`Ushbu operatsiyani (${money(confirmDel.amount)}) o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            if (confirmDel.type === "kirim") onDeletePayment(confirmDel.orderId, confirmDel.paymentId);
            else onDeleteExpense({ id: confirmDel.txId, amount: confirmDel.amount, date: confirmDel.date, type: "chiqim" });
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}
