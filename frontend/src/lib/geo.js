// geo.js — joylashuvni bir marta olish (faqat "Keldim"/"Ketdim" bosilganda)
export function getPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Bu brauzer joylashuvni aniqlay olmaydi"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(
        e.code === 1 ? "Joylashuvga ruxsat berilmagan. Brauzer sozlamalarida UVIX uchun joylashuvni yoqing."
          : e.code === 3 ? "Joylashuv aniqlanmadi (vaqt tugadi). Qayta urinib ko'ring."
            : "Joylashuv aniqlanmadi. GPS yoqilganini tekshiring.")),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}
