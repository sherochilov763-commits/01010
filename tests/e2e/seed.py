# Sinov ma'lumotlari: xodimlar (admin, operator, dizayner, pechatchi), mijozlar, Telegram lid, 6 ta buyurtma, 2 ta chat bildirishnomasi
import json, datetime
from common import api, dbset

api("/api/auth/bootstrap", {"name": "Administrator", "pin": "0000"})
aid = [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"]
tok = api("/api/auth/login", {"employeeId": aid, "pin": "0000"})["token"]
lst = json.loads(api("/api/kv/uvix:employees", token=tok)["value"]); have = {e["id"] for e in lst}
for e in [{"id": "aziza", "name": "Aziza Karimova", "role": "operator", "pin": "1234"}, {"id": "kamola", "name": "Kamola Sharipova", "role": "designer", "pin": "1111"}, {"id": "jasur", "name": "Jasur Aliyev", "role": "printer", "pin": "2222"}]:
    if e["id"] not in have: lst.append(e)
api("/api/kv/uvix:employees", {"value": json.dumps(lst)}, tok, "PUT")
st = json.loads(api("/api/kv/uvix:settings", token=tok).get("value") or "{}"); st["tgOnboardOffer"] = False
api("/api/kv/uvix:settings", {"value": json.dumps(st)}, tok, "PUT")

now = datetime.datetime.utcnow()
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
ago = lambda **kw: iso(now - datetime.timedelta(**kw))
def pay(i, amt, date): return {"id": f"p{i}", "amount": amt, "date": date, "paymentType": "naqd", "comment": "Avans", "createdBy": "Aziza Karimova", "createdAt": ago(days=1)}
O = lambda **k: {"subcategory": "UVIXPRINT", "createdBy": "Aziza Karimova", "createdAt": ago(days=2), "manager": "Aziza Karimova", **k}
orders = [
    O(id="o1", orderNumber="UV-261013-004", date="2026-10-13", customer="Malika Interior", title="Stiker (logotip)", materialType="Plyonka", area=1.2, agreementUzs=171000, payments=[pay(1, 89319, "2026-10-13")], prodStage="ready", readyAt=ago(hours=2), design={"assigneeId": "kamola", "status": "done"}, print={"assigneeId": "jasur", "status": "done"}),
    O(id="o2", orderNumber="UV-261013-003", date="2026-10-13", customer="Malika Interior", title="LED peshlavha", materialType="Akril", area=0.6, agreementUzs=228000, payments=[pay(2, 119091, "2026-10-12")], prodStage="printing", design={"assigneeId": "kamola", "status": "done"}, print={"assigneeId": "jasur", "status": "new"}),
    O(id="o3", orderNumber="UV-261013-002", date="2026-10-13", customer="Malika Interior", title="Oshxona fartugi", materialType="Shisha", area=2.4, agreementUzs=749700, payments=[pay(3, 391590, "2026-10-13")], prodStage="design", design={"assigneeId": "kamola", "status": "in_progress", "startedAt": ago(hours=1)}),
    O(id="o4", orderNumber="UV-261012-001", date="2026-10-12", customer="Jahongir Tursunov", title="Shisha 18 m²", materialType="Shisha", area=18, agreementUzs=3000000, payments=[pay(4, 1250000, "2026-10-12")], prodStage="new"),
    O(id="o5", orderNumber="UV-261009-001", date="2026-10-09", customer="Sardor Ahmedov", title="Oniks 24 m²", materialType="Oniks", area=24, agreementUzs=4500000, payments=[pay(5, 2500000, "2026-10-09")], prodStage="new"),
    O(id="o6", orderNumber="UV-261005-001", date="2026-10-05", customer="Nodira Xonim", title="Shisha 30 m²", materialType="Shisha", area=30, agreementUzs=6000000, payments=[pay(6, 6000000, "2026-10-05")], prodStage="delivered"),
]
r = api("/api/kv/uvix:orders", {"value": json.dumps(orders)}, tok, "PUT"); assert "value" in r, r
custs = [
    {"id": "c1", "key": "malika interior", "name": "Malika Interior", "phone": "+998 90 777 88 99", "telegram": "malika_int", "aliases": [], "createdAt": ago(days=5)},
    {"id": "c2", "key": "sardor ahmedov", "name": "Sardor Ahmedov", "phone": "+998 93 111 22 33", "aliases": [], "createdAt": ago(days=5)},
]
r = api("/api/kv/uvix:customers", {"value": json.dumps(custs)}, tok, "PUT"); assert "value" in r, r
leads = [{"id": "l1", "customer": "Malika Interior", "phone": "+998907778899", "telegramChatId": "777001", "telegramUsername": "malika_int", "stage": "won", "source": "telegram", "createdAt": ago(days=6), "createdBy": "Aziza Karimova"}]
r = api("/api/kv/uvix:leads", {"value": json.dumps(leads)}, tok, "PUT"); assert "value" in r, r
dbset("uvix:notifications", [
    {"id": "n1", "cat": "chats", "title": "Jahongir", "body": "Narxi qancha bo'ladi?", "view": "chats", "at": ago(minutes=5), "level": "info", "to": None},
    {"id": "n2", "cat": "chats", "title": "Dilshod", "body": "Salom", "view": "chats", "at": ago(minutes=3), "level": "info", "to": None},
])
print("seed ok", aid)
