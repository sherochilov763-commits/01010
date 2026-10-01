// storage.js — backend REST API bilan ishlash uchun kichik client.
// Claude artifact ichidagi `window.storage.get/set` bilan bir xil "shakl"da
// ishlaydi, shuning uchun App.jsx kodi deyarli o'zgarishsiz qoldi.
// Endi barcha /kv so'rovlari Authorization: Bearer <token> talab qiladi.

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "uvix_auth_token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ---- Auth (token talab qilinmaydi) ----
export async function authListEmployees() {
  const res = await fetch(`${API_BASE}/auth/employees`);
  if (!res.ok) throw new Error(`auth/employees failed: ${res.status}`);
  const data = await res.json();
  return data.employees || [];
}

export async function authBootstrap(name, pin) {
  const res = await fetch(`${API_BASE}/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `bootstrap failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  setToken(data.token);
  return data.employee;
}

export async function authLogin(employeeId, pin) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `login failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  setToken(data.token);
  return data.employee;
}

export async function authLoginByName(name, pin) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `login failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  setToken(data.token);
  return data.employee;
}

export async function sendBackupNow() {
  const res = await fetch(`${API_BASE}/backup/send-now`, { method: "POST", headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `send failed: ${res.status}`);
  }
  return data;
}

export async function requestPinReset(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `request failed: ${res.status}`);
  }
  return data;
}

export async function confirmPinReset(email, code, newPin) {
  const res = await fetch(`${API_BASE}/auth/reset-pin-with-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, newPin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `reset failed: ${res.status}`);
  }
  return data;
}

export async function uploadPhotos(orderId, files) {
  const form = new FormData();
  for (const f of files) form.append("photos", f);
  const res = await fetch(`${API_BASE}/photos/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `upload failed: ${res.status}`);
  }
  // Backend nisbiy manzil (masalan /api/photos/xxx.png) qaytaradi — bu to'g'ridan-to'g'ri
  // <img src> orqali ishlaydi (ko'rish endpointi auth talab qilmaydi), shuning uchun
  // hech qanday qo'shimcha o'zgartirish shart emas.
  return data.photos;
}

export async function deletePhoto(filename) {
  const res = await fetch(`${API_BASE}/photos/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `delete failed: ${res.status}`);
  }
  return true;
}

export async function fetchTelegramUserStatus() {
  const res = await fetch(`${API_BASE}/telegram-user/status`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `status failed: ${res.status}`);
  }
  return data;
}

// Ilovaning o'zidan Telegram'ga kirish: step = "qr" | "phone" | "code" | "password" | "cancel", yoki holatni olish (step yo'q)
export async function telegramLogin(step, body = {}) {
  const res = step
    ? await fetch(`${API_BASE}/telegram-user/login/${step}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) })
    : await fetch(`${API_BASE}/telegram-user/login`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `login failed: ${res.status}`);
  return data;
}

export async function fetchTelegramChats() {
  const res = await fetch(`${API_BASE}/telegram-user/chats`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `fetch failed: ${res.status}`);
  }
  return data.chats || [];
}

export async function markTelegramChatRead(chatId) {
  const res = await fetch(`${API_BASE}/telegram-user/mark-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chatId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `mark-read failed: ${res.status}`);
  }
  return data;
}

export async function connectTelegramUser() {
  const res = await fetch(`${API_BASE}/telegram-user/connect`, { method: "POST", headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `connect failed: ${res.status}`);
  }
  return data;
}

export async function disconnectTelegramUser() {
  const res = await fetch(`${API_BASE}/telegram-user/disconnect`, { method: "POST", headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `disconnect failed: ${res.status}`);
  }
  return data;
}

export async function fetchTelegramMessages(chatId) {
  const res = await fetch(`${API_BASE}/telegram-user/messages/${encodeURIComponent(chatId)}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `fetch failed: ${res.status}`);
  }
  return data.messages || [];
}

