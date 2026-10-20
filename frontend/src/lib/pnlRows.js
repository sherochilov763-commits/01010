// pnlRows.js — «Foyda va zarar» qatorlari (eksport uchun, JSX'siz). Ekrandagi jadval bilan bir xil tartib.
export function pnlRowsPlain(p) {
  const sh = p.shares;
  return [
    { k: "income", l: "Tushum (to'lovlar)", v: (c) => c.income },
    { k: "direct", l: "To'g'ridan-to'g'ri rasxod", v: (c) => -c.direct },
    ...(p.hasStaff ? [{ k: "staff", l: "Umumiy xodimlar oyligi (bajargan ishi bo'yicha)", v: (c) => -c.staff }] : []),
    { k: "common", l: `Umumiy rasxod ulushi (${Math.round(sh.UVIXPRINT * 100)}% / ${Math.round(sh.UVONYX * 100)}%)`, v: (c) => -c.common },
    { k: "profit", l: "Sof foyda", v: (c) => c.profit, strong: true },
    { k: "margin", l: "Marja", v: (c) => c.margin, isPct: true },
    { k: "prev", l: p.months.length > 1 ? "Oldingi davr sof foyda" : "O'tgan oy sof foyda", v: (c) => c.prevProfit },
    { k: "change", l: "Farq", v: (c) => c.diff },
    { k: "debt", l: "Qarzdorlik (barcha davr)", v: (c) => c.debt },
  ];
}
