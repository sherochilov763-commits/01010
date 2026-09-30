// Charts.jsx — dashboard grafiklari. recharts og'ir kutubxona, shuning uchun bu fayl alohida
// bo'lak bo'lib yuklanadi: raqamlar darhol chiqadi, grafiklar bir lahzadan so'ng qo'shiladi.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { THEME } from "../../theme.js";
import { fmt, money } from "../../lib/format.js";

export function MoneyBarChart({ data, bars, xTickSize = 10 }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: xTickSize, fill: THEME.muted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: THEME.muted }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => fmt(v)} />
        <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {bars.map((b) => <Bar key={b.key} dataKey={b.key} fill={b.color} radius={[8, 8, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, colors }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((entry, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