export async function sendTelegramUserMessage(chatId, text, replyToTgId) {
  const res = await fetch(`${API_BASE}/telegram-user/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chatId, text, replyToTgId: replyToTgId || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `send failed: ${res.status}`);
  }
  return data;
}


export function authLogout() {
  clearToken();
  // Umumiy kompyuterda keyingi odamga saqlanmay qolgan ma'lumot qolmasin
  try { Object.keys(localStorage).filter((k) => k.startsWith("uvix-pending:")).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
}

// ---- Himoyalangan kv API (token talab qiladi) ----
function httpError(msg, status) { const e = new Error(msg); e.status = status; return e; }
export async function apiGet(key, rev) {
  const q = rev != null ? `?rev=${encodeURIComponent(rev)}` : "";
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}${q}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (res.status === 401) { clearToken(); throw httpError("unauthorized", 401); }
  if (!res.ok) throw httpError(`GET ${key} failed: ${res.status}`, res.status);
  return res.json(); // { key, value, rev } yoki { unchanged: true, rev }
}

export async function apiSet(key, value) {
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ value }),
  });
  if (res.status === 401) { clearToken(); throw httpError("unauthorized", 401); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw httpError(d.message || `PUT ${key} failed: ${res.status}`, res.status);
  }
  return res.json();
}

// Faqat o'zgargan yozuvlarni yuborish — server ularni hozirgi ro'yxatga qo'llaydi
export async function apiMerge(key, patch) {
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) { clearToken(); throw httpError("unauthorized", 401); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw httpError(d.message || `MERGE ${key} failed: ${res.status}`, res.status);
  }
  return res.json();
}

export async function apiDelete(key) {
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) { clearToken(); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(`DELETE ${key} failed: ${res.status}`);
  return res.json();
}

// ---- Dizayner / Pechatchi vazifalari ----
export async function fetchTasks() {
  const res = await fetch(`${API_BASE}/tasks`, { headers: authHeaders() });
  if (res.status === 401) { clearToken(); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Vazifalarni olib bo'lmadi");
  return data.tasks || [];
}
export async function setTaskStatus(leadId, kind, status) {
  const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(leadId)}/${kind}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Holatni o'zgartirib bo'lmadi");
  return data.task;
}

// "Noma'lum" Telegram mijozlarining ismini Telegram'dan qayta so'rash
export async function refreshTelegramNames() {
  const res = await fetch(`${API_BASE}/telegram-user/refresh-names`, { method: "POST", headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Ismlarni yangilab bo'lmadi");
  return data;
}

// ---- Chat: rasm, ovozli xabar, joylashuv, reaksiya ----
async function tgJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}
// kind: "photo" | "voice"; file: File yoki Blob
export async function sendTelegramMedia(chatId, kind, file, { caption, replyToTgId, filename } = {}) {
  const form = new FormData();
  form.append("chatId", chatId);
  form.append("kind", kind);
  if (caption) form.append("caption", caption);
  if (replyToTgId) form.append("replyToTgId", String(replyToTgId));
  form.append("file", file, filename || file.name || (kind === "voice" ? "voice.webm" : "photo.jpg"));
  const res = await fetch(`${API_BASE}/telegram-user/send-media`, { method: "POST", headers: authHeaders(), body: form });
  return (await tgJson(res, kind === "voice" ? "Ovozli xabar yuborilmadi" : "Rasm yuborilmadi")).message;
}
export async function sendTelegramLocation(chatId, lat, lng, replyToTgId) {
  const res = await fetch(`${API_BASE}/telegram-user/send-location`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chatId, lat, lng, replyToTgId: replyToTgId || undefined }),
  });
  return (await tgJson(res, "Joylashuv yuborilmadi")).message;
}
export async function reactTelegramMessage(chatId, messageId, emoji) {
  const res = await fetch(`${API_BASE}/telegram-user/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chatId, messageId, emoji: emoji || null }),
  });
  return tgJson(res, "Reaksiya qo'yib bo'lmadi");
}

