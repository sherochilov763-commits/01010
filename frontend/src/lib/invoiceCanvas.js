// invoiceCanvas.js — hisob-faktura rasmini brauzerda chizadi (1080px kenglik, Telegram'da aniq o'qiladi).
// Serverda brauzer kerak emas: tayyor rasm userbot orqali mijozga yuboriladi.
// Eslatma: buyurtmadagi $ narxlar ichki (kraska) hisob-kitobi uchun — mijozga ko'rsatilmaydi;
// rasmda faqat ish/material, hajm va kelishilgan umumiy summa bo'ladi.
import { orderTotalPaid } from "./finance.js";
import { todayStr } from "./format.js";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const C = { ink: "#17142A", muted: "#6B6880", line: "#E6E4EE", paper: "#FFFFFF", green: "#0B7A52", crop: "#B9B6C9" };
const STRIP = ["#00AEEF", "#EC008C", "#FFD400", "#17142A", "#F2F1F6", "#6A4BF0"];
const W = 1080, PAD = 92;
const num = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const som = (n) => `${num(n)} so'm`;
const dLabel = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return `${d}-${MONTHS[m - 1]} ${y}`; };
const dShort = (s) => { const [, m, d] = String(s).slice(0, 10).split("-").map(Number); return `${d}-${MONTHS[m - 1]}`; };
const area = (a) => `${String(Math.round(a * 100) / 100).replace(".", ",")} m²`;
const F = {
  brand: "700 44px Unbounded, sans-serif", no: "600 26px Unbounded, sans-serif", total: "700 38px Unbounded, sans-serif",
  h1: "600 64px Onest, sans-serif", body: "400 23px Onest, sans-serif", bodyM: "500 23px Onest, sans-serif", small: "400 19px Onest, sans-serif",
  sub: "500 20px Onest, sans-serif", label: "500 20px Onest, sans-serif", strong: "600 26px Onest, sans-serif", to: "400 24px Onest, sans-serif", toB: "600 24px Onest, sans-serif",
};

export async function ensureInvoiceFonts() {
  if (!document.fonts?.load) return;
  await Promise.all(["700 44px Unbounded", "600 26px Unbounded", "400 23px Onest", "500 23px Onest", "600 26px Onest"].map((f) => document.fonts.load(f).catch(() => {})));
}

