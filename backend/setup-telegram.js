// setup-telegram.js — BIR MARTALIK skript. Buni o'zingizning kompyuteringizda
// (Railway'da EMAS!) qo'lda ishga tushirasiz, chunki u interaktiv (telefon
// raqami va Telegram'dan kelgan kodni so'raydi).
//
// Ishlatish:
//   1) https://my.telegram.org ga kiring (o'z Telegram raqamingiz bilan)
//   2) "API development tools" bo'limidan yangi ilova yarating
//   3) sizga berilgan "App api_id" va "App api_hash"ni oling
//   4) shu papkada: npm install teleproto
//   5) shu skriptni ishga tushiring: node setup-telegram.js
//   6) so'ralgan ma'lumotlarni kiriting (api_id, api_hash, telefon, kod, 2FA parol agar bo'lsa)
//   7) oxirida chiqqan "SESSION STRING"ni nusxalab, UVIX dasturidagi
//      Sozlamalar -> Telegram shaxsiy akkaunt bo'limiga joylashtiring

const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");
const { createInterface } = require("node:readline/promises");

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  console.log("=== UVIX — Telegram shaxsiy akkaunt ulash ===\n");
  const apiIdStr = await rl.question("API ID (my.telegram.org dan): ");
  const apiHash = await rl.question("API Hash (my.telegram.org dan): ");
  const apiId = parseInt(apiIdStr.trim(), 10);

  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash.trim(), {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => rl.question("Telefon raqamingiz (+998...): "),
    password: () => rl.question("2FA parolingiz (agar yoqilgan bo'lmasa, bo'sh qoldirib Enter bosing): "),
    phoneCode: () => rl.question("Telegram'dan kelgan tasdiqlash kodi: "),
    onError: (err) => console.error("Xato:", err.message),
  });

  const me = await client.getMe();
  console.log(`\n✅ Muvaffaqiyatli ulandi: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "username yo'q"})`);

  const sessionString = client.session.save();
  console.log("\n=== SESSION STRING (buni nusxalab, dasturga kiriting) ===\n");
  console.log(sessionString);
  console.log("\n=== API ID va API HASH ni ham saqlab qo'ying ===");
  console.log("API ID:", apiId);
  console.log("API Hash:", apiHash.trim());
  console.log("\nDiqqat: Session string — akkauntingizga to'liq kirish huquqi beradi.");
  console.log("Uni hech kimga bermang, faqat UVIX dasturining o'z sozlamalariga kiriting.");

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("Kutilmagan xato:", e);
  process.exit(1);
});