// Suhbat + eski tarix bormi (yuqoriga aylantirganda yuklash uchun)
export async function fetchTelegramThread(chatId) {
  const res = await fetch(`${API_BASE}/telegram-user/messages/${encodeURIComponent(chatId)}`, { headers: authHeaders() });
  const data = await tgJson(res, "Xabarlarni yuklab bo'lmadi");
  return { messages: data.messages || [], hasOlder: !!data.hasOlder };
}
export async function fetchOlderTelegramMessages(chatId, beforeTgId) {
  const q = beforeTgId ? `?before=${encodeURIComponent(beforeTgId)}` : "";
  const res = await fetch(`${API_BASE}/telegram-user/messages/${encodeURIComponent(chatId)}/older${q}`, { headers: authHeaders() });
  const data = await tgJson(res, "Eski xabarlarni yuklab bo'lmadi");
  return { messages: data.messages || [], hasMore: !!data.hasMore };
}
export async function createLeadFromChat(chatId) {
  const res = await fetch(`${API_BASE}/telegram-user/create-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chatId }),
  });
  return (await tgJson(res, "CRM'ga qo'shib bo'lmadi")).lead;
}

// ---- Tizim holati va zaxiradan tiklash (admin) ----
export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json().catch(() => ({}));
}
export async function fetchSystemStatus() {
  const res = await fetch(`${API_BASE}/system/status`, { headers: authHeaders() });
  return tgJson(res, "Tizim holatini olib bo'lmadi");
}
// apply=false — faqat tekshiradi (nechta buyurtma/lid borligini ko'rsatadi), true — tiklaydi
export async function restoreBackup(file, apply) {
  const form = new FormData();
  form.append("file", file, file.name || "backup.db");
  const res = await fetch(`${API_BASE}/backup/restore${apply ? "?apply=1" : ""}`, { method: "POST", headers: authHeaders(), body: form });
  return tgJson(res, "Zaxirani tiklab bo'lmadi");
}

// ---- Xodimning o'z dashboard ko'rinishi ----
export async function fetchMyDashboard() {
  const res = await fetch(`${API_BASE}/me/dashboard`, { headers: authHeaders() });
  if (!res.ok) return null;
  return (await res.json().catch(() => ({}))).prefs || null;
}
export async function saveMyDashboard(prefs) {
  const res = await fetch(`${API_BASE}/me/dashboard`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ prefs }),
  });
  if (!res.ok) throw new Error("Ko'rinishni saqlab bo'lmadi");
  return (await res.json()).prefs;
}

// Shaxsiy menyu sozlamasi (joylashuv, tartib, yashirilganlar, telefon paneli)
export async function fetchMyNav() {
  const res = await fetch(`${API_BASE}/me/nav`, { headers: authHeaders() });
  if (!res.ok) return null;
  return (await res.json().catch(() => ({}))).prefs || null;
}
export async function saveMyNav(prefs) {
  const res = await fetch(`${API_BASE}/me/nav`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ prefs }),
  });
  if (!res.ok) throw new Error("Menyuni saqlab bo'lmadi");
  return (await res.json()).prefs;
}

// ---- Davomat (keldi-ketdi) ----
async function attReq(path, opts = {}) {
  const res = await fetch(`${API_BASE}/attendance${path}`, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || `Xato: ${res.status}`), { status: res.status, data });
  return data;
}
export const fetchMyAttendance = (month) => attReq(`/me${month ? `?month=${month}` : ""}`);
export const checkAttendance = (type, pos) => attReq("/check", { method: "POST", body: JSON.stringify({ type, ...pos }) });
export const fetchAttendanceConfig = () => attReq("/config").then((d) => d.config);
export const saveAttendanceConfig = (config) => attReq("/config", { method: "PUT", body: JSON.stringify({ config }) }).then((d) => d.config);
export const fetchAttendanceReport = (from, to) => attReq(`/report?from=${from}&to=${to}`);
export const saveAttendanceManual = (payload) => attReq("/manual", { method: "POST", body: JSON.stringify(payload) });
export const sendAttendanceReport = (type) => attReq("/send-report", { method: "POST", body: JSON.stringify({ type }) });
// Selfi rasmini (faqat admin) avtorizatsiya bilan olib, brauzerda ko'rsatish uchun manzil qaytaradi
export async function fetchAttendancePhoto(id) {
  const res = await fetch(`${API_BASE}/attendance/photo/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.status === 404 ? "Rasm o'chirilgan (saqlash muddati tugagan)" : "Rasmni olib bo'lmadi");
  return URL.createObjectURL(await res.blob());
}

// ---- Xodimning Telegram'i (UVIX boti orqali shaxsiy eslatmalar) ----
async function meTg(method = "GET", sub = "") {
  const res = await fetch(`${API_BASE}/me/telegram${sub}`, { method, headers: { "Content-Type": "application/json", ...authHeaders() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Xato: ${res.status}`);
  return data;
}
export const fetchMyTelegram = () => meTg();
export const linkMyTelegram = () => meTg("POST", "/link");
export const unlinkMyTelegram = () => meTg("DELETE");
export async function fetchStaffTelegram() {
  const res = await fetch(`${API_BASE}/staff-telegram`, { headers: authHeaders() });
  if (!res.ok) return {};
  return (await res.json()).linked || {};
}
