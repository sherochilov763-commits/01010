import { THEME, mixColors } from "./theme.js";
import { Banknote, ClipboardCheck, Clock, Contact, Droplets, CreditCard, FileBarChart2, FolderTree, Landmark, LayoutDashboard, ListChecks, MessageCircle, Package, Settings, TrendingDown, Users, Users2 } from "lucide-react";

export const DEFAULT_CATEGORIES = {
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


// Bosqich ranglari: sokin, bir-biridan ajraladigan; fon rangi joriy mavzudan (yorug'/grafit) hisoblanadi
const stage = (key, label, color) => ({ key, label, color, get bg() { return mixColors(color, THEME.card, THEME.isDark ? 0.82 : 0.9); } });
export const LEAD_STAGES = [
  stage("new", "Yangi lid", "#1F5FD6"),
  stage("measure", "O'lchov (UVONYX)", "#7C3AED"),
  stage("negotiation", "Muzokara", "#B45309"),
  stage("design", "Jarayonda (Dizayn)", "#6D28D9"),
  stage("printing", "Jarayonda (Pechatchi)", "#0E7490"),
  stage("ready", "Tayyor (olib ketish)", "#4D7C0F"),
  stage("won", "Yopilgan", "#15803D"),
  stage("lost", "Yo'qotilgan", "#DC2626"),
];

// Yo'nalish bo'yicha CRM bosqichlari: UVONYX — Murojaat → O'lchov → Smeta → (avans) buyurtma → ...
const UVONYX_LABELS = { new: "Murojaat", measure: "O'lchov", negotiation: "Smeta", design: "Dizayn", printing: "Ishlab chiqarish", ready: "Tayyor / o'rnatish" };
export function leadStagesFor(line) {
  if (line === "UVONYX") return LEAD_STAGES.map((s) => (UVONYX_LABELS[s.key] ? stage(s.key, UVONYX_LABELS[s.key], s.color) : s));
  if (line === "UVIXPRINT") return LEAD_STAGES.filter((s) => s.key !== "measure");
  return LEAD_STAGES;
}

// Mijoz rozi bo'lgan (ish boshlangan) bosqichlar — shu yerdan boshlab lidni buyurtmaga aylantirish mumkin
export const ORDER_READY_STAGES = ["design", "printing", "ready", "won"];

// Rollar: admin va operator — to'liq tizim; dizayner va pechatchi — faqat o'z vazifalari (pulsiz)
export const ROLE_LABELS = { admin: "Administrator", manager: "Katta menejer", operator: "Operator", designer: "Dizayner", printer: "Pechatchi", installer: "Montajchi" };
export const WORKER_ROLES = ["designer", "printer", "installer"];
export const isWorkerRole = (role) => WORKER_ROLES.includes(role);
export const roleLabel = (role) => ROLE_LABELS[role] || "Operator";

export const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "orders", label: "Buyurtmalar", icon: Package },
  { key: "crm", label: "CRM", icon: Users2 },
  { key: "chats", label: "Chatlar", icon: MessageCircle },
  { key: "customers", label: "Mijozlar", icon: Contact },
  { key: "expense", label: "Rasxod", icon: TrendingDown },
  { key: "operations", label: "Operatsiyalar", icon: ListChecks },
  { key: "kassa", label: "Kassalar", icon: Landmark, adminOnly: true, managerOk: true },
  { key: "report", label: "Hisobot", icon: FileBarChart2, adminOnly: true, managerOk: true },
  { key: "card", label: "Karta", icon: CreditCard, adminOnly: true },
  { key: "jobs", label: "Vazifalar", icon: ClipboardCheck },
  { key: "categories", label: "Kategoriyalar", icon: FolderTree },
  { key: "employees", label: "Xodimlar", icon: Users, adminOnly: true },
  { key: "paint", label: "Bo'yoq ombori", icon: Droplets },
  { key: "attendance", label: "Davomat", icon: Clock },
  { key: "settings", label: "Sozlamalar", icon: Settings },
];

// Sidebar'dagi guruh sarlavhalari (Dashboard va Sozlamalar guruhsiz)
export const NAV_GROUP = {
  orders: "Savdo", crm: "Savdo", chats: "Savdo", customers: "Savdo",
  expense: "Moliya", operations: "Moliya", kassa: "Moliya", report: "Moliya", card: "Moliya",
  jobs: "Ishlab chiqarish", paint: "Ishlab chiqarish", attendance: "Ishlab chiqarish", employees: "Ishlab chiqarish", categories: "Ishlab chiqarish",
};

export const PAYMENT_TYPES = [
  { v: "karta", l: "Karta", icon: CreditCard, color: "violet" },
  { v: "naqd", l: "Naqd", icon: Banknote, color: "green" },
  { v: "bank", l: "Bank o'tkazma", icon: Landmark, color: "blue" },
];

export const DEFAULT_SETTINGS = { usdRate: 12700 };

