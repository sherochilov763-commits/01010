// reset-admin-pin.js — admin PIN'ini tiklash (faqat serverga kirish huquqi borlar uchun).
// Ishlatish:  node reset-admin-pin.js 482913     → birinchi admin PIN'i 482913 bo'ladi
// (PIN majburiy — taxmin qilinadigan "0000" standart qiymati yo'q)
// Railway'da: loyiha → servis → "..." → "Shell" (yoki `railway run node backend/reset-admin-pin.js <PIN>`)
const bcrypt = require("bcryptjs");
const db = require("./db");

const newPin = process.argv[2] || "";
if (!/^\d{4,6}$/.test(newPin)) {
  console.error("Ishlatish: node reset-admin-pin.js <yangi PIN (4-6 raqam)>");
  process.exit(1);
}
const row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get("uvix:employees");
const employees = row ? JSON.parse(row.value) : [];
const admin = employees.find((e) => e.role === "admin");
if (!admin) {
  console.error("Administrator topilmadi");
  process.exit(1);
}
admin.pin = bcrypt.hashSync(newPin, 10);
db.prepare("UPDATE kv_store SET value = ?, updated_at = datetime('now') WHERE key = ?").run(JSON.stringify(employees), "uvix:employees");
console.log(`✓ "${admin.name}" PIN'i yangilandi. Kirgandan so'ng darhol o'zgartiring.`);
