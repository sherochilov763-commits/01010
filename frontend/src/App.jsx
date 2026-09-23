import { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";
import { apiGet, apiSet, authListEmployees, authLogin, authLoginByName, authLogout, authResetAdminPin, sendBackupNow, requestPinReset, confirmPinReset, uploadPhotos, deletePhoto, fetchTelegramUserStatus, connectTelegramUser, disconnectTelegramUser, fetchTelegramMessages, sendTelegramUserMessage } from "./storage.js";
import {
  LayoutDashboard, TrendingUp, TrendingDown, ListChecks, FileBarChart2,
  FolderTree, Users, Settings, Plus, Search, Download, Printer, Trash2,
  Pencil, X, LogOut, Wallet, CreditCard, Banknote, ChevronDown, Lock,
  ShieldCheck, ClipboardList, AlertTriangle, Package, Eye, Landmark, Upload,
  Users2, Phone, ArrowRight, ArrowLeft,
} from "lucide-react";

function hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}
function mixColors(hex1, hex2, weight) {
  const c1 = hexToRgb(hex1), c2 = hexToRgb(hex2);
  return rgbToHex(c1.r + (c2.r - c1.r) * weight, c1.g + (c2.g - c1.g) * weight, c1.b + (c2.b - c1.b) * weight);
}

const APPEARANCE_MODE_PRESETS = {
  light: { ink: "#100E1A", surface: "#F7F7FB", card: "#FFFFFF", text: "#1A1826", muted: "#8A8698", mutedDark: "#5C5870", border: "#EDEBF3", borderSoft: "rgba(20,16,40,0.06)" },
  soft: { ink: "#100E1A", surface: "#EEF2F7", card: "#F9FAFB", text: "#18202A", muted: "#727B87", mutedDark: "#4B5563", border: "#DFE4EA", borderSoft: "rgba(24,32,42,0.06)" },
  dark: { ink: "#0B0B10", surface: "#111118", card: "#1B1B24", text: "#F5F5F7", muted: "#AAA7B5", mutedDark: "#C7C4D1", border: "#30303A", borderSoft: "rgba(255,255,255,0.08)" },
};
const APPEARANCE_COLOR_PRESETS = {
  purple: { primary: "#7C5CFC", accent: "#2DD4EE" },
  blue: { primary: "#2563EB", accent: "#06B6D4" },
  emerald: { primary: "#059669", accent: "#14B8A6" },
  orange: { primary: "#EA580C", accent: "#F59E0B" },
  pink: { primary: "#DB2777", accent: "#8B5CF6" },
};
const APPEARANCE_RADIUS_PRESETS = { sharp: 8, medium: 18, rounded: 26 };
const DEFAULT_APPEARANCE = {
  mode: "light", colorScheme: "purple", customPrimary: "#7C5CFC", customAccent: "#2DD4EE",
  density: "comfortable", radius: "medium", sidebarStyle: "modern",
};

function buildTheme(appearance) {
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const mode = APPEARANCE_MODE_PRESETS[a.mode] || APPEARANCE_MODE_PRESETS.light;
  const colorSet = a.colorScheme === "custom"
    ? { primary: a.customPrimary || DEFAULT_APPEARANCE.customPrimary, accent: a.customAccent || DEFAULT_APPEARANCE.customAccent }
    : (APPEARANCE_COLOR_PRESETS[a.colorScheme] || APPEARANCE_COLOR_PRESETS.purple);
  const isDark = a.mode === "dark";
  const softBg = (hex) => mixColors(hex, mode.card, isDark ? 0.8 : 0.9);
  return {
    ink: mode.ink, ink2: mixColors(mode.ink, "#ffffff", 0.08), ink3: mixColors(mode.ink, "#ffffff", 0.14),
    surface: mode.surface, card: mode.card, text: mode.text, muted: mode.muted, mutedDark: mode.mutedDark,
    border: mode.border, borderSoft: mode.borderSoft,
    violet: colorSet.primary, violetDark: mixColors(colorSet.primary, "#000000", 0.22), violetSoft: softBg(colorSet.primary),
    cyan: colorSet.accent, cyanBg: softBg(colorSet.accent),
    green: "#12B76A", greenBg: softBg("#12B76A"),
    rose: "#F5455C", roseBg: softBg("#F5455C"),
    amber: "#F5A524", amberBg: softBg("#F5A524"),
    blue: "#3B82F6", blueBg: softBg("#3B82F6"),
    shadowSm: isDark ? "0 1px 2px rgba(0,0,0,0.35)" : "0 1px 2px rgba(20,16,40,0.04)",
    shadowMd: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 2px 8px rgba(20,16,40,0.05), 0 8px 24px rgba(20,16,40,0.04)",
    shadowLg: isDark ? "0 16px 40px rgba(0,0,0,0.55)" : "0 12px 32px rgba(20,16,40,0.10)",
    radius: APPEARANCE_RADIUS_PRESETS[a.radius] || APPEARANCE_RADIUS_PRESETS.medium,
  };
}
let THEME = buildTheme(DEFAULT_APPEARANCE);

const DEFAULT_CATEGORIES = {
  "Material": ["Shisha", "MDF", "Plastik", "Alyuminiy", "Qog'oz", "Boshqa material"],
  "Kraska": ["UV kraska", "Primer", "Lak", "Tozalash vositalari", "Boshqa"],
  "Brak": ["Material braki", "Bosma xatosi", "Kesish xatosi", "Boshqa"],
  "Ishlab chiqarish": ["UV print", "3D print", "Kesish", "Frezer", "Post-processing", "Boshqa"],
  "Xodimlar": ["Oylik", "Avans", "Bonus"],
  "Ijara": ["Sex", "Ofis", "Ombor"],
  "Kommunal": ["Elektr", "Suv", "Gaz", "Internet"],
  "Logistika": ["Dostavka", "Taxi", "Kuryer", "Transport"],
  "Marketing": ["Instagram", "Reklama", "SMM", "Banner"],
  "Ta'mirlash": ["Printer", "Stanok", "Kompyuter", "Boshqa texnika"],
  "Asbob-uskunalar": ["Asbob-uskunalar"],
  "Dastur va servislar": ["CRM", "AI", "Adobe", "Hosting", "Boshqa"],
  "Bank": ["Bank komissiyasi", "Bank xizmati"],
  "Soliq": ["Soliq"],
  "Shaxsiy": ["Shaxsiy"],
  "Boshqa": ["Boshqa"],
};


const LEAD_STAGES = [
  { key: "new", label: "Yangi lid", color: "#7C5CFC", bg: "#EFE9FE" },
  { key: "negotiation", label: "Muzokara", color: "#D97706", bg: "#FEF3C7" },
  { key: "won", label: "Yopilgan", color: "#0F9D58", bg: "#E3F6EC" },
  { key: "lost", label: "Yo'qotilgan", color: "#E53E5A", bg: "#FCE4E9" },
];

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "orders", label: "Buyurtmalar", icon: Package },
  { key: "crm", label: "CRM", icon: Users2 },
  { key: "expense", label: "Rasxod", icon: TrendingDown },
  { key: "operations", label: "Operatsiyalar", icon: ListChecks },
  { key: "report", label: "Hisobot", icon: FileBarChart2, adminOnly: true },
  { key: "categories", label: "Kategoriyalar", icon: FolderTree },
  { key: "employees", label: "Xodimlar", icon: Users, adminOnly: true },
  { key: "settings", label: "Sozlamalar", icon: Settings },
];

const PAYMENT_TYPES = [
  { v: "karta", l: "Karta", icon: CreditCard, color: "violet" },
  { v: "naqd", l: "Naqd", icon: Banknote, color: "green" },
  { v: "bank", l: "Bank o'tkazma", icon: Landmark, color: "blue" },
];
function paymentTypeLabel(pt) {
  const found = PAYMENT_TYPES.find((p) => p.v === pt);
  return found ? found.l : "Naqd";
}
function paymentTypeBadgeColors(pt) {
  if (pt === "karta") return { color: THEME.violetDark, bg: THEME.violetSoft };
  if (pt === "bank") return { color: THEME.blue, bg: THEME.blueBg };
  return { color: "#0F6E56", bg: THEME.greenBg };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
// Mahalliy (brauzer/foydalanuvchi) sanasini "YYYY-MM-DD" ko'rinishida qaytaradi.
// MUHIM: toISOString() har doim UTC vaqtini beradi — Toshkent (UTC+5) uchun bu
// kechasi 00:00–04:59 oralig'ida "kechagi kun"ni ko'rsatib, sana bir kun orqada
// qolib ketishiga sabab bo'lardi. Shu sababli getFullYear/getMonth/getDate
// (mahalliy vaqt komponentlari) orqali hisoblanadi.
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() {
  return localDateStr(new Date());
}
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  const sign = n < 0 ? "-" : "";
  n = Math.round(Math.abs(n));
  return sign + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function money(n) {
  return fmt(n) + " so'm";
}
function usd(n) {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : "";
}
function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}
function dateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
}
function monthLabel(mk) {
  const [y, m] = mk.split("-");
  const names = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];
  return names[parseInt(m, 10) - 1] + " " + y.slice(2);
}


/* ---------------- ORDER / PAYMENT HELPERS (bitta joyda — source of truth) ---------------- */
function orderTotalPaid(order) {
  return (order.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0);
}
function orderDebt(order) {
  return Math.max(0, (order.agreementUzs || 0) - orderTotalPaid(order));
}
function orderBrakSum(order, transactions) {
  if (!transactions || !order) return 0;
  return transactions
    .filter((t) => !t.deletedAt && t.category === "Brak" && t.relatedOrderId === order.id)
    .reduce((s, t) => s + (t.amount || 0), 0);
}
function orderAddedValue(order, transactions) {
  const brak = orderBrakSum(order, transactions);
  return (order.agreementUzs || 0) - (order.kraskaSum || 0) - (order.materialSum || 0) - brak;
}
function generateOrderNumber(existingOrders, dateStr) {
  const datePart = (dateStr || todayStr()).replace(/-/g, "").slice(2); // YYMMDD
  const prefix = `UV-${datePart}-`;
  const sameDay = existingOrders.filter((o) => (o.orderNumber || "").startsWith(prefix));
  const seq = String(sameDay.length + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

function buildExcelWorkbook(orders, expenses, categories, rangeLabel) {
  const totalOrderUzs = orders.reduce((s, o) => s + (o.agreementUzs || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + orderTotalPaid(o), 0);
  const totalDebt = orders.reduce((s, o) => s + orderDebt(o), 0);
  const totalKraska = orders.reduce((s, o) => s + (o.kraskaSum || 0), 0);
  const totalMaterialInOrders = orders.reduce((s, o) => s + (o.materialSum || 0), 0);
  const totalAddedValue = orders.reduce((s, o) => s + orderAddedValue(o, expenses), 0);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

  const catNames = Object.keys(categories || {});
  const catTotals = {};
  catNames.forEach((c) => (catTotals[c] = 0));
  expenses.forEach((t) => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const orderRows = orders.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((o) => ({
    "Buyurtma raqami": o.orderNumber || "", Sana: o.date, Mijoz: o.customer || "", "Sub kategoriya": o.subcategory || "",
    "Material turi": o.materialType || "", "Mas'ul menedjer": o.manager || "", "Kv/m": o.area != null ? o.area : "",
    "Umumiy buyurtma ($)": o.agreementUsd || "", "USD kursi": o.exchangeRate || "", "Umumiy buyurtma (so'm)": o.agreementUzs || "",
    "Kraska summasi": o.kraskaSum || "", "Material summasi": o.materialSum || "",
    "Qo'shilgan qiymat": orderAddedValue(o, expenses), "To'langan": orderTotalPaid(o), Qarzdorlik: orderDebt(o),
    Kommentariya: o.note || "",
  }));

  const paymentRows = [];
  orders.forEach((o) => {
    (o.payments || []).forEach((p) => {
      paymentRows.push({
        "Buyurtma raqami": o.orderNumber || "", Mijoz: o.customer || "", Sana: p.date,
        Summa: p.amount, "To'lov turi": paymentTypeLabel(p.paymentType),
        Izoh: p.comment || "", "Kim qabul qildi": p.createdBy || "",
      });
    });
  });

  const expenseRows = expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => ({
    Sana: t.date, Kategoriya: t.category, Subkategoriya: t.subcategory || "",
    "To'lov turi": paymentTypeLabel(t.paymentType), Summa: t.amount, Izoh: t.note || "",
  }));

  const catRows = Object.entries(catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([Kategoriya, Summa]) => ({ Kategoriya, Summa }));

  const summaryRows = [
    { Korsatkich: "Davr", Qiymat: rangeLabel || "Barcha vaqt" },
    { Korsatkich: "Umumiy buyurtmalar summasi", Qiymat: totalOrderUzs },
    { Korsatkich: "Jami to'langan", Qiymat: totalPaid },
    { Korsatkich: "Jami qarzdorlik", Qiymat: totalDebt },
    { Korsatkich: "Jami kraska", Qiymat: totalKraska },
    { Korsatkich: "Jami material (buyurtmalarda)", Qiymat: totalMaterialInOrders },
    { Korsatkich: "Jami qo'shilgan qiymat", Qiymat: totalAddedValue },
    { Korsatkich: "Jami rasxod", Qiymat: totalExpense },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Umumiy");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "Buyurtmalar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), "To'lovlar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), "Rasxodlar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), "Kategoriyalar");
  return wb;
}
function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}

async function storageGet(key, shared, fallback) {
  try {
    const r = await apiGet(key);
    if (!r) return fallback;
    return JSON.parse(r.value);
  } catch (e) {
    console.error("storage get failed", key, e);
    return fallback;
  }
}
async function storageSet(key, shared, value) {
  try {
    await apiSet(key, JSON.stringify(value));
  } catch (e) {
    console.error("storage set failed", key, e);
  }
}

const SEED_EMPLOYEES = [
  { id: "admin1", name: "Administrator", role: "admin", pin: "0000" },
];
const DEFAULT_SETTINGS = { usdRate: 12700 };

