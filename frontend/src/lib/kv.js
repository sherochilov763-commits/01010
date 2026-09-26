import { apiGet, apiSet } from "../storage.js";

export async function storageGet(key, shared, fallback) {
  try {
    const r = await apiGet(key);
    if (!r) return fallback;
    return JSON.parse(r.value);
  } catch (e) {
    console.error("storage get failed", key, e);
    return fallback;
  }
}
export async function storageSet(key, shared, value) {
  try {
    await apiSet(key, JSON.stringify(value));
  } catch (e) {
    console.error("storage set failed", key, e);
  }
}