export const DASHBOARD_SIZE_SPANS = { sm: 3, md: 4, ml: 5, lg: 6, xl: 7, full: 12 };
export const DASHBOARD_SIZE_LABELS = { sm: "Kichik", md: "O'rta", lg: "Katta", full: "To'liq" };
// Yangi Dashboard (2026-10, eskiz 51–56): 11 ta asosiy blok; eski kartalar «Eski ko'rsatkichlar»da (sukut — yashirin)
export const DASHBOARD_GROUPS = [
  { id: "main", label: "" },
  { id: "money", label: "Pul va xarajat" },
  { id: "ops", label: "Qarz · ishlab chiqarish · mijozlar" },
  { id: "extra", label: "Qo'shimcha" },
  { id: "hero", label: "Eski: asosiy karta" },
  { id: "today", label: "Eski: bugungi va oylik ko'rsatkichlar" },
  { id: "kpis", label: "Eski: buyurtmalar bo'yicha ko'rsatkichlar" },
  { id: "customers", label: "Eski: mijozlar va buyurtmalar" },
  { id: "charts", label: "Eski: grafiklar" },
];
export const DASHBOARD_WIDGET_CATALOG = [
  { id: "kpis", group: "main", label: "Asosiy raqamlar: tushum, yangi buyurtmalar, qarz, kassa", defaultSize: "full" },
  { id: "revenue", group: "main", label: "Tushum dinamikasi (o'tgan davr bilan)", defaultSize: "xl" },
  { id: "managers", group: "main", label: "Menejerlar: bugun · hafta · oy", defaultSize: "ml" },
  { id: "attention", group: "main", label: "Diqqat talab qiladi", defaultSize: "lg" },
  { id: "recentPay", group: "main", label: "So'nggi to'lovlar", defaultSize: "lg" },
  { id: "expenseDonut", group: "money", label: "Korxona rasxodi (dumaloq diagramma)", defaultSize: "md" },
  { id: "payTypes", group: "money", label: "To'lov turlari: naqd · karta · bank", defaultSize: "md" },
  { id: "fixedCosts", group: "money", label: "Oylik xarajatlar (doimiy xarajatlar qoplandimi)", defaultSize: "md" },
  { id: "debtAging", group: "ops", label: "Qarzdorlik yoshi va eng katta qarzdorlar", defaultSize: "md" },
  { id: "production", group: "ops", label: "Ishlab chiqarish", defaultSize: "md" },
  { id: "customersStats", group: "ops", label: "Mijozlar va o'rtacha chek", defaultSize: "md" },
  { id: "lineShare", group: "extra", label: "Yo'nalishlar ulushi (UVIX / ONYX)", defaultSize: "md" },
  { id: "funnel", group: "extra", label: "CRM voronkasi", defaultSize: "md" },
  { id: "topMaterials", group: "extra", label: "Material bo'yicha tushum", defaultSize: "md" },
  { id: "forecast", group: "extra", label: "Oy oxiri prognozi", defaultSize: "md" },
  { id: "hero", group: "hero", label: "Umumiy buyurtmalar summasi (eski asosiy karta)", defaultSize: "full" },
  { id: "debtAlert", group: "hero", label: "Qarzdorlik ogohlantirishi", defaultSize: "full" },
  { id: "m_todayPaid", colorable: true, group: "today", label: "Bugungi to'lov", defaultSize: "sm" },
  { id: "m_todayExpense", colorable: true, group: "today", label: "Bugungi rasxod", defaultSize: "sm" },
  { id: "m_monthPaid", colorable: true, group: "today", label: "Shu oydagi to'lov", defaultSize: "sm" },
  { id: "m_monthExpense", colorable: true, group: "today", label: "Shu oydagi rasxod", defaultSize: "sm" },
  { id: "m_totalArea", colorable: true, group: "kpis", label: "Umumiy kvadrat", defaultSize: "md" },
  { id: "m_orderValue", colorable: true, group: "kpis", label: "Buyurtmalar qiymati", defaultSize: "md" },
  { id: "m_addedValue", colorable: true, group: "kpis", label: "Qo'shilgan qiymat", defaultSize: "md" },
  { id: "m_totalPaid", colorable: true, group: "kpis", label: "Jami to'lov", defaultSize: "md" },
  { id: "m_totalExpense", colorable: true, group: "kpis", label: "Jami rasxod", defaultSize: "md" },
  { id: "m_materialExpense", colorable: true, group: "kpis", label: "Material xarajati", defaultSize: "md" },
  { id: "m_kraska", colorable: true, group: "kpis", label: "Kraska hisob-kitobi", defaultSize: "md" },
  { id: "m_totalMoney", colorable: true, group: "kpis", label: "Jami pul", defaultSize: "md" },
  { id: "m_topDebtors", group: "customers", label: "Eng katta qarzdor mijozlar", defaultSize: "lg" },
  { id: "m_recentOrders", group: "customers", label: "So'nggi buyurtmalar", defaultSize: "lg" },
  { id: "topOrders", group: "customers", label: "Eng katta buyurtmalar", defaultSize: "lg" },
  { id: "brakSummary", group: "customers", label: "Brak xarajatlari xulosasi", defaultSize: "sm" },
  { id: "dailyChart", group: "charts", label: "Kunlik to'lov/rasxod grafigi", defaultSize: "lg" },
  { id: "categoryPie", group: "charts", label: "Rasxod kategoriyalari diagrammasi", defaultSize: "lg" },
  { id: "monthlyChart", group: "charts", label: "Oylik to'lov/rasxod grafigi", defaultSize: "lg" },
  { id: "paymentMethods", group: "charts", label: "To'lov turlari taqqoslash (eski)", defaultSize: "lg" },
];
export const DEFAULT_DASHBOARD_LAYOUT = [
  "kpis", "revenue", "managers", "attention", "recentPay",
  "expenseDonut", "payTypes", "fixedCosts",
  "debtAging", "production", "customersStats",
].map((id) => ({ id, visible: true, size: DASHBOARD_WIDGET_CATALOG.find((c) => c.id === id).defaultSize }));
export const PAGE_SIZE = 25;

/* ---------------- HISOBOT ---------------- */
export const PERIODS = [
  { key: "today", label: "Bugun" },
  { key: "yesterday", label: "Kecha" },
  { key: "week", label: "Shu hafta" },
  { key: "month", label: "Shu oy" },
  { key: "lastMonth", label: "O'tgan oy" },
  { key: "year", label: "Shu yil" },
  { key: "custom", label: "Custom" },
];
