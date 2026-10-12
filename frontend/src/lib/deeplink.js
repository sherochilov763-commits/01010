// deeplink.js — boshqa bo'limning ma'lum yorlig'ini ochish (masalan Sozlamalar → «Davomat sozlamalari»).
// Bir martalik: o'qilgach o'chadi.
const K = (view) => `uvix:openTab:${view}`;
export function setOpenTab(view, tab) { try { sessionStorage.setItem(K(view), tab); } catch { /* shart emas */ } }
export function takeOpenTab(view, allowed) {
  try {
    const v = sessionStorage.getItem(K(view));
    if (v) sessionStorage.removeItem(K(view));
    return v && (!allowed || allowed.includes(v)) ? v : null;
  } catch { return null; }
}
// Sozlamalarning ma'lum bo'limini ochish (Ctrl K, bildirishnoma qo'ng'irog'i va h.k.)
export const SETTINGS_EVENT = "uvix:settings-section";
export function openSettingsSection(section, anchor) {
  try { sessionStorage.setItem("uvix:settingsSection", section); } catch { /* shart emas */ }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { section, anchor } }));
  if (anchor) setTimeout(() => document.querySelector(`[data-testid="${anchor}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 450);
}
