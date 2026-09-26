import { PAYMENT_TYPES } from "../constants.js";
import { THEME } from "../theme.js";

export function paymentTypeLabel(pt) {
  const found = PAYMENT_TYPES.find((p) => p.v === pt);
  return found ? found.l : "Naqd";
}
export function paymentTypeBadgeColors(pt) {
  if (pt === "karta") return { color: THEME.violetDark, bg: THEME.violetSoft };
  if (pt === "bank") return { color: THEME.blue, bg: THEME.blueBg };
  return { color: "#0F6E56", bg: THEME.greenBg };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
// Mahalliy (brauzer/foydalanuvchi) sanasini "YYYY-MM-DD" ko'rinishida qaytaradi.
// MUHIM: toISOString() har doim UTC vaqtini beradi — Toshkent (UTC+5) uchun bu
// kechasi 00:00–04:59 oralig'ida "kechagi kun"ni ko'rsatib, sana bir kun orqada
// qolib ketishiga sabab bo'lardi. Shu sababli getFullYear/getMonth/getDate
// (mahalliy vaqt komponentlari) orqali hisoblanadi.
export function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function todayStr() {
  return localDateStr(new Date());
}
export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  const sign = n < 0 ? "-" : "";
  n = Math.round(Math.abs(n));
  return sign + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
export function money(n) {
  return fmt(n) + " so'm";
}
export function usd(n) {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : "";
}
export function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}
export function dateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
}
export function monthLabel(mk) {
  const [y, m] = mk.split("-");
  const names = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];
  return names[parseInt(m, 10) - 1] + " " + y.slice(2);
}

// Brauzerlar o'zbek tilidagi sana formatini to'liq qo'llamaydi ("2026 M09 25, Fri"), shuning uchun qo'lda
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
export function longDateUz(d = new Date()) {
  const wd = UZ_WEEKDAYS[d.getDay()];
  return `${wd[0].toUpperCase() + wd.slice(1)}, ${d.getDate()}-${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function shortDateUz(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return dateStr;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}${sameYear ? "" : " " + d.getFullYear()}`;
}
