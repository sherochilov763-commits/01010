// imageCompress.js — rasmni serverga yuborishdan oldin brauzerning o'zida kichraytirish (server diski to'lmasligi uchun).
// Telefon surati 3–5 MB → ~0,4–0,8 MB (2400 px, JPEG 85% — chizma yozuvlari o'qiladi); ro'yxat uchun kichik nusxa ~15 KB (360 px).

function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file)).catch(() => loadImg(file));
  }
  return loadImg(file);
}
function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Rasmni o'qib bo'lmadi")); };
    img.src = url;
  });
}
const baseName = (n) => String(n || "rasm").replace(/\.[^.]+$/, "");

// max — uzun tomoni (px); qaytaradi: File (JPEG) yoki o'zgartirib bo'lmasa — asl fayl
export async function shrinkImage(file, max = 2400, quality = 0.85, suffix = "") {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || "")) return file;
  let src;
  try { src = await loadBitmap(file); } catch { return file; }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  if (!w0 || !h0) return file;
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  // Kichik PNG (logotip, shaffof fon) va allaqachon kichik JPEG — o'zgartirilmaydi
  if (k === 1 && !suffix && (file.type === "image/png" ? file.size < 1.5e6 : file.size < 400e3)) return file;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, w, h); // shaffof joy — oq
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  try { src.close?.(); } catch { /* */ }
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) return file;
  if (!suffix && blob.size >= file.size) return file; // siqish foyda bermadi
  return new File([blob], `${baseName(file.name)}${suffix}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

// Asosiy rasm + ro'yxat uchun kichik nusxa
export async function prepareImage(file) {
  const main = await shrinkImage(file, 2400, 0.85); // chizmalardagi mayda yozuvlar o'qilishi uchun 2400 px
  const thumb = await shrinkImage(file, 360, 0.72, "_kichik");
  return { main, thumb: thumb === file ? null : thumb };
}
