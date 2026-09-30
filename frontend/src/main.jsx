import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { hasUnsaved } from "./lib/kv.js";

// Yangi versiya deploy qilinganda ochiq turgan eski sahifa endi mavjud bo'lmagan bo'lakni so'rashi mumkin.
// Shunda sahifani bir marta yangilaymiz (saqlanmagan o'zgarish bo'lsa — avval saqlanishini kutamiz).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  let last = 0;
  try { last = Number(sessionStorage.getItem("uvix-chunk-reload") || 0); } catch { /* */ }
  if (Date.now() - last < 30000) return; // takroriy yangilanish aylanib qolmasin
  const reload = () => {
    try { sessionStorage.setItem("uvix-chunk-reload", String(Date.now())); } catch { /* */ }
    window.location.reload();
  };
  if (!hasUnsaved()) return reload();
  const t = setInterval(() => { if (!hasUnsaved()) { clearInterval(t); reload(); } }, 500);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
