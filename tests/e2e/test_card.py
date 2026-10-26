# Karta (CardXabar): faqat rahbar; chiqim → rasxod, kirim → buyurtma to'lovi, shaxsiy belgisi; telefon ko'rinishi
import asyncio, datetime, json
from common import *  # noqa: F401,F403

now = datetime.datetime.now(datetime.timezone.utc)
at = lambda **kw: (now - datetime.timedelta(**kw)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
def it(i, d, amount, merchant, bal, kind, **kw):
    return {"id": f"UVIXPRINT:999:{i}", "line": "UVIXPRINT", "tgId": i, "kind": kind, "dir": d, "amount": amount, "currency": "UZS", "card": "8313",
            "merchant": merchant, "at": kw.pop("when"), "balance": bal, "msgAt": now.isoformat(), "sig": f"s{i}", "receivedAt": at(minutes=2), **kw}
ITEMS = [
    it(4, "in", 1250000, "UZCARD P2P, UZ", 3772539.19, "Popolnenie", when=at(minutes=20)),
    it(3, "out", 320000, "KORZINKA, UZ", 2522539.19, "Platezh", when=at(hours=2)),
    it(2, "out", 249717, "PAYME P2P, UZ", 2842539.19, "Spisanie c karty", when=at(hours=3)),
    it(1, "out", 2022000, "ATB HAMKORBANK PAYME AJ, UZ", 3092256.19, "Platezh", when=at(days=1)),
]

async def main():
    dbset("uvix:cardTx", {"items": ITEMS, "meta": {"UVIXPRINT": {"chatId": "999", "name": "CardXabar", "found": True}}})
    adm = admin_token()
    op = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    ok("operator karta ma'lumotini ko'ra olmaydi (403)", api("/api/card-tx", token=op).get("_code") == 403)
    ok("KV orqali ham yopiq", api("/api/kv/uvix:cardTx", token=adm).get("_code") == 403)
    r = api("/api/card-tx", token=adm)
    ok("rahbar: 4 ta yozuv, ichki maydon chiqmaydi", len(r["items"]) == 4 and "sig" not in r["items"][0], r)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Karta"); await d.wait_for_timeout(1200)
        await d.locator("button", has_text="Hammasi").first.click(); await d.wait_for_timeout(300)
        ok("ro'yxat: 4 qator", await d.locator("[data-testid=card-row]").count() == 4)
        ok("ulangan belgisi va qoldiq", await d.locator("text=CardXabar ulangan").count() == 1 and await d.locator("text=3 772 539.19 so'm").count() >= 1)
        await d.screenshot(path=OUT + "card_desktop.png")
        # Chiqim → rasxod
        await d.locator("[data-testid=card-row]", has_text="KORZINKA").click(); await d.wait_for_timeout(400)
        await d.locator(".uvix-modal-panel button", has_text="Rasxodga yozish").click(); await d.wait_for_timeout(600)
        await d.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await d.wait_for_timeout(1500)
        tx = json.loads(api("/api/kv/uvix:transactions", token=adm)["value"])
        k = [x for x in api("/api/card-tx", token=adm)["items"] if x["tgId"] == 3][0]
        ok("rasxod yozildi (karta, 320 000) va yozuvga bog'landi", any(t["id"] == k.get("txId") and t["amount"] == 320000 and t["paymentType"] == "karta" for t in tx), (k, tx[:2]))
        ok("qatorda «Rasxod:» belgisi", await d.locator("[data-testid=card-row]", has_text="KORZINKA").locator("text=Rasxod:").count() == 1)
        # Kirim → buyurtma to'lovi
        await d.locator("[data-testid=card-row]", has_text="UZCARD P2P").click(); await d.wait_for_timeout(400)
        await d.locator(".uvix-modal-panel button", has_text="Buyurtmaga bog'lash").click(); await d.wait_for_timeout(500)
        await d.locator(".uvix-modal-panel input").fill("Jahongir"); await d.wait_for_timeout(300)
        await d.locator(".uvix-modal-panel button", has_text="UV-261012-001").click(); await d.wait_for_timeout(1500)
        o4 = order(adm, "UV-261012-001")
        ok("to'lov buyurtmaga qo'shildi (karta, 1 250 000)", any(p["amount"] == 1250000 and p["paymentType"] == "karta" for p in o4["payments"]), o4["payments"])
        k = [x for x in api("/api/card-tx", token=adm)["items"] if x["tgId"] == 4][0]
        ok("kirim buyurtmaga bog'landi", k.get("orderId") == "o4" and k.get("paymentId"), k)
        # Shaxsiy
        await d.locator("[data-testid=card-row]", has_text="PAYME P2P").click(); await d.wait_for_timeout(400)
        await d.locator(".uvix-modal-panel button", has_text="Shaxsiy").click(); await d.wait_for_timeout(800)
        k = [x for x in api("/api/card-tx", token=adm)["items"] if x["tgId"] == 2][0]
        ok("shaxsiy deb belgilandi", k.get("personal") is True, k)
        await d.locator("button", has_text="Belgilanmagan").click(); await d.wait_for_timeout(300)
        ok("«Belgilanmagan»: 1 ta qoldi", await d.locator("[data-testid=card-row]").count() == 1)
        await b.close()
        b = await p.chromium.launch()
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Administrator", "0000"); await m.wait_for_timeout(2500)
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(500)
        ok("telefon: «Yana» ichida Karta plitkasi", await m.locator("[data-tile=card]").count() == 1)
        await m.locator("[data-tile=card]").click(); await m.wait_for_timeout(1500)
        await m.locator("button", has_text="Hammasi").first.click(); await m.wait_for_timeout(300)
        ok("telefon: gorizontal aylantirish yo'q", await m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        await m.screenshot(path=OUT + "card_mobile.png", full_page=True)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
