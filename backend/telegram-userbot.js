// telegram-userbot.js — shaxsiy Telegram akkauntga ulanib turadigan, xabarlarni
// qabul qiladigan va yuboradigan modul. MTProto (teleproto) orqali ishlaydi —
// bu Bot API emas, balki haqiqiy foydalanuvchi sessiyasi.

const path = require("path");
const crypto = require("crypto");
const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");

let client = null;
let connecting = false;
let lastError = null;
let onNewMessageCallback = null;
let mediaDir = null; // rasmlar saqlanadigan papka (server.js tomonidan beriladi)

function setMediaDir(dir) {
  mediaDir = dir;
}

// ==================== Ism aniqlash ====================
// Telegram yangi xabarda ko'pincha faqat foydalanuvchi ID'sini yuboradi. Ism kutubxonaning
// xotirasidan (entity cache) olinadi, u esa server har qayta ishga tushganda bo'shab qoladi —
// shuning uchun oldin "Noma'lum (ID)" chiqardi. Endi xotira bo'sh bo'lsa, so'nggi suhbatlar
// ro'yxatini yuklab (getDialogs) xotirani to'ldiramiz va ismni qayta so'raymiz.
let lastWarmAt = 0;
const failedAt = new Map(); // id -> oxirgi muvaffaqiyatsiz urinish vaqti
async function warmEntityCache(limit = 200) {
  if (!client) return;
  const now = Date.now();
  if (now - lastWarmAt < 3000) return; // bir vaqtda kelgan ko'p xabarda bitta so'rov yetadi
  lastWarmAt = now;
  try {
    // Yangi mijoz yozgan zahoti uning suhbati ro'yxatning eng tepasida bo'ladi
    await client.getDialogs({ limit });
  } catch (e) {
    console.error("Telegram suhbatlar ro'yxatini yuklab bo'lmadi:", e.message);
  }
}

async function resolveUser(id) {
  if (!client || id == null) return null;
  try {
    return await client.getEntity(id);
  } catch {
    const key = String(id);
    // Bir xil topilmaydigan ID uchun Telegram'ni daqiqasiga bir martadan ortiq bezovta qilmaymiz
    if (Date.now() - (failedAt.get(key) || 0) < 60 * 1000) return null;
    lastWarmAt = 0;
    await warmEntityCache(50);
    try {
      const e = await client.getEntity(id);
      failedAt.delete(key);
      return e;
    } catch {
      failedAt.set(key, Date.now());
      return null;
    }
  }
}

function describeEntity(entity, fallbackId) {
  const fullName = entity ? [entity.firstName, entity.lastName].filter(Boolean).join(" ").trim() : "";
  const title = entity?.title || ""; // guruh/kanal nomi
  const username = entity?.username || "";
  const phone = entity?.phone || "";
  const name = fullName || title || (username ? `@${username}` : "") || (phone ? `+${phone}` : "");
  return { name: name || `Noma'lum (${fallbackId})`, known: !!name, username, phone };
}

// Berilgan chat ID'lar uchun ism/username/telefonni aniqlaydi (eski "Noma'lum" lidlarni tuzatish uchun)
async function resolveChatNames(chatIds) {
  const out = {};
  if (!isConnected() || !chatIds?.length) return out;
  lastWarmAt = 0;
  failedAt.clear();
  await warmEntityCache(200);
  for (const id of chatIds) {
    const entity = await resolveUser(isNaN(Number(id)) ? id : Number(id));
    const info = describeEntity(entity, id);
    if (info.known) out[id] = info;
  }
  return out;
}

function isConnected() {
  return !!client && client.connected;
}

function getStatus() {
  if (connecting) return { status: "connecting" };
  if (isConnected()) return { status: "connected" };
  if (lastError) return { status: "error", message: lastError };
  return { status: "disconnected" };
}

