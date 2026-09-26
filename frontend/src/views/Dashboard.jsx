import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CreditCard, FileBarChart2, FolderTree, Landmark, ListChecks, Package, Settings, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, EmptyState, MetricCard, SectionTitle, getInputStyle } from "../components/ui.jsx";
import { DASHBOARD_GROUPS, DASHBOARD_SIZE_SPANS, DASHBOARD_WIDGET_CATALOG } from "../constants.js";
import { computeFinanceStats, getEffectiveDashboardLayout, orderDebt } from "../lib/finance.js";
import { dateLabel, fmt, localDateStr, money, monthKey, monthLabel, todayStr, usd } from "../lib/format.js";
import { THEME } from "../theme.js";
import { DashboardConstructorSection } from "./settings/DashboardConstructorSection.jsx";

export function Dashboard({ orders, expenses, isAdmin, onNavigate, settings, onSaveSettings }) {
  const [subFilter, setSubFilter] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [periodMode, setPeriodMode] = useState("month"); // "all" | "month" | "range" — standart: joriy oy
  const [periodMonth, setPeriodMonth] = useState(() => todayStr().slice(0, 7));
  const [periodFrom, setPeriodFrom] = useState(() => todayStr());
  const [periodTo, setPeriodTo] = useState(() => todayStr());
  const [monthTouched, setMonthTouched] = useState(false); // true bo'lsa — foydalanuvchi qo'lda oy tanlagan, avto-yangilanish to'xtaydi

  // Foydalanuvchi qo'lda boshqa oy tanlamagan bo'lsa, "Oy" rejimi doim joriy oyni ko'rsatib turadi
  // (masalan dastur ochiq turgan holda yangi oy boshlansa, avtomatik yangilanadi)
  useEffect(() => {
    if (monthTouched || periodMode !== "month") return;
    const interval = setInterval(() => {
      const nowMonth = todayStr().slice(0, 7);
      setPeriodMonth((prev) => (prev !== nowMonth ? nowMonth : prev));
    }, 60000);
    return () => clearInterval(interval);
  }, [monthTouched, periodMode]);

  const filteredOrders = useMemo(
    () => (subFilter === "all" ? orders : orders.filter((o) => o.subcategory === subFilter)),
    [orders, subFilter]
  );

  // Davr filtri — "Oy" yoki "Erkin oraliq" tanlansa, butun Dashboard shu davrga moslashadi
  const effectivePeriod = useMemo(() => {
    if (periodMode === "month" && periodMonth) {
      const [y, m] = periodMonth.split("-").map(Number);
      const from = `${periodMonth}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const to = `${periodMonth}-${String(lastDay).padStart(2, "0")}`;
      return { from, to };
    }
    if (periodMode === "range" && periodFrom && periodTo) {
      return periodFrom <= periodTo ? { from: periodFrom, to: periodTo } : { from: periodTo, to: periodFrom };
    }
    return null;
  }, [periodMode, periodMonth, periodFrom, periodTo]);

  const dateFilteredOrders = useMemo(() => {
    if (!effectivePeriod) return filteredOrders;
    return filteredOrders.filter((o) => o.date >= effectivePeriod.from && o.date <= effectivePeriod.to);
  }, [filteredOrders, effectivePeriod]);

  const dateFilteredExpenses = useMemo(() => {
    if (!effectivePeriod) return expenses;
    return expenses.filter((t) => t.date >= effectivePeriod.from && t.date <= effectivePeriod.to);
  }, [expenses, effectivePeriod]);

  const stats = useMemo(() => computeFinanceStats(dateFilteredOrders, dateFilteredExpenses), [dateFilteredOrders, dateFilteredExpenses]);
  const curMonth = todayStr().slice(0, 7);
  const today = todayStr();
  const monthStart = curMonth + "-01";
  function go(view, filter) {
    if (onNavigate) onNavigate(view, filter);
  }

  const dailyData = useMemo(() => {
    const days = [];
    if (effectivePeriod) {
      const start = new Date(effectivePeriod.from);
      const end = new Date(effectivePeriod.to);
      const spanDays = Math.round((end - start) / 86400000) + 1;
      if (spanDays > 0 && spanDays <= 45) {
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = localDateStr(d);
          const paid = stats.allPayments.filter((p) => p.date === key).reduce((s, p) => s + p.amount, 0);
          const exp = dateFilteredExpenses.filter((t) => t.date === key).reduce((s, t) => s + t.amount, 0);
          days.push({ label: dateLabel(key), "To'lov": paid, Rasxod: exp });
        }
        return days;
      }
      // Uzun oraliq — kunlik grafik o'rniga oylik grafikda ko'rinadi, bu yerda bo'sh qoldiramiz
      return days;
    }
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = localDateStr(d);
      const paid = stats.allPayments.filter((p) => p.date === key).reduce((s, p) => s + p.amount, 0);
      const exp = dateFilteredExpenses.filter((t) => t.date === key).reduce((s, t) => s + t.amount, 0);
      days.push({ label: dateLabel(key), "To'lov": paid, Rasxod: exp });
    }
    return days;
  }, [stats.allPayments, dateFilteredExpenses, effectivePeriod]);

  const monthlyData = useMemo(() => {
    const months = [];
    if (effectivePeriod) {
      const cur = new Date(effectivePeriod.from);
      cur.setDate(1);
      const endMonth = new Date(effectivePeriod.to);
      endMonth.setDate(1);
      let guard = 0;
      while (cur <= endMonth && guard < 36) {
        const key = cur.toISOString().slice(0, 7);
        const paid = stats.allPayments.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.amount, 0);
        const exp = dateFilteredExpenses.filter((t) => monthKey(t.date) === key).reduce((s, t) => s + t.amount, 0);
        months.push({ label: monthLabel(key), "To'lov": paid, Rasxod: exp });
        cur.setMonth(cur.getMonth() + 1);
        guard++;
      }
      return months;
    }
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const paid = stats.allPayments.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.amount, 0);
      const exp = dateFilteredExpenses.filter((t) => monthKey(t.date) === key).reduce((s, t) => s + t.amount, 0);
      months.push({ label: monthLabel(key), "To'lov": paid, Rasxod: exp });
    }
    return months;
  }, [stats.allPayments, dateFilteredExpenses, effectivePeriod]);

  const categoryPie = useMemo(() => {
    const map = {};
    const source = effectivePeriod ? dateFilteredExpenses : expenses.filter((t) => monthKey(t.date) === curMonth);
    source.forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses, dateFilteredExpenses, effectivePeriod, curMonth]);

  const topDebtors = useMemo(() => {
    const map = {};
    dateFilteredOrders.forEach((o) => {
      const debt = orderDebt(o);
      if (debt > 0) map[o.customer || "Noma'lum"] = (map[o.customer || "Noma'lum"] || 0) + debt;
    });
    return Object.entries(map).map(([customer, debt]) => ({ customer, debt })).sort((a, b) => b.debt - a.debt).slice(0, 5);
  }, [dateFilteredOrders]);

  const recentOrders = useMemo(() => {
    return dateFilteredOrders.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  }, [dateFilteredOrders]);

  const topOrders = useMemo(() => {
    return dateFilteredOrders.slice().sort((a, b) => (b.agreementUzs || 0) - (a.agreementUzs || 0)).slice(0, 5);
  }, [dateFilteredOrders]);

  const totalBrak = useMemo(() => {
    return dateFilteredExpenses.filter((t) => !t.deletedAt && t.category === "Brak").reduce((s, t) => s + t.amount, 0);
  }, [dateFilteredExpenses]);

  const PIE_COLORS = ["#7C3AED", "#22D3EE", "#F59E0B", "#E11D48", "#16A34A", "#3B82F6", "#EC4899", "#8B5CF6", "#0EA5E9", "#F97316"];

  const layout = useMemo(() => getEffectiveDashboardLayout(settings), [settings]);

  const WIDGETS = {
    hero: () => (
      <Card className="uvix-dash-card" style={{ background: `linear-gradient(125deg, ${THEME.ink} 0%, #241D40 60%, #2E2154 100%)`, border: "none", boxShadow: THEME.shadowLg, color: "#fff", padding: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#B3ACCF", fontWeight: 600 }}>UMUMIY BUYURTMALAR SUMMASI</div>
              <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 2 }}>
                {[{ v: "all", l: "Barchasi" }, { v: "UVIXPRINT", l: "UVIXPRINT" }, { v: "UVONYX", l: "UVONYX" }].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setSubFilter(opt.v)}
                    style={{
                      padding: "3px 10px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 700,
                      background: subFilter === opt.v ? THEME.violet : "transparent",
                      color: subFilter === opt.v ? "#fff" : "#B3ACCF",
                    }}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: THEME.isDark ? "clamp(22px, 7vw, 30px)" : 32, fontFamily: THEME.fontNum, fontWeight: THEME.isDark ? 500 : 800, letterSpacing: -0.5, marginTop: 4, fontVariantNumeric: "tabular-nums", background: `linear-gradient(90deg, #fff, ${THEME.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {money(stats.totalOrderValue)}
            </div>
            <div style={{ fontSize: 12, color: "#9891B8", marginTop: 4 }}>Qabul qilingan to'lovlar {money(stats.totalPaid)} &middot; Qarzdorlik {money(stats.totalDebt)}</div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "#9891B8", display: "flex", alignItems: "center", gap: 5 }}><CreditCard size={13} /> KARTA QOLDIG'I</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, color: stats.cardBalance >= 0 ? "#fff" : "#FF8FA3" }}>{money(stats.cardBalance)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9891B8", display: "flex", alignItems: "center", gap: 5 }}><Banknote size={13} /> NAQD QOLDIQ</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, color: stats.cashBalance >= 0 ? "#fff" : "#FF8FA3" }}>{money(stats.cashBalance)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9891B8", display: "flex", alignItems: "center", gap: 5 }}><Landmark size={13} /> BANK QOLDIG'I</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, color: stats.bankBalance >= 0 ? "#fff" : "#FF8FA3" }}>{money(stats.bankBalance)}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, height: 8, borderRadius: 6, background: "rgba(255,255,255,0.1)", overflow: "hidden", display: "flex" }}>
          {(() => {
            const posCard = Math.max(0, stats.cardBalance);
            const posCash = Math.max(0, stats.cashBalance);
            const posBank = Math.max(0, stats.bankBalance);
            const posTotal = posCard + posCash + posBank;
            const cardPct = posTotal > 0 ? (posCard / posTotal) * 100 : 33.3;
            const cashPct = posTotal > 0 ? (posCash / posTotal) * 100 : 33.3;
            const bankPct = posTotal > 0 ? (posBank / posTotal) * 100 : 33.4;
            return (
              <>
                <div style={{ width: `${cardPct}%`, background: THEME.violet }} />
                <div style={{ width: `${cashPct}%`, background: THEME.green }} />
                <div style={{ width: `${bankPct}%`, background: THEME.blue, boxShadow: `0 0 10px ${THEME.blue}` }} />
              </>
            );
          })()}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8B84AD", marginTop: 4 }}>
          <span>Karta</span><span>Naqd</span><span>Bank</span>
        </div>
      </Card>
    ),
    debtAlert: () => stats.totalDebt <= 0 ? null : (
      <Card className="uvix-dash-card"
        onClick={() => go("orders", { onlyDebt: true })}
        style={{ background: `linear-gradient(120deg, ${THEME.amberBg} 0%, ${THEME.roseBg} 100%)`, border: `1.5px solid ${THEME.roseBorder}`, boxShadow: "0 4px 18px rgba(245,69,92,0.12)", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: THEME.rose, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.rose, textTransform: "uppercase", letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
                Umumiy qarzdorlik
                {subFilter !== "all" && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: THEME.rose, padding: "2px 7px", borderRadius: 10, textTransform: "none", letterSpacing: 0 }}>{subFilter}</span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: THEME.roseText, letterSpacing: -0.3 }}>{money(stats.totalDebt)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: THEME.roseMuted, maxWidth: 300 }}>Umumiy buyurtma summasidan hisoblanadi (barcha to'lovlar yig'indisi ayirilib) — qo'shilgan qiymatga bog'liq emas</div>
        </div>
      </Card>
    ),
    m_todayPaid: () => <MetricCard label="Bugungi to'lov" value={money(stats.todayPaid)} accent={THEME.green} bg={THEME.greenBg} icon={TrendingUp} onClick={() => go("operations", { typeFilter: "kirim", from: today, to: today })} />,
    m_todayExpense: () => <MetricCard label="Bugungi rasxod" value={money(stats.todayExpense)} accent={THEME.rose} bg={THEME.roseBg} icon={TrendingDown} onClick={() => go("operations", { typeFilter: "chiqim", from: today, to: today })} />,
    m_monthPaid: () => <MetricCard label="Shu oydagi to'lov" value={money(stats.monthPaid)} accent={THEME.green} bg={THEME.greenBg} icon={TrendingUp} onClick={() => go("operations", { typeFilter: "kirim", from: monthStart, to: today })} />,
    m_monthExpense: () => <MetricCard label="Shu oydagi rasxod" value={money(stats.monthExpense)} accent={THEME.rose} bg={THEME.roseBg} icon={TrendingDown} onClick={() => go("operations", { typeFilter: "chiqim", from: monthStart, to: today })} />,
    m_totalArea: () => <MetricCard label="Umumiy kvadrat" value={`${stats.totalArea.toLocaleString("ru-RU")} kv/m`} accent={THEME.cyan} bg={THEME.cyanBg} icon={FolderTree} onClick={() => go("orders", {})} />,
    m_orderValue: () => (
      <MetricCard
        label="Buyurtmalar qiymati"
        value={money(stats.totalOrderValue)}
        sub={stats.totalAgreementUsd > 0 ? usd(stats.totalAgreementUsd) : `To'langan: ${money(stats.totalPaid)}`}
        pctBadge={`${stats.collectionRatePct.toFixed(1)}% yig'ilgan`}
        progressPct={stats.collectionRatePct}
        accent={THEME.violet}
        bg={THEME.violetSoft}
        icon={Wallet}
        variant="filled"
        onClick={() => go("orders", {})}
      />
    ),
    m_addedValue: () => (
      <MetricCard
        label="Qo'shilgan qiymat"
        value={money(stats.totalAddedValue)}
        pctBadge={`${stats.addedValueMarginPct.toFixed(1)}% marja`}
        progressPct={Math.max(0, stats.addedValueMarginPct)}
        accent={stats.totalAddedValue >= 0 ? THEME.green : THEME.rose}
        bg={stats.totalAddedValue >= 0 ? THEME.greenBg : THEME.roseBg}
        icon={Wallet}
        onClick={() => go("orders", {})}
      />
    ),
    m_totalPaid: () => (
      <MetricCard
        label="Jami to'lov"
        value={money(stats.totalPaid)}
        sub={`Shu oy: ${money(stats.monthPaid)}`}
        trendPct={stats.momPaymentGrowthPct}
        goodDirection="up"
        accent={THEME.green}
        bg={THEME.greenBg}
        icon={TrendingUp}
        onClick={() => go("operations", { typeFilter: "kirim" })}
      />
    ),
    m_totalExpense: () => (
      <MetricCard
        label="Jami rasxod"
        value={money(stats.totalExpense)}
        pctBadge={`${stats.expenseToIncomeRatioPct.toFixed(1)}% tushumdan`}
        progressPct={Math.min(100, stats.expenseToIncomeRatioPct)}
        accent={stats.expenseToIncomeRatioPct >= 80 ? THEME.rose : stats.expenseToIncomeRatioPct >= 50 ? THEME.amber : THEME.green}
        bg={stats.expenseToIncomeRatioPct >= 80 ? THEME.roseBg : stats.expenseToIncomeRatioPct >= 50 ? THEME.amberBg : THEME.greenBg}
        icon={TrendingDown}
        onClick={() => go("operations", { typeFilter: "chiqim" })}
      />
    ),
    m_materialExpense: () => <MetricCard label="Material xarajati" value={money(stats.materialExpense)} accent={THEME.amber} bg={THEME.amberBg} icon={Wallet} onClick={() => go("operations", { typeFilter: "chiqim", catFilter: "Material" })} />,
    m_kraska: () => <MetricCard label="Kraska hisob-kitobi" value={money(stats.totalKraska)} accent={THEME.amber} bg={THEME.amberBg} icon={Wallet} onClick={() => go("orders", {})} />,
    m_totalMoney: () => <MetricCard label="Jami pul" value={money(stats.totalMoney)} accent={stats.totalMoney >= 0 ? THEME.green : THEME.rose} bg={stats.totalMoney >= 0 ? THEME.greenBg : THEME.roseBg} icon={Landmark} onClick={() => go("operations", {})} />,
    m_topDebtors: () => (
      <Card className="uvix-dash-card" style={{ padding: 0 }}>
        <div style={{ padding: "18px 18px 10px", fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Eng katta qarzdor mijozlar
          <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, background: THEME.surface, padding: "3px 10px", borderRadius: 20 }}>{topDebtors.length} ta</span>
        </div>
        {topDebtors.length === 0 ? (
          <div style={{ padding: "0 16px 18px" }}><EmptyState text="Qarzdorlik yo'q" /></div>
        ) : (
          <div style={{ padding: "4px 10px 12px" }}>
            {topDebtors.map((d, i) => (
              <div key={d.customer} className="uvix-row" onClick={() => go("orders", { search: d.customer, onlyDebt: true })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px", borderRadius: 14, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${THEME.rose}, #FF8FA3)`, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {(d.customer || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.customer || "-"}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>#{i + 1} eng katta qarzdor</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: THEME.rose, background: THEME.roseBg, padding: "5px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>{money(d.debt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    m_recentOrders: () => (
      <Card className="uvix-dash-card" style={{ padding: 0 }}>
        <div style={{ padding: "18px 18px 10px", fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          So'nggi buyurtmalar
          <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, background: THEME.surface, padding: "3px 10px", borderRadius: 20 }}>{recentOrders.length} ta</span>
        </div>
        {recentOrders.length === 0 ? (
          <div style={{ padding: "0 16px 18px" }}><EmptyState text="Hali buyurtma yo'q" /></div>
        ) : (
          <div style={{ padding: "4px 10px 12px" }}>
            {recentOrders.map((o) => (
              <div key={o.id} className="uvix-row" onClick={() => go("orders", { search: o.orderNumber })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px", borderRadius: 14, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: THEME.violetSoft, color: THEME.violet, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Package size={17} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "-"}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{o.orderNumber} &middot; {o.date}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: THEME.text, whiteSpace: "nowrap" }}>{money(o.agreementUzs || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    dailyChart: () => (
      <Card className="uvix-dash-card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Kunlik to'lov va rasxod (14 kun)</div>
        {stats.allPayments.length === 0 && dateFilteredExpenses.length === 0 ? <EmptyState text="Hozircha ma'lumot yo'q" /> : dailyData.length === 0 ? (
          <div style={{ fontSize: 12.5, color: THEME.muted, textAlign: "center", padding: "24px 0" }}>Tanlangan davr juda uzun — kunlik grafik ko'rsatilmaydi, "Oylik" grafikka qarang</div>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: THEME.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: THEME.muted }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="To'lov" fill={THEME.violet} radius={[8, 8, 0, 0]} />
                <Bar dataKey="Rasxod" fill={THEME.rose} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    ),
    categoryPie: () => (
      <Card className="uvix-dash-card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Rasxod kategoriyalari (shu oy)</div>
        {categoryPie.length === 0 ? <EmptyState text="Rasxod yo'q" /> : (
          <>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categoryPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {categoryPie.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8, maxHeight: 130, overflowY: "auto" }} className="uvix-scroll">
              {categoryPie.map((c, i) => {
                const catTotal = categoryPie.reduce((s, x) => s + x.value, 0);
                const sharePct = catTotal > 0 ? (c.value / catTotal) * 100 : 0;
                return (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: THEME.text }}>{c.name}</span>
                    </div>
                    <span style={{ fontWeight: 700, color: THEME.muted, flexShrink: 0 }}>{sharePct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    ),
    monthlyChart: () => (
      <Card className="uvix-dash-card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Oylik to'lov va rasxod (6 oy)</div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: THEME.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: THEME.muted }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="To'lov" fill={THEME.cyan} radius={[8, 8, 0, 0]} />
              <Bar dataKey="Rasxod" fill={THEME.amber} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    paymentMethods: () => (
      <Card className="uvix-dash-card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>To'lov turlari taqqoslash</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            { label: "Karta", pct: stats.cardSharePct, color: THEME.violet },
            { label: "Naqd", pct: stats.cashSharePct, color: THEME.green },
            { label: "Bank", pct: stats.bankSharePct, color: THEME.blue },
          ].map((it) => (
            <div key={it.label} style={{ flex: 1, padding: "8px 10px", background: THEME.surface, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: it.color }} /> {it.label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginTop: 2 }}>{it.pct.toFixed(1)}%</div>
            </div>
          ))}
        </div>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={[
              { label: "Karta", "To'lov": stats.cardPaid, Rasxod: stats.cardExpense },
              { label: "Naqd", "To'lov": stats.cashPaid, Rasxod: stats.cashExpense },
              { label: "Bank", "To'lov": stats.bankPaid, Rasxod: stats.bankExpense },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: THEME.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: THEME.muted }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="To'lov" fill={THEME.green} radius={[8, 8, 0, 0]} />
              <Bar dataKey="Rasxod" fill={THEME.rose} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    topOrders: () => (
      <Card className="uvix-dash-card" style={{ padding: 0 }}>
        {topOrders.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState text="Hali buyurtma yo'q" /></div>
        ) : (
          <div style={{ padding: 8 }}>
            {topOrders.map((o, i) => (
              <div key={o.id} className="uvix-row" onClick={() => go("orders", { search: o.orderNumber })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", borderRadius: 9, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: THEME.violetSoft, color: THEME.violet, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "-"}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{o.orderNumber} &middot; {o.date}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: THEME.violet, whiteSpace: "nowrap" }}>{money(o.agreementUzs || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    brakSummary: () => (
      <MetricCard
        label="Jami Brak xarajati"
        value={money(totalBrak)}
        sub={totalBrak > 0 ? "Buyurtmalar qo'shilgan qiymatidan ayirilgan" : "Hozircha brak qayd etilmagan"}
        accent={totalBrak > 0 ? THEME.rose : THEME.muted}
        bg={totalBrak > 0 ? THEME.roseBg : THEME.surface}
        icon={AlertTriangle}
        onClick={() => go("operations", { typeFilter: "chiqim", catFilter: "Brak" })}
      />
    ),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card className="uvix-dash-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: THEME.muted }}>
          <ListChecks size={14} /> Davr:
        </div>
        <div style={{ display: "flex", gap: 3, background: THEME.surface, borderRadius: 20, padding: 2 }}>
          {[{ v: "all", l: "Barchasi" }, { v: "month", l: "Oy" }, { v: "range", l: "Oraliq" }].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setPeriodMode(opt.v)}
              style={{
                padding: "5px 12px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                background: periodMode === opt.v ? THEME.violet : "transparent",
                color: periodMode === opt.v ? "#fff" : THEME.muted,
              }}
            >
              {opt.l}
            </button>
          ))}
        </div>
        {periodMode === "month" && (
          <input
            type="month"
            value={periodMonth}
            onChange={(e) => { setPeriodMonth(e.target.value); setMonthTouched(true); }}
            style={{ ...getInputStyle(), width: "auto", padding: "6px 10px", fontSize: 13 }}
          />
        )}
        {periodMode === "month" && monthTouched && (
          <button
            type="button"
            onClick={() => { setPeriodMonth(todayStr().slice(0, 7)); setMonthTouched(false); }}
            style={{ background: "none", border: "none", color: THEME.violet, cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 }}
          >
            Joriy oyga qaytish
          </button>
        )}
        {periodMode === "range" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={{ ...getInputStyle(), width: "auto", padding: "6px 10px", fontSize: 13 }} />
            <span style={{ color: THEME.muted, fontSize: 12 }}>—</span>
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={{ ...getInputStyle(), width: "auto", padding: "6px 10px", fontSize: 13 }} />
          </div>
        )}
        {effectivePeriod && (
          <span style={{ fontSize: 11.5, color: THEME.violet, fontWeight: 700, background: THEME.violetSoft, padding: "4px 10px", borderRadius: 20 }}>
            {effectivePeriod.from} — {effectivePeriod.to}
          </span>
        )}
      </Card>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "2px 2px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {[
            { color: THEME.green, label: "Tushum / ijobiy" },
            { color: THEME.rose, label: "Chiqim / qarz" },
            { color: THEME.amber, label: "Buyurtma ichidagi xarajat" },
            { color: THEME.cyan, label: "O'lchov (pul emas)" },
            { color: THEME.violet, label: "Umumiy / neytral" },
          ].map((it) => (
            <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: THEME.muted, fontWeight: 600 }}>{it.label}</span>
            </div>
          ))}
        </div>
        {isAdmin && (
          <Button variant={editMode ? "primary" : "ghost"} onClick={() => setEditMode((v) => !v)}>
            <Settings size={14} /> {editMode ? "Tahrirlashni tugatish" : "Dashboardni tahrirlash"}
          </Button>
        )}
      </div>

      {editMode && isAdmin && (
        <DashboardConstructorSection settings={settings} onSaveSettings={onSaveSettings} />
      )}

      {DASHBOARD_GROUPS.map((g) => {
        const groupIds = new Set(DASHBOARD_WIDGET_CATALOG.filter((c) => c.group === g.id).map((c) => c.id));
        const items = layout.filter((w) => w.visible && groupIds.has(w.id));
        if (items.length === 0) return null;
        const groupIcons = { hero: null, today: TrendingUp, kpis: Package, customers: Users, charts: FileBarChart2 };
        const Icon = groupIcons[g.id];
        return (
          <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Icon && <SectionTitle icon={Icon} text={g.label} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 }} className="uvix-dash-grid">
              {items.map((w) => {
                const renderFn = WIDGETS[w.id];
                if (!renderFn) return null;
                const content = renderFn();
                if (!content) return null;
                const span = DASHBOARD_SIZE_SPANS[w.size] || 12;
                return (
                  <div key={w.id} style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