const DASHBOARD_SIZE_SPANS = { sm: 3, md: 4, lg: 6, full: 12 };
const DASHBOARD_SIZE_LABELS = { sm: "Kichik", md: "O'rta", lg: "Katta", full: "To'liq" };
const DASHBOARD_GROUPS = [
  { id: "hero", label: "Asosiy" },
  { id: "today", label: "Bugungi va oylik ko'rsatkichlar" },
  { id: "kpis", label: "Buyurtmalar bo'yicha umumiy ko'rsatkichlar" },
  { id: "customers", label: "Mijozlar va buyurtmalar" },
  { id: "charts", label: "Grafiklar" },
];
const DASHBOARD_WIDGET_CATALOG = [
  { id: "hero", group: "hero", label: "Umumiy buyurtmalar summasi (asosiy karta)", defaultSize: "full" },
  { id: "debtAlert", group: "hero", label: "Qarzdorlik ogohlantirishi", defaultSize: "full" },
  { id: "m_todayPaid", group: "today", label: "Bugungi to'lov", defaultSize: "sm" },
  { id: "m_todayExpense", group: "today", label: "Bugungi rasxod", defaultSize: "sm" },
  { id: "m_monthPaid", group: "today", label: "Shu oydagi to'lov", defaultSize: "sm" },
  { id: "m_monthExpense", group: "today", label: "Shu oydagi rasxod", defaultSize: "sm" },
  { id: "m_totalArea", group: "kpis", label: "Umumiy kvadrat", defaultSize: "md" },
  { id: "m_orderValue", group: "kpis", label: "Buyurtmalar qiymati", defaultSize: "md" },
  { id: "m_addedValue", group: "kpis", label: "Qo'shilgan qiymat", defaultSize: "md" },
  { id: "m_totalPaid", group: "kpis", label: "Jami to'lov", defaultSize: "md" },
  { id: "m_totalExpense", group: "kpis", label: "Jami rasxod", defaultSize: "md" },
  { id: "m_materialExpense", group: "kpis", label: "Material xarajati", defaultSize: "md" },
  { id: "m_kraska", group: "kpis", label: "Kraska hisob-kitobi", defaultSize: "md" },
  { id: "m_totalMoney", group: "kpis", label: "Jami pul", defaultSize: "md" },
  { id: "m_topDebtors", group: "customers", label: "Eng katta qarzdor mijozlar", defaultSize: "lg" },
  { id: "m_recentOrders", group: "customers", label: "So'nggi buyurtmalar", defaultSize: "lg" },
  { id: "topOrders", group: "customers", label: "Eng katta buyurtmalar (yangi shablon)", defaultSize: "lg" },
  { id: "brakSummary", group: "customers", label: "Brak xarajatlari xulosasi (yangi shablon)", defaultSize: "sm" },
  { id: "dailyChart", group: "charts", label: "Kunlik to'lov/rasxod grafigi", defaultSize: "lg" },
  { id: "categoryPie", group: "charts", label: "Rasxod kategoriyalari diagrammasi", defaultSize: "lg" },
  { id: "monthlyChart", group: "charts", label: "Oylik to'lov/rasxod grafigi", defaultSize: "lg" },
  { id: "paymentMethods", group: "charts", label: "To'lov turlari taqqoslash", defaultSize: "lg" },
];
const DEFAULT_DASHBOARD_LAYOUT = [
  "hero", "debtAlert",
  "m_todayPaid", "m_todayExpense", "m_monthPaid", "m_monthExpense",
  "m_totalArea", "m_orderValue", "m_addedValue", "m_totalPaid", "m_totalExpense", "m_materialExpense", "m_kraska", "m_totalMoney",
  "m_topDebtors", "m_recentOrders",
  "dailyChart", "categoryPie", "monthlyChart", "paymentMethods",
].map((id) => ({ id, visible: true, size: DASHBOARD_WIDGET_CATALOG.find((c) => c.id === id).defaultSize }));
function getEffectiveDashboardLayout(settings) {
  const saved = settings?.dashboardLayout;
  const base = Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_DASHBOARD_LAYOUT;
  const known = new Set(base.map((w) => w.id));
  const extra = DASHBOARD_WIDGET_CATALOG.filter((w) => !known.has(w.id)).map((w) => ({ id: w.id, visible: false, size: w.defaultSize }));
  return [...base, ...extra].map((w) => ({ ...w, size: w.size || DASHBOARD_WIDGET_CATALOG.find((c) => c.id === w.id)?.defaultSize || "md" }));
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState([]); // faqat rasxod (chiqim)
  const [orders, setOrders] = useState([]); // buyurtmalar (har birida payments[])
  const [leads, setLeads] = useState([]); // CRM — savdo voronkasi lidlari
  const [pendingLeadForOrder, setPendingLeadForOrder] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [navFilter, setNavFilter] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function navigateWithFilter(targetView, filter) {
    setNavFilter(filter || {});
    setView(targetView);
  }
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      let emp = [];
      try {
        emp = await authListEmployees();
      } catch (e) {
        emp = [];
      }
      setEmployees(emp);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      let tx = await storageGet("uvix:transactions", true, []);
      let ords = await storageGet("uvix:orders", true, null);

      // --- Eski (kirim+chiqim aralash) formatdan migratsiya ---
      if (ords === null) {
        const legacyKirim = tx.filter((t) => t.type === "kirim");
        const migrated = [];
        legacyKirim.forEach((t) => {
          const order = {
            id: t.id || uid(),
            orderNumber: generateOrderNumber(migrated, t.date),
            date: t.date,
            customer: t.customer || "",
            subcategory: t.subcategory || "",
            materialType: t.materialType || "",
            materialLines: t.materialLines || [],
            manager: t.manager || "",
            area: t.area || 0,
            exchangeRate: t.exchangeRate || DEFAULT_SETTINGS.usdRate,
            agreementUsd: t.agreementUsd || 0,
            agreementUzs: t.agreementUzs || 0,
            kraskaLines: t.kraskaLines || [],
            kraskaSum: t.kraskaSum || 0,
            materialSum: t.materialSum || 0,
            payments: t.amount
              ? [{ id: uid(), amount: t.amount, date: t.date, paymentType: t.paymentType || "naqd", comment: "", createdBy: t.createdBy || "Noma'lum", createdAt: t.createdAt || new Date().toISOString() }]
              : [],
            note: t.note || "",
            createdBy: t.createdBy || "Noma'lum",
            createdAt: t.createdAt || new Date().toISOString(),
          };
          migrated.push(order);
        });
        ords = migrated;
        tx = tx.filter((t) => t.type !== "kirim");
        await storageSet("uvix:orders", true, ords);
        await storageSet("uvix:transactions", true, tx);
      }

      const log = await storageGet("uvix:audit", true, []);
      const leadsData = await storageGet("uvix:leads", true, []);
      let cats = await storageGet("uvix:categories", true, null);
      if (!cats || Object.keys(cats).length === 0) {
        cats = DEFAULT_CATEGORIES;
        await storageSet("uvix:categories", true, cats);
      } else if (!cats["Brak"]) {
        cats = { ...cats, Brak: DEFAULT_CATEGORIES["Brak"] };
        await storageSet("uvix:categories", true, cats);
      }
      let sett = await storageGet("uvix:settings", true, null);
      if (!sett) {
        sett = DEFAULT_SETTINGS;
        await storageSet("uvix:settings", true, sett);
      }
      let appr = await storageGet("uvix:appearance", false, null);
      if (!appr) {
        appr = DEFAULT_APPEARANCE;
      }
      THEME = buildTheme(appr);
      setTransactions(tx);
      setOrders(ords);
      setAuditLog(log);
      setLeads(leadsData);
      setCategories(cats);
      setSettings(sett);
      setAppearance(appr);
    })();
  }, [currentUser]);

  function applyAppearance(next) {
    THEME = buildTheme(next);
    setAppearance(next);
    storageSet("uvix:appearance", false, next);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function persistSettings(next) {
    setSettings(next);
    await storageSet("uvix:settings", true, next);
  }

  async function persistTx(next) {
    setTransactions(next);
    await storageSet("uvix:transactions", true, next);
  }
  async function persistOrders(next) {
    setOrders(next);
    await storageSet("uvix:orders", true, next);
  }
  async function persistLeads(next) {
    setLeads(next);
    await storageSet("uvix:leads", true, next);
  }
  async function persistEmployees(next) {
    setEmployees(next);
    await storageSet("uvix:employees", true, next);
  }
  async function persistLog(next) {
    setAuditLog(next);
    await storageSet("uvix:audit", true, next);
  }
  async function persistCategories(next) {
    setCategories(next);
    await storageSet("uvix:categories", true, next);
  }
  function addCategory(name) {
    const clean = (name || "").trim();
    if (!clean || categories[clean]) return false;
    const next = { ...categories, [clean]: ["Umumiy"] };
    persistCategories(next);
    addLog(`Yangi rasxod kategoriyasi qo'shildi: "${clean}"`);
    return true;
  }
  function addSubcategory(cat, sub) {
    const clean = (sub || "").trim();
    if (!cat || !clean) return false;
    const list = categories[cat] || [];
    if (list.includes(clean)) return false;
    const next = { ...categories, [cat]: [...list, clean] };
    persistCategories(next);
    addLog(`"${cat}" kategoriyasiga subkategoriya qo'shildi: "${clean}"`);
    return true;
  }
  function renameCategory(oldName, newName) {
    const clean = (newName || "").trim();
    if (!clean || oldName === clean || categories[clean]) return false;
    const next = { ...categories };
    next[clean] = next[oldName];
    delete next[oldName];
    persistCategories(next);
    const txNext = transactions.map((t) => (t.category === oldName ? { ...t, category: clean } : t));
    persistTx(txNext);
    addLog(`Kategoriya nomi o'zgartirildi: "${oldName}" -> "${clean}"`);
    return true;
  }
  function deleteCategory(cat) {
    const next = { ...categories };
    delete next[cat];
    persistCategories(next);
    addLog(`Rasxod kategoriyasi o'chirildi: "${cat}"`);
  }
  function deleteSubcategory(cat, sub) {
    const next = { ...categories, [cat]: (categories[cat] || []).filter((s) => s !== sub) };
    persistCategories(next);
    addLog(`"${cat}" kategoriyasidan subkategoriya o'chirildi: "${sub}"`);
  }

  function addLog(what) {
    const entry = {
      id: uid(),
      who: currentUser ? currentUser.name : "Noma'lum",
      what,
      when: new Date().toISOString(),
    };
    const next = [entry, ...auditLog].slice(0, 500);
    persistLog(next);
  }

  // ---- Rasxod (chiqim) CRUD ----
  function saveTransaction(tx, isEdit) {
    let next;
    if (isEdit) {
      next = transactions.map((t) => (t.id === tx.id ? tx : t));
      addLog(`Rasxod tahrirlandi: ${money(tx.amount)} (${tx.date})`);
    } else {
      next = [tx, ...transactions];
      addLog(`Rasxod qo'shildi: ${money(tx.amount)} (${tx.date})`);
    }
    persistTx(next);
    showToast(isEdit ? "Yangilandi" : "Saqlandi");
  }
  function deleteTransaction(tx) {
    const next = transactions.map((t) => (t.id === tx.id ? { ...t, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : t));
    persistTx(next);
    addLog(`Rasxod chiqindi qutisiga o'tkazildi: ${money(tx.amount)} (${tx.date})`);
    showToast("Chiqindi qutisiga o'tkazildi");
  }
  function restoreTransaction(tx) {
    const next = transactions.map((t) => (t.id === tx.id ? { ...t, deletedAt: null, deletedBy: null } : t));
    persistTx(next);
    addLog(`Rasxod tiklandi: ${money(tx.amount)} (${tx.date})`);
    showToast("Tiklandi");
  }
  function permanentlyDeleteTransaction(tx) {
    const next = transactions.filter((t) => t.id !== tx.id);
    persistTx(next);
    addLog(`Rasxod butunlay o'chirildi: ${money(tx.amount)} (${tx.date})`);
    showToast("Butunlay o'chirildi");
  }

  // ---- Buyurtma (order) CRUD ----
  function addOrdersBulk(newOrders) {
    if (!newOrders || newOrders.length === 0) return;
    const next = [...newOrders, ...orders];
    persistOrders(next);
    addLog(`Excel orqali ${newOrders.length} ta buyurtma import qilindi`);
    showToast(`${newOrders.length} ta buyurtma qo'shildi`);
  }
  function saveOrder(order, isEdit, linkedExpenseTx) {
    let next;
    if (isEdit) {
      next = orders.map((o) => (o.id === order.id ? order : o));
      addLog(`Buyurtma tahrirlandi: ${order.orderNumber} (${money(order.agreementUzs)})`);
    } else {
      next = [order, ...orders];
      addLog(`Yangi buyurtma qo'shildi: ${order.orderNumber} (${money(order.agreementUzs)})`);
    }
    persistOrders(next);
    if (linkedExpenseTx) {
      const exists = transactions.some((t) => t.id === linkedExpenseTx.id);
      const txNext = exists
        ? transactions.map((t) => (t.id === linkedExpenseTx.id ? linkedExpenseTx : t))
        : [linkedExpenseTx, ...transactions];
      persistTx(txNext);
      addLog(exists
        ? `Buyurtmaga bog'liq material xarajati yangilandi: ${money(linkedExpenseTx.amount)} (${linkedExpenseTx.date})`
        : `Buyurtmaga bog'liq material xarajati qo'shildi: ${money(linkedExpenseTx.amount)} (${linkedExpenseTx.date})`);
    }
    showToast(isEdit ? "Yangilandi" : "Saqlandi");
  }
  function deleteOrder(order) {
    const next = orders.map((o) => (o.id === order.id ? { ...o, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : o));
    persistOrders(next);
    addLog(`Buyurtma chiqindi qutisiga o'tkazildi: ${order.orderNumber}`);
    showToast("Chiqindi qutisiga o'tkazildi");
  }
  function restoreOrder(order) {
    const next = orders.map((o) => (o.id === order.id ? { ...o, deletedAt: null, deletedBy: null } : o));
    persistOrders(next);
    addLog(`Buyurtma tiklandi: ${order.orderNumber}`);
    showToast("Tiklandi");
  }
  // ==================== CRM (savdo voronkasi) ====================
  function saveLead(lead, isEdit) {
    let next;
    if (isEdit) {
      next = leads.map((l) => (l.id === lead.id ? lead : l));
      addLog(`Lid tahrirlandi: ${lead.customer}`);
    } else {
      lead.createdBy = currentUser.name;
      lead.createdAt = new Date().toISOString();
      next = [lead, ...leads];
      addLog(`Yangi lid qo'shildi: ${lead.customer}`);
    }
    persistLeads(next);
    showToast(isEdit ? "Yangilandi" : "Saqlandi");
  }
  function deleteLead(lead) {
    const next = leads.filter((l) => l.id !== lead.id);
    persistLeads(next);
    addLog(`Lid o'chirildi: ${lead.customer}`);
    showToast("O'chirildi");
  }
  function moveLead(lead, newStage) {
    const next = leads.map((l) => (l.id === lead.id ? { ...l, stage: newStage } : l));
    persistLeads(next);
    addLog(`Lid bosqichi o'zgardi: ${lead.customer} -> ${LEAD_STAGES.find((s) => s.key === newStage)?.label}`);
  }
  function createOrderFromLead(lead) {
    setPendingLeadForOrder(lead);
    setView("orders");
  }
  function linkOrderToLead(lead, order) {
    const next = leads.map((l) => (l.id === lead.id ? { ...l, orderId: order.id } : l));
    persistLeads(next);
    setPendingLeadForOrder(null);
    addLog(`Lid buyurtmaga bog'landi: ${lead.customer} -> ${order.orderNumber}`);
  }
  function permanentlyDeleteOrder(order) {
    const next = orders.filter((o) => o.id !== order.id);
    persistOrders(next);
    addLog(`Buyurtma butunlay o'chirildi: ${order.orderNumber}`);
    showToast("Butunlay o'chirildi");
  }
  function addPayment(orderId, paymentsArr) {
    const list = Array.isArray(paymentsArr) ? paymentsArr : [paymentsArr];
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: [...(o.payments || []), ...list] } : o));
    persistOrders(next);
    const total = list.reduce((s, p) => s + p.amount, 0);
    const methods = [...new Set(list.map((p) => paymentTypeLabel(p.paymentType)))].join(" + ");
    addLog(`To'lov qo'shildi: ${order?.orderNumber || ""} — ${money(total)} (${methods})`);
    showToast(list.length > 1 ? "To'lovlar qo'shildi" : "To'lov qo'shildi");
  }
  function deletePayment(orderId, paymentId) {
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).map((p) => (p.id === paymentId ? { ...p, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : p)) } : o));
    persistOrders(next);
    addLog(`To'lov chiqindi qutisiga o'tkazildi: ${order?.orderNumber || ""}`);
    showToast("Chiqindi qutisiga o'tkazildi");
  }
  function restorePayment(orderId, paymentId) {
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).map((p) => (p.id === paymentId ? { ...p, deletedAt: null, deletedBy: null } : p)) } : o));
    persistOrders(next);
    addLog(`To'lov tiklandi: ${order?.orderNumber || ""}`);
    showToast("Tiklandi");
  }
  function permanentlyDeletePayment(orderId, paymentId) {
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).filter((p) => p.id !== paymentId) } : o));
    persistOrders(next);
    addLog(`To'lov butunlay o'chirildi: ${order?.orderNumber || ""}`);
    showToast("Butunlay o'chirildi");
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.surface, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <style>{`@keyframes uvixPulse { 0%,100% { opacity: 0.55; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1); } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "uvixPulse 1.1s ease-in-out infinite",
          }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>UV</span>
          </div>
          <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 500 }}>Yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        employees={employees}
        onLogin={async (emp, pinTry) => {
          const user = emp.manual ? await authLoginByName(emp.name, pinTry) : await authLogin(emp.id, pinTry);
          setCurrentUser(user);
        }}
        onCreateFirstAdmin={async (emp) => {
          const next = [emp];
          await persistEmployees(next);
        }}
        onRequestPinReset={requestPinReset}
        onConfirmPinReset={confirmPinReset}
      />
    );
  }

  const isAdmin = currentUser.role === "admin";
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);
  const activeTransactions = transactions.filter((t) => !t.deletedAt);
  const activeOrders = orders.filter((o) => !o.deletedAt);
  const myTx = isAdmin ? activeTransactions : activeTransactions.filter((t) => t.createdBy === currentUser.name);
  const myOrders = isAdmin ? activeOrders : activeOrders.filter((o) => o.createdBy === currentUser.name);

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", color: THEME.text, minHeight: "100vh" }}>
      <style>{`
        html, body { overflow-x: hidden; max-width: 100vw; overscroll-behavior-x: none; }
        * { box-sizing: border-box; }
        .uvix-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .uvix-scroll::-webkit-scrollbar-thumb { background: #D8D4E8; border-radius: 4px; }
        .uvix-scroll::-webkit-scrollbar-thumb:hover { background: #C4BEDD; }
        input, select, textarea { font-family: inherit; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${THEME.violet} !important; box-shadow: 0 0 0 3px rgba(124,92,252,0.15); }
        button { transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease; }
        button:active:not(:disabled) { transform: scale(0.97); }
        .uvix-card { transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease; }
        .uvix-card:hover { box-shadow: 0 6px 20px rgba(28,24,48,0.07); border-color: #DCD6EE; }
        .uvix-metric:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(28,24,48,0.09); border-color: #DCD6EE; }
        .uvix-row { transition: background-color 0.12s ease; }
        .uvix-row:hover { background-color: #FAF9FE; }
        .uvix-iconbtn { transition: background-color 0.15s ease, transform 0.15s ease; }
        .uvix-iconbtn:hover { background-color: #ECE7F8; transform: translateY(-1px); }
        .uvix-nav-item { transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, padding-left 0.18s ease; }
        .uvix-nav-item:hover:not(.uvix-nav-active) { background: rgba(255,255,255,0.06); color: #E5E1F5; padding-left: 15px; }
        .uvix-btn-primary { box-shadow: 0 2px 8px rgba(124,92,252,0.30); }
        .uvix-btn-primary:hover:not(:disabled) { box-shadow: 0 6px 16px rgba(124,92,252,0.40); transform: translateY(-1px); }
        .uvix-btn-ghost:hover:not(:disabled) { background: #FAF9FE; border-color: #CFC7E8 !important; }
        .uvix-btn-danger:hover:not(:disabled) { background: #FBDCE3; }
        .uvix-modal-backdrop { animation: uvixFadeIn 0.15s ease; }
        .uvix-modal-panel { animation: uvixScaleIn 0.18s cubic-bezier(0.16,1,0.3,1); }
        .uvix-modal-shake { animation: uvixShake 0.35s ease !important; }
        @keyframes uvixShake { 10%, 90% { transform: translateX(-1px); } 20%, 80% { transform: translateX(2px); } 30%, 50%, 70% { transform: translateX(-4px); } 40%, 60% { transform: translateX(4px); } }
        @keyframes uvixFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes uvixScaleIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes uvixSlideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .uvix-toast { animation: uvixSlideUp 0.22s cubic-bezier(0.16,1,0.3,1); }
        .uvix-view-enter { animation: uvixFadeIn 0.22s ease; }
        .uvix-skeleton { background: linear-gradient(90deg, #EDEAF6 25%, #F5F3FB 37%, #EDEAF6 63%); background-size: 400% 100%; animation: uvixShimmer 1.4s ease infinite; border-radius: 8px; }
        @keyframes uvixShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
        .uvix-chip { transition: all 0.15s ease; }
        .uvix-chip:hover { border-color: ${THEME.violet} !important; }
        .uvix-login-item { transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease; }
        .uvix-login-item:hover { background: rgba(255,255,255,0.09) !important; border-color: rgba(255,255,255,0.22) !important; transform: translateY(-1px); }
        /* Dashboard — zamonaviy fintech uslubi: katta yumaloq burchaklar, yengil soya */
        .uvix-dash-card { border-radius: 22px !important; box-shadow: 0 1px 2px rgba(20,16,40,0.04) !important; }
        .uvix-dash-card:hover { box-shadow: 0 10px 26px rgba(28,24,48,0.09) !important; }
        @media print {
          .no-print { display: none !important; }
          .print-area { display: block !important; }
        }
        .print-area { display: none; }

        /* Zichlik (density) — Card va jadval qatorlarining ichki bo'shlig'iga ta'sir qiladi */
        .uvix-density-compact .uvix-card { padding: 12px !important; }
        .uvix-density-compact td, .uvix-density-compact th { padding: 8px 11px !important; }
        .uvix-density-spacious .uvix-card { padding: 24px !important; }
        .uvix-density-spacious td, .uvix-density-spacious th { padding: 17px 20px !important; }

        /* ---- Mobil (telefon) moslashuvi ---- */
        .uvix-hamburger { display: none; }
        @media (max-width: 860px) {
          .uvix-hamburger { display: flex !important; }
          .uvix-sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            height: 100vh;
            z-index: 200;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 0 0 40px rgba(0,0,0,0.35);
          }
          .uvix-sidebar-open { transform: translateX(0) !important; }
          .uvix-sidebar-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 190;
          }
        }
        /* Dashboard'ning 12-ustunli grid'i tor ekranlarda 2 ustun, keyin 1 ustunga siqiladi */
        @media (max-width: 680px) {
          .uvix-dash-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .uvix-dash-grid > div { grid-column: span 2 !important; }
        }
        @media (max-width: 420px) {
          .uvix-dash-grid { grid-template-columns: 1fr !important; }
          .uvix-dash-grid > div { grid-column: span 1 !important; }
        }
        /* Forma ichidagi 2-ustunli grid'lar (Field'lar) tor ekranda 1 ustunga tushadi */
        @media (max-width: 560px) {
          [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          [style*="grid-template-columns: 1.2fr 0.8fr 0.8fr auto"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div className={`uvix-density-${appearance.density || "comfortable"}`} style={{ display: "flex", minHeight: "100vh", background: THEME.surface, maxWidth: "100vw", overflowX: "hidden" }}>
        <Sidebar nav={visibleNav} view={view} setView={(v) => { setNavFilter(null); setView(v); }} user={currentUser} onLogout={() => { authLogout(); setCurrentUser(null); }} sidebarStyle={appearance.sidebarStyle} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Topbar user={currentUser} view={view} onLogout={() => { authLogout(); setCurrentUser(null); }} onMenuClick={() => setSidebarOpen(true)} />
          <div key={view} className="uvix-view-enter" style={{ padding: "20px 24px 40px" }}>
            {view === "dashboard" && <Dashboard orders={myOrders} expenses={myTx} isAdmin={isAdmin} onNavigate={navigateWithFilter} settings={settings} onSaveSettings={persistSettings} />}
            {view === "orders" && (
              <OrdersView
                orders={myOrders}
                allOrders={orders}
                transactions={myTx}
                currentUser={currentUser}
                isAdmin={isAdmin}
                categories={categories}
                employees={employees}
                settings={settings}
                initialFilter={navFilter}
                onAddSubcategory={addSubcategory}
                onSaveOrder={saveOrder}
                onImportOrders={addOrdersBulk}
                onDeleteOrder={deleteOrder}
                onAddPayment={addPayment}
                onDeletePayment={deletePayment}
                onUploadPhotos={uploadPhotos}
                onDeletePhoto={deletePhoto}
                pendingLead={pendingLeadForOrder}
                onOrderLinkedToLead={linkOrderToLead}
              />
            )}
            {view === "crm" && (
              <CRMView
                leads={leads}
                orders={orders}
                employees={employees}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onSaveLead={saveLead}
                onDeleteLead={deleteLead}
                onMoveLead={moveLead}
                onCreateOrderFromLead={createOrderFromLead}
                onFetchTelegramMessages={fetchTelegramMessages}
                onSendTelegramMessage={sendTelegramUserMessage}
              />
            )}
            {view === "expense" && (
              <ExpenseView
                transactions={myTx}
                orders={myOrders}
                currentUser={currentUser}
                categories={categories}
                onAddCategory={addCategory}
                onAddSubcategory={addSubcategory}
                onSave={saveTransaction}
                onDelete={deleteTransaction}
              />
            )}
            {view === "operations" && (
              <OperationsView
                orders={myOrders}
                transactions={myTx}
                isAdmin={isAdmin}
                onDeletePayment={deletePayment}
                onDeleteExpense={deleteTransaction}
                currentUser={currentUser}
                categories={categories}
                initialFilter={navFilter}
              />
            )}
            {view === "report" && isAdmin && <ReportView orders={activeOrders} transactions={activeTransactions} categories={categories} />}
            {view === "categories" && (
              <CategoriesView
                transactions={activeTransactions}
                categories={categories}
                isAdmin={isAdmin}
                onAddCategory={addCategory}
                onAddSubcategory={addSubcategory}
                onRenameCategory={renameCategory}
                onDeleteCategory={deleteCategory}
                onDeleteSubcategory={deleteSubcategory}
              />
            )}
            {view === "employees" && isAdmin && (
              <EmployeesView
                employees={employees}
                onSave={persistEmployees}
                auditLog={auditLog}
                currentUser={currentUser}
              />
            )}
            {view === "settings" && (
              <SettingsView
                currentUser={currentUser}
                employees={employees}
                onSave={persistEmployees}
                onLogout={() => { authLogout(); setCurrentUser(null); }}
                isAdmin={isAdmin}
                settings={settings}
                onSaveSettings={persistSettings}
                appearance={appearance}
                onApplyAppearance={applyAppearance}
                orders={orders}
                transactions={transactions}
                onRestoreOrder={restoreOrder}
                onPermanentDeleteOrder={permanentlyDeleteOrder}
                onRestoreTransaction={restoreTransaction}
                onPermanentDeleteTransaction={permanentlyDeleteTransaction}
                onRestorePayment={restorePayment}
                onPermanentDeletePayment={permanentlyDeletePayment}
                onResetAll={async () => {
                  await persistTx([]);
                  await persistOrders([]);
                  addLog("Barcha buyurtma va operatsiyalar tozalandi");
                }}
                onSendBackupNow={sendBackupNow}
                onConnectTelegramUser={connectTelegramUser}
                onDisconnectTelegramUser={disconnectTelegramUser}
                onFetchTelegramUserStatus={fetchTelegramUserStatus}
              />
            )}
          </div>
        </div>
      </div>
      {toast && (
        <div className="uvix-toast" style={{ position: "fixed", bottom: 20, right: 20, background: THEME.ink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 200, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: THEME.cyan, boxShadow: `0 0 8px ${THEME.cyan}` }} />
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- LOGIN ---------------- */
function LoginScreen({ employees, onLogin, onCreateFirstAdmin, onRequestPinReset, onConfirmPinReset }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Forgot-PIN oqimi: "closed" -> "email" -> "code"
  const [forgotStep, setForgotStep] = useState("closed");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  async function sendForgotCode() {
    if (!forgotEmail.trim()) { setForgotError("Email manzilini kiriting"); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await onRequestPinReset(forgotEmail.trim());
      setForgotStep("code");
      setForgotMsg("Tasdiqlash kodi email'ingizga yuborildi (10 daqiqa amal qiladi)");
    } catch (e) {
      setForgotError(e?.message || "Yuborib bo'lmadi");
    } finally {
      setForgotLoading(false);
    }
  }
  async function confirmForgotCode() {
    if (!/^\d{4,6}$/.test(forgotCode)) { setForgotError("Kodni to'g'ri kiriting"); return; }
    if (!/^\d{4,6}$/.test(forgotNewPin)) { setForgotError("Yangi PIN 4-6 xonali raqam bo'lishi kerak"); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await onConfirmPinReset(forgotEmail.trim(), forgotCode.trim(), forgotNewPin);
      setForgotMsg("PIN muvaffaqiyatli yangilandi. Endi shu bilan kiring.");
      setForgotStep("closed");
      setForgotCode("");
      setForgotNewPin("");
    } catch (e) {
      setForgotError(e?.message || "Tiklab bo'lmadi");
    } finally {
      setForgotLoading(false);
    }
  }

  const suggestions = query.trim()
    ? employees.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : employees;

  function pickSuggestion(e) {
    setSelected(e);
    setQuery(e.name);
    setShowSuggestions(false);
    setPin("");
    setError("");
  }
  function handleQueryChange(v) {
    setQuery(v);
    setSelected(null);
    setShowSuggestions(true);
    setError("");
  }

  async function tryLogin() {
    if (loading || !query.trim()) return;
    setError("");
    setLoading(true);
    try {
      if (selected) {
        await onLogin(selected, pin);
      } else {
        await onLogin({ name: query.trim(), manual: true }, pin);
      }
    } catch (e) {
      setError(e?.message || "Foydalanuvchi yoki PIN noto'g'ri");
    } finally {
      setLoading(false);
    }
  }

  const readyForPin = query.trim().length > 0;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${THEME.ink} 0%, #1E1836 55%, #241B3F 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-sans-serif, system-ui, sans-serif", padding: 24 }}>
      <style>{`* { box-sizing: border-box; }`}</style>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, boxShadow: `0 0 32px ${THEME.violet}66`, marginBottom: 14 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>UV</span>
          </div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>UVIX Moliya</div>
          <div style={{ color: "#A79FC9", fontSize: 13, marginTop: 4 }}>Tushum va rasxodlarni nazorat qilish tizimi</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 20, backdropFilter: "blur(6px)", overflow: "visible" }}>
          <label style={{ color: "#C9C2E4", fontSize: 12, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>Foydalanuvchi</label>

          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 12, color: "#8B84AD" }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (suggestions.length === 1 && !selected) pickSuggestion(suggestions[0]);
                  else document.getElementById("uvix-pin-input")?.focus();
                }
              }}
              placeholder="Ismingizni yozing..."
              style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: `1px solid ${selected ? THEME.violet : "rgba(255,255,255,0.15)"}`, background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none" }}
            />

            {showSuggestions && !selected && suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#1E1836", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", zIndex: 20, maxHeight: 220, overflowY: "auto", padding: 6 }} className="uvix-scroll">
                {suggestions.map((e) => (
                  <button
                    key={e.id}
                    onMouseDown={() => pickSuggestion(e)}
                    className="uvix-login-item"
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                      {e.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{e.name}</span>
                    <span style={{ color: "#8B84AD", fontSize: 11, marginLeft: "auto" }}>{e.role === "admin" ? "Administrator" : "Operator"}</span>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && !selected && query.trim() && suggestions.length === 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#1E1836", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#8B84AD", zIndex: 20 }}>
                Ro'yxatda topilmadi — shu ism bilan kirishga urinib ko'rish mumkin
              </div>
            )}
          </div>

          {readyForPin && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <label style={{ color: "#C9C2E4", fontSize: 12, fontWeight: 600 }}>PIN kod</label>
              <div style={{ position: "relative", marginTop: 6 }}>
                <Lock size={15} style={{ position: "absolute", left: 12, top: 12, color: "#8B84AD" }} />
                <input
                  id="uvix-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && tryLogin()}
                  style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 15, letterSpacing: 3, outline: "none" }}
                  placeholder="****"
                />
              </div>
              {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginTop: 8 }}>{error}</div>}
              <button
                onClick={tryLogin}
                disabled={loading}
                style={{ width: "100%", marginTop: 14, padding: "11px 0", borderRadius: 10, border: "none", background: THEME.violet, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", boxShadow: THEME.shadowMd, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Tekshirilmoqda..." : "Kirish"}
              </button>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", color: "#6E6690", fontSize: 11, marginTop: 16 }}>
          Standart admin: <b style={{ color: "#A79FC9" }}>Administrator</b> · PIN <b style={{ color: "#A79FC9" }}>0000</b>
        </div>
        {onRequestPinReset && (
          <div style={{ marginTop: 10 }}>
            {forgotStep === "closed" && (
              <div style={{ textAlign: "center" }}>
                {forgotMsg && !forgotError ? (
                  <div style={{ fontSize: 11.5, color: "#A79FC9" }}>{forgotMsg}</div>
                ) : (
                  <button onClick={() => { setForgotStep("email"); setForgotMsg(""); setForgotError(""); }} style={{ background: "none", border: "none", color: "#8B84AD", cursor: "pointer", fontSize: 11.5, padding: 0, textDecoration: "underline" }}>
                    PIN'ni unutdingizmi?
                  </button>
                )}
              </div>
            )}
            {forgotStep === "email" && (
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 14, marginTop: 8 }}>
                <div style={{ color: "#C9C2E4", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Ro'yxatdagi email manzilingizni kiriting</div>
                <input
                  autoFocus
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendForgotCode()}
                  placeholder="sizniki@gmail.com"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none" }}
                />
                {forgotError && <div style={{ color: "#FCA5A5", fontSize: 11.5, marginTop: 8 }}>{forgotError}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => setForgotStep("closed")} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "none", color: "#C9C2E4", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Bekor qilish</button>
                  <button onClick={sendForgotCode} disabled={forgotLoading} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: THEME.violet, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: forgotLoading ? "not-allowed" : "pointer", opacity: forgotLoading ? 0.7 : 1 }}>
                    {forgotLoading ? "Yuborilmoqda..." : "Kod yuborish"}
                  </button>
                </div>
              </div>
            )}
            {forgotStep === "code" && (
              <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 14, marginTop: 8 }}>
                <div style={{ color: "#C9C2E4", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{forgotMsg}</div>
                <input
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Tasdiqlash kodi"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none", marginBottom: 8, letterSpacing: 2 }}
                />
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={forgotNewPin}
                  onChange={(e) => setForgotNewPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && confirmForgotCode()}
                  placeholder="Yangi PIN (4-6 raqam)"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none", letterSpacing: 2 }}
                />
                {forgotError && <div style={{ color: "#FCA5A5", fontSize: 11.5, marginTop: 8 }}>{forgotError}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => setForgotStep("closed")} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "none", color: "#C9C2E4", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Bekor qilish</button>
                  <button onClick={confirmForgotCode} disabled={forgotLoading} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: THEME.violet, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: forgotLoading ? "not-allowed" : "pointer", opacity: forgotLoading ? 0.7 : 1 }}>
                    {forgotLoading ? "Tekshirilmoqda..." : "Tiklash"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- SIDEBAR / TOPBAR ---------------- */
function Sidebar({ nav, view, setView, user, onLogout, sidebarStyle, isOpen, onClose }) {
  const style = sidebarStyle || "modern";
  const isClassic = style === "classic";
  const isMinimal = style === "minimal";
  return (
    <>
      {isOpen && <div className="uvix-sidebar-backdrop no-print" onClick={onClose} />}
      <div className={`uvix-sidebar no-print${isOpen ? " uvix-sidebar-open" : ""}`} style={{ width: isMinimal ? 208 : 232, background: THEME.ink, flexShrink: 0, display: "flex", flexDirection: "column", padding: isMinimal ? "20px 10px" : "20px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 24px" }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 14px rgba(124,92,252,0.35)` }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>UV</span>
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.1, letterSpacing: -0.2 }}>UVIX</div>
          <div style={{ color: "#837DA3", fontSize: 10.5 }}>Moliya tizimi</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isMinimal ? 1 : 3 }}>
        {nav.map((n) => {
          const Icon = n.icon;
          const active = view === n.key;
          let itemStyle;
          if (isClassic) {
            itemStyle = {
              display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 4,
              border: "none", borderLeft: active ? `3px solid ${THEME.cyan}` : "3px solid transparent",
              cursor: "pointer", textAlign: "left", fontSize: 13.5, fontWeight: active ? 700 : 500,
              background: active ? "rgba(255,255,255,0.06)" : "transparent",
              color: active ? "#fff" : "#9C96BA",
            };
          } else if (isMinimal) {
            itemStyle = {
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
              border: "none", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: active ? 700 : 500,
              background: "transparent",
              color: active ? THEME.cyan : "#8B84AD",
            };
          } else {
            itemStyle = {
              display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 12,
              border: "none", cursor: "pointer", textAlign: "left", fontSize: 13.5, fontWeight: active ? 700 : 500,
              background: active ? THEME.violet : "transparent",
              color: active ? "#fff" : "#9C96BA",
              boxShadow: active ? "0 4px 14px rgba(124,92,252,0.35)" : "none",
            };
          }
          return (
            <button
              key={n.key}
              onClick={() => { setView(n.key); if (onClose) onClose(); }}
              className={`uvix-nav-item${active ? " uvix-nav-active" : ""}`}
              style={itemStyle}
            >
              <Icon size={isMinimal ? 15 : 16} />
              {n.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "14px 8px 4px" }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#fff", fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <div style={{ color: "#837DA3", fontSize: 10.5 }}>{user.role === "admin" ? "Administrator" : "Operator"}</div>
        </div>
        <button onClick={onLogout} title="Chiqish" className="uvix-iconbtn" style={{ background: "none", border: "none", color: "#837DA3", cursor: "pointer", padding: 5, borderRadius: 8, display: "flex" }}>
          <LogOut size={15} />
        </button>
      </div>
      </div>
    </>
  );
}


function Topbar({ user, view, onLogout, onMenuClick }) {
  const title = NAV.find((n) => n.key === view)?.label || "";
  return (
    <div className="no-print" style={{ padding: "18px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onMenuClick}
          className="uvix-hamburger uvix-iconbtn"
          style={{
            background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 11, cursor: "pointer",
            display: "none", alignItems: "center", justifyContent: "center", flexShrink: 0,
            width: 44, height: 44, minWidth: 44, minHeight: 44, position: "relative", zIndex: 50,
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <ListChecks size={20} color={THEME.text} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>
            {new Date().toLocaleDateString("uz-UZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- SHARED UI ---------------- */
function Card({ children, style, className, onClick, ...rest }) {
  return (
    <div className={`uvix-card ${className || ""}`} onClick={onClick} style={{ background: THEME.card, border: `1px solid ${THEME.borderSoft}`, boxShadow: THEME.shadowSm, borderRadius: THEME.radius, padding: 18, ...style }} {...rest}>
      {children}
    </div>
  );
}
function MetricCard({ label, value, sub, accent, bg, icon: Icon, onClick, pctBadge, progressPct, trendPct, goodDirection = "up", variant = "default" }) {
  const trendGood = goodDirection === "up" ? trendPct >= 0 : trendPct <= 0;
  const isFilled = variant === "filled";
  return (
    <Card
      className="uvix-metric uvix-dash-card"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 12, cursor: onClick ? "pointer" : "default",
        borderRadius: 22, border: isFilled ? "none" : `1px solid ${THEME.border}`,
        background: isFilled ? `linear-gradient(135deg, ${accent || THEME.violet}, ${shadeColor(accent || THEME.violet, -18)})` : THEME.card,
        boxShadow: isFilled ? `0 10px 28px ${accent || THEME.violet}55` : "0 1px 2px rgba(20,16,40,0.04)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, color: isFilled ? "rgba(255,255,255,0.85)" : THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
        {Icon && (
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: isFilled ? "rgba(255,255,255,0.22)" : (bg || THEME.violetSoft), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={15} color={isFilled ? "#fff" : (accent || THEME.violet)} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 25, fontWeight: 800, color: isFilled ? "#fff" : THEME.text, letterSpacing: -0.5, lineHeight: 1.1 }}>{value}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 20 }}>
        {pctBadge && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: isFilled ? "#fff" : (accent || THEME.violet), background: isFilled ? "rgba(255,255,255,0.22)" : (bg || THEME.violetSoft), padding: "3px 9px", borderRadius: 20 }}>{pctBadge}</span>
        )}
        {trendPct !== undefined && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: isFilled ? "#fff" : (trendGood ? THEME.green : THEME.rose), background: isFilled ? "rgba(255,255,255,0.22)" : (trendGood ? THEME.greenBg : THEME.roseBg), padding: "3px 9px", borderRadius: 20, display: "flex", alignItems: "center", gap: 2 }}>
            {trendPct >= 0 ? "↑" : "↓"} {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
        {sub && !pctBadge && trendPct === undefined && <span style={{ fontSize: 11.5, color: isFilled ? "rgba(255,255,255,0.75)" : THEME.muted }}>{sub}</span>}
      </div>
      {progressPct !== undefined && (
        <div style={{ height: 7, borderRadius: 10, background: isFilled ? "rgba(255,255,255,0.25)" : THEME.surface, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, progressPct))}%`, background: isFilled ? "#fff" : (accent || THEME.violet), borderRadius: 10, transition: "width 0.3s ease" }} />
        </div>
      )}
      {sub && (pctBadge || trendPct !== undefined) && <div style={{ fontSize: 11, color: isFilled ? "rgba(255,255,255,0.7)" : THEME.muted, marginTop: -4 }}>{sub}</div>}
    </Card>
  );
}
function shadeColor(hex, percent) {
  if (!hex || hex[0] !== "#") return hex;
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  r = Math.round(r * (100 + percent) / 100); g = Math.round(g * (100 + percent) / 100); b = Math.round(b * (100 + percent) / 100);
  r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function Button({ children, onClick, variant = "primary", style, type = "button", disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: Math.max(6, THEME.radius - 7),
    fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none",
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: THEME.violet, color: "#fff" },
    ghost: { background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border}` },
    danger: { background: THEME.roseBg, color: THEME.rose, border: `1px solid #F9CBD3` },
  };
  const classNames = { primary: "uvix-btn-primary", ghost: "uvix-btn-ghost", danger: "uvix-btn-danger" };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={classNames[variant]} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: THEME.mutedDark }}>{label}</label>
      {children}
    </div>
  );
}
function getInputStyle() {
  return {
    padding: "10px 12px", borderRadius: Math.max(6, THEME.radius - 7), border: `1.5px solid ${THEME.border}`, fontSize: 13.5,
    outline: "none", background: THEME.card === "#FFFFFF" ? "#FCFCFE" : THEME.card, width: "100%", color: THEME.text,
  };
}
function Modal({ title, onClose, children, width = 460 }) {
  const [shake, setShake] = useState(false);
  function handleBackdropClick() {
    setShake(true);
    setTimeout(() => setShake(false), 350);
  }
  return (
    <div className="uvix-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(16,14,26,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={handleBackdropClick}>
      <div className={`uvix-modal-panel${shake ? " uvix-modal-shake" : ""}`} style={{ background: THEME.card, borderRadius: THEME.radius + 4, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", boxShadow: THEME.shadowLg }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2, color: THEME.text }}>{title}</div>
          <button onClick={onClose} className="uvix-iconbtn" style={{ background: THEME.surface, border: "none", cursor: "pointer", color: THEME.muted, borderRadius: 9, padding: 6, display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <Modal title="Tasdiqlash" onClose={onCancel} width={360}>
      <div style={{ fontSize: 13.5, color: THEME.text, marginBottom: 18, display: "flex", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: THEME.roseBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertTriangle size={16} color={THEME.rose} />
        </div>
        <span style={{ paddingTop: 6 }}>{message}</span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onCancel}>Bekor qilish</Button>
        <Button variant="danger" onClick={onConfirm}>O'chirish</Button>
      </div>
    </Modal>
  );
}
function Badge({ children, color, bg }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, color, background: bg }}>
      {children}
    </span>
  );
}
function EmptyState({ text }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: THEME.muted, fontSize: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: THEME.surface, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
        <FolderTree size={17} color={THEME.muted} />
      </div>
      {text}
    </div>
  );
}
const PAGE_SIZE = 25;
function usePagination(list, deps) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return { page: safePage, setPage, totalPages, pageItems };
}
function Pagination({ page, totalPages, onChange, totalCount }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${THEME.border}`, flexWrap: "wrap", gap: 8 }}>
      <div style={{ fontSize: 12, color: THEME.muted }}>
        Jami <b style={{ color: THEME.text }}>{totalCount}</b> ta yozuv &middot; {page}/{totalPages}-sahifa
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.card, color: page <= 1 ? THEME.muted : THEME.text, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 600, opacity: page <= 1 ? 0.5 : 1 }}
        >
          &larr; Oldingi
        </button>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.card, color: page >= totalPages ? THEME.muted : THEME.text, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 600, opacity: page >= totalPages ? 0.5 : 1 }}
        >
          Keyingi &rarr;
        </button>
      </div>
    </div>
  );
}
function PaymentTypeSelector({ value, onChange, size = "normal" }) {
  const pad = size === "small" ? "7px 0" : "8px 0";
  const fontSize = size === "small" ? 11.5 : 12.5;
  return (
    <div style={{ display: "flex", gap: 4, background: THEME.surface, borderRadius: 11, padding: 3 }}>
      {PAYMENT_TYPES.map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: pad, borderRadius: 9, border: "none", cursor: "pointer", fontSize, fontWeight: 700,
            background: value === opt.v ? "#fff" : "transparent",
            color: value === opt.v ? THEME.violet : THEME.muted,
            boxShadow: value === opt.v ? THEME.shadowSm : "none",
            whiteSpace: "nowrap",
          }}
        >
          <opt.icon size={size === "small" ? 12 : 13} /> {opt.l}
        </button>
      ))}
    </div>
  );
}
function MultiPaymentLines({ lines, onChange, bg }) {
  function update(id, field, val) {
    onChange(lines.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  }
  function add() {
    onChange([...lines, { id: uid(), methodType: "naqd", amountStr: "" }]);
  }
  function remove(id) {
    onChange(lines.length > 1 ? lines.filter((l) => l.id !== id) : lines);
  }
  const total = lines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map((line) => (
          <div key={line.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={line.methodType}
              onChange={(e) => update(line.id, "methodType", e.target.value)}
              style={{ ...getInputStyle(), background: bg || "#fff", width: 150, flexShrink: 0 }}
            >
              {PAYMENT_TYPES.map((pt) => <option key={pt.v} value={pt.v}>{pt.l}</option>)}
            </select>
            <input
              value={line.amountStr}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                update(line.id, "amountStr", digits ? fmt(parseInt(digits, 10)) : "");
              }}
              placeholder="0"
              inputMode="numeric"
              style={{ ...getInputStyle(), background: bg || "#fff" }}
            />
            <button
              type="button"
              onClick={() => remove(line.id)}
              disabled={lines.length <= 1}
              className="uvix-iconbtn"
              style={{ ...getIconBtn(), background: bg || THEME.surface, opacity: lines.length <= 1 ? 0.35 : 1, flexShrink: 0 }}
            >
              <X size={14} color={THEME.rose} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, background: "none", border: "none", color: THEME.violet, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
        <Plus size={14} /> Yana to'lov usuli qo'shish
      </button>
      {lines.length > 1 && total > 0 && (
        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, textAlign: "right", color: THEME.text }}>
          Jami: {money(total)}
        </div>
      )}
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */

/* ---------------- FINANCE STATS (bitta manba — Dashboard, Hisobot, Excel barchasi shundan foydalanadi) ---------------- */
function computeFinanceStats(orders, expenses) {
  const today = todayStr();
  const curMonth = today.slice(0, 7);
  const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

  const totalOrderValue = sum(orders, (o) => o.agreementUzs || 0);
  const totalPaid = sum(orders, (o) => orderTotalPaid(o));
  const totalDebt = sum(orders, (o) => orderDebt(o));
  const totalKraska = sum(orders, (o) => o.kraskaSum || 0);
  const totalMaterialInOrders = sum(orders, (o) => o.materialSum || 0);
  const totalAddedValue = sum(orders, (o) => orderAddedValue(o, expenses));
  const totalArea = sum(orders, (o) => o.area || 0);
  const totalAgreementUsd = sum(orders, (o) => o.agreementUsd || 0);

  const allPayments = [];
  orders.forEach((o) => (o.payments || []).forEach((p) => allPayments.push({ ...p, orderId: o.id, orderNumber: o.orderNumber, customer: o.customer })));

  const cardPaid = sum(allPayments, (p) => (p.paymentType === "karta" ? p.amount : 0));
  const cashPaid = sum(allPayments, (p) => (p.paymentType === "naqd" ? p.amount : 0));
  const bankPaid = sum(allPayments, (p) => (p.paymentType === "bank" ? p.amount : 0));
  const cardExpense = sum(expenses, (t) => (t.paymentType === "karta" ? t.amount : 0));
  const cashExpense = sum(expenses, (t) => (t.paymentType === "naqd" ? t.amount : 0));
  const bankExpense = sum(expenses, (t) => (t.paymentType === "bank" ? t.amount : 0));
  const totalExpense = sum(expenses, (t) => t.amount);

  const todayPaid = sum(allPayments, (p) => (p.date === today ? p.amount : 0));
  const todayExpense = sum(expenses, (t) => (t.date === today ? t.amount : 0));
  const monthPaid = sum(allPayments, (p) => (monthKey(p.date) === curMonth ? p.amount : 0));
  const monthExpense = sum(expenses, (t) => (monthKey(t.date) === curMonth ? t.amount : 0));

  const materialExpense = sum(expenses, (t) => (t.category === "Material" ? t.amount : 0));
  const employeeExpense = sum(expenses, (t) => (t.category === "Xodimlar" ? t.amount : 0));

  // Oldingi oy (MoM taqqoslash uchun)
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);
  const prevMonthPaid = sum(allPayments, (p) => (monthKey(p.date) === prevMonth ? p.amount : 0));
  const prevMonthExpense = sum(expenses, (t) => (monthKey(t.date) === prevMonth ? t.amount : 0));

  const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
  const momChange = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0));

  return {
    totalOrderValue, totalPaid, totalDebt, totalKraska, totalMaterialInOrders, totalAddedValue,
    totalArea, totalAgreementUsd,
    cardPaid, cashPaid, bankPaid, cardExpense, cashExpense, bankExpense, totalExpense,
    cardBalance: cardPaid - cardExpense, cashBalance: cashPaid - cashExpense, bankBalance: bankPaid - bankExpense,
    totalMoney: (cardPaid - cardExpense) + (cashPaid - cashExpense) + (bankPaid - bankExpense),
    todayPaid, todayExpense, monthPaid, monthExpense, prevMonthPaid, prevMonthExpense,
    materialExpense, employeeExpense,
    allPayments,
    // --- Nisbatlar / foizlar (KPI) ---
    collectionRatePct: pct(totalPaid, totalOrderValue),
    debtSharePct: pct(totalDebt, totalOrderValue),
    addedValueMarginPct: pct(totalAddedValue, totalOrderValue),
    expenseToIncomeRatioPct: pct(totalExpense, totalPaid),
    momPaymentGrowthPct: momChange(monthPaid, prevMonthPaid),
    momExpenseGrowthPct: momChange(monthExpense, prevMonthExpense),
    cardSharePct: pct(cardPaid, cardPaid + cashPaid + bankPaid),
    cashSharePct: pct(cashPaid, cardPaid + cashPaid + bankPaid),
    bankSharePct: pct(bankPaid, cardPaid + cashPaid + bankPaid),
  };
}

/* ---------------- DASHBOARD ---------------- */
function SectionTitle({ icon: Icon, text, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: -4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: THEME.violetSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={13} color={THEME.violet} />
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: THEME.text, letterSpacing: -0.2 }}>{text}</span>
      </div>
      {action}
    </div>
  );
}
function Dashboard({ orders, expenses, isAdmin, onNavigate, settings, onSaveSettings }) {
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
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, background: `linear-gradient(90deg, #fff, ${THEME.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
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
        style={{ background: `linear-gradient(120deg, #FFF5F0 0%, ${THEME.roseBg} 100%)`, border: `1.5px solid #F9C5CE`, boxShadow: "0 4px 18px rgba(245,69,92,0.12)", cursor: "pointer" }}
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
              <div style={{ fontSize: 20, fontWeight: 800, color: "#7A1224", letterSpacing: -0.3 }}>{money(stats.totalDebt)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#9B4152", maxWidth: 300 }}>Umumiy buyurtma summasidan hisoblanadi (barcha to'lovlar yig'indisi ayirilib) — qo'shilgan qiymatga bog'liq emas</div>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEDF7" vertical={false} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEDF7" vertical={false} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEDF7" vertical={false} />
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

/* ---------------- ORDERS VIEW ---------------- */
function OrdersView({ orders, allOrders, transactions, currentUser, isAdmin, categories, employees, settings, initialFilter, onAddSubcategory, onSaveOrder, onImportOrders, onDeleteOrder, onAddPayment, onDeletePayment, onUploadPhotos, onDeletePhoto, pendingLead, onOrderLinkedToLead }) {
  const [modal, setModal] = useState(null); // {edit?}
  const [confirmDel, setConfirmDel] = useState(null);
  const [paymentsFor, setPaymentsFor] = useState(null); // order object
  const [search, setSearch] = useState(initialFilter?.search || "");

  useEffect(() => {
    if (pendingLead) setModal({ prefillCustomer: pendingLead.customer });
  }, [pendingLead]);
  const [onlyDebt, setOnlyDebt] = useState(!!initialFilter?.onlyDebt);
  const [importErrors, setImportErrors] = useState(null);
  const fileInputRef = useRef(null);
  const list = orders
    .filter((o) => !onlyDebt || orderDebt(o) > 0)
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (o.customer || "").toLowerCase().includes(q) || (o.orderNumber || "").toLowerCase().includes(q);
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const { page, setPage, totalPages, pageItems } = usePagination(list, [search, onlyDebt, orders.length]);

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

  return (
    <div>
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
              background: onlyDebt ? THEME.roseBg : "#fff", color: onlyDebt ? THEME.rose : THEME.text,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <AlertTriangle size={13} /> Faqat qarzdorlar
          </button>
          {(search || onlyDebt) && (
            <Button variant="ghost" onClick={() => { setSearch(""); setOnlyDebt(false); }}>Tozalash</Button>
          )}
          <div style={{ flex: 1 }} />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} style={{ display: "none" }} />
          <Button variant="ghost" onClick={downloadImportTemplate} title="Excel namunasini yuklab olish"><FileBarChart2 size={14} /> Namuna</Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Excel yuklash</Button>
          <Button variant="ghost" onClick={exportExcel} disabled={list.length === 0}><Download size={14} /> Excel</Button>
          <Button onClick={() => setModal({})}><Plus size={15} /> Yangi buyurtma</Button>
        </div>
        {importErrors && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: THEME.roseBg, border: "1.5px solid #F9C5CE", borderRadius: 11 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.rose, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Ba'zi qatorlar import qilinmadi:</span>
              <button onClick={() => setImportErrors(null)} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.rose }}><X size={14} /></button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#7A1224" }}>
              {importErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </Card>
      <Card style={{ padding: 0, overflowX: "auto" }} className="uvix-scroll">
        {list.length === 0 ? <EmptyState text="Hali buyurtma kiritilmagan" /> : (
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
function getIconBtn() {
  return { background: THEME.surface, border: "none", borderRadius: Math.max(5, THEME.radius - 9), padding: 7, cursor: "pointer", display: "flex" };
}

/* ---------------- PAYMENTS MODAL ---------------- */
function LeadForm({ initial, employees, onClose, onSave }) {
  const isEdit = !!initial;
  const managerNames = employees ? employees.map((e) => e.name) : [];
  const [customer, setCustomer] = useState(initial?.customer || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [source, setSource] = useState(initial?.source || "");
  const [estimatedValueStr, setEstimatedValueStr] = useState(initial?.estimatedValue != null ? fmt(initial.estimatedValue) : "");
  const [manager, setManager] = useState(initial?.manager || managerNames[0] || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [error, setError] = useState("");

  function submit() {
    if (!customer.trim()) return setError("Mijoz ismini kiriting");
    const lead = {
      id: initial?.id || uid(),
      customer: customer.trim(),
      phone: phone.trim(),
      source: source.trim(),
      estimatedValue: parseInt(estimatedValueStr.replace(/\s/g, ""), 10) || 0,
      manager,
      notes: notes.trim(),
      stage: initial?.stage || "new",
      orderId: initial?.orderId || null,
      createdBy: initial?.createdBy,
      createdAt: initial?.createdAt,
    };
    onSave(lead, isEdit);
  }

  return (
    <Modal title={isEdit ? "Lidni tahrirlash" : "Yangi lid"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Mijoz ismi">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} style={getInputStyle()} placeholder="Mijoz yoki kompaniya nomi" autoFocus />
        </Field>
        <Field label="Telefon">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={getInputStyle()} placeholder="+998 90 123 45 67" />
        </Field>
        <Field label="Manba (qayerdan kelgan)">
          <input value={source} onChange={(e) => setSource(e.target.value)} style={getInputStyle()} placeholder="Instagram, tavsiya, qo'ng'iroq..." />
        </Field>
        <Field label="Taxminiy summa (so'm)">
          <input value={estimatedValueStr} onChange={(e) => setEstimatedValueStr(fmt(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))} style={getInputStyle()} placeholder="0" inputMode="numeric" />
        </Field>
        <Field label="Mas'ul menejer">
          <select value={manager} onChange={(e) => setManager(e.target.value)} style={getInputStyle()}>
            {managerNames.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Izoh">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...getInputStyle(), resize: "vertical" }} placeholder="Qo'shimcha ma'lumot (ixtiyoriy)" />
        </Field>
        {error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

function LeadChatModal({ lead, onClose, onFetchMessages, onSendMessage }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    onFetchMessages(lead.telegramChatId)
      .then((msgs) => { if (!cancelled) setMessages(msgs); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Xabarlarni yuklab bo'lmadi"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lead.telegramChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    const outgoing = text.trim();
    setText("");
    try {
      await onSendMessage(lead.telegramChatId, outgoing);
      setMessages((prev) => [...prev, { id: uid(), text: outgoing, out: true, date: new Date().toISOString() }]);
    } catch (e) {
      setError(e?.message || "Yuborilmadi");
      setText(outgoing);
    } finally {
      setSending(false);
    }
  }

  const subtitle = [lead.phone, lead.telegramUsername ? `@${lead.telegramUsername}` : null].filter(Boolean).join(" · ");

  return (
    <Modal
      title={
        <div>
          <div>{lead.customer}</div>
          {subtitle && <div style={{ fontSize: 11.5, fontWeight: 500, color: THEME.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
      }
      onClose={onClose}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", height: 560 }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 4px 12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: THEME.muted, fontSize: 12.5, marginTop: 20 }}>Yuklanmoqda...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", color: THEME.muted, fontSize: 12.5, marginTop: 20 }}>Hali xabar yo'q</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.out ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                <div style={{
                  background: m.out ? THEME.violet : THEME.surface,
                  color: m.out ? "#fff" : THEME.text,
                  padding: "8px 12px", borderRadius: 14,
                  borderBottomRightRadius: m.out ? 4 : 14, borderBottomLeftRadius: m.out ? 14 : 4,
                  fontSize: 13, wordBreak: "break-word",
                }}>
                  {m.text}
                </div>
                <div style={{ fontSize: 10, color: THEME.muted, marginTop: 2, textAlign: m.out ? "right" : "left" }}>
                  {new Date(m.date).toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        {error && <div style={{ color: THEME.rose, fontSize: 11.5, marginBottom: 6 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${THEME.border}`, paddingTop: 10 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Xabar yozing..."
            style={{ ...getInputStyle(), flex: 1 }}
          />
          <Button onClick={send} disabled={sending || !text.trim()}>{sending ? "..." : "Yuborish"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CRMView({ leads, orders, employees, currentUser, isAdmin, onSaveLead, onDeleteLead, onMoveLead, onCreateOrderFromLead, onFetchTelegramMessages, onSendTelegramMessage }) {
  const [modal, setModal] = useState(null); // null | true (new) | lead (edit)
  const [confirmDel, setConfirmDel] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  const leadsByStage = useMemo(() => {
    const map = {};
    LEAD_STAGES.forEach((s) => (map[s.key] = []));
    (leads || []).forEach((l) => {
      if (map[l.stage]) map[l.stage].push(l);
      else map.new.push(l);
    });
    return map;
  }, [leads]);

  function saveLead(lead, isEdit) {
    onSaveLead(lead, isEdit);
    setModal(null);
  }
  function stageIndex(key) {
    return LEAD_STAGES.findIndex((s) => s.key === key);
  }
  function handleDragStart(e, lead) {
    setDraggedLeadId(lead.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
  }
  function handleDragEnd() {
    setDraggedLeadId(null);
    setDragOverStage(null);
  }
  function handleColumnDragOver(e, stageKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stageKey) setDragOverStage(stageKey);
  }
  function handleColumnDrop(e, stageKey) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain") || draggedLeadId;
    const lead = (leads || []).find((l) => l.id === leadId);
    if (lead && lead.stage !== stageKey) onMoveLead(lead, stageKey);
    setDraggedLeadId(null);
    setDragOverStage(null);
  }
  function moveStage(lead, dir) {
    const idx = stageIndex(lead.stage);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= LEAD_STAGES.length) return;
    onMoveLead(lead, LEAD_STAGES[nextIdx].key);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: THEME.muted }}>Savdo voronkasi — lidlarni bosqichlar bo'yicha kuzating</div>
        <Button onClick={() => setModal(true)}><Plus size={14} /> Yangi lid</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(240px, 1fr))", gap: 14, overflowX: "auto" }} className="uvix-scroll">
        {LEAD_STAGES.map((stage) => (
          <div
            key={stage.key}
            onDragOver={(e) => handleColumnDragOver(e, stage.key)}
            onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
            onDrop={(e) => handleColumnDrop(e, stage.key)}
            style={{
              borderRadius: 14,
              transition: "background-color 0.15s ease",
              background: dragOverStage === stage.key ? THEME.violetSoft : "transparent",
              padding: dragOverStage === stage.key ? 6 : 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{stage.label}</span>
              <span style={{ fontSize: 11, color: THEME.muted, background: THEME.surface, padding: "1px 8px", borderRadius: 20 }}>{leadsByStage[stage.key].length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
              {leadsByStage[stage.key].length === 0 ? (
                <div style={{ fontSize: 11.5, color: THEME.muted, padding: "16px 0", textAlign: "center", border: `1.5px dashed ${THEME.border}`, borderRadius: 12 }}>Bo'sh</div>
              ) : (
                leadsByStage[stage.key].map((lead) => {
                  const idx = stageIndex(lead.stage);
                  const linkedOrder = lead.orderId ? (orders || []).find((o) => o.id === lead.orderId) : null;
                  return (
                    <Card
                      key={lead.id}
                      className="uvix-dash-card"
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      style={{
                        padding: 12, display: "flex", flexDirection: "column", gap: 6,
                        cursor: "grab", opacity: draggedLeadId === lead.id ? 0.4 : 1,
                        transition: "opacity 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.customer}</div>
                        <button onClick={() => setConfirmDel(lead)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 2 }}><X size={13} color={THEME.muted} /></button>
                      </div>
                      {lead.phone && (
                        <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {lead.phone}</div>
                      )}
                      {lead.estimatedValue > 0 && (
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.violet }}>{money(lead.estimatedValue)}</div>
                      )}
                      {lead.manager && <div style={{ fontSize: 11, color: THEME.muted }}>Menejer: {lead.manager}</div>}
                      {lead.source && <div style={{ fontSize: 11, color: THEME.muted }}>Manba: {lead.source}</div>}
                      {lead.notes && <div style={{ fontSize: 11, color: THEME.muted, fontStyle: "italic" }}>{lead.notes}</div>}

                      {lead.telegramChatId && onFetchTelegramMessages && (
                        <Button variant="ghost" onClick={() => setChatFor(lead)} style={{ fontSize: 11.5, padding: "5px 10px", marginTop: 2 }}>
                          💬 Telegram chat
                        </Button>
                      )}

                      {linkedOrder ? (
                        <div style={{ fontSize: 11, color: THEME.green, fontWeight: 700, background: THEME.greenBg, padding: "3px 8px", borderRadius: 8, marginTop: 2 }}>
                          ✓ Buyurtma: {linkedOrder.orderNumber}
                        </div>
                      ) : (
                        lead.stage === "won" && (
                          <Button onClick={() => onCreateOrderFromLead(lead)} style={{ fontSize: 11.5, padding: "5px 10px", marginTop: 2 }}>
                            <Package size={12} /> Buyurtma yaratish
                          </Button>
                        )
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, borderTop: `1px dashed ${THEME.border}`, paddingTop: 6 }}>
                        <button onClick={() => moveStage(lead, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, padding: 2 }}>
                          <ArrowLeft size={14} color={THEME.text} />
                        </button>
                        <button onClick={() => setModal(lead)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: THEME.violet, fontWeight: 700 }}>Tahrirlash</button>
                        <button onClick={() => moveStage(lead, 1)} disabled={idx === LEAD_STAGES.length - 1} style={{ background: "none", border: "none", cursor: idx === LEAD_STAGES.length - 1 ? "default" : "pointer", opacity: idx === LEAD_STAGES.length - 1 ? 0.3 : 1, padding: 2 }}>
                          <ArrowRight size={14} color={THEME.text} />
                        </button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <LeadForm
          initial={modal === true ? null : modal}
          employees={employees}
          onClose={() => setModal(null)}
          onSave={saveLead}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`"${confirmDel.customer}" lidini o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeleteLead(confirmDel); setConfirmDel(null); }}
        />
      )}
      {chatFor && (
        <LeadChatModal
          lead={chatFor}
          onClose={() => setChatFor(null)}
          onFetchMessages={onFetchTelegramMessages}
          onSendMessage={onSendTelegramMessage}
        />
      )}
    </div>
  );
}

function PaymentsModal({ order, transactions, currentUser, isAdmin, onClose, onAddPayment, onDeletePayment }) {
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([{ id: uid(), methodType: "naqd", amountStr: "" }]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const paid = orderTotalPaid(order);
  const debt = orderDebt(order);
  const brakSum = orderBrakSum(order, transactions);
  const payments = (order.payments || []).filter((p) => !p.deletedAt).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalNew = lines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);

  function submit() {
    if (!date) return setError("Sanani tanlang");
    const validLines = lines.filter((l) => (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0) > 0);
    if (validLines.length === 0) return setError("Kamida bitta summani to'g'ri kiriting (0 dan katta)");
    const newPayments = validLines.map((l) => ({
      id: uid(),
      amount: parseInt(l.amountStr.replace(/\s/g, ""), 10),
      date,
      paymentType: l.methodType,
      comment: comment.trim(),
      createdBy: currentUser.name,
      createdAt: new Date().toISOString(),
    }));
    onAddPayment(order.id, newPayments);
    setLines([{ id: uid(), methodType: "naqd", amountStr: "" }]);
    setComment("");
    setError("");
  }

  return (
    <Modal title={`To'lovlar — ${order.orderNumber}`} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>Buyurtma</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{money(order.agreementUzs)}</div>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>To'langan</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: THEME.green }}>{money(paid)}</div>
          </Card>
          <Card style={{ padding: 12, background: debt > 0 ? THEME.roseBg : THEME.greenBg, border: debt > 0 ? "1.5px solid #F9C5CE" : `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 10.5, color: debt > 0 ? THEME.rose : THEME.green, fontWeight: 700, textTransform: "uppercase" }}>Qarzdorlik</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: debt > 0 ? THEME.rose : THEME.green }}>{money(debt)}</div>
          </Card>
        </div>

        {brakSum > 0 && (
          <Card style={{ padding: 12, background: THEME.roseBg, border: "1.5px solid #F9C5CE" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <div>
                <div style={{ fontSize: 10.5, color: THEME.rose, fontWeight: 700, textTransform: "uppercase" }}>Brak (ushbu buyurtma bo'yicha)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: THEME.rose, marginTop: 2 }}>−{money(brakSum)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>Sof buyurtma summasi</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text, marginTop: 2 }}>{money((order.agreementUzs || 0) - brakSum)}</div>
              </div>
            </div>
          </Card>
        )}

        {(order.photos || []).length > 0 && (
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Fotolar ({order.photos.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
              {order.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${THEME.border}`, display: "block" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </a>
              ))}
            </div>
          </Card>
        )}

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>To'lovlar tarixi</div>
          {payments.length === 0 ? (
            <EmptyState text="Hali to'lov kiritilmagan" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }} className="uvix-scroll">
              {payments.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{money(p.amount)}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{p.date} &middot; {paymentTypeLabel(p.paymentType)}{p.comment ? ` · ${p.comment}` : ""}</div>
                  </div>
                  {(isAdmin || p.createdBy === currentUser.name) && (
                    <button onClick={() => setConfirmDel(p)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={13} color={THEME.rose} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 2 }}>Yangi to'lov qo'shish</div>
          <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 8 }}>
            Mijoz to'lovni bir nechta usul orqali qilgan bo'lsa (masalan qisman naqd, qisman karta), har birini alohida qator sifatida qo'shing.
          </div>
          <Field label="Sana">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...getInputStyle(), marginBottom: 10 }} />
          </Field>
          <MultiPaymentLines lines={lines} onChange={setLines} bg={THEME.surface} />
          {lines.length > 1 && (
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8, textAlign: "right", color: THEME.violet }}>
              Jami: {money(totalNew)}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Field label="Izoh (ixtiyoriy)">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Masalan: 2-avans" style={getInputStyle()} />
            </Field>
          </div>
          {error && <div style={{ color: THEME.rose, fontSize: 12.5, marginTop: 8 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <Button onClick={submit}><Plus size={14} /> To'lov qo'shish</Button>
          </div>
        </div>
      </div>
      {confirmDel && (
        <ConfirmDialog
          message={`${money(confirmDel.amount)} to'lovni o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeletePayment(order.id, confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </Modal>
  );
}

/* ---------------- ORDER FORM ---------------- */
function OrderForm({ initial, currentUser, categories, employees, settings, allOrders, transactions, onAddSubcategory, onClose, onSave, onUploadPhotos, onDeletePhoto, prefillCustomer }) {
  const isEdit = !!initial;
  const [orderId] = useState(() => initial?.id || uid());
  const [photos, setPhotos] = useState(initial?.photos || []);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (photos.length + files.length > 10) {
      setPhotoError("Bitta buyurtmaga maksimum 10 ta rasm yuklash mumkin");
      e.target.value = "";
      return;
    }
    setPhotoError("");
    setPhotoUploading(true);
    try {
      const uploaded = await onUploadPhotos(orderId, files);
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setPhotoError(err?.message || "Rasm yuklashda xato yuz berdi");
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  }
  async function handlePhotoDelete(photo) {
    try {
      await onDeletePhoto(photo.filename || photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err) {
      setPhotoError(err?.message || "Rasmni o'chirishda xato yuz berdi");
    }
  }

  const linkedExpense = isEdit ? (transactions || []).find((t) => t.relatedOrderId === initial.id) : null;
  const materialOptions = (categories && categories["Material"]) || ["Boshqa material"];
  const managerNames = employees ? employees.map((e) => e.name) : [];
  const defaultUsdRate = (settings && settings.usdRate) || 12700;
  const BIZ_LINES = ["UVIXPRINT", "UVONYX"];

  function sanitizeDecimal(v) {
    let s = v.replace(/[^0-9.,]/g, "").replace(",", ".");
    const parts = s.split(".");
    if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
    return s;
  }

  const [date, setDate] = useState(initial?.date || todayStr());
  const [customer, setCustomer] = useState(initial?.customer || prefillCustomer || "");
  const [bizLine, setBizLine] = useState(initial?.subcategory || BIZ_LINES[0]);
  const [manager, setManager] = useState(initial?.manager || managerNames[0] || "");

  const [materialLines, setMaterialLines] = useState(
    initial?.materialLines?.length
      ? initial.materialLines.map((l) => ({ id: uid(), materialType: l.materialType || materialOptions[0] || "", areaStr: l.area != null ? String(l.area) : "", priceStr: l.priceUsd != null ? String(l.priceUsd) : "" }))
      : [{ id: uid(), materialType: materialOptions[0] || "", areaStr: "", priceStr: "" }]
  );
  const [kraskaStr, setKraskaStr] = useState(initial?.kraskaSum != null ? fmt(initial.kraskaSum) : "");
  const [kraskaTouched, setKraskaTouched] = useState(false);

  const [exchangeRateStr, setExchangeRateStr] = useState(
    initial?.exchangeRate != null ? fmt(initial.exchangeRate) : (defaultUsdRate ? fmt(defaultUsdRate) : "")
  );
  const [agreementStr, setAgreementStr] = useState(initial?.agreementUzs != null ? fmt(initial.agreementUzs) : "");

  const [addInitialPayment, setAddInitialPayment] = useState(false);
  const [initPaymentLines, setInitPaymentLines] = useState([{ id: uid(), methodType: "naqd", amountStr: "" }]);

  const [addMaterialExpense, setAddMaterialExpense] = useState(false);
  const [matExpType, setMatExpType] = useState(linkedExpense?.subcategory || materialOptions[0] || "");
  const [matExpAmountStr, setMatExpAmountStr] = useState(
    linkedExpense ? fmt(linkedExpense.amount) : (initial?.materialSum != null ? fmt(initial.materialSum) : "")
  );
  const [matExpPaymentType, setMatExpPaymentType] = useState(linkedExpense?.paymentType || "naqd");
  const [newMatExpOpen, setNewMatExpOpen] = useState(false);
  const [newMatExpName, setNewMatExpName] = useState("");
  const [newMatLineOpen, setNewMatLineOpen] = useState(null);
  const [newMatLineName, setNewMatLineName] = useState("");

  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");

  const materialLinesComputed = materialLines.map((l) => {
    const area = parseFloat((l.areaStr || "").replace(",", ".")) || 0;
    const price = parseFloat((l.priceStr || "").replace(",", ".")) || 0;
    return { ...l, area, price, lineTotalUsd: area * price };
  });
  const totalArea = materialLinesComputed.reduce((s, l) => s + l.area, 0);
  const totalUsdNum = materialLinesComputed.reduce((s, l) => s + l.lineTotalUsd, 0);
  const exchangeRateNum = parseInt(exchangeRateStr.replace(/\s/g, ""), 10) || 0;
  const autoTotalUzs = Math.round(totalUsdNum * exchangeRateNum);
  const agreementUzs = parseInt(agreementStr.replace(/\s/g, ""), 10) || 0;

  const kraskaSumTotal = parseInt(kraskaStr.replace(/\s/g, ""), 10) || 0;
  const matExpAmountNum = parseInt(matExpAmountStr.replace(/\s/g, ""), 10) || 0;
  const materialSumForCalc = matExpAmountNum;
  const brakSumForCalc = isEdit ? orderBrakSum(initial, transactions) : 0;
  const addedValueUzs = agreementUzs - kraskaSumTotal - materialSumForCalc - brakSumForCalc;
  const initPaymentNum = initPaymentLines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);
  const alreadyPaidUzs = isEdit ? orderTotalPaid(initial) : (addInitialPayment ? initPaymentNum : 0);
  const debtUzs = Math.max(0, agreementUzs - alreadyPaidUzs);

  useEffect(() => {
    if (!kraskaTouched && autoTotalUzs > 0) {
      setKraskaStr(fmt(autoTotalUzs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTotalUzs]);

  function handleKraskaChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setKraskaStr(digits ? fmt(parseInt(digits, 10)) : "");
    setKraskaTouched(true);
  }
  function resetKraska() {
    setKraskaTouched(false);
    setKraskaStr(fmt(autoTotalUzs));
  }

  function updateMaterialLine(id, field, value) {
    setMaterialLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }
  function addMaterialLine() {
    setMaterialLines((prev) => [...prev, { id: uid(), materialType: materialOptions[0] || "", areaStr: "", priceStr: "" }]);
  }
  function removeMaterialLine(id) {
    setMaterialLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }
  function submitNewMaterialLine(lineId) {
    const clean = newMatLineName.trim();
    if (!clean) return;
    if (!materialOptions.includes(clean)) onAddSubcategory("Material", clean);
    updateMaterialLine(lineId, "materialType", clean);
    setNewMatLineName("");
    setNewMatLineOpen(null);
  }
  function handleAgreementChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setAgreementStr(digits ? fmt(parseInt(digits, 10)) : "");
  }
  function handleExchangeRateChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setExchangeRateStr(digits ? fmt(parseInt(digits, 10)) : "");
  }
  function submitNewMatExp() {
    const clean = newMatExpName.trim();
    if (!clean) return;
    if (!materialOptions.includes(clean)) onAddSubcategory("Material", clean);
    setMatExpType(clean);
    setNewMatExpName("");
    setNewMatExpOpen(false);
  }
  function handleMatExpAmountChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setMatExpAmountStr(digits ? fmt(parseInt(digits, 10)) : "");
  }

  function submit() {
    if (!date) return setError("Sanani tanlang");
    if (!customer.trim()) return setError("Mijoz nomini kiriting");
    if (!agreementUzs || agreementUzs <= 0) return setError("Umumiy buyurtma summasini kiriting");
    if (totalUsdNum > 0 && (!exchangeRateNum || exchangeRateNum <= 0)) return setError("Kraska hisob-kitobida $ narx kiritilgan bo'lsa, USD kursini ham kiriting");
    if (addMaterialExpense && (!matExpAmountNum || matExpAmountNum <= 0)) return setError("Material xarajati summasini kiriting");
    if (addInitialPayment && (!initPaymentNum || initPaymentNum <= 0)) return setError("Boshlang'ich to'lov summasini kiriting");

    const order = {
      id: orderId,
      orderNumber: initial?.orderNumber || generateOrderNumber(allOrders, date),
      date,
      customer: customer.trim(),
      subcategory: bizLine,
      materialType: materialLinesComputed.map((l) => l.materialType).filter(Boolean).join(", "),
      materialLines: materialLinesComputed.map((l) => ({ materialType: l.materialType, area: l.area, priceUsd: l.price, totalUsd: l.lineTotalUsd })),
      manager,
      area: totalArea,
      exchangeRate: exchangeRateNum,
      agreementUsd: totalUsdNum,
      agreementUzs,
      kraskaLines: kraskaSumTotal > 0 ? [{ amount: kraskaSumTotal }] : [],
      kraskaSum: kraskaSumTotal,
      materialSum: matExpAmountNum,
      payments: initial?.payments || [],
      note: note.trim(),
      createdBy: initial?.createdBy || currentUser.name,
      createdAt: initial?.createdAt || new Date().toISOString(),
      photos: photos,
    };

    if (!isEdit && addInitialPayment && initPaymentNum > 0) {
      order.payments = initPaymentLines
        .filter((l) => (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0) > 0)
        .map((l) => ({
          id: uid(), amount: parseInt(l.amountStr.replace(/\s/g, ""), 10), date, paymentType: l.methodType,
          comment: "Boshlang'ich to'lov", createdBy: currentUser.name, createdAt: new Date().toISOString(),
        }));
    }

    let linkedExpenseTx = null;
    if (linkedExpense) {
      // Mavjud bog'liq xarajat — qiymatlarni yangilaymiz (agar summa 0 bo'lsa, eskisiga tegmaymiz)
      if (matExpAmountNum > 0) {
        linkedExpenseTx = {
          ...linkedExpense, category: "Material", subcategory: matExpType,
          amount: matExpAmountNum, paymentType: matExpPaymentType, date: linkedExpense.date,
        };
      }
    } else if (addMaterialExpense && matExpAmountNum > 0) {
      linkedExpenseTx = {
        id: uid(), type: "chiqim", date, category: "Material", subcategory: matExpType,
        amount: matExpAmountNum, paymentType: matExpPaymentType,
        note: `Buyurtma ${order.orderNumber} (${customer.trim()}) uchun material xarajati`,
        createdBy: currentUser.name, createdAt: new Date().toISOString(), relatedOrderId: order.id,
      };
    }
    onSave(order, linkedExpenseTx);
  }

  return (
    <Modal title={isEdit ? `Buyurtmani tahrirlash — ${initial.orderNumber}` : "Yangi buyurtma"} onClose={onClose} width={720}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Sana">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Mijoz">
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Mijoz ismi" style={getInputStyle()} />
          </Field>
          <Field label="Sub kategoriya">
            <div style={{ display: "flex", gap: 6, background: THEME.surface, borderRadius: 11, padding: 3 }}>
              {BIZ_LINES.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setBizLine(opt)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: bizLine === opt ? "#fff" : "transparent",
                    color: bizLine === opt ? THEME.violet : THEME.muted,
                    boxShadow: bizLine === opt ? THEME.shadowSm : "none",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Mas'ul menedjer">
          {managerNames.length > 0 ? (
            <select value={manager} onChange={(e) => setManager(e.target.value)} style={getInputStyle()}>
              {managerNames.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Menedjer ismi" style={getInputStyle()} />
          )}
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Ushbu buyurtma uchun mas'ul bo'lgan menedjer — "Xodimlar" bo'limida qo'shilgan xodimlar ro'yxatidan tanlanadi.
          </div>
        </Field>

        {/* 1) UMUMIY BUYURTMA SUMMASI — hodim tomonidan to'g'ridan-to'g'ri kiritiladi */}
        <Field label="Umumiy buyurtma summasi (so'm)">
          <input
            value={agreementStr}
            onChange={handleAgreementChange}
            placeholder="0"
            inputMode="numeric"
            style={{ ...getInputStyle(), fontSize: 20, fontWeight: 800, color: THEME.violet, padding: "13px 14px" }}
          />
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 4 }}>
            Mijoz bilan kelishilgan umumiy summani shu yerga kiriting.
          </div>
        </Field>

        {/* 2) BOSHLANG'ICH TO'LOV / AVANS — Umumiy buyurtma summasidan keyin, darhol */}
        {!isEdit && (
          <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: THEME.text }}>
              <input type="checkbox" checked={addInitialPayment} onChange={(e) => setAddInitialPayment(e.target.checked)} style={{ width: 16, height: 16 }} />
              Boshlang'ich to'lov (avans) bor
            </label>
            {addInitialPayment && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, padding: 12, background: THEME.surface, borderRadius: 11 }}>
                <div style={{ fontSize: 11, color: THEME.muted, marginBottom: -4 }}>
                  Mijoz bir nechta usul orqali to'lagan bo'lsa (masalan qisman naqd, qisman karta), har birini alohida qator sifatida kiriting.
                </div>
                <MultiPaymentLines lines={initPaymentLines} onChange={setInitPaymentLines} bg="#fff" />
                {initPaymentLines.length > 1 && initPaymentNum > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 800, textAlign: "right", color: THEME.violet }}>
                    Jami: {money(initPaymentNum)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: THEME.muted }}>
                  Keyingi to'lovlarni buyurtma ochilgandan so'ng "To'lovlar" oynasidan qo'shishingiz mumkin.
                </div>
              </div>
            )}
          </div>
        )}
        {isEdit && (
          <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>To'lovlar (avans)</div>
            <div style={{ padding: 12, background: THEME.surface, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: THEME.green }}>{money(orderTotalPaid(initial))}</div>
                <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>
                  {(initial.payments || []).filter((p) => !p.deletedAt).length} ta to'lov qayd etilgan — bu joyda o'chirilmagan, faqat forma ichida ko'rinmaydi
                </div>
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, maxWidth: 220 }}>
                To'lov qo'shish, o'chirish yoki tarixini ko'rish uchun buyurtmalar ro'yxatida <b style={{ color: THEME.text }}>"To'lovlar"</b> tugmasidan foydalaning.
              </div>
            </div>
          </div>
        )}

        {/* Qo'shimcha $ hisob-kitobi (ixtiyoriy) — Kraska hisob-kitobiga asos bo'ladi */}
        <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Qo'shimcha $ hisob-kitobi (ixtiyoriy) — Material turlari va kv/m</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {materialLinesComputed.map((line) => (
              <div key={line.id} style={{ padding: 10, background: THEME.surface, borderRadius: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr auto", gap: 8, alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={line.materialType} onChange={(e) => updateMaterialLine(line.id, "materialType", e.target.value)} style={{ ...getInputStyle(), background: THEME.card }}>
                        {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button type="button" onClick={() => setNewMatLineOpen(newMatLineOpen === line.id ? null : line.id)} title="Yangi material turi" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px", background: THEME.card }}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {newMatLineOpen === line.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          autoFocus
                          value={newMatLineName}
                          onChange={(e) => setNewMatLineName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewMaterialLine(line.id))}
                          placeholder="Yangi material turi nomi"
                          style={{ ...getInputStyle(), fontSize: 12.5, background: THEME.card }}
                        />
                        <Button type="button" onClick={() => submitNewMaterialLine(line.id)} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
                      </div>
                    )}
                  </div>
                  <input
                    value={line.areaStr}
                    onChange={(e) => updateMaterialLine(line.id, "areaStr", sanitizeDecimal(e.target.value))}
                    placeholder="Kv/m"
                    inputMode="decimal"
                    style={{ ...getInputStyle(), background: THEME.card }}
                  />
                  <input
                    value={line.priceStr}
                    onChange={(e) => updateMaterialLine(line.id, "priceStr", sanitizeDecimal(e.target.value))}
                    placeholder="$ / m²"
                    inputMode="decimal"
                    style={{ ...getInputStyle(), background: THEME.card }}
                  />
                  <button
                    type="button"
                    onClick={() => removeMaterialLine(line.id)}
                    disabled={materialLines.length <= 1}
                    className="uvix-iconbtn"
                    style={{ ...getIconBtn(), background: THEME.card, opacity: materialLines.length <= 1 ? 0.35 : 1, marginTop: 0 }}
                  >
                    <X size={14} color={THEME.rose} />
                  </button>
                </div>
                {line.lineTotalUsd > 0 && (
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6, textAlign: "right" }}>
                    {line.area} m² × {usd(line.price)} = <b style={{ color: THEME.text }}>{usd(line.lineTotalUsd)}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addMaterialLine} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, background: "none", border: "none", color: THEME.violet, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            <Plus size={14} /> Yana material turi qo'shish
          </button>
          {totalUsdNum > 0 && (
            <div style={{ marginTop: 10 }}>
              <Field label="USD kursi (1 $ = ? so'm)">
                <input
                  value={exchangeRateStr}
                  onChange={handleExchangeRateChange}
                  placeholder="12 700"
                  inputMode="numeric"
                  style={{ ...getInputStyle(), fontSize: 15, fontWeight: 700 }}
                />
              </Field>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Jami: {usd(totalUsdNum)}{exchangeRateNum > 0 ? ` ≈ ${money(autoTotalUzs)}` : ""}
              </div>
            </div>
          )}
        </div>

        {/* KRASKA HISOB-KITOBI — yuqoridagi $ hisob-kitobi jamisidan avtomatik olinadi */}
        <Field label="Kraska hisob-kitobi (so'm)">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={kraskaStr}
              onChange={handleKraskaChange}
              placeholder="0"
              inputMode="numeric"
              style={{ ...getInputStyle(), fontSize: 16, fontWeight: 700 }}
            />
            {kraskaTouched && autoTotalUzs > 0 && (
              <button type="button" onClick={resetKraska} title="Avtomatik hisoblanganga qaytarish" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px" }}>
                <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 4 }}>
            {kraskaTouched ? "Qo'lda kiritilgan qiymat" : "Qo'shimcha $ hisob-kitobi jamisidan avtomatik olinadi — kerak bo'lsa qo'lda o'zgartirishingiz mumkin"}
          </div>
        </Field>

        {/* 4) QARZDORLIK */}
        <Field label="Qarzdorlik">
          <div style={{
            padding: "10px 12px", borderRadius: 11, fontSize: 17, fontWeight: 800,
            background: debtUzs > 0 ? THEME.roseBg : THEME.greenBg,
            color: debtUzs > 0 ? THEME.rose : THEME.green,
            border: debtUzs > 0 ? "1.5px solid #F9C5CE" : `1.5px solid ${THEME.border}`,
          }}>
            {money(debtUzs)}
          </div>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Umumiy buyurtma − {isEdit ? "hozirgacha to'langan summalar" : "boshlang'ich to'lov"}
          </div>
        </Field>

        {/* 5) QO'SHILGAN QIYMAT */}
        <Field label="Qo'shilgan qiymat (avtomatik)">
          <div style={{
            padding: "10px 12px", borderRadius: 11, fontSize: 16, fontWeight: 800,
            background: addedValueUzs >= 0 ? THEME.greenBg : THEME.roseBg,
            color: addedValueUzs >= 0 ? THEME.green : THEME.rose,
            border: addedValueUzs >= 0 ? `1.5px solid ${THEME.border}` : "1.5px solid #F9C5CE",
          }}>
            {money(addedValueUzs)}
          </div>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Umumiy buyurtma − Kraska summasi − Material xarajati{brakSumForCalc > 0 ? ` − Brak (${money(brakSumForCalc)})` : ""}
          </div>
        </Field>


        <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
          {linkedExpense ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Material xarajati (MATERIALGA PUL XARAJATLARI)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: THEME.surface, borderRadius: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Material turi">
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={matExpType} onChange={(e) => setMatExpType(e.target.value)} style={{ ...getInputStyle(), background: THEME.card }}>
                        {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button type="button" onClick={() => setNewMatExpOpen((v) => !v)} title="Yangi material turi" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px", background: THEME.card }}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {newMatExpOpen && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          autoFocus
                          value={newMatExpName}
                          onChange={(e) => setNewMatExpName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewMatExp())}
                          placeholder="Yangi material turi nomi"
                          style={{ ...getInputStyle(), fontSize: 12.5, background: THEME.card }}
                        />
                        <Button type="button" onClick={submitNewMatExp} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
                      </div>
                    )}
                  </Field>
                  <Field label="Xarajat summasi (so'm)">
                    <input value={matExpAmountStr} onChange={handleMatExpAmountChange} placeholder="0" inputMode="numeric" style={{ ...getInputStyle(), background: THEME.card }} />
                  </Field>
                </div>
                <Field label="To'lov turi (material uchun)">
                  <PaymentTypeSelector value={matExpPaymentType} onChange={setMatExpPaymentType} size="small" />
                </Field>
                <div style={{ fontSize: 11, color: THEME.muted }}>
                  Bu buyurtmaga bog'liq material xarajati Rasxod → Material bo'limida ham avtomatik yangilanadi.
                </div>
              </div>
            </>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: THEME.text }}>
                <input type="checkbox" checked={addMaterialExpense} onChange={(e) => setAddMaterialExpense(e.target.checked)} style={{ width: 16, height: 16 }} />
                Ushbu buyurtma uchun material xarajatini ham shu yerda kiritish (MATERIALGA PUL XARAJATLARI)
              </label>
              {addMaterialExpense && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, padding: 12, background: THEME.surface, borderRadius: 11 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Material turi">
                      <div style={{ display: "flex", gap: 6 }}>
                        <select value={matExpType} onChange={(e) => setMatExpType(e.target.value)} style={getInputStyle()}>
                          {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button type="button" onClick={() => setNewMatExpOpen((v) => !v)} title="Yangi material turi" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px", background: THEME.card }}>
                          <Plus size={14} />
                        </button>
                      </div>
                      {newMatExpOpen && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <input
                            autoFocus
                            value={newMatExpName}
                            onChange={(e) => setNewMatExpName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewMatExp())}
                            placeholder="Yangi material turi nomi"
                            style={{ ...getInputStyle(), fontSize: 12.5, background: THEME.card }}
                          />
                          <Button type="button" onClick={submitNewMatExp} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
                        </div>
                      )}
                    </Field>
                    <Field label="Xarajat summasi (so'm)">
                      <input value={matExpAmountStr} onChange={handleMatExpAmountChange} placeholder="0" inputMode="numeric" style={{ ...getInputStyle(), background: THEME.card }} />
                    </Field>
                  </div>
                  <Field label="To'lov turi (material uchun)">
                    <PaymentTypeSelector value={matExpPaymentType} onChange={setMatExpPaymentType} size="small" />
                  </Field>
                  <div style={{ fontSize: 11, color: THEME.muted }}>
                    Bu xarajat avtomatik ravishda Rasxod → Material bo'limiga ham qo'shiladi.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <Field label="Kommentariya">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qo'shimcha izoh (ixtiyoriy)" style={{ ...getInputStyle(), resize: "vertical" }} />
        </Field>

        {onUploadPhotos && (
          <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: THEME.text }}>Fotolar ({photos.length}/10)</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading || photos.length >= 10}
                style={{ display: "flex", alignItems: "center", gap: 5, background: THEME.violetSoft, color: THEME.violet, border: "none", borderRadius: 9, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: photoUploading ? "not-allowed" : "pointer", opacity: photoUploading || photos.length >= 10 ? 0.6 : 1 }}
              >
                <Upload size={13} /> {photoUploading ? "Yuklanmoqda..." : "Rasm qo'shish"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: "none" }} />
            </div>
            {photoError && <div style={{ color: THEME.rose, fontSize: 12, marginBottom: 8 }}>{photoError}</div>}
            {photos.length === 0 ? (
              <div style={{ fontSize: 12, color: THEME.muted, padding: "10px 0" }}>Hali rasm yuklanmagan — jarayon yoki tayyor mahsulot suratlarini qo'shishingiz mumkin.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
                {photos.map((p) => (
                  <div key={p.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${THEME.border}` }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <button
                      type="button"
                      onClick={() => handlePhotoDelete(p)}
                      style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(20,16,30,0.7)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}


/* ---------------- EXPENSE VIEW ---------------- */
function ExpenseView({ transactions, orders, currentUser, categories, onAddCategory, onAddSubcategory, onSave, onDelete }) {
  const [modal, setModal] = useState(null);
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
        {list.length === 0 ? <EmptyState text="Hali rasxod kiritilmagan" /> : (
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

/* ---------------- RASXOD FORMASI (faqat chiqim uchun) ---------------- */
function TransactionForm({ initial, currentUser, categories, orders, onAddCategory, onAddSubcategory, onClose, onSave }) {
  const catNames = categories ? Object.keys(categories) : [];
  const [date, setDate] = useState(initial?.date || todayStr());
  const [category, setCategory] = useState(initial?.category || catNames[0] || "");
  const [subcategory, setSubcategory] = useState(initial?.subcategory || (categories?.[catNames[0]] || [])[0] || "");
  const [amountStr, setAmountStr] = useState(initial ? fmt(initial.amount) : "");
  const [paymentType, setPaymentType] = useState(initial?.paymentType || "karta");
  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [linkedOrderId, setLinkedOrderId] = useState(initial?.relatedOrderId || "");
  const [orderQuery, setOrderQuery] = useState(() => {
    if (initial?.relatedOrderId) {
      const found = (orders || []).find((o) => o.id === initial.relatedOrderId);
      if (found) return `${found.customer} (${found.orderNumber})`;
    }
    return "";
  });
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);

  const isBrak = category === "Brak";
  const orderSuggestions = orderQuery.trim()
    ? (orders || []).filter((o) =>
        (o.customer || "").toLowerCase().includes(orderQuery.trim().toLowerCase()) ||
        (o.orderNumber || "").toLowerCase().includes(orderQuery.trim().toLowerCase())
      ).slice(0, 8)
    : (orders || []).slice(0, 8);
  function pickOrder(o) {
    setLinkedOrderId(o.id);
    setOrderQuery(`${o.customer} (${o.orderNumber})`);
    setShowOrderSuggestions(false);
  }

  function handleAmountChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setAmountStr(digits ? fmt(parseInt(digits, 10)) : "");
  }
  function handleCategoryChange(cat) {
    setCategory(cat);
    setSubcategory((categories[cat] || [])[0] || "");
  }
  function submitNewCategory() {
    const clean = newCatName.trim();
    if (!clean) return;
    if (catNames.includes(clean)) { setCategory(clean); setSubcategory((categories[clean] || [])[0] || ""); }
    else {
      onAddCategory(clean);
      setCategory(clean);
      setSubcategory("Umumiy");
    }
    setNewCatName("");
    setNewCatOpen(false);
  }
  function submitNewSubcategory() {
    const clean = newSubName.trim();
    if (!clean || !category) return;
    const existing = categories[category] || [];
    if (!existing.includes(clean)) onAddSubcategory(category, clean);
    setSubcategory(clean);
    setNewSubName("");
    setNewSubOpen(false);
  }

  function submit() {
    if (!date) return setError("Sanani tanlang");
    const amount = parseInt(amountStr.replace(/\s/g, ""), 10);
    if (!amount || amount <= 0) return setError("Summani to'g'ri kiriting (0 dan katta)");
    if (!category) return setError("Kategoriyani tanlang");
    if (isBrak && !linkedOrderId) return setError("Brak qaysi buyurtmaga tegishli ekanini tanlang");
    const tx = {
      id: initial?.id || uid(),
      type: "chiqim",
      date,
      amount,
      paymentType,
      note: note.trim(),
      createdBy: initial?.createdBy || currentUser.name,
      createdAt: initial?.createdAt || new Date().toISOString(),
      category,
      subcategory,
      relatedOrderId: isBrak ? linkedOrderId : (initial?.relatedOrderId || undefined),
    };
    onSave(tx);
  }

  return (
    <Modal title={(initial ? "Tahrirlash" : "Yangi") + " rasxod"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Sana">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Kategoriya">
            <div style={{ display: "flex", gap: 6 }}>
              <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} style={getInputStyle()}>
                {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={() => setNewCatOpen((v) => !v)} title="Yangi kategoriya" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px" }}>
                <Plus size={14} />
              </button>
            </div>
            {newCatOpen && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewCategory())}
                  placeholder="Yangi kategoriya nomi"
                  style={{ ...getInputStyle(), fontSize: 12.5 }}
                />
                <Button type="button" onClick={submitNewCategory} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
              </div>
            )}
          </Field>
          <Field label="Subkategoriya">
            <div style={{ display: "flex", gap: 6 }}>
              <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} style={getInputStyle()}>
                {(categories[category] || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={() => setNewSubOpen((v) => !v)} title="Yangi subkategoriya" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px" }}>
                <Plus size={14} />
              </button>
            </div>
            {newSubOpen && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  autoFocus
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewSubcategory())}
                  placeholder="Yangi subkategoriya nomi"
                  style={{ ...getInputStyle(), fontSize: 12.5 }}
                />
                <Button type="button" onClick={submitNewSubcategory} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
              </div>
            )}
          </Field>
        </div>
        {isBrak && (
          <Field label="Qaysi buyurtmaga tegishli?">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: THEME.muted }} />
              <input
                value={orderQuery}
                onChange={(e) => { setOrderQuery(e.target.value); setLinkedOrderId(""); setShowOrderSuggestions(true); }}
                onFocus={() => setShowOrderSuggestions(true)}
                onBlur={() => setTimeout(() => setShowOrderSuggestions(false), 150)}
                placeholder="Mijoz yoki buyurtma № bo'yicha qidiring..."
                style={{ ...getInputStyle(), paddingLeft: 30, borderColor: linkedOrderId ? THEME.violet : undefined }}
              />
              {showOrderSuggestions && orderSuggestions.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 11, boxShadow: THEME.shadowLg, zIndex: 20, maxHeight: 200, overflowY: "auto", padding: 4 }} className="uvix-scroll">
                  {orderSuggestions.map((o) => (
                    <button
                      key={o.id}
                      onMouseDown={() => pickOrder(o)}
                      type="button"
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "none", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}
                      className="uvix-row"
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{o.customer}</span>
                      <span style={{ fontSize: 11.5, color: THEME.muted }}>{o.orderNumber}</span>
                    </button>
                  ))}
                </div>
              )}
              {showOrderSuggestions && orderQuery.trim() && orderSuggestions.length === 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 11, padding: "10px 14px", fontSize: 12, color: THEME.muted, zIndex: 20 }}>
                  Buyurtma topilmadi
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
              Bu summa shu buyurtmaning "Qo'shilgan qiymat" hisobidan avtomatik ayiriladi va buyurtmalar ro'yxatida ko'rsatiladi.
            </div>
          </Field>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Summa (so'm)">
            <input value={amountStr} onChange={handleAmountChange} placeholder="0" inputMode="numeric" style={{ ...getInputStyle(), fontSize: 17, fontWeight: 700 }} />
          </Field>
          <Field label="To'lov turi">
            <PaymentTypeSelector value={paymentType} onChange={setPaymentType} />
          </Field>
        </div>
        <Field label="Izoh">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qo'shimcha izoh (ixtiyoriy)" style={{ ...getInputStyle(), resize: "vertical" }} />
        </Field>
        {error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- OPERATIONS VIEW (to'lovlar + rasxodlar birlashtirilgan) ---------------- */
function OperationsView({ orders, transactions, isAdmin, onDeletePayment, onDeleteExpense, currentUser, categories, initialFilter }) {
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
        {filtered.length === 0 ? <EmptyState text="Natija topilmadi" /> : (
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
                    <Badge color={t.type === "kirim" ? "#0F6E56" : "#991B1B"} bg={t.type === "kirim" ? THEME.greenBg : THEME.roseBg}>
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

/* ---------------- HISOBOT ---------------- */
const PERIODS = [
  { key: "today", label: "Bugun" },
  { key: "yesterday", label: "Kecha" },
  { key: "week", label: "Shu hafta" },
  { key: "month", label: "Shu oy" },
  { key: "lastMonth", label: "O'tgan oy" },
  { key: "year", label: "Shu yil" },
  { key: "custom", label: "Custom" },
];
function periodRange(period, customFrom, customTo) {
  const now = new Date();
  const fmtD = (d) => localDateStr(d);
  if (period === "today") return { from: fmtD(now), to: fmtD(now) };
  if (period === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: fmtD(y), to: fmtD(y) };
  }
  if (period === "week") {
    const day = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
    return { from: fmtD(monday), to: fmtD(now) };
  }
  if (period === "month") {
    return { from: fmtD(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtD(now) };
  }
  if (period === "lastMonth") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmtD(first), to: fmtD(last) };
  }
  if (period === "year") {
    return { from: fmtD(new Date(now.getFullYear(), 0, 1)), to: fmtD(now) };
  }
  return { from: customFrom || fmtD(now), to: customTo || fmtD(now) };
}

function ReportView({ orders, transactions, categories }) {
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
              background: period === p.key ? THEME.violet : "#fff", color: period === p.key ? "#fff" : THEME.text,
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
                    <div style={{ height: 6, borderRadius: 4, background: "#F0EEF8", width: "100%", maxWidth: 200 }}>
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

/* ---------------- KATEGORIYALAR ---------------- */
function CategoriesView({ transactions, categories, isAdmin, onAddCategory, onAddSubcategory, onRenameCategory, onDeleteCategory, onDeleteSubcategory }) {
  const [open, setOpen] = useState(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [subInput, setSubInput] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDelCat, setConfirmDelCat] = useState(null);
  const [confirmDelSub, setConfirmDelSub] = useState(null);
  const catNames = Object.keys(categories || {});
  const curMonth = todayStr().slice(0, 7);

  const totalsByCat = useMemo(() => {
    const map = {};
    catNames.forEach((c) => (map[c] = { month: 0, all: 0 }));
    transactions.filter((t) => t.type === "chiqim").forEach((t) => {
      if (!map[t.category]) map[t.category] = { month: 0, all: 0 };
      map[t.category].all += t.amount;
      if (monthKey(t.date) === curMonth) map[t.category].month += t.amount;
    });
    return map;
  }, [transactions, curMonth, catNames]);

  function submitNewCategory() {
    const clean = newCatName.trim();
    if (!clean) return;
    onAddCategory(clean);
    setNewCatName("");
    setNewCatOpen(false);
    setOpen(clean);
  }
  function submitSub(cat) {
    const clean = (subInput[cat] || "").trim();
    if (!clean) return;
    onAddSubcategory(cat, clean);
    setSubInput((s) => ({ ...s, [cat]: "" }));
  }
  function submitRename() {
    const clean = renameVal.trim();
    if (!clean || !renaming) return setRenaming(null);
    onRenameCategory(renaming, clean);
    setRenaming(null);
    setRenameVal("");
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Button onClick={() => setNewCatOpen((v) => !v)}><Plus size={14} /> Yangi kategoriya</Button>
        </div>
      )}
      {newCatOpen && (
        <Card style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            autoFocus
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNewCategory()}
            placeholder="Kategoriya nomi, masalan: Sug'urta"
            style={{ ...getInputStyle(), flex: 1 }}
          />
          <Button onClick={submitNewCategory}>Qo'shish</Button>
          <Button variant="ghost" onClick={() => { setNewCatOpen(false); setNewCatName(""); }}>Bekor qilish</Button>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {catNames.length === 0 && <EmptyState text="Hozircha kategoriya yo'q" />}
        {catNames.map((cat) => {
          const isOpen = open === cat;
          const t = totalsByCat[cat] || { month: 0, all: 0 };
          const subs = categories[cat] || [];
          return (
            <Card key={cat} style={{ padding: 0 }}>
              <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                <button onClick={() => setOpen(isOpen ? null : cat)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0 }}>
                  <FolderTree size={16} color={THEME.violet} style={{ flexShrink: 0 }} />
                  {renaming === cat ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitRename()}
                      style={{ ...getInputStyle(), padding: "5px 8px", width: 180 }}
                    />
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{cat}</span>
                  )}
                  <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>({subs.length} subkategoriya)</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.rose }}>{money(t.month)}</div>
                    <div style={{ fontSize: 10.5, color: THEME.muted }}>shu oy</div>
                  </div>
                  {isAdmin && renaming !== cat && (
                    <>
                      <button onClick={() => { setRenaming(cat); setRenameVal(cat); }} title="Nomini o'zgartirish" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={13} /></button>
                      <button onClick={() => setConfirmDelCat(cat)} title="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={13} color={THEME.rose} /></button>
                    </>
                  )}
                  {isAdmin && renaming === cat && (
                    <button onClick={submitRename} title="Saqlash" className="uvix-iconbtn" style={getIconBtn()}><ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} /></button>
                  )}
                  <ChevronDown onClick={() => setOpen(isOpen ? null : cat)} size={16} style={{ cursor: "pointer", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", color: THEME.muted }} />
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: "0 14px 14px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: isAdmin ? 10 : 0 }}>
                    {subs.map((s) => (
                      <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, padding: "5px 10px", borderRadius: 8, background: "#F5F3FA", color: THEME.text }}>
                        {s}
                        {isAdmin && (
                          <button onClick={() => setConfirmDelSub({ cat, sub: s })} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: THEME.muted }}>
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                    {subs.length === 0 && <span style={{ fontSize: 11.5, color: THEME.muted }}>Subkategoriya yo'q</span>}
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6, maxWidth: 320 }}>
                      <input
                        value={subInput[cat] || ""}
                        onChange={(e) => setSubInput((s) => ({ ...s, [cat]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitSub(cat)}
                        placeholder="Yangi subkategoriya"
                        style={{ ...getInputStyle(), fontSize: 12.5, padding: "7px 10px" }}
                      />
                      <Button onClick={() => submitSub(cat)} style={{ padding: "7px 12px", fontSize: 12 }}>+ Qo'shish</Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {confirmDelCat && (
        <ConfirmDialog
          message={`"${confirmDelCat}" kategoriyasini o'chirmoqchimisiz? Bu kategoriyadagi mavjud rasxod yozuvlari saqlanib qoladi, lekin yangi rasxod qo'shishda bu kategoriya endi ko'rinmaydi.`}
          onCancel={() => setConfirmDelCat(null)}
          onConfirm={() => { onDeleteCategory(confirmDelCat); setConfirmDelCat(null); if (open === confirmDelCat) setOpen(null); }}
        />
      )}
      {confirmDelSub && (
        <ConfirmDialog
          message={`"${confirmDelSub.sub}" subkategoriyasini o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDelSub(null)}
          onConfirm={() => { onDeleteSubcategory(confirmDelSub.cat, confirmDelSub.sub); setConfirmDelSub(null); }}
        />
      )}
    </div>
  );
}

/* ---------------- EMPLOYEES VIEW ---------------- */

/* ---------------- XODIMLAR ---------------- */
function EmployeesView({ employees, onSave, auditLog, currentUser }) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [tab, setTab] = useState("list");
  const [editEmailFor, setEditEmailFor] = useState(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [editEmailError, setEditEmailError] = useState("");

  function saveEmail() {
    const trimmed = editEmailValue.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setEditEmailError("Email manzili noto'g'ri formatda");
    onSave(employees.map((e) => (e.id === editEmailFor.id ? { ...e, email: trimmed } : e)));
    setEditEmailFor(null);
    setEditEmailError("");
  }

  function addEmployee() {
    if (!name.trim()) return setError("Ismni kiriting");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN 4-6 xonali raqam bo'lishi kerak");
    if (employees.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())) return setError("Bu ism band");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Email manzili noto'g'ri formatda");
    const next = [...employees, { id: uid(), name: name.trim(), role, pin, email: email.trim() }];
    onSave(next);
    setModal(false); setName(""); setPin(""); setRole("operator"); setEmail(""); setError("");
  }
  function removeEmployee(emp) {
    onSave(employees.filter((e) => e.id !== emp.id));
    setConfirmDel(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Button variant={tab === "list" ? "primary" : "ghost"} onClick={() => setTab("list")}><Users size={14} /> Xodimlar</Button>
        <Button variant={tab === "log" ? "primary" : "ghost"} onClick={() => setTab("log")}><ClipboardList size={14} /> O'zgarishlar tarixi</Button>
        {tab === "list" && <div style={{ flex: 1 }} />}
        {tab === "list" && <Button onClick={() => setModal(true)}><Plus size={14} /> Xodim qo'shish</Button>}
      </div>

      {tab === "list" ? (
        <Card style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ism</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Email</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Rol</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ruxsatlar</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, fontSize: 12.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {e.email || <span style={{ color: THEME.rose }}>Kiritilmagan</span>}
                      <button
                        onClick={() => { setEditEmailFor(e); setEditEmailValue(e.email || ""); setEditEmailError(""); }}
                        className="uvix-iconbtn"
                        style={{ ...getIconBtn(), padding: 3 }}
                        title="Email'ni tahrirlash"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={e.role === "admin" ? THEME.violetDark : "#0F6E56"} bg={e.role === "admin" ? "#EFE9FE" : THEME.greenBg}>
                      {e.role === "admin" ? "Admin" : "Operator"}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, fontSize: 12 }}>
                    {e.role === "admin" ? "Hammasini ko'radi, qo'shadi, tahrirlaydi, o'chiradi" : "Faqat o'z tushum/rasxodlarini kiritadi va ko'radi"}
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    {e.id !== currentUser.id && (
                      <button onClick={() => setConfirmDel(e)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card style={{ padding: 0, maxHeight: 480, overflowY: "auto" }} className="uvix-scroll">
          {auditLog.length === 0 ? <EmptyState text="Hozircha tarix yo'q" /> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                  <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Kim</th>
                  <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Nima o'zgartirdi</th>
                  <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Qachon</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((l) => (
                  <tr key={l.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                    <td style={{ padding: "9px 14px", fontWeight: 600 }}>{l.who}</td>
                    <td style={{ padding: "9px 14px" }}>{l.what}</td>
                    <td style={{ padding: "9px 14px", color: THEME.muted, whiteSpace: "nowrap" }}>{new Date(l.when).toLocaleString("uz-UZ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {modal && (
        <Modal title="Yangi xodim qo'shish" onClose={() => setModal(false)} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Ism">
              <input value={name} onChange={(e) => setName(e.target.value)} style={getInputStyle()} placeholder="Ism familiya" />
            </Field>
            <Field label="Rol">
              <select value={role} onChange={(e) => setRole(e.target.value)} style={getInputStyle()}>
                <option value="operator">Operator</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
            <Field label="PIN kod (4-6 raqam)">
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={getInputStyle()} placeholder="0000" inputMode="numeric" maxLength={6} />
            </Field>
            <Field label="Email (PIN unutilganda tiklash uchun)">
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={getInputStyle()} placeholder="xodim@gmail.com" type="email" />
            </Field>
            {error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setModal(false)}>Bekor qilish</Button>
              <Button onClick={addEmployee}>Qo'shish</Button>
            </div>
          </div>
        </Modal>
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`${confirmDel.name}ni xodimlar ro'yxatidan o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => removeEmployee(confirmDel)}
        />
      )}
      {editEmailFor && (
        <Modal title={`${editEmailFor.name} — email`} onClose={() => setEditEmailFor(null)} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Email (PIN unutilganda tiklash uchun)">
              <input value={editEmailValue} onChange={(e) => setEditEmailValue(e.target.value)} style={getInputStyle()} placeholder="xodim@gmail.com" type="email" autoFocus />
            </Field>
            {editEmailError && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{editEmailError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setEditEmailFor(null)}>Bekor qilish</Button>
              <Button onClick={saveEmail}>Saqlash</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- SETTINGS VIEW ---------------- */

/* ---------------- SOZLAMALAR ---------------- */
function AppearanceSection({ appearance, onApply }) {
  const [customPrimary, setCustomPrimary] = useState(appearance.customPrimary || DEFAULT_APPEARANCE.customPrimary);
  const [customAccent, setCustomAccent] = useState(appearance.customAccent || DEFAULT_APPEARANCE.customAccent);

  useEffect(() => {
    setCustomPrimary(appearance.customPrimary || DEFAULT_APPEARANCE.customPrimary);
    setCustomAccent(appearance.customAccent || DEFAULT_APPEARANCE.customAccent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance.customPrimary, appearance.customAccent]);

  function set(patch) {
    onApply({ ...appearance, ...patch });
  }
  function segmented(options, valueKey) {
    return (
      <div style={{ display: "flex", gap: 6, background: THEME.surface, borderRadius: 11, padding: 3 }}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => set({ [valueKey]: o.v })}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
              background: appearance[valueKey] === o.v ? THEME.card : "transparent",
              color: appearance[valueKey] === o.v ? THEME.violet : THEME.muted,
              boxShadow: appearance[valueKey] === o.v ? THEME.shadowSm : "none",
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    );
  }

  const COLOR_OPTS = [
    { v: "purple", l: "Purple", ...APPEARANCE_COLOR_PRESETS.purple },
    { v: "blue", l: "Blue", ...APPEARANCE_COLOR_PRESETS.blue },
    { v: "emerald", l: "Emerald", ...APPEARANCE_COLOR_PRESETS.emerald },
    { v: "orange", l: "Orange", ...APPEARANCE_COLOR_PRESETS.orange },
    { v: "pink", l: "Pink", ...APPEARANCE_COLOR_PRESETS.pink },
  ];

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Ko'rinish</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>Butun tizimning rangi va ko'rinishini sozlang. O'zgarishlar darhol qo'llanadi.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Rejim</div>
          {segmented([{ v: "light", l: "Light" }, { v: "soft", l: "Soft" }, { v: "dark", l: "Dark" }], "mode")}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Asosiy rang</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {COLOR_OPTS.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => set({ colorScheme: o.v })}
                title={o.l}
                style={{
                  width: 38, height: 38, borderRadius: "50%", cursor: "pointer", padding: 3,
                  background: "none", display: "flex", alignItems: "center", justifyContent: "center",
                  border: appearance.colorScheme === o.v ? `2.5px solid ${o.primary}` : `2px solid ${THEME.border}`,
                }}
              >
                <span style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block", background: `linear-gradient(135deg, ${o.primary}, ${o.accent})` }} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => set({ colorScheme: "custom" })}
              title="Custom"
              style={{
                width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 15,
                background: THEME.card, display: "flex", alignItems: "center", justifyContent: "center",
                border: appearance.colorScheme === "custom" ? `2.5px solid ${THEME.text}` : `2px dashed ${THEME.border}`,
              }}
            >
              🎨
            </button>
          </div>
          {appearance.colorScheme === "custom" && (
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              <Field label="Asosiy (Primary)">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={(e) => { setCustomPrimary(e.target.value); set({ colorScheme: "custom", customPrimary: e.target.value, customAccent }); }}
                    style={{ width: 40, height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 0, background: "none" }}
                  />
                  <span style={{ fontSize: 12.5, fontFamily: "monospace", color: THEME.mutedDark }}>{customPrimary}</span>
                </div>
              </Field>
              <Field label="Urg'u (Accent)">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={customAccent}
                    onChange={(e) => { setCustomAccent(e.target.value); set({ colorScheme: "custom", customPrimary, customAccent: e.target.value }); }}
                    style={{ width: 40, height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 0, background: "none" }}
                  />
                  <span style={{ fontSize: 12.5, fontFamily: "monospace", color: THEME.mutedDark }}>{customAccent}</span>
                </div>
              </Field>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Zichlik</div>
          {segmented([{ v: "compact", l: "Compact" }, { v: "comfortable", l: "Comfortable" }, { v: "spacious", l: "Spacious" }], "density")}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Burchak radiusi</div>
          {segmented([{ v: "sharp", l: "Sharp" }, { v: "medium", l: "Medium" }, { v: "rounded", l: "Rounded" }], "radius")}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Sidebar uslubi</div>
          {segmented([{ v: "classic", l: "Classic" }, { v: "modern", l: "Modern" }, { v: "minimal", l: "Minimal" }], "sidebarStyle")}
        </div>

        <Button variant="ghost" onClick={() => onApply(DEFAULT_APPEARANCE)} style={{ alignSelf: "flex-start" }}>
          Standart ko'rinishga qaytarish
        </Button>
      </div>
    </Card>
  );
}
function AppearancePreviewCard({ appearance }) {
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Ko'rinish namunasi</div>
      <div style={{ borderRadius: THEME.radius, overflow: "hidden", border: `1px solid ${THEME.border}`, display: "flex" }}>
        <div style={{ width: 84, background: THEME.ink, padding: 12, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})` }} />
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: THEME.violet }} />
          <div style={{ width: "70%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
          <div style={{ width: "80%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
        </div>
        <div style={{ flex: 1, background: THEME.surface, padding: 14 }}>
          <div style={{ background: THEME.card, borderRadius: Math.max(6, THEME.radius - 6), padding: 12, border: `1px solid ${THEME.borderSoft}` }}>
            <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>UMUMIY BUYURTMA</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, marginTop: 4 }}>248 500 000 so'm</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <div style={{ padding: "5px 10px", borderRadius: Math.max(6, THEME.radius - 10), background: THEME.violet, color: "#fff", fontSize: 10.5, fontWeight: 700 }}>Dashboard</div>
              <div style={{ padding: "5px 10px", borderRadius: Math.max(6, THEME.radius - 10), background: THEME.card, color: THEME.muted, fontSize: 10.5, fontWeight: 700, border: `1px solid ${THEME.border}` }}>Buyurtmalar</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: THEME.muted, marginTop: 10 }}>
        Chapdagi sozlamalarni o'zgartirsangiz, bu namuna va butun dastur darhol yangilanadi.
      </div>
    </Card>
  );
}
function TrashSection({ orders, transactions, onRestoreOrder, onPermanentDeleteOrder, onRestoreTransaction, onPermanentDeleteTransaction, onRestorePayment, onPermanentDeletePayment }) {
  const [confirmPerm, setConfirmPerm] = useState(null); // { kind, item, orderId? }
  const deletedOrders = orders.filter((o) => o.deletedAt).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const deletedTx = transactions.filter((t) => t.deletedAt).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const deletedPayments = [];
  orders.forEach((o) => {
    (o.payments || []).filter((p) => p.deletedAt).forEach((p) => {
      deletedPayments.push({ ...p, orderId: o.id, orderNumber: o.orderNumber, customer: o.customer });
    });
  });
  deletedPayments.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));

  const totalCount = deletedOrders.length + deletedTx.length + deletedPayments.length;

  function confirmPermanent() {
    const { kind, item } = confirmPerm;
    if (kind === "order") onPermanentDeleteOrder(item);
    if (kind === "tx") onPermanentDeleteTransaction(item);
    if (kind === "payment") onPermanentDeletePayment(item.orderId, item.id);
    setConfirmPerm(null);
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Chiqindi qutisi</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>
        O'chirilgan buyurtma, rasxod va to'lovlar shu yerda 30 kun (yoki siz butunlay o'chirmaguningizcha) saqlanadi — tasodifiy o'chirishdan qo'rqmasdan ishlashingiz mumkin.
      </div>

      {totalCount === 0 ? (
        <EmptyState text="Chiqindi qutisi bo'sh" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {deletedOrders.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Buyurtmalar ({deletedOrders.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deletedOrders.map((o) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{o.orderNumber} <span style={{ fontWeight: 500, color: THEME.muted }}>&middot; {o.customer}</span></div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{money(o.agreementUzs)} &middot; o'chirgan: {o.deletedBy || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => onRestoreOrder(o)} style={{ padding: "6px 10px", fontSize: 12 }}>Tiklash</Button>
                      <button onClick={() => setConfirmPerm({ kind: "order", item: o })} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedTx.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Rasxodlar ({deletedTx.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deletedTx.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{money(t.amount)} <span style={{ fontWeight: 500, color: THEME.muted }}>&middot; {t.category}</span></div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{t.date} &middot; o'chirgan: {t.deletedBy || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => onRestoreTransaction(t)} style={{ padding: "6px 10px", fontSize: 12 }}>Tiklash</Button>
                      <button onClick={() => setConfirmPerm({ kind: "tx", item: t })} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedPayments.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>To'lovlar ({deletedPayments.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deletedPayments.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{money(p.amount)} <span style={{ fontWeight: 500, color: THEME.muted }}>&middot; {p.orderNumber} ({p.customer})</span></div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{p.date} &middot; o'chirgan: {p.deletedBy || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => onRestorePayment(p.orderId, p.id)} style={{ padding: "6px 10px", fontSize: 12 }}>Tiklash</Button>
                      <button onClick={() => setConfirmPerm({ kind: "payment", item: p })} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {confirmPerm && (
        <ConfirmDialog
          message="Bu yozuvni BUTUNLAY o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi."
          onCancel={() => setConfirmPerm(null)}
          onConfirm={confirmPermanent}
        />
      )}
    </Card>
  );
}
function DashboardConstructorSection({ settings, onSaveSettings }) {
  const [layout, setLayout] = useState(() => getEffectiveDashboardLayout(settings));
  const [savedMsg, setSavedMsg] = useState("");

  function groupItems(groupId) {
    return layout.filter((w) => DASHBOARD_WIDGET_CATALOG.find((c) => c.id === w.id)?.group === groupId);
  }

  function moveItem(id, dir) {
    const catalogItem = DASHBOARD_WIDGET_CATALOG.find((c) => c.id === id);
    const groupId = catalogItem?.group;
    const groupList = groupItems(groupId);
    const posInGroup = groupList.findIndex((w) => w.id === id);
    const targetPos = posInGroup + dir;
    if (targetPos < 0 || targetPos >= groupList.length) return;
    const newGroupList = groupList.slice();
    [newGroupList[posInGroup], newGroupList[targetPos]] = [newGroupList[targetPos], newGroupList[posInGroup]];
    const next = [];
    DASHBOARD_GROUPS.forEach((g) => {
      if (g.id === groupId) next.push(...newGroupList);
      else next.push(...groupItems(g.id));
    });
    setLayout(next);
    setSavedMsg("");
  }
  function toggleVisible(id) {
    setLayout(layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
    setSavedMsg("");
  }
  function changeSize(id, size) {
    setLayout(layout.map((w) => (w.id === id ? { ...w, size } : w)));
    setSavedMsg("");
  }
  function saveLayout() {
    onSaveSettings({ ...settings, dashboardLayout: layout });
    setSavedMsg("Saqlandi — Dashboard shu tartib va o'lchamlarda ko'rsatiladi (barcha foydalanuvchilar uchun)");
  }
  function resetLayout() {
    const next = DEFAULT_DASHBOARD_LAYOUT.map((w) => ({ ...w }));
    setLayout(next);
    onSaveSettings({ ...settings, dashboardLayout: next });
    setSavedMsg("Standart tartibga qaytarildi");
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Dashboard konstruktori</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>
        Har bir ko'rsatkichning tartibi, o'lchami va ko'rinishini boshqaring — har biri faqat o'z bo'limi ichida suriladi, boshqa bo'limga o'tib ketmaydi. O'zgarish barcha foydalanuvchilar uchun bir xil bo'ladi.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: 500, overflowY: "auto", paddingRight: 4 }} className="uvix-scroll">
        {DASHBOARD_GROUPS.map((g) => {
          const items = groupItems(g.id);
          if (items.length === 0) return null;
          return (
            <div key={g.id}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.violet, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((w, i) => {
                  const meta = DASHBOARD_WIDGET_CATALOG.find((c) => c.id === w.id);
                  return (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: w.visible ? THEME.surface : "#F3F2F7", borderRadius: 10, opacity: w.visible ? 1 : 0.55, flexWrap: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                        <button onClick={() => moveItem(w.id, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", padding: 0, opacity: i === 0 ? 0.3 : 1, color: THEME.muted }}>
                          <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} />
                        </button>
                        <button onClick={() => moveItem(w.id, 1)} disabled={i === items.length - 1} style={{ background: "none", border: "none", cursor: i === items.length - 1 ? "not-allowed" : "pointer", padding: 0, opacity: i === items.length - 1 ? 0.3 : 1, color: THEME.muted }}>
                          <ChevronDown size={12} />
                        </button>
                      </div>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{meta?.label || w.id}</span>
                      <select
                        value={w.size || "md"}
                        onChange={(e) => changeSize(w.id, e.target.value)}
                        style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "4px 6px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer" }}
                      >
                        {Object.keys(DASHBOARD_SIZE_SPANS).map((s) => (
                          <option key={s} value={s}>{DASHBOARD_SIZE_LABELS[s]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => toggleVisible(w.id)}
                        style={{
                          flexShrink: 0, padding: "5px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                          background: w.visible ? THEME.greenBg : THEME.roseBg,
                          color: w.visible ? THEME.green : THEME.rose,
                        }}
                      >
                        {w.visible ? "Ko'rinadi" : "Yashirilgan"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {savedMsg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 10 }}>{savedMsg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button onClick={saveLayout}>Saqlash</Button>
        <Button variant="ghost" onClick={resetLayout}>Standartga qaytarish</Button>
      </div>
    </Card>
  );
}
function SettingsView({ currentUser, employees, onSave, onLogout, isAdmin, settings, onSaveSettings, appearance, onApplyAppearance, orders, transactions, onRestoreOrder, onPermanentDeleteOrder, onRestoreTransaction, onPermanentDeleteTransaction, onRestorePayment, onPermanentDeletePayment, onResetAll, onSendBackupNow, onConnectTelegramUser, onDisconnectTelegramUser, onFetchTelegramUserStatus }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetPinError, setResetPinError] = useState("");
  const [rateStr, setRateStr] = useState(settings ? String(settings.usdRate) : "");
  const [rateMsg, setRateMsg] = useState("");
  const [tgToken, setTgToken] = useState(settings?.telegramBotToken || "");
  const [tgChatId, setTgChatId] = useState(settings?.telegramChatId || "");
  const [tgMsg, setTgMsg] = useState("");
  const [backupTime, setBackupTime] = useState(settings?.backupTime || "21:00");
  const [backupMsg, setBackupMsg] = useState("");
  const [sendingNow, setSendingNow] = useState(false);
  const [tgUnlocked, setTgUnlocked] = useState(false);
  const [tgUnlockPin, setTgUnlockPin] = useState("");
  const [tgUnlockError, setTgUnlockError] = useState("");
  const [tgUnlocking, setTgUnlocking] = useState(false);
  const [gmailUser, setGmailUser] = useState(settings?.gmailUser || "");
  const [gmailAppPassword, setGmailAppPassword] = useState(settings?.gmailAppPassword || "");
  const [gmailMsg, setGmailMsg] = useState("");

  function saveGmail() {
    onSaveSettings({ ...settings, gmailUser: gmailUser.trim(), gmailAppPassword: gmailAppPassword.trim() });
    setGmailMsg("Saqlandi");
  }

  const [tgUserApiId, setTgUserApiId] = useState(settings?.telegramUserApiId || "");
  const [tgUserApiHash, setTgUserApiHash] = useState(settings?.telegramUserApiHash || "");
  const [tgUserSession, setTgUserSession] = useState(settings?.telegramUserSession || "");
  const [tgUserMsg, setTgUserMsg] = useState("");
  const [tgUserStatus, setTgUserStatus] = useState(null);
  const [tgUserConnecting, setTgUserConnecting] = useState(false);

  useEffect(() => {
    if (onFetchTelegramUserStatus) {
      onFetchTelegramUserStatus().then(setTgUserStatus).catch(() => setTgUserStatus({ status: "error", message: "Holatni bilib bo'lmadi" }));
    }
  }, []);

  function saveTelegramUser() {
    onSaveSettings({ ...settings, telegramUserApiId: tgUserApiId.trim(), telegramUserApiHash: tgUserApiHash.trim(), telegramUserSession: tgUserSession.trim() });
    setTgUserMsg("Saqlandi");
  }
  async function connectTelegramUser() {
    setTgUserConnecting(true);
    setTgUserMsg("");
    try {
      await onConnectTelegramUser();
      const status = await onFetchTelegramUserStatus();
      setTgUserStatus(status);
      setTgUserMsg(status.status === "connected" ? "Muvaffaqiyatli ulandi!" : "Ulanmadi");
    } catch (e) {
      setTgUserMsg(e?.message || "Ulanishda xato");
    } finally {
      setTgUserConnecting(false);
    }
  }
  async function disconnectTelegramUser() {
    await onDisconnectTelegramUser();
    setTgUserStatus({ status: "disconnected" });
  }

  async function unlockTelegram() {
    setTgUnlocking(true);
    setTgUnlockError("");
    try {
      const ok = await verifyPin(tgUnlockPin);
      if (!ok) {
        setTgUnlockError("PIN noto'g'ri");
        return;
      }
      setTgUnlocked(true);
      setTgUnlockPin("");
    } finally {
      setTgUnlocking(false);
    }
  }

  function saveTelegram() {
    onSaveSettings({ ...settings, telegramBotToken: tgToken.trim(), telegramChatId: tgChatId.trim(), backupTime });
    setTgMsg("Saqlandi");
  }
  function disableTelegram() {
    setTgToken("");
    setTgChatId("");
    onSaveSettings({ ...settings, telegramBotToken: "", telegramChatId: "" });
    setTgMsg("Xabarnomalar o'chirildi");
  }
  async function sendBackupNow() {
    setSendingNow(true);
    setBackupMsg("");
    try {
      await onSendBackupNow();
      setBackupMsg("Yuborildi — Telegram'ni tekshiring");
    } catch (e) {
      setBackupMsg(e?.message || "Yuborishda xato yuz berdi");
    } finally {
      setSendingNow(false);
    }
  }

  function changePin() {
    if (!/^\d{4,6}$/.test(pin)) return setMsg("PIN 4-6 xonali raqam bo'lishi kerak");
    const next = employees.map((e) => (e.id === currentUser.id ? { ...e, pin } : e));
    onSave(next);
    setMsg("PIN yangilandi");
    setPin("");
  }
  function saveRate() {
    const rate = parseFloat(rateStr.replace(/\s/g, "").replace(",", "."));
    if (!rate || rate <= 0) return setRateMsg("Kursni to'g'ri kiriting");
    onSaveSettings({ ...settings, usdRate: rate });
    setRateMsg("Kurs yangilandi");
  }
  async function verifyPin(pinToCheck) {
    try {
      await authLogin(currentUser.id, pinToCheck);
      return true;
    } catch (e) {
      return false;
    }
  }
  async function confirmResetWithPin() {
    const ok = await verifyPin(resetPin);
    if (!ok) {
      setResetPinError("PIN noto'g'ri");
      return;
    }
    onResetAll();
    setConfirmReset(false);
    setResetPin("");
    setResetPinError("");
  }

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ flex: "2 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <AppearanceSection appearance={appearance} onApply={onApplyAppearance} />

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
              {currentUser.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{currentUser.name}</div>
              <div style={{ fontSize: 12, color: THEME.muted, display: "flex", alignItems: "center", gap: 4 }}>
                <ShieldCheck size={13} /> {currentUser.role === "admin" ? "Administrator" : "Operator"}
              </div>
            </div>
          </div>
          <Field label="Yangi PIN kod">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={getInputStyle()} placeholder="0000" inputMode="numeric" maxLength={6} />
              <Button onClick={changePin} style={{ flexShrink: 0 }}>Saqlash</Button>
            </div>
          </Field>
          {msg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 8 }}>{msg}</div>}
          <Button variant="ghost" onClick={onLogout} style={{ marginTop: 14 }}><LogOut size={14} /> Chiqish</Button>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Valyuta formati</div>
          <div style={{ fontSize: 12.5, color: THEME.muted }}>Barcha summalar o'zbek so'mi formatida ko'rsatiladi, masalan: <b style={{ color: THEME.text }}>{money(1500000)}</b></div>
        </Card>

        {isAdmin && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Valyuta kursi (USD → so'm)</div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10 }}>
              Tushum bo'limida 1 kv/m narxi dollarda kiritiladi va shu kurs orqali so'mga o'giriladi. Kurs faqat
              yangi kiritilayotgan yozuvlarga ta'sir qiladi — eski yozuvlar o'sha paytdagi kursda saqlanib qoladi.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={rateStr} onChange={(e) => setRateStr(e.target.value.replace(/[^0-9.,]/g, ""))} style={getInputStyle()} placeholder="12700" inputMode="decimal" />
              <Button onClick={saveRate} style={{ flexShrink: 0 }}>Saqlash</Button>
            </div>
            {rateMsg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 8 }}>{rateMsg}</div>}
            <div style={{ fontSize: 12, color: THEME.muted, marginTop: 10 }}>
              Joriy kurs: <b style={{ color: THEME.text }}>1 $ = {money(settings?.usdRate || 0)}</b>
            </div>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={14} color={THEME.muted} /> Telegram xabarnomalari
            </div>
            {!tgUnlocked ? (
              <div>
                <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12 }}>
                  Xavfsizlik uchun bu bo'lim qulflangan — ko'rish/o'zgartirish uchun PIN kodingizni kiriting.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={tgUnlockPin}
                    onChange={(e) => setTgUnlockPin(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && unlockTelegram()}
                    style={getInputStyle()}
                    placeholder="PIN kod"
                  />
                  <Button onClick={unlockTelegram} disabled={tgUnlocking} style={{ flexShrink: 0 }}>
                    {tgUnlocking ? "Tekshirilmoqda..." : "Ochish"}
                  </Button>
                </div>
                {tgUnlockError && <div style={{ fontSize: 12, color: THEME.rose, marginTop: 8 }}>{tgUnlockError}</div>}
              </div>
            ) : (
              <>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12 }}>
              Yangi buyurtma, to'lov va rasxod qo'shilganda shaxsiy Telegram'ingizga avtomatik xabar keladi.
              Sozlash uchun: 1) Telegram'da <b style={{ color: THEME.text }}>@BotFather</b>'ga yozib yangi bot yarating (token oling),
              2) yaratgan botingizga bironta xabar yozing, 3) <b style={{ color: THEME.text }}>@userinfobot</b>'ga yozib o'z Chat ID'ingizni bilib oling.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="Bot token">
                <input value={tgToken} onChange={(e) => setTgToken(e.target.value)} style={getInputStyle()} placeholder="123456789:AAExampleTokenHere" />
              </Field>
              <Field label="Chat ID">
                <input value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} style={getInputStyle()} placeholder="123456789" />
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={saveTelegram}>Saqlash</Button>
                {(settings?.telegramBotToken || tgToken) && <Button variant="ghost" onClick={disableTelegram}>O'chirish</Button>}
              </div>
              {tgMsg && <div style={{ fontSize: 12, color: THEME.green }}>{tgMsg}</div>}
              <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}>
                Holat:
                {settings?.telegramBotToken && settings?.telegramChatId ? (
                  <Badge color={THEME.green} bg={THEME.greenBg}>Yoqilgan</Badge>
                ) : (
                  <Badge color={THEME.muted} bg={THEME.surface}>O'chirilgan</Badge>
                )}
              </div>
            </div>
            <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Kunlik hisobot va zaxira nusxa</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>
                Har kuni belgilangan vaqtda Excel hisobot (Buyurtmalar + Rasxodlar) va butun bazaning zaxira nusxasi
                shu Telegram'ga avtomatik yuboriladi.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <Field label="Yuborish vaqti">
                  <input type="time" value={backupTime} onChange={(e) => setBackupTime(e.target.value)} style={{ ...getInputStyle(), width: "auto" }} />
                </Field>
                <Button onClick={saveTelegram}>Vaqtni saqlash</Button>
                <Button variant="ghost" onClick={sendBackupNow} disabled={sendingNow || !(settings?.telegramBotToken && settings?.telegramChatId)}>
                  {sendingNow ? "Yuborilmoqda..." : "Hoziroq yubor"}
                </Button>
              </div>
              {backupMsg && <div style={{ fontSize: 12, color: backupMsg.includes("xato") ? THEME.rose : THEME.green, marginTop: 8 }}>{backupMsg}</div>}
            </div>
            <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Email orqali PIN tiklash (Gmail)</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>
                Xodim PIN'ini unutsa, "PIN'ni unutdingizmi?" havolasi orqali email'iga tasdiqlash kodi yuboriladi.
                Buning uchun Gmail hisobingizdan <b style={{ color: THEME.text }}>App Password</b> (ilova paroli) kerak —
                oddiy Gmail parolingiz emas. Google hisobingizda 2 bosqichli tasdiqlashni yoqib,
                myaccount.google.com/apppasswords sahifasidan yarating.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Field label="Gmail manzili">
                  <input value={gmailUser} onChange={(e) => setGmailUser(e.target.value)} style={getInputStyle()} placeholder="sizniki@gmail.com" type="email" />
                </Field>
                <Field label="App Password (16 belgili)">
                  <input value={gmailAppPassword} onChange={(e) => setGmailAppPassword(e.target.value)} style={getInputStyle()} placeholder="xxxx xxxx xxxx xxxx" type="password" />
                </Field>
                <div><Button onClick={saveGmail}>Saqlash</Button></div>
                {gmailMsg && <div style={{ fontSize: 12, color: THEME.green }}>{gmailMsg}</div>}
                <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  Holat:
                  {settings?.gmailUser && settings?.gmailAppPassword ? (
                    <Badge color={THEME.green} bg={THEME.greenBg}>Yoqilgan</Badge>
                  ) : (
                    <Badge color={THEME.muted} bg={THEME.surface}>O'chirilgan</Badge>
                  )}
                </div>
              </div>
            </div>
            {onConnectTelegramUser && (
              <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 14, paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: THEME.rose }}>Telegram shaxsiy akkaunt (CRM chat) — ⚠ tavakkalchilik</div>
                <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>
                  Bu — shaxsiy Telegram akkauntingizni CRM'ga ulaydi (mijozlar bilan to'g'ridan-to'g'ri chat).
                  <b style={{ color: THEME.rose }}> Bu Telegram qoidalariga norasmiy yondashuv — akkauntingiz bloklanish xavfi bor.</b> Session
                  string'ni <code>setup-telegram.js</code> skripti orqali (backend papkasida, kompyuteringizda "node setup-telegram.js"
                  buyrug'i bilan) bir marta yaratasiz.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Field label="API ID">
                    <input value={tgUserApiId} onChange={(e) => setTgUserApiId(e.target.value)} style={getInputStyle()} placeholder="my.telegram.org dan olingan raqam" />
                  </Field>
                  <Field label="API Hash">
                    <input value={tgUserApiHash} onChange={(e) => setTgUserApiHash(e.target.value)} style={getInputStyle()} placeholder="my.telegram.org dan olingan kod" type="password" />
                  </Field>
                  <Field label="Session String">
                    <textarea value={tgUserSession} onChange={(e) => setTgUserSession(e.target.value)} rows={2} style={{ ...getInputStyle(), resize: "vertical", fontFamily: "monospace", fontSize: 11 }} placeholder="setup-telegram.js skriptidan olingan uzun matn" />
                  </Field>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={saveTelegramUser}>Saqlash</Button>
                    <Button variant="ghost" onClick={connectTelegramUser} disabled={tgUserConnecting}>
                      {tgUserConnecting ? "Ulanmoqda..." : "Ulash"}
                    </Button>
                    {tgUserStatus?.status === "connected" && (
                      <Button variant="ghost" onClick={disconnectTelegramUser}>Uzish</Button>
                    )}
                  </div>
                  {tgUserMsg && <div style={{ fontSize: 12, color: tgUserMsg.includes("xato") || tgUserMsg.includes("Ulanmadi") ? THEME.rose : THEME.green }}>{tgUserMsg}</div>}
                  <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}>
                    Holat:
                    {tgUserStatus?.status === "connected" && <Badge color={THEME.green} bg={THEME.greenBg}>Ulangan</Badge>}
                    {tgUserStatus?.status === "connecting" && <Badge color={THEME.amber} bg={"#FEF3C7"}>Ulanmoqda...</Badge>}
                    {tgUserStatus?.status === "disconnected" && <Badge color={THEME.muted} bg={THEME.surface}>Ulanmagan</Badge>}
                    {tgUserStatus?.status === "error" && <Badge color={THEME.rose} bg={THEME.roseBg}>{tgUserStatus.message || "Xato"}</Badge>}
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </Card>
        )}

        {isAdmin && (
          <Card style={{ borderColor: "#F3C6D0" }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: THEME.rose }}>Xavfli hudud</div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10 }}>Barcha tushum va rasxod ma'lumotlarini butunlay o'chirish. Bu amalni bekor qilib bo'lmaydi.</div>
            <Button variant="danger" onClick={() => setConfirmReset(true)}><Trash2 size={14} /> Barcha ma'lumotlarni tozalash</Button>
          </Card>
        )}
      </div>

      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <AppearancePreviewCard appearance={appearance} />
        {isAdmin && (
          <TrashSection
            orders={orders}
            transactions={transactions}
            onRestoreOrder={onRestoreOrder}
            onPermanentDeleteOrder={onPermanentDeleteOrder}
            onRestoreTransaction={onRestoreTransaction}
            onPermanentDeleteTransaction={onPermanentDeleteTransaction}
            onRestorePayment={onRestorePayment}
            onPermanentDeletePayment={onPermanentDeletePayment}
          />
        )}
      </div>

      {confirmReset && (
        <Modal title="Xavfsizlik tasdiqlash" onClose={() => { setConfirmReset(false); setResetPin(""); setResetPinError(""); }} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13.5, color: THEME.text, display: "flex", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: THEME.roseBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={16} color={THEME.rose} />
              </div>
              <span style={{ paddingTop: 6 }}>Barcha tushum va rasxod ma'lumotlari <b>butunlay</b> o'chiriladi. Bu amalni bekor qilib bo'lmaydi. Davom etish uchun PIN kodingizni kiriting.</span>
            </div>
            <Field label="PIN kod">
              <input
                type="password"
                autoFocus
                value={resetPin}
                onChange={(e) => { setResetPin(e.target.value.replace(/\D/g, "")); setResetPinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && confirmResetWithPin()}
                placeholder="****"
                inputMode="numeric"
                maxLength={6}
                style={getInputStyle()}
              />
            </Field>
            {resetPinError && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{resetPinError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setConfirmReset(false); setResetPin(""); setResetPinError(""); }}>Bekor qilish</Button>
              <Button variant="danger" onClick={confirmResetWithPin} disabled={resetPin.length < 4}>Tasdiqlash va o'chirish</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
