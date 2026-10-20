# Ikki yo'nalish: xodim o'z yo'nalishida (rahbar biriktiradi), server himoyasi, rahbar — hammasi (haqiqiy backend)
import asyncio, datetime, json
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
TODAY = datetime.date.today()
M = TODAY.strftime("%Y-%m")
D = lambda d: f"{M}-{d:02d}" if d <= TODAY.day else TODAY.isoformat()

def extra(adm):
    lst = orders(adm)
    for o in lst:
        if o["id"] == "o1": o["payments"] = [{"id": "p1", "amount": 600000, "date": D(1), "paymentType": "naqd", "createdBy": "Aziza Karimova"}]
    lst.append({"id": "x1", "orderNumber": "ON-261015-001", "date": D(1), "customer": "Oniks Mijoz", "subcategory": "UVONYX", "title": "Oniks stol", "materialType": "Oniks",
                "agreementUzs": 1000000, "payments": [{"id": "px1", "amount": 400000, "date": D(1), "paymentType": "karta", "createdBy": "Aziza Karimova"}],
                "createdBy": "Aziza Karimova", "createdAt": "2026-10-01T10:00:00.000Z", "manager": "Aziza Karimova", "prodStage": "new"})
    dbset("uvix:orders", lst)
    dbset("uvix:transactions", [
        {"id": "e1", "type": "chiqim", "date": D(1), "amount": 50000, "paymentType": "karta", "category": "Material", "subcategory": "Shisha", "line": "UVONYX", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
        {"id": "e2", "type": "chiqim", "date": D(1), "amount": 1000000, "paymentType": "naqd", "category": "Ijara", "subcategory": "Sex", "line": "common", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
        {"id": "e3", "type": "chiqim", "date": D(1), "amount": 70000, "paymentType": "naqd", "category": "Kraska", "subcategory": "UV kraska", "line": "UVIXPRINT", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
    ])

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])
async def rows(pg):
    return await pg.evaluate("[...document.querySelectorAll('tr.uvix-row')].map(r => r.innerText.split('\\n')[0]).join(' | ')")

async def main():
    adm = admin_token()
    extra(adm)
    errs = []
    inc = {"UVIXPRINT": 0, "UVONYX": 0}
    for o in orders(adm):
        for pmt in o.get("payments", []):
            if str(pmt.get("date", "")).startswith(M) and not pmt.get("deletedAt"): inc["UVONYX" if o.get("subcategory") == "UVONYX" else "UVIXPRINT"] += pmt["amount"]
    on_share = inc["UVONYX"] / (inc["UVONYX"] + inc["UVIXPRINT"])

    # ---------- Server: operator (yo'nalishi belgilanmagan → UVIXPRINT) ----------
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    ao = kv("uvix:orders", az)
    ok("server: UVIXPRINT xodimiga ON buyurtma berilmaydi", ao and all(o.get("subcategory") != "UVONYX" for o in ao), [o["orderNumber"] for o in ao])
    at = kv("uvix:transactions", az)
    ok("server: rasxod — o'zi + umumiy (UVONYX'niki yo'q)", sorted(t["id"] for t in at) == ["e2", "e3"], [t["id"] for t in at])
    e2 = [t for t in at if t["id"] == "e2"][0]
    ok("server: umumiy rasxodda shu oy ulushi", abs(e2.get("_lineShare", -1) - (1 - on_share)) < 1e-9, e2)
    ok("rahbar: hammasini oladi", len(kv("uvix:transactions", adm)) == 3 and any(o.get("subcategory") == "UVONYX" for o in orders(adm)))

    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        ok("rahbar: almashtirish kartasi va rangli chiziq yo'q", await d.locator("[data-testid=line-card]").count() == 0 and await d.locator("[data-testid=line-stripe]").count() == 0)
        # «Foyda va zarar» endi Kassalar → «Foyda va zarar» yorlig'ida; Dashboard'da ixcham «Pul va foyda» kartasi
        ok("Dashboard: «Pul va foyda» kartasi", await d.locator("[data-testid=money-card]").count() == 1)
        await nav(d, "Kassalar"); await d.locator("[data-tab=pnl]").click(); await d.wait_for_timeout(1000)
        pnl = d.locator("[data-testid=pnl]")
        cell = lambda row, col: pnl.locator(f"[data-pnl-row={row}] [data-col={col}]").inner_text()
        f = lambda v: f"{round(v):,}".replace(",", " ")
        on_common = 1000000 - round(1000000 * (1 - on_share))
        on_profit = inc["UVONYX"] - 50000 - on_common
        ok("Foyda va zarar: rahbarda bor", await pnl.count() == 1)
        ok("P&L UVONYX: tushum, to'g'ridan, umumiy ulush, sof foyda",
           await cell("income", "UVONYX") == f(inc["UVONYX"]) and await cell("direct", "UVONYX") == "−" + f(50000) and await cell("common", "UVONYX") == "−" + f(on_common) and (await cell("profit", "UVONYX")).replace("−", "-") == f(on_profit).replace(" ", " ") if on_profit >= 0 else (await cell("profit", "UVONYX")) == "−" + f(-on_profit),
           [await cell(r, "UVONYX") for r in ("income", "direct", "common", "profit")])
        ok("P&L Jami: umumiy rasxod to'liq 1 000 000", await cell("common", "total") == "−1 000 000")
        await pnl.screenshot(path=OUT + "lines_pnl.png")
        # Umumiy yo'nalish tanlovi (menyu tepasida): Barchasi / UVIXPRINT / UVONYX / Yonma-yon
        await nav(d, "Dashboard")
        g = d.locator("[data-testid=line-selector]")
        ok("yo'nalish tanlovi: 4 holat", await g.count() == 1 and await g.locator("[data-line-opt]").count() == 4)
        await g.locator("[data-line-opt=UVONYX]").click(); await d.wait_for_timeout(600)
        dash = await d.locator(".uvix-hero").first.inner_text()
        exp_cash = f"-{round(1000000 * on_share) - 350000:,}".replace(",", " ")
        now_txt = (await d.locator("[data-testid=money-now]").inner_text()).replace("−", "-")
        ok("Dashboard UVONYX: buyurtma 1 000 000; kassa = 400 000 − 50 000 − ijara (UVIXPRINT kassasidan to'langan)", "1 000 000" in dash and now_txt == "350 000", (now_txt, dash[:300]))
        ok("rangli chiziq (UVONYX)", await d.locator("[data-testid=line-strip]").count() == 1)
        await g.locator("[data-line-opt=split]").click(); await d.wait_for_timeout(600)
        ok("Yonma-yon: taqqoslash jadvali", await d.locator("[data-testid=split-compare] [data-cmp-row]").count() >= 4)
        await g.locator("[data-line-opt=all]").click(); await d.wait_for_timeout(400)
        ok("rahbar: Bo'yoq ombori bor", await d.locator(".uvix-nav-item", has_text="Bo'yoq").count() == 1)
        await nav(d, "Rasxod")
        await d.locator("[data-testid=exp-line] [data-line=common]").click(); await d.wait_for_timeout(400)
        t = await d.locator("table").first.inner_text()
        ok("Rasxod filtri «Umumiy»: faqat ijara", "1 000 000" in t and "50 000" not in t and "70 000" not in t, t)
        await d.locator("[data-testid=exp-line] [data-line=all]").click()
        await nav(d, "Buyurtmalar")
        r = await rows(d)
        ok("rahbar: Buyurtmalarda ikkala yo'nalish", "ON-261015-001" in r and "UV-261013-003" in r, r)
        # Xodimlar: Aziza → UVONYX
        await nav(d, "Xodimlar")
        sel = d.locator("[data-emp-line=aziza] select")
        ok("Xodimlar: yo'nalish ustuni (standart UVIXPRINT)", await sel.count() == 1 and await sel.input_value() == "UVIXPRINT")
        await d.screenshot(path=OUT + "lines_employees.png")
        await sel.select_option("UVONYX"); await d.wait_for_timeout(1200)
        emp = [e for e in kv("uvix:employees", adm) if e["id"] == "aziza"][0]
        ok("saqlandi: Aziza → UVONYX", emp.get("line") == "UVONYX", emp)
        # Noto'g'ri qiymat server tomonda tashlab yuboriladi
        el = kv("uvix:employees", adm)
        for e in el:
            if e["id"] == "jasur": e["line"] = "HACK"
        api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
        ok("server: noto'g'ri yo'nalish qabul qilinmaydi", "line" not in [e for e in kv("uvix:employees", adm) if e["id"] == "jasur"][0])

        # ---------- Operator (UVONYX) telefonda ----------
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Aziza", "1234"); await m.wait_for_selector(".uvix-bottomnav", timeout=15000); await m.wait_for_timeout(1500)
        ok("telefon: almashtirish yorlig'i yo'q", await m.locator("[data-testid=line-pill]").count() == 0)
        await m.screenshot(path=OUT + "lines_today.png")
        # ---------- Operator (UVONYX) kompyuterda ----------
        a = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); a.on("pageerror", lambda e: errs.append("A:" + str(e)))
        await dlogin(a, "Aziza", "1234")
        ok("operator: Bo'yoq ombori yo'q (UVONYX)", await a.locator(".uvix-nav-item", has_text="Bo'yoq").count() == 0)
        ok("operator: Dashboard tugmalari yo'q, UVONYX belgisi", await a.locator("[data-testid=dash-line]").count() == 0 and await a.locator(".uvix-hero [data-line-tag=UVONYX]").count() == 1)
        await nav(a, "Buyurtmalar")
        r = await rows(a)
        ok("operator: faqat ON- buyurtma", "ON-261015-001" in r and "UV-" not in r, r)
        await a.screenshot(path=OUT + "lines_orders.png")
        await nav(a, "Rasxod")
        await a.locator("button", has_text="Yangi rasxod").click(); await a.wait_for_timeout(500)
        ok("yangi rasxod: «Kimga tegishli» tanlovi yo'q", await a.locator("[data-testid=tx-line]").count() == 0)
        await a.locator(".uvix-modal-panel input[inputmode=numeric], .uvix-modal-panel input[placeholder='0']").first.fill("120000")
        await a.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await a.wait_for_timeout(1200)
        txt = await a.locator("body").inner_text()
        ok("operator Rasxod: o'zi kiritgani ko'rinadi", "120 000" in txt)
        tx = kv("uvix:transactions", adm)
        nw = [t for t in tx if t["id"] not in ("e1", "e2", "e3")]
        ok("saqlandi: line = UVONYX; boshqa rasxodlar joyida", len(nw) == 1 and nw[0].get("line") == "UVONYX" and nw[0]["amount"] == 120000 and len(tx) == 4, [(t["id"], t.get("line")) for t in tx])
        await b.close()

    # ---------- Server himoyasi: UVONYX xodimi ----------
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    mine = kv("uvix:transactions", az)
    api("/api/kv/uvix:transactions", {"value": json.dumps([t for t in mine if t["id"] != "e2"])}, az, method="PUT")
    ids = sorted(t["id"] for t in kv("uvix:transactions", adm))
    ok("PUT: ko'rinmagan UVIXPRINT va umumiy rasxod o'chmaydi", "e3" in ids and "e2" in ids, ids)
    o1 = order(adm, "UV-261013-003") if any(o["orderNumber"] == "UV-261013-003" for o in orders(adm)) else None
    if o1:
        r = api("/api/kv/uvix:orders/merge", {"upserts": [{"item": {**o1, "agreementUzs": 1}}], "deletes": []}, az)
        ok("merge: boshqa yo'nalish buyurtmasini o'zgartirib bo'lmaydi", order(adm, "UV-261013-003")["agreementUzs"] == o1["agreementUzs"] and all(o.get("subcategory") == "UVONYX" for o in json.loads(r["value"])))
        r = api(f"/api/orders/{o1['id']}/stage", {"stage": "ready"}, az)
        ok("holat: boshqa yo'nalish buyurtmasi — «topilmadi»", r.get("_code") == 404, r)
    r = api("/api/quotes/convert", {"customer": "Yangi Oniks", "subcategory": "UVIXPRINT", "items": [{"id": "i1", "unit": "lump", "title": "Oniks panno", "price": 500000}], "payments": [{"amount": 500000, "paymentType": "naqd"}]}, az)
    nums = [o["orderNumber"] for o in r.get("orders", [])]
    ok("smeta→buyurtma: UVONYX xodimi — har doim ON-", len(nums) == 1 and nums[0].startswith("ON-"), r)
    me = api("/api/auth/me", token=az)
    ok("/api/auth/me: yo'nalish qaytadi", me.get("employee", {}).get("line") == "UVONYX", me)
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
