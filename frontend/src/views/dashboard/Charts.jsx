// Charts.jsx — dashboard grafiklari. recharts og'ir kutubxona, shuning uchun bu fayl alohida
// bo'lak bo'lib yuklanadi: raqamlar darhol chiqadi, grafiklar bir lahzadan so'ng qo'shiladi.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { THEME } from "../../theme.js";
import { money } from "../../lib/format.js";

// O'q yozuvlari ixcham: 12 000 000 -> 12 mln
const short = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)} mlrd`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)} mln`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(0)} ming`;
  return String(v);
};
const tip = () => ({
  contentStyle: { fontSize: 12.5, borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, boxShadow: THEME.shadowMd, padding: "8px 10px" },
  labelStyle: { color: THEME.muted, marginBottom: 4 },
  cursor: { fill: THEME.hover },
});

export function MoneyBarChart({ data, bars, xTickSize = 10 }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data}>
        <CartesianGrid stroke={THEME.chartGrid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: xTickSize, fill: THEME.dim }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10.5, fill: THEME.dim }} axisLine={false} tickLine={false} width={52} tickFormatter={short} />
        <Tooltip formatter={(v) => money(v)} {...tip()} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: THEME.muted }} />
        {bars.map((b) => <Bar key={b.key} dataKey={b.key} fill={b.color} radius={[3, 3, 0, 0]} maxBarSize={28} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, colors }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={1.5} stroke={THEME.card} strokeWidth={2}>
          {data.map((entry, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => money(v)} {...tip()} />
      </PieChart>
    </ResponsiveContainer>
  );
}
