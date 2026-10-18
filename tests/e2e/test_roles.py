# 7-etap: Katta menejer (yo'nalish rahbari), huquqlar (kassa, foyda, tasdiq chegarasi), mijozning mas'ul menejeri
import asyncio, json
from common import *  # noqa: F401,F403

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])
def emp(adm, i): return [e for e in kv("uvix:employees", adm) if e["id"] == i][0]

async def main():
    adm = admin_token()
    # Ikkinchi operator: Bobur (UVIXPRINT)
    el = kv("uvix:employees", adm)
    el.append({"id": "bobur", "name": "Bobur Olimov", "role": "operator", "pin": "3333", "line": "UVIXPRINT"})
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Xodimlar")
        await d.locator("[data-emp-edit=aziza]").click(); await d.wait_for_timeout(400)
        await d.locator("[data-testid=emp-role]").select_option("manager"); await d.wait_for_timeout(200)
        # Istisno: tasdiqlash chegarasi 500 000, kassa qoldiqlari — yo'q
        await d.locator("[data-testid=override-add]").click(); await d.locator("[data-testid=override-pick]").select_option("approve.limit"); await d.wait_for_timeout(200)
        await d.locator("[data-override='approve.limit'] [data-testid='perm-approve.limit']").click(); await d.wait_for_timeout(150)
        await d.locator("[data-testid='perm-approve.limit-sum']").fill("500000")
        await d.locator("[data-testid=override-add]").click(); await d.locator("[data-testid=override-pick]").select_option("kassa.view"); await d.wait_for_timeout(200)
        await d.locator("[data-override='kassa.view'] [data-testid='perm-kassa.view']").click(); await d.wait_for_timeout(150)
        await d.screenshot(path=OUT + "roles_rights.png")
        await d.locator("[data-testid=emp-rights-save]").click(); await d.wait_for_timeout(1200)
        a = emp(adm, "aziza")
        ok("Aziza → Katta menejer, chegara 500 000, kassa yopiq", a["role"] == "manager" and a.get("permOver") == {"approve.limit": 500000, "kassa.view": "none"} and not a.get("perm"), a)
        ok("Xodimlar: istisno belgisi", await d.locator("tr", has_text="Aziza").locator("[data-perm=over][data-n='2']").count() == 1)
        # Mijoz Malika Interior → mas'ul Aziza
        await nav(d, "Mijozlar"); await d.wait_for_timeout(800)
        await d.locator("text=Malika Interior").first.click(); await d.wait_for_timeout(500)
        await d.locator("[data-testid=customer-card] button", has_text="Tahrirlash").first.click(); await d.wait_for_timeout(400)
        await d.locator("[data-testid=cust-manager-select]").select_option("aziza")
        await d.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await d.wait_for_timeout(1200)
        c1 = [c for c in kv("uvix:customers", adm) if c["id"] == "c1"][0]
        ok("mijoz: mas'ul menejer saqlandi", c1.get("managerId") == "aziza", c1)

        # ---------- Tasdiqlash: Bobur so'rov yuboradi ----------
        bo = api("/api/auth/login", {"employeeId": "bobur", "pin": "3333"})["token"]
        small = api("/api/approvals", {"kind": "payment_edit", "orderId": "o2", "paymentId": "p2", "amount": 100000, "reason": "xato yozilgan"}, bo)["approval"]
        big = api("/api/approvals", {"kind": "payment_delete", "orderId": "o6", "paymentId": "p6", "reason": "qaytarildi"}, bo)["approval"]
        az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
        ap = {r["id"]: r for r in api("/api/approvals", token=az)["approvals"]}
        ok("katta menejer: kichik so'rovni hal qila oladi, kattasini — yo'q", ap.get(small["id"], {}).get("canDecide") is True and ap.get(big["id"], {}).get("canDecide") in (False, None), ap)
        r = api(f"/api/approvals/{big['id']}/approve", {}, az)
        ok("chegaradan katta so'rov — 403", r.get("_code") == 403, r)
        ok("operator so'rovni tasdiqlay olmaydi", api(f"/api/approvals/{small['id']}/approve", {}, bo).get("_code") == 403)

        # ---------- Aziza (Katta menejer) ekrani ----------
        m = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await dlogin(m, "Aziza", "1234"); await m.wait_for_timeout(1500)
        ok("kassa huquqi yo'q: qoldiqlar ko'rinmaydi", await m.locator("[data-testid=hero-balances]").count() == 0)
        ok("Hisobot bo'limi ochiq (o'z yo'nalishi)", await m.locator(".uvix-nav-item", has_text="Hisobot").count() == 1)
        card = m.locator("[data-testid=approvals-card]")
        ok("tasdiqlash kartasi: faqat chegaradagi so'rov", await card.count() == 1 and await card.locator(f"[data-approval='{small['id']}']").count() == 1 and await card.locator(f"[data-approval='{big['id']}']").count() == 0)
        await m.screenshot(path=OUT + "roles_manager.png")
        await card.locator(f"[data-approval='{small['id']}'] button", has_text="Tasdiqlash").click(); await m.wait_for_timeout(1500)
        pay = [x for x in [o for o in kv("uvix:orders", adm) if o["id"] == "o2"][0]["payments"] if x["id"] == "p2"][0]
        ok("katta menejer tasdiqladi → to'lov 100 000", pay["amount"] == 100000 and pay.get("approvedBy") == "Aziza Karimova", pay)
        # Bobur yaratgan buyurtma katta menejerga ko'rinadi (operatorga faqat o'ziniki)
        ol = kv("uvix:orders", adm)
        ol.append({"id": "b1", "orderNumber": "UV-261016-009", "date": "2026-10-16", "customer": "Bobur mijozi", "subcategory": "UVIXPRINT", "title": "Banner", "agreementUzs": 100000, "payments": [], "createdBy": "Bobur Olimov", "createdAt": "2026-10-16T08:00:00Z", "prodStage": "new"})
        dbset("uvix:orders", ol)
        await m.reload(); await m.wait_for_timeout(2500)
        await nav(m, "Buyurtmalar")
        rows = await m.evaluate("[...document.querySelectorAll('tr.uvix-row')].map(r => r.innerText.split('\\n')[0]).join(' | ')")
        ok("katta menejer: boshqa xodim buyurtmasi ham ko'rinadi", "UV-261016-009" in rows, rows)

        # ---------- Bobur (operator): Aziza'ga biriktirilgan mijoz ko'rinmaydi ----------
        o = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); o.on("pageerror", lambda e: errs.append("O:" + str(e)))
        await dlogin(o, "Bobur", "3333"); await o.wait_for_timeout(1200)
        await nav(o, "Mijozlar"); await o.wait_for_timeout(800)
        body = await o.locator("body").inner_text()
        ok("operator: boshqa menejer mijozi ko'rinmaydi", "Malika Interior" not in body and "Bobur mijozi" in body, body[:400])
        await b.close()
    # Operator mas'ulni o'zgartira olmaydi (server)
    cl = kv("uvix:customers", bo)
    c1 = [c for c in cl if c["id"] == "c1"][0] if any(c["id"] == "c1" for c in cl) else None
    if c1:
        api("/api/kv/uvix:customers/merge", {"upserts": [{"item": {**c1, "managerId": "bobur"}}], "deletes": []}, bo)
    ok("server: operator mas'ulni o'zgartira olmaydi", [c for c in kv("uvix:customers", adm) if c["id"] == "c1"][0].get("managerId") == "aziza")
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
