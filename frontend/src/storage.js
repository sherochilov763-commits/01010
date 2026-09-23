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

export async function sendTelegramUserMessage(chatId, text) {
  const res = await fetch(`${API_BASE}/telegram-user/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chatId, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `send failed: ${res.status}`);
  }
  return data;
}


export async function authResetAdminPin() {
  const res = await fetch(`${API_BASE}/auth/reset-admin-pin`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `reset failed: ${res.status}`);
    throw err;
  }
  return data;
}

export function authLogout() {
  clearToken();
}

// ---- Himoyalangan kv API (token talab qiladi) ----
export async function apiGet(key) {
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (res.status === 401) { clearToken(); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(`GET ${key} failed: ${res.status}`);
  return res.json(); // { key, value }
}

export async function apiSet(key, value) {
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ value }),
  });
  if (res.status === 401) { clearToken(); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(`PUT ${key} failed: ${res.status}`);
  return res.json();
}

export async function apiDelete(key) {
  const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) { clearToken(); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(`DELETE ${key} failed: ${res.status}`);
  return res.json();
}
