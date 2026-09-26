import { useMemo, useState, useEffect } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Pagination, getIconBtn, usePagination, useIsMobile, MobileRow } from "../../components/ui.jsx";
import { buildExcelWorkbook, downloadWorkbook } from "../../lib/excel.js";
import { money, paymentTypeBadgeColors, paymentTypeLabel, todayStr, shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { TransactionForm } from "./TransactionForm.jsx";

/* ---------------- EXPENSE VIEW ---------------- */
export function ExpenseView({ quickAddNonce, onQuickAddHandled, transactions, orders, currentUser, categories, onAddCategory, onAddSubcategory, onSave, onDelete }) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null);
  // Pastki menyudagi "+" tugmasidan kelinganda — formani darhol ochamiz
  useEffect(() => {
    if (!quickAddNonce) return;
    setModal({});
    onQuickAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddNonce]);
  const [confirmDel, setConfirmDel] = useState(null);
  const list = transactions.filter((t) => t.type === "chiqim").sort((a, b) => (a.date < b.date ? 1 : -1));
  const { page, setPage, totalPages, pageItems } = usePagination(list, [transactions.length]);
  const orderById = useMemo(() => {
    const map = {};
    (orders || []).forEach((o) => { map[o.id] = o; });
    return map;
  }, [orders]);

  function exportExcel() {
    const wb = buildExcelWorkbook([], list, categories, "Rasxodlar");
    downloadWorkbook(wb, `UVIX_rasxodlar_${todayStr()}.xlsx`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        <Button variant="ghost" onClick={exportExcel} disabled={list.length === 0}><Download size={14} /> Excel</Button>
        <Button onClick={() => setModal({})}><Plus size={15} /> Yangi rasxod</Button>
      </div>
      <Card style={{ padding: 0, overflowX: "auto" }} className="uvix-scroll">
        {list.length === 0 ? <EmptyState text="Hali rasxod kiritilmagan" /> : isMobile ? (
          <div>
            {pageItems.map((t) => {
              const linkedOrder = t.relatedOrderId ? orderById[t.relatedOrderId] : null;
              const pc = paymentTypeBadgeColors(t.paymentType);
              return (
                <MobileRow key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{t.category}{t.subcategory && t.subcategory !== "Umumiy" ? <span style={{ color: THEME.muted, fontWeight: 500 }}> · {t.subcategory}</span> : null}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {shortDateUz(t.date)}
                        <Badge color={pc.color} bg={pc.bg}>{paymentTypeLabel(t.paymentType)}</Badge>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: THEME.rose, whiteSpace: "nowrap" }}>−{money(t.amount)}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setModal({ edit: t })} aria-label="Tahrirlash" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                        <button onClick={() => setConfirmDel(t)} aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                      </div>
                    </div>
                  </div>
                  {(linkedOrder || t.note) && (
                    <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 8, lineHeight: 1.45 }}>
                      {linkedOrder && <div>{linkedOrder.customer} <span style={{ opacity: 0.8 }}>({linkedOrder.orderNumber})</span></div>}
                      {t.note && <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</div>}
                    </div>
                  )}
                </MobileRow>
              );
            })}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                {["Sana", "Kategoriya", "Subkategoriya", "Mijoz / Buyurtma", "To'lov turi", "Summa", "Izoh", ""].map((h) => (
                  <th key={h} style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => {
                const linkedOrder = t.relatedOrderId ? orderById[t.relatedOrderId] : null;
                return (
                <tr key={t.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "13px 16px", fontWeight: 600 }}>{t.category}</td>
                  <td style={{ padding: "13px 16px", color: THEME.muted }}>{t.subcategory}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {linkedOrder ? (
                      <span style={{ fontSize: 12.5 }}>{linkedOrder.customer} <span style={{ color: THEME.muted }}>({linkedOrder.orderNumber})</span></span>
                    ) : <span style={{ color: THEME.muted }}>-</span>}
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={paymentTypeBadgeColors(t.paymentType).color} bg={paymentTypeBadgeColors(t.paymentType).bg}>
                      {paymentTypeLabel(t.paymentType)}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px", fontWeight: 700, color: THEME.rose, whiteSpace: "nowrap" }}>-{money(t.amount)}</td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "-"}</td>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setModal({ edit: t })} className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDel(t)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={list.length} />
      </Card>
      {modal && (
        <TransactionForm
          initial={modal.edit}
          currentUser={currentUser}
          categories={categories}
          orders={orders}
          onAddCategory={onAddCategory}
          onAddSubcategory={onAddSubcategory}
          onClose={() => setModal(null)}
          onSave={(tx) => { onSave(tx, !!modal.edit); setModal(null); }}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`${confirmDel.date} sanadagi ${money(confirmDel.amount)} rasxodni o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDelete(confirmDel); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}
