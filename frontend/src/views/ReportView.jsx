import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, Card, EmptyState, MetricCard, getInputStyle } from "../components/ui.jsx";
import { PERIODS } from "../constants.js";
import { buildExcelWorkbook, downloadWorkbook } from "../lib/excel.js";
import { orderAddedValue, periodRange } from "../lib/finance.js";
import { inRange, money, todayStr } from "../lib/format.js";
import { THEME } from "../theme.js";

export function ReportView({ orders, transactions, categories }) {
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const range = periodRange(period, customFrom, customTo);

  // Buyurtmalar — davr bo'yicha buyurtma SANASI orqali filtrlanadi.
  const filteredOrders = useMemo(() => orders.filter((o) => inRange(o.date, range.from, range.to)), [orders, range.from, range.to]);
  // Rasxodlar — davr bo'yicha.
  const filteredExpenses = useMemo(() => transactions.filter((t) => inRange(t.date, range.from, range.to)), [transactions, range.from, range.to]);
  // To'lovlar — davr bo'yicha, BARCHA buyurtmalar ichidan (buyurtma boshqa oyda ochilgan bo'lsa ham, shu oyda to'lov bo'lgan bo'lishi mumkin).
  const filteredPayments = useMemo(() => {
    const list = [];
    orders.forEach((o) => (o.payments || []).forEach((p) => { if (inRange(p.date, range.from, range.to)) list.push({ ...p, orderNumber: o.orderNumber, customer: o.customer }); }));
    return list;
  }, [orders, range.from, range.to]);

  const stats = useMemo(() => {
    const totalOrderValue = filteredOrders.reduce((s, o) => s + (o.agreementUzs || 0), 0);
    const totalKraska = filteredOrders.reduce((s, o) => s + (o.kraskaSum || 0), 0);
    const totalMaterialInOrders = filteredOrders.reduce((s, o) => s + (o.materialSum || 0), 0);
    const totalAddedValue = filteredOrders.reduce((s, o) => s + orderAddedValue(o, transactions), 0);
    const totalPaidInPeriod = filteredPayments.reduce((s, p) => s + p.amount, 0);
    const totalExpense = filteredExpenses.reduce((s, t) => s + t.amount, 0);
    return { totalOrderValue, totalKraska, totalMaterialInOrders, totalAddedValue, totalPaidInPeriod, totalExpense, net: totalPaidInPeriod - totalExpense };
  }, [filteredOrders, filteredPayments, filteredExpenses]);

  const catNames = Object.keys(categories || {});
  const catTotals = useMemo(() => {
    const map = {};
    catNames.forEach((c) => (map[c] = 0));
    filteredExpenses.forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [filteredExpenses, catNames]);

  function exportExcel() {
    const wb = buildExcelWorkbook(filteredOrders, filteredExpenses, categories, `${range.from} — ${range.to}`);
    downloadWorkbook(wb, `UVIX_hisobot_${range.from}_${range.to}.xlsx`);
  }
  function exportExcelAll() {
    const wb = buildExcelWorkbook(orders, transactions, categories, "Barcha vaqt");
    downloadWorkbook(wb, `UVIX_hisobot_barcha_vaqt_${todayStr()}.xlsx`);
  }

  return (
    <div>
      <Card style={{ marginBottom: 14 }} className="no-print">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className="uvix-chip" style={{
              padding: "7px 13px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${period === p.key ? THEME.violet : THEME.border}`,
              background: period === p.key ? THEME.violet : THEME.card, color: period === p.key ? "#fff" : THEME.text,
            }}>{p.label}</button>
          ))}
          {period === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...getInputStyle(), width: 140 }} />
              <span style={{ color: THEME.muted, fontSize: 12 }}>—</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...getInputStyle(), width: 140 }} />
            </>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={exportExcelAll}><Download size={14} /> Excel (barcha vaqt)</Button>
          <Button variant="ghost" onClick={exportExcel}><Download size={14} /> Excel (joriy davr)</Button>
          <Button variant="ghost" onClick={() => window.print()}><Printer size={14} /> PDF / Chop etish</Button>
        </div>
      </Card>

      <div id="report-printable">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
          <MetricCard label="Buyurtmalar summasi (davr)" value={money(stats.totalOrderValue)} accent={THEME.violet} />
          <MetricCard label="Qabul qilingan to'lovlar" value={money(stats.totalPaidInPeriod)} accent={THEME.green} />
          <MetricCard label="Rasxod (davr)" value={money(stats.totalExpense)} accent={THEME.rose} />
          <MetricCard label="Sof pul oqimi" value={money(stats.net)} accent={stats.net >= 0 ? THEME.green : THEME.rose} />
          <MetricCard label="Qo'shilgan qiymat" value={money(stats.totalAddedValue)} accent={stats.totalAddedValue >= 0 ? THEME.green : THEME.rose} />
          <MetricCard label="Kraska (davr)" value={money(stats.totalKraska)} />
        </div>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Rasxod kategoriyalari bo'yicha ({range.from} — {range.to})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {Object.entries(catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                <tr key={cat} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "8px 4px" }}>{cat}</td>
                  <td style={{ padding: "8px 4px" }}>
                    <div style={{ height: 6, borderRadius: 4, background: THEME.chip, width: "100%", maxWidth: 200 }}>
                      <div style={{ height: 6, borderRadius: 4, background: THEME.violet, width: `${stats.totalExpense ? (val / stats.totalExpense) * 100 : 0}%` }} />
                    </div>
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700 }}>{money(val)}</td>
                </tr>
              ))}
              {Object.values(catTotals).every((v) => v === 0) && (
                <tr><td colSpan={3}><EmptyState text="Bu davrda rasxod yo'q" /></td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="print-area" style={{ padding: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>UVIX</div>
        <div style={{ fontSize: 14, color: "#555" }}>Moliyaviy hisobot &middot; Davr: {range.from} — {range.to}</div>
        <hr style={{ margin: "14px 0" }} />
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={{ padding: 4 }}>Buyurtmalar summasi</td><td style={{ padding: 4, textAlign: "right" }}>{money(stats.totalOrderValue)}</td></tr>
            <tr><td style={{ padding: 4 }}>Qabul qilingan to'lovlar</td><td style={{ padding: 4, textAlign: "right" }}>{money(stats.totalPaidInPeriod)}</td></tr>
            <tr><td style={{ padding: 4 }}>Rasxod</td><td style={{ padding: 4, textAlign: "right" }}>{money(stats.totalExpense)}</td></tr>
            <tr><td style={{ padding: 4, fontWeight: 700 }}>Sof pul oqimi</td><td style={{ padding: 4, textAlign: "right", fontWeight: 700 }}>{money(stats.net)}</td></tr>
            <tr><td style={{ padding: 4 }}>Qo'shilgan qiymat</td><td style={{ padding: 4, textAlign: "right" }}>{money(stats.totalAddedValue)}</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 16, fontWeight: 700 }}>Rasxod kategoriyalari</div>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginTop: 6 }}>
          <tbody>
            {Object.entries(catTotals).filter(([, v]) => v > 0).map(([cat, val]) => (
              <tr key={cat}><td style={{ padding: 4 }}>{cat}</td><td style={{ padding: 4, textAlign: "right" }}>{money(val)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
