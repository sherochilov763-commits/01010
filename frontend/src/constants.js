import { Banknote, CreditCard, FileBarChart2, FolderTree, Landmark, LayoutDashboard, ListChecks, MessageCircle, Package, Settings, TrendingDown, Users, Users2 } from "lucide-react";

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


export const LEAD_STAGES = [
  { key: "new", label: "Yangi lid", color: "#7C5CFC", bg: "#EFE9FE" },
  { key: "negotiation", label: "Muzokara", color: "#D97706", bg: "#FEF3C7" },
  { key: "design", label: "Jarayonda (Dizayn)", color: "#3B82F6", bg: "#DBEAFE" },
  { key: "printing", label: "Jarayonda (Pechatchi)", color: "#0D9488", bg: "#CCFBF1" },
  { key: "won", label: "Yopilgan", color: "#0F9D58", bg: "#E3F6EC" },
  { key: "lost", label: "Yo'qotilgan", color: "#E53E5A", bg: "#FCE4E9" },
];

// Mijoz rozi bo'lgan (ish boshlangan) bosqichlar — shu yerdan boshlab lidni buyurtmaga aylantirish mumkin
export const ORDER_READY_STAGES = ["design", "printing", "won"];

// Rollar: admin va operator — to'liq tizim; dizayner va pechatchi — faqat o'z vazifalari (pulsiz)
export const ROLE_LABELS = { admin: "Administrator", operator: "Operator", designer: "Dizayner", printer: "Pechatchi" };
export const WORKER_ROLES = ["designer", "printer"];
export const isWorkerRole = (role) => WORKER_ROLES.includes(role);
export const roleLabel = (role) => ROLE_LABELS[role] || "Operator";

export const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "orders", label: "Buyurtmalar", icon: Package },
  { key: "crm", label: "CRM", icon: Users2 },
  { key: "chats", label: "Chatlar", icon: MessageCircle },
  { key: "expense", label: "Rasxod", icon: TrendingDown },
  { key: "operations", label: "Operatsiyalar", icon: ListChecks },
  { key: "report", label: "Hisobot", icon: FileBarChart2, adminOnly: true },
  { key: "categories", label: "Kategoriyalar", icon: FolderTree },
  { key: "employees", label: "Xodimlar", icon: Users, adminOnly: true },
  { key: "settings", label: "Sozlamalar", icon: Settings },
];

export const PAYMENT_TYPES = [
  { v: "karta", l: "Karta", icon: CreditCard, color: "violet" },
  { v: "naqd", l: "Naqd", icon: Banknote, color: "green" },
  { v: "bank", l: "Bank o'tkazma", icon: Landmark, color: "blue" },
];

export const SEED_EMPLOYEES = [
  { id: "admin1", name: "Administrator", role: "admin", pin: "0000" },
];
export const DEFAULT_SETTINGS = { usdRate: 12700 };

export const DASHBOARD_SIZE_SPANS = { sm: 3, md: 4, lg: 6, full: 12 };
export const DASHBOARD_SIZE_LABELS = { sm: "Kichik", md: "O'rta", lg: "Katta", full: "To'liq" };
export const DASHBOARD_GROUPS = [
  { id: "hero", label: "Asosiy" },
  { id: "today", label: "Bugungi va oylik ko'rsatkichlar" },
  { id: "kpis", label: "Buyurtmalar bo'yicha umumiy ko'rsatkichlar" },
  { id: "customers", label: "Mijozlar va buyurtmalar" },
  { id: "charts", label: "Grafiklar" },
];
export const DASHBOARD_WIDGET_CATALOG = [
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
export const DEFAULT_DASHBOARD_LAYOUT = [
  "hero", "debtAlert",
  "m_todayPaid", "m_todayExpense", "m_monthPaid", "m_monthExpense",
  "m_totalArea", "m_orderValue", "m_addedValue", "m_totalPaid", "m_totalExpense", "m_materialExpense", "m_kraska", "m_totalMoney",
  "m_topDebtors", "m_recentOrders",
  "dailyChart", "categoryPie", "monthlyChart", "paymentMethods",
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
