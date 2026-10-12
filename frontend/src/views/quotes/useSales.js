// useSales.js — narxlar ro'yxati va avans foizi (serverdan bir marta olinadi, sozlamada saqlansa yangilanadi)
import { useEffect, useState } from "react";
import { fetchSalesConfig } from "../../storage.js";

let cache = null;
let inflight = null;
const listeners = new Set();
export function setSalesCache(cfg) { cache = cfg; listeners.forEach((fn) => fn(cfg)); }
export function loadSales(force) {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight) inflight = fetchSalesConfig().then((c) => { setSalesCache(c || { advancePct: 50, prices: [] }); return cache; }).finally(() => { inflight = null; });
  return inflight;
}
export function useSales() {
  const [cfg, setCfg] = useState(cache);
  useEffect(() => {
    listeners.add(setCfg);
    loadSales().catch(() => setCfg((c) => c || { advancePct: 50, prices: [] }));
    return () => listeners.delete(setCfg);
  }, []);
  return cfg || { advancePct: 50, prices: [], loading: true };
}
