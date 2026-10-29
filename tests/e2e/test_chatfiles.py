# Chat fayllari (116-eskiz): Sozlamalar → Ma'lumotlar — guruhlar, tasdiq bilan tozalash, sozlama; chatda «↻ Qayta yuklash».
# Buyurtma rasmi hech qachon o'chmasligi haqiqiy diskda tekshiriladi.
import asyncio, datetime, json, os, time
from common import *  # noqa: F401,F403

UP = os.path.join(os.path.dirname(DB), "uploads")


def put(name, days_ago, size=2000):
    os.makedirs(UP, exist_ok=True)
    p = os.path.join(UP, name)
    with open(p, "wb") as f: f.write(b"x" * size)
    t = time.time() - days_ago * 86400
    os.utime(p, (t, t))


def seed():
    now = datetime.datetime.now(datetime.timezone.utc)
    iso = lambda days: (now - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    put("cforder1.jpg", 100, 3000)      # buyurtmaga biriktirilgan
    put("tgcfold90.mp4", 90, 50000)     # faqat chatda, 90 kun — muddati o'tgan
    put("tgcfnew2.jpg", 2, 4000)        # faqat chatda, yangi
    put("cfdupe1234.jpg", 5, 20000)     # hech qayerda — yetim
    orders = json.loads(api("/api/kv/uvix:orders", token=admin_token())["value"])
    orders[0]["photos"] = (orders[0].get("photos") or []) + [{"filename": "cforder1.jpg", "url": "/api/photos/cforder1.jpg"}]
    dbset("uvix:orders", orders)
    dbset("uvix:telegramMessages", {
        "777001": [
            {"id": "c1", "tgId": 11, "out": False, "text": "", "mediaType": "video", "mediaUrl": "/api/photos/tgcfold90.mp4", "fileSize": 50000, "date": iso(90)},
            {"id": "c2", "tgId": 12, "out": False, "text": "", "mediaType": "photo", "mediaUrl": "/api/photos/tgcfnew2.jpg", "date": iso(2)},
            {"id": "c3", "tgId": 13, "out": False, "text": "chizma", "mediaType": "document", "fileName": "chizma.pdf", "fileSize": 3200000, "mediaUrl": None, "lazy": True, "date": iso(1)},
        ],
    })
    dbset("uvix:telegramContacts", {"777001": {"name": "Malika Interior", "username": "malika_int"}})


async def main():
    seed()
    tok = admin_token()
    errs = []
    s = api("/api/system/chat-files", token=tok)
    ok("server: guruhlar — yetim, eski, biriktirilgan, yangi", s["orphan"]["count"] >= 1 and s["old"]["count"] == 1 and s["attached"]["count"] >= 1 and s["recent"]["count"] >= 1, s)
    ok("standart sozlama: video ochilganda, 60 kun, avtomatik", s["config"] == {"lazyDocs": True, "keepDays": 60, "autoClean": True}, s["config"])
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    ok("operator: ko'ra olmaydi, tozalay olmaydi", api("/api/system/chat-files", token=az).get("_code") == 403 and api("/api/system/chat-files/clean", {"orphans": True}, az).get("_code") == 403)
    kv = api("/api/kv/uvix:chatFiles", token=tok)
    ok("ichki kalit — KV orqali ochiq emas", kv.get("_code") in (403, 404), kv)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(pg, "Administrator", "0000")
        # ---------- chatda: oldindan yuklanmagan fayl ----------
        await nav(pg, "Chatlar"); await pg.wait_for_timeout(1200)
        await pg.locator("[data-chat='777001']").click(); await pg.wait_for_timeout(1500)
        fm = pg.locator("[data-testid=fetch-media]")
        ok("chatda: hujjat «Ochilganda Telegram'dan yuklanadi»", await fm.count() == 1 and "Telegram'dan yuklanadi" in await fm.inner_text())
        await fm.locator("[data-testid=fetch-media-btn]").click(); await pg.wait_for_timeout(1200)
        ok("Telegram ulanmagan — tushunarli xato", "ulanmagan" in (await fm.inner_text()).lower(), await fm.inner_text())
        # ---------- Sozlamalar → Ma'lumotlar ----------
        await nav(pg, "Sozlamalar"); await pg.locator("[data-section=malumotlar]").click(); await pg.wait_for_timeout(1200)
        card = pg.locator("[data-testid=chat-files]")
        ok("«Chat fayllari» kartasi: 4 guruh", await card.locator("[data-cf]").count() == 4)
        await card.locator("[data-keep='0']").click(); await pg.wait_for_timeout(700)
        cf0 = api("/api/system/chat-files", token=tok)
        ok("saqlash muddati «Cheksiz» — serverda; eski fayl yo'q", cf0["config"]["keepDays"] == 0 and cf0["old"]["count"] == 0, cf0)
        await card.locator("[data-keep='60']").click(); await pg.wait_for_timeout(700)
        await card.locator("[data-testid=cf-lazy]").click(); await pg.wait_for_timeout(600)
        ok("«ochilganda yuklansin» o'chirildi — serverda", api("/api/system/chat-files", token=tok)["config"]["lazyDocs"] is False)
        await card.locator("[data-testid=cf-lazy]").click(); await pg.wait_for_timeout(400)
        await card.locator("[data-testid=cf-clean-open]").click(); await pg.wait_for_timeout(400)
        sh = pg.locator("[data-testid=cf-sheet]")
        ok("tozalash oynasi: ikkala belgi, «qaytarilmaydi» ogohlantirishi", await sh.count() == 1 and "qaytarilmaydi" in await sh.inner_text() and "tegilmaydi" in await sh.inner_text())
        await pg.screenshot(path=S + "cf_sheet.png")
        await sh.locator("[data-testid=cf-clean-confirm]").click(); await pg.wait_for_timeout(1500)
        ok("natija: «… bo'shatildi»", "bo'shatildi" in await sh.locator("[data-testid=cf-done]").inner_text())
        ex = lambda n: os.path.exists(os.path.join(UP, n))
        ok("diskda: yetim va 90 kunlik o'chdi; buyurtma rasmi va yangi chat fayli qoldi", not ex("cfdupe1234.jpg") and not ex("tgcfold90.mp4") and ex("cforder1.jpg") and ex("tgcfnew2.jpg"))
        c = dbmsgs()["777001"]
        ok("xabarda «mediaGone», yangisi o'zgarmadi", c[0].get("mediaGone") is True and c[0].get("mediaUrl") is None and c[1]["mediaUrl"] == "/api/photos/tgcfnew2.jpg", c[:2])
        await sh.locator("text=Yopish").last.click(); await pg.wait_for_timeout(300)
        # ---------- chatda: muddati o'tgan fayl ----------
        await nav(pg, "Chatlar"); await pg.wait_for_timeout(1200)
        await pg.locator("[data-chat='777001']").click(); await pg.wait_for_timeout(1500)
        ok("chatda: o'chirilgan video — «↻ Qayta yuklash»", await pg.locator("[data-testid=fetch-media][data-gone='1']").count() == 1 and "Qayta yuklash" in await pg.locator("[data-testid=fetch-media][data-gone='1']").inner_text())
        await pg.screenshot(path=S + "cf_chat.png")
        ok("JS xatolari yo'q", not errs, errs)
        await b.close()
    finish()


def sqlite_get(key):
    import sqlite3
    c = sqlite3.connect(DB); v = c.execute("select value from kv_store where key=?", (key,)).fetchone()[0]; c.close()
    return json.loads(v)

asyncio.run(main())
