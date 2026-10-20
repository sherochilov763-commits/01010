# Umumiy yordamchilar: haqiqiy backend (E2E_BASE) va Playwright bilan sinov
import json, os, sqlite3, sys, urllib.request, urllib.error
from playwright.async_api import async_playwright  # noqa: F401 (to'plamlar shu yerdan oladi)

B = os.environ.get("E2E_BASE", "http://localhost:4990")
DB = os.environ.get("E2E_DB", "")
OUT = os.environ.get("E2E_OUT", os.path.join(os.path.dirname(__file__), "out")) + "/"
S = OUT
os.makedirs(OUT, exist_ok=True)

def api(path, body=None, token=None, method=None, raw=False):
    req = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, method=method or ("POST" if body is not None else "GET"),
                                 headers={"content-type": "application/json", **({"authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read(); return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        return {"_code": e.code, **json.loads(e.read() or b"{}")}

def dbset(key, val):
    c = sqlite3.connect(DB); c.execute("insert or replace into kv_store(key,value) values(?,?)", (key, json.dumps(val))); c.commit(); c.close()

OK = []
def ok(name, cond, info=""):
    OK.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name, "" if cond else info, flush=True)
def finish():
    n = sum(1 for _, c in OK if c)
    print(f"\n{n}/{len(OK)} o'tdi")
    sys.exit(0 if n == len(OK) and OK else 1)

def admin_token():
    aid = [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"]
    return api("/api/auth/login", {"employeeId": aid, "pin": "0000"})["token"]

LIST_DEFAULT = "localStorage.setItem('uvix_orders_view_def','list')"  # eski testlar «Ro'yxat» bilan boshlanadi

async def dlogin(pg, name, pin):
    await pg.goto(B); await pg.evaluate(LIST_DEFAULT); await pg.wait_for_selector("[data-testid=desktop-login]"); await pg.wait_for_timeout(400)
    await pg.locator("[data-testid=dl-person]").click(); await pg.wait_for_timeout(200)
    await pg.locator(".dl-options button", has_text=name).first.click(); await pg.wait_for_timeout(200)
    await pg.keyboard.type(pin); await pg.keyboard.press("Enter")
    await pg.wait_for_selector("[data-testid=desktop-login]", state="detached", timeout=10000); await pg.wait_for_timeout(1500)

async def mob_login(pg, name, pin):
    await pg.goto(B); await pg.evaluate(LIST_DEFAULT); await pg.wait_for_selector(".ul-person, .ul-pad", timeout=15000)
    if await pg.locator(".ul-person").count(): await pg.locator(".ul-person", has_text=name).click()
    for d in pin: await pg.locator(f".ul-key[aria-label='{d}']").click()
    await pg.locator(".ul-primary", has_text="Kirish").click()

async def nav(pg, name):
    await pg.evaluate(f"[...document.querySelectorAll('.uvix-nav-item')].find(b=>b.textContent.trim().startsWith({name!r})).click()"); await pg.wait_for_timeout(1100)

async def close_modal(pg):
    await pg.locator(".uvix-modal-panel [aria-label=Yopish]").last.click(); await pg.wait_for_timeout(500)

# ---- Buyurtma/jurnal yordamchilari ----
def orders(tok): return json.loads(api("/api/kv/uvix:orders", token=tok)["value"])
def order(tok, num): return [o for o in orders(tok) if o["orderNumber"] == num][0]
def audit(tok): return json.loads(api("/api/kv/uvix:audit", token=tok)["value"])
async def open_payments(pg, num):
    row = pg.locator("tr.uvix-row", has_text=num)
    await row.hover(); await row.locator("[aria-label=\"To'lovlar\"]").click(); await pg.wait_for_timeout(500)

# ---- Ishchi: «Surib yakunlang» va kartani o'ngga surish (5 soniya «Bekor qilish» bilan) ----
async def slide_done(pg, slider, commit=True):
    knob = slider.locator("[role=slider]")
    kb = await knob.bounding_box(); sb = await slider.bounding_box()
    y = kb["y"] + kb["height"] / 2
    await pg.mouse.move(kb["x"] + kb["width"] / 2, y); await pg.mouse.down()
    end = sb["x"] + sb["width"] - 10
    for i in range(1, 13): await pg.mouse.move(kb["x"] + kb["width"] / 2 + (end - kb["x"]) * i / 12, y); await pg.wait_for_timeout(15)
    await pg.mouse.up(); await pg.wait_for_timeout(300)
    if commit: await pg.wait_for_timeout(5600)

async def swipe_card(pg, card, commit=True):
    bb = await card.bounding_box()
    await pg.mouse.move(bb["x"] + 30, bb["y"] + bb["height"] / 2); await pg.mouse.down()
    for i in range(1, 8): await pg.mouse.move(bb["x"] + 30 + i * 20, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(20)
    await pg.mouse.up(); await pg.wait_for_timeout(400)
    if commit: await pg.wait_for_timeout(5600)
