# Karta 1-bosqich (137-eskiz): navbat, kirimdan yangi buyurtma, Material rasxodini buyurtmalarga bo'lish,
# avvalgi kategoriyani eslash, istalgan sahifada chiqadigan so'rov oynasi
import asyncio, datetime, json
from common import *  # noqa: F401,F403

now = datetime.datetime.now(datetime.timezone.utc)
at = lambda **kw: (now - datetime.timedelta(**kw)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
def it(i, d, amount, merchant, kind, **kw):
    return {"id": f"UVIXPRINT:999:{i}", "line": "UVIXPRINT", "tgId": i, "kind": kind, "dir": d, "amount": amount, "currency": "UZS", "card": "8313",
            "merchant": merchant, "at": kw.pop("when"), "balance": 1000000, "msgAt": at(minutes=kw.get("_m", 2)), "sig": f"s{i}", "receivedAt": at(minutes=kw.pop("_m", 2)), **kw}
OLD_TX = {"id": "txold", "type": "chiqim", "date": "2026-10-01", "amount": 90000, "paymentType": "karta", "note": "eski", "category": "Material", "subcategory": "MDF"}
ITEMS = [
    it(4, "in", 900000, "UZCARD P2P, UZ", "Popolnenie", when=at(minutes=20)),
    it(3, "out", 500000, "STROYBAZA, UZ", "Platezh", when=at(hours=1)),
    it(1, "out", 90000, "STROYBAZA, UZ", "Platezh", when=at(days=3), txId="txold", label="Material / MDF · 1 buyurtma"),
]
CARD = lambda items: {"items": items, "meta": {"UVIXPRINT": {"chatId": "999", "name": "CardXabar", "found": True}}}
card = lambda tok, i: [x for x in api("/api/card-tx", token=tok)["items"] if x["tgId"] == i][0]

async def main():
    adm = admin_token()
    r = api("/api/kv/uvix:transactions", token=adm)
    dbset("uvix:transactions", [OLD_TX, *(json.loads(r["value"]) if r.get("value") else [])])
    dbset("uvix:cardTx", CARD(ITEMS))
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await d.wait_for_timeout(1500)
        ok("birinchi kirishda eski yozuvlar uchun so'rov chiqmaydi", await d.locator("[data-testid=card-prompt]").count() == 0)
        await nav(d, "Karta"); await d.wait_for_timeout(1200)
        q = d.locator("[data-testid=card-queue]")
        ok("navbat ko'rinadi (2 ta belgilanmagan)", await q.count() == 1 and await q.locator("text=900 000").count() >= 1, await q.inner_text() if await q.count() else "")
        await d.screenshot(path=OUT + "card2_queue.png")
        # Kirim → yangi buyurtma (shu to'lov avans)
        await q.locator("[data-testid=q-new]").click(); await d.wait_for_timeout(900)
        qs = d.locator("[data-testid=quote-sheet2]")
        ok("Smeta / Buyurtma oynasi: karta summasi avans (qulflangan)", await qs.count() == 1 and await qs.locator("[data-testid=qs-adv]").is_disabled() and "900 000" in (await qs.locator("[data-testid=qs-adv]").input_value()).replace("\u00a0", " "))
        await qs.locator("[data-testid=quote-customer]").fill("Test Mijoz Karta")
        r1 = qs.locator("[data-testid=qs-row]").nth(0)
        await r1.locator("[data-testid=qs-name]").fill("Shisha fartuk 3 m")
        await r1.locator("[data-testid=qs-calc] [data-v=lump]").click()
        await r1.locator("[data-testid=qs-price]").fill("2000000")
        await d.screenshot(path=OUT + "card2_quick.png")
        await qs.locator("[data-testid=qs-create]").click(); await d.wait_for_timeout(800)
        if await d.locator("[data-testid=qs-force-ok]").count():  # 900 000 < 50% — rahbar tasdiqlab ochadi
            await d.locator("[data-testid=qs-force-ok]").click()
        await d.wait_for_timeout(2000)
        os_ = [o for o in orders(adm) if o.get("customer") == "Test Mijoz Karta"]
        o = os_[0] if os_ else {}
        ok("buyurtma yaratildi: 2 000 000, avans karta 900 000", len(os_) == 1 and any(pp["amount"] == 900000 and pp["paymentType"] == "karta" for pp in o.get("payments", [])), o)
        k = card(adm, 4)
        ok("kirim yangi buyurtmaga bog'landi", k.get("orderId") == o.get("id") and k.get("paymentId") == (o.get("payments") or [{}])[0].get("id"), k)
        # Chiqim → Material, oldingi kategoriya eslab qolingan, 2 buyurtmaga bo'lish + qoldiq
        await d.wait_for_timeout(500)
        q = d.locator("[data-testid=card-queue]")
        ok("navbatda keyingisi — chiqim", await q.locator("[data-testid=q-expense]").count() == 1)
        await q.locator("[data-testid=q-expense]").click(); await d.wait_for_timeout(600)
        m = d.locator(".uvix-modal-panel")
        sels = m.locator("select")
        ok("kategoriya avvalgidan: Material / MDF", await sels.nth(0).input_value() == "Material" and await sels.nth(1).input_value() == "MDF",
           [await sels.nth(i).input_value() for i in range(min(2, await sels.count()))])
        await m.locator("[data-testid=split-add]").click(); await d.wait_for_timeout(200)
        ok("birinchi qatorga to'liq summa qo'yiladi", (await m.locator("[data-testid=split-amount]").first.input_value()).replace(" ", "").replace(" ", "") == "500000")
        await m.locator("[data-testid=split-order]").first.select_option("o4")
        await m.locator("[data-testid=split-amount]").first.fill("200000")
        await m.locator("[data-testid=split-add]").click(); await d.wait_for_timeout(200)
        await m.locator("[data-testid=split-order]").nth(1).select_option("o5")
        await m.locator("[data-testid=split-amount]").nth(1).fill("150000")
        st = await m.locator("[data-testid=split-sum]").inner_text()
        ok("taqsim holati: 350 000 / 500 000, qolgani umumiy", "350" in st and "500" in st and "umumiy" in st, st)
        await d.screenshot(path=OUT + "card2_split.png")
        await m.locator("button", has_text="Saqlash").last.click(); await d.wait_for_timeout(1800)
        tx = json.loads(api("/api/kv/uvix:transactions", token=adm)["value"])
        k = card(adm, 3)
        mine = [t for t in tx if t["id"] in (k.get("txIds") or [])]
        by = {t.get("relatedOrderId"): t["amount"] for t in mine}
        ok("3 ta rasxod: o4 200 000, o5 150 000, umumiy 150 000", len(mine) == 3 and by.get("o4") == 200000 and by.get("o5") == 150000 and by.get(None) == 150000, mine)
        ok("hammasi Material / MDF, karta", all(t["category"] == "Material" and t["subcategory"] == "MDF" and t["paymentType"] == "karta" for t in mine))
        ok("karta yozuvi belgisi: «· 2 buyurtma»", k.get("txId") in [t["id"] for t in mine] and "2 buyurtma" in (k.get("label") or ""), k)
        ok("navbat bo'shadi", await d.locator("[data-testid=card-queue]").count() == 0)
        # Yangi yozuv keldi → boshqa sahifada so'rov oynasi
        await nav(d, "Buyurtmalar"); await d.wait_for_timeout(500)
        dbset("uvix:cardTx", CARD([it(7, "in", 333000, "PAYME P2P, UZ", "Popolnenie", when=at(minutes=1), _m=0), *[card(adm, i) for i in (4, 3, 1)]]))
        await d.reload(); await d.wait_for_timeout(2500)
        cp = d.locator("[data-testid=card-prompt]")
        ok("yangi kirim: so'rov oynasi chiqdi", await cp.count() == 1 and "333 000" in (await cp.inner_text()).replace(" ", " "))
        await d.screenshot(path=OUT + "card2_prompt.png")
        await cp.locator("[data-testid=cp-link]").click(); await d.wait_for_timeout(1200)
        ok("«Buyurtmaga bog'lash» → Karta, buyurtma tanlash oynasi", await d.locator(".uvix-modal-panel input").count() >= 1 and await d.locator("[data-testid=card-prompt]").count() == 0)
        await d.keyboard.press("Escape"); await d.wait_for_timeout(300)
        await d.reload(); await d.wait_for_timeout(2500)
        ok("ko'rilgan yozuv qayta so'ralmaydi", await d.locator("[data-testid=card-prompt]").count() == 0)
        await b.close()
        # Telefon: so'rov oynasi va «Shaxsiy»
        dbset("uvix:cardTx", CARD([it(8, "out", 45000, "KAFE, UZ", "Platezh", when=at(minutes=1), _m=0), *[card(adm, i) for i in (7, 4, 3, 1)]]))
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")
        mp = await ctx.new_page(); mp.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(mp, "Administrator", "0000"); await mp.wait_for_timeout(2000)
        # Yangi qurilma: birinchi yuklashda hammasi «ko'rilgan» — so'rovni ko'rish uchun belgi eskiroq qilinadi
        await mp.evaluate("localStorage.setItem('uvix:cardSeenAt', '2000-01-01T00:00:00.000Z')")
        await mp.reload(); await mp.wait_for_timeout(2500)
        cp = mp.locator("[data-testid=card-prompt]")
        ok("telefon: so'rov oynasi (chiqim)", await cp.count() == 1 and await cp.locator("[data-testid=cp-expense]").count() == 1)
        box = await cp.bounding_box()
        ok("telefon: oyna ekranga sig'adi", box and box["x"] >= 0 and box["x"] + box["width"] <= 391, box)
        await mp.screenshot(path=OUT + "card2_prompt_mobile.png")
        # Eng eski ochiq yozuv birinchi (7 — kirim 333 000 bog'lanmagan) bo'lishi mumkin; shaxsiy deb belgilaymiz
        first = await cp.inner_text()
        await cp.locator("[data-testid=cp-personal]").click(); await mp.wait_for_timeout(1000)
        tg = 7 if "333" in first else 8
        ok("telefon: «Shaxsiy» darhol belgilaydi", card(adm, tg).get("personal") is True, first)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