// Sozlamalardan (apiId, apiHash, sessionString) o'qib, ulanishni boshlaydi.
// onNewMessage(fromUserId, fromName, text, chatId) — yangi xabar kelganda chaqiriladi.
async function connectFromSettings(settings, onNewMessage) {
  onNewMessageCallback = onNewMessage;
  const apiId = parseInt(settings?.telegramUserApiId, 10);
  const apiHash = settings?.telegramUserApiHash;
  const sessionString = settings?.telegramUserSession;

  if (!apiId || !apiHash || !sessionString) {
    lastError = "Sozlamalar to'liq emas (API ID / API Hash / Session)";
    return { ok: false, error: lastError };
  }

  try {
    connecting = true;
    lastError = null;
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    // Ulanishi bilan xotirani to'ldiramiz — birinchi xabardanoq ism to'g'ri chiqadi
    warmEntityCache(200);

    client.updates.on("newMessage", async (update) => {
      try {
        const msg = update.message;
        if (!msg || msg.out) return; // ozimiz yuborgan xabarni ozimiz qayta ishlamaymiz
        let sender = null;
        try { sender = await msg.getSender(); } catch { /* xotirada yo'q */ }
        if (!sender || (!sender.firstName && !sender.lastName && !sender.title && !sender.username)) {
          sender = (await resolveUser(msg.senderId ?? msg.chatId)) || sender;
        }
        const chatId = String(msg.chatId || sender?.id || "");
        // Hech narsa aniqlanmasa ham, kamida chatId'ni ko'rsatamiz — shunda bir nechta
        // "Noma'lum" birlashib ketmaydi, har biri o'zining ID'si bilan ajralib turadi.
        const { name: fromName } = describeEntity(sender, chatId);

        // Xabar matnini aniqlaymiz — agar rasm/video/fayl bo'lsa, mos belgi qo'shamiz
        let text = msg.message || "";
        let mediaUrl = null;
        let mediaType = null;
        if (msg.media) {
          if (msg.photo && mediaDir) {
            // Rasmning o'zini yuklab olamiz — shunda CRM'da haqiqiy rasm korinadi
            try {
              const buffer = await client.downloadMedia(msg, {});
              if (buffer) {
                const filename = `${crypto.randomBytes(12).toString("hex")}.jpg`;
                require("fs").writeFileSync(path.join(mediaDir, filename), buffer);
                mediaUrl = `/api/photos/${filename}`;
                mediaType = "photo";
              }
            } catch (e) {
              console.error("Rasmni yuklab olishda xato:", e.message);
            }
          }
          const mediaLabel = msg.photo ? "📷 Rasm" : msg.video ? "🎥 Video" : msg.voice ? "🎤 Ovozli xabar" : msg.document ? "📎 Fayl" : "📎 Media";
          text = text ? `${mediaLabel}: ${text}` : (mediaUrl ? text : mediaLabel);
        }
        if (!text && !mediaUrl) text = "[Bo'sh xabar]";

        if (onNewMessageCallback) {
          onNewMessageCallback({
            chatId,
            fromName,
            username: sender?.username || "",
            phone: sender?.phone || "",
            text,
            mediaUrl,
            mediaType,
            date: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
          });
        }
      } catch (e) {
        console.error("Telegram xabarni qayta ishlashda xato:", e.message);
      }
    });

    connecting = false;
    return { ok: true };
  } catch (e) {
    connecting = false;
    lastError = e.message;
    client = null;
    return { ok: false, error: e.message };
  }
}

async function disconnect() {
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {
      // e'tiborsiz qoldiramiz
    }
    client = null;
  }
}

async function sendMessage(chatId, text) {
  if (!isConnected()) throw new Error("Telegram akkauntga ulanmagan");
  await client.sendMessage(chatId, { message: text });
}

async function getRecentMessages(chatId, limit = 30) {
  if (!isConnected()) throw new Error("Telegram akkauntga ulanmagan");
  const messages = await client.getMessages(chatId, { limit });
  return messages
    .map((m) => ({
      id: String(m.id),
      text: m.message || "",
      out: !!m.out,
      date: new Date((m.date || 0) * 1000).toISOString(),
    }))
    .reverse();
}

module.exports = { connectFromSettings, disconnect, sendMessage, getRecentMessages, getStatus, isConnected, setMediaDir, resolveChatNames };