export function invoiceLines(order) {
  const lines = (order.materialLines || []).filter((l) => (l.area || 0) > 0 || l.materialType);
  if (lines.length <= 1) {
    const l = lines[0];
    const title = l?.materialType ? `UV bosma — ${l.materialType}` : order.subcategory ? `UV bosma (${order.subcategory})` : "UV bosma";
    return [{ title, sub: order.jobTitle || "", qty: order.area ? area(order.area) : l?.area ? area(l.area) : "—", sum: order.agreementUzs || 0 }];
  }
  return lines.map((l) => ({ title: `UV bosma — ${l.materialType || "material"}`, sub: "", qty: l.area ? area(l.area) : "—", sum: null }));
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// { order, customer: { name, phone }, cfg: { cardNumber, cardHolder, managerPhone, managerName, companyLine } }
export function drawInvoice({ order, customer, cfg }) {
  const lines = invoiceLines(order);
  const paid = orderTotalPaid(order);
  const total = order.agreementUzs || 0;
  const due = Math.max(0, total - paid);
  const pays = (order.payments || []).filter((p) => !p.deletedAt);
  const hasPay = !!(cfg.cardNumber || cfg.managerPhone);
  const rowH = (l) => (l.sub ? 104 : 80);
  const H = 84 + 90 + 150 + 130 + 20 + lines.reduce((s, l) => s + rowH(l), 0) + 40 + (paid ? 100 : 50) + 120 + (hasPay ? 150 : 0) + 110 + 22;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  const t = (x, y, s, font, color = C.ink, align = "left") => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(s, x, y); };

  // kesish belgilari (bosmaxona uslubi)
  ctx.strokeStyle = C.crop; ctx.lineWidth = 1.5;
  const crop = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x, y + dy * 44); ctx.lineTo(x, y); ctx.lineTo(x + dx * 44, y); ctx.stroke(); };
  crop(72, 28, -1, 1); crop(W - 72, 28, 1, 1); crop(72, H - 60, -1, -1); crop(W - 72, H - 60, 1, -1);

  let y = 84 + 44;
  t(PAD, y, "UVIX", F.brand);
  t(W - PAD, y - 14, order.orderNumber || "", F.no, C.ink, "right");
  t(W - PAD, y + 20, dLabel(todayStr()), F.sub, C.muted, "right");
  t(PAD, y + 38, cfg.companyLine || "UV bosma ustaxonasi", F.sub, C.muted);

  y += 170;
  t(PAD, y, "Hisob-faktura", F.h1);
  y += 52;
  ctx.font = F.to; const lw = ctx.measureText("Mijoz: ").width;
  t(PAD, y, "Mijoz: ", F.to, C.muted);
  ctx.font = F.toB; const nm = fit(ctx, customer?.name || order.customer || "", 560);
  t(PAD + lw, y, nm, F.toB);
  if (customer?.phone) { ctx.font = F.toB; t(PAD + lw + ctx.measureText(nm).width + 22, y, customer.phone, F.to, C.muted); }
  if (order.date) { y += 36; t(PAD, y, `Buyurtma sanasi: ${dLabel(order.date)}`, F.small, C.muted); }

  // jadval
  y += 74;
  const colQty = W - PAD - 260, colSum = W - PAD;
  t(PAD, y, "Ish", F.label, C.muted); t(colQty, y, "Hajmi", F.label, C.muted, "right"); t(colSum, y, "Summa", F.label, C.muted, "right");
  y += 16; ctx.fillStyle = C.ink; ctx.fillRect(PAD, y, W - PAD * 2, 2);
  for (const l of lines) {
    const h = rowH(l);
    ctx.font = F.body;
    t(PAD, y + 46, fit(ctx, l.title, colQty - PAD - 180), F.body);
    if (l.sub) { ctx.font = F.small; t(PAD, y + 76, fit(ctx, l.sub, colQty - PAD - 180), F.small, C.muted); }
    t(colQty, y + 46, l.qty, F.body, C.ink, "right");
    t(colSum, y + 46, l.sum == null ? "" : num(l.sum), F.body, C.ink, "right");
    y += h; ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - PAD * 2, 1);
  }

  // jami
  const tx = W - PAD - 620;
  y += 66;
  t(tx, y, "Jami", F.body); t(W - PAD, y, som(total), F.body, C.ink, "right");
  if (paid) {
    y += 50;
    const when = pays.length === 1 && pays[0].date ? ` (${dShort(pays[0].date)})` : pays.length > 1 ? ` (${pays.length} ta to'lov)` : "";
    t(tx, y, `To'langan${when}`, F.body, C.green); t(W - PAD, y, `−${som(paid)}`, F.body, C.green, "right");
  }
  y += 34;
  const bh = 100, r = 22;
  ctx.fillStyle = due > 0 ? C.ink : C.green;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, y, W - PAD - tx, bh, r) : ctx.rect(tx, y, W - PAD - tx, bh); ctx.fill();
  t(tx + 34, y + 60, due > 0 ? "To'lash kerak" : "To'liq to'langan", F.sub, "rgba(255,255,255,0.78)");
  t(W - PAD - 34, y + 64, som(due > 0 ? due : total), F.total, "#FFFFFF", "right");
  y += bh;

  // to'lov rekvizitlari
  if (hasPay) {
    y += 70;
    const half = (W - PAD * 2) / 2;
    if (cfg.cardNumber) {
      t(PAD, y, "Karta orqali", F.label, C.muted);
      t(PAD, y + 38, cfg.cardNumber, F.strong);
      if (cfg.cardHolder) t(PAD, y + 70, cfg.cardHolder, F.small, C.muted);
    }
    if (cfg.managerPhone) {
      const x = cfg.cardNumber ? PAD + half : PAD;
      t(x, y, "Savollar bo'yicha", F.label, C.muted);
      t(x, y + 38, cfg.managerPhone, F.strong);
      if (cfg.managerName) t(x, y + 70, cfg.managerName, F.small, C.muted);
    }
    y += 80;
  }
  y += 70;
  t(PAD, y, due > 0 ? "To'lovdan so'ng chek rasmini shu chatga yuboring — biz tasdiqlaymiz." : "Buyurtmangiz uchun rahmat!", F.sub, C.muted);

  // CMYK nazorat chizig'i
  const sw = W / STRIP.length;
  STRIP.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(Math.round(i * sw), H - 22, Math.ceil(sw), 22); });
  return cv;
}

export function invoiceCaption(order, cfg) {
  const due = Math.max(0, (order.agreementUzs || 0) - orderTotalPaid(order));
  return [
    `Assalomu alaykum! Buyurtmangiz bo'yicha hisob-faktura ${order.orderNumber || ""}.`.replace(" .", "."),
    due > 0 ? `To'lash kerak: ${som(due)}` : `Buyurtma to'liq to'langan — rahmat!`,
    due > 0 && cfg.cardNumber ? `Karta: ${cfg.cardNumber}${cfg.cardHolder ? ` (${cfg.cardHolder})` : ""}` : null,
  ].filter(Boolean).join("\n");
}
