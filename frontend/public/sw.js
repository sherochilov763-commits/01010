const CACHE_NAME = "uvix-shell-v2";
const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Faqat statik fayllarni keshlaymiz (app-shell). /api/ so'rovlari doim tarmoqdan olinadi —
// moliyaviy ma'lumotlar eskirgan holda ko'rsatilmasligi kerak.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // API — har doim tarmoqdan
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ==================== Push bildirishnomalar ====================
// Ilova yopiq bo'lsa ham telefon/kompyuter ekranida ko'rinadi. Ovoz — tizimniki (brauzer o'z ovozini qo'yishga ruxsat bermaydi).
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "UVIX", body: event.data ? event.data.text() : "" }; }
  const title = d.title || "UVIX";
  const options = {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || d.id || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.critical,
    vibrate: d.critical ? [200, 100, 200, 100, 200] : [120, 60, 120],
    data: { view: d.view || "dashboard", id: d.id },
  };
  event.waitUntil((async () => {
    // Ilova ochiq va ko'rinib turgan bo'lsa — ichkaridagi ovoz va qo'ng'iroqcha yetarli, tizim bildirishnomasi shart emas
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = wins.some((w) => w.visibilityState === "visible" && w.focused);
    wins.forEach((w) => w.postMessage({ type: "uvix-push", payload: d }));
    if (visible) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const view = event.notification.data?.view || "dashboard";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        w.postMessage({ type: "uvix-open", view, id: event.notification.data?.id });
        return w.focus();
      }
    }
    return self.clients.openWindow(`/?view=${encodeURIComponent(view)}`);
  })());
});
