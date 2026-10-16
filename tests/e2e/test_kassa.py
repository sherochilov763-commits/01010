# 9-etap: alohida kassalar (yo'nalish × to'lov turi), umumiy rasxod — qaysi kassadan, ichki o'tkazma
import asyncio, datetime, json
from common import *  # noqa: F401,F403
TODAY = datetime.date.today().isoformat()

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])
f = lambda v: ("−" if v < 0 else "") + f"{abs(round(v)):,}".replace(",", " ")

async def main():
    adm = admin_token()
    lst = orders(adm)
    lst.append({"id": "x1", "orderNumber": "ON-261015-001", "date": TODAY, "customer": "Oniks Mijoz", "subcategory": "UVONYX", "title": "Oniks stol", "agreementUzs": 1000000,
                "payments": [{"id": "px1", "amount": 400000, "date": TODAY, "paymentType": "karta", "createdBy": "Administrator"}], "createdBy": "Administrator", "createdAt": "2026-10-15T10:00:00Z", "prodStage": "new"})
    dbset("uvix:orders", lst)
    dbset("uvix:transactions", [
        {"id": "e1", "type": "chiqim", "date": TODAY, "amount": 50000, "paymentType": "karta", "category": "Material", "line": "UVONYX", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
        {"id": "e2", "type": "chiqim", "date": TODAY, "amount": 1000000, "paymentType": "naqd", "category": "Ijara", "line": "common", "paidFrom": "UVONYX", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
        {"id": "e3", "type": "chiqim", "date": TODAY, "amount": 100000, "paymentType": "naqd", "category": "Kommunal", "line": "common", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
    ])
    uv_cash = sum(p["amount"] for o in lst if o.get("subcategory") != "UVONYX" and not o.get("deletedAt") for p in o.get("payments", []) if not p.get("deletedAt") and p.get("paymentType", "naqd") == "naqd") - 100000
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Kassalar"); await d.wait_for_timeout(1200)
        bal = lambda key: d.locator(f"[data-kassa-row='{key}'] [data-bal]").inner_text()
        ok("UVONYX karta: 400 000 − 50 000", await bal("UVONYX:karta") == f(350000), await bal("UVONYX:karta"))
        ok("UVONYX naqd: ijara shu kassadan (−1 000 000)", await bal("UVONYX:naqd") == f(-1000000), await bal("UVONYX:naqd"))
        ok("UVIXPRINT naqd: to'lovlar − belgilanmagan umumiy rasxod", await bal("UVIXPRINT:naqd") == f(uv_cash), (await bal("UVIXPRINT:naqd"), f(uv_cash)))
        await d.screenshot(path=OUT + "kassa_before.png")
        await d.locator("[data-testid=transfer-new]").click(); await d.wait_for_timeout(400)
        await d.locator("[data-testid=tr-amount]").fill("1000000")
        await d.locator(".uvix-modal-panel input:not([data-testid])").last.fill("ijara uchun")
        await d.locator("[data-testid=tr-save]").click(); await d.wait_for_timeout(1200)
        ok("o'tkazmadan keyin UVONYX naqd = 0, UVIXPRINT naqd −1 mln", await bal("UVONYX:naqd") == "0" and await bal("UVIXPRINT:naqd") == f(uv_cash - 1000000), (await bal("UVONYX:naqd"), await bal("UVIXPRINT:naqd")))
        tr = kv("uvix:transfers", adm)
        ok("o'tkazma saqlandi (kim, qayerdan, qayerga)", len(tr) == 1 and tr[0]["from"] == {"line": "UVIXPRINT", "type": "naqd"} and tr[0]["to"] == {"line": "UVONYX", "type": "naqd"} and tr[0]["amount"] == 1000000 and tr[0]["createdBy"] == "Administrator", tr)
        await d.screenshot(path=OUT + "kassa_after.png")
        # Rahbar: umumiy rasxodda «Qaysi kassadan» tanlovi
        await nav(d, "Rasxod")
        await d.locator("button", has_text="Yangi rasxod").click(); await d.wait_for_timeout(500)
        await d.locator("[data-testid=tx-line] [data-line=common]").click(); await d.wait_for_timeout(200)
        ok("umumiy rasxod: «Qaysi kassadan to'landi» tanlovi", await d.locator("[data-testid=tx-paid-from] [data-line=UVONYX]").count() == 1)
        await b.close()
    # Katta menejer (UVONYX, kassa huquqi bilan) — faqat o'z kassasi; operator o'tkazma yoza olmaydi
    el = kv("uvix:employees", adm)
    for e in el:
        if e["id"] == "aziza": e.update({"role": "manager", "line": "UVONYX", "perm": {"cash": True, "profit": True, "approveLimit": 0}})
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    ok("menejer: o'z yo'nalishiga tegishli o'tkazmani ko'radi", len(kv("uvix:transfers", az)) == 1)
    r = api("/api/kv/uvix:transfers", {"value": "[]"}, az, method="PUT")
    ok("rahbardan boshqa hech kim o'tkazma yoza olmaydi", r.get("_code") == 403 and len(kv("uvix:transfers", adm)) == 1, r)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        m = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await dlogin(m, "Aziza", "1234")
        await nav(m, "Kassalar"); await m.wait_for_timeout(1200)
        ok("menejer: faqat UVONYX kassasi, o'tkazma tugmasi yo'q", await m.locator("[data-kassa=UVONYX]").count() == 1 and await m.locator("[data-kassa=UVIXPRINT]").count() == 0 and await m.locator("[data-testid=transfer-new]").count() == 0)
        ok("menejer: UVONYX naqd 0 (ijara − o'tkazma)", await m.locator("[data-kassa-row='UVONYX:naqd'] [data-bal]").inner_text() == "0")
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
