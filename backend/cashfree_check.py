# backend/cashfree_check.py  -- TEMPORARY DIAGNOSTIC, delete it afterwards.
#
# Run from the backend folder (venv active):   python cashfree_check.py
#
# It creates three small TEST orders in your Cashfree SANDBOX (one per API
# version) and writes cashfree_check.html next to it.
# Open that HTML file in Chrome and press each button to see which kind of
# session id Cashfree's checkout accepts. It never prints your keys.

import json
import sys
import uuid

import requests
from decouple import config

APP_ID = config("CASHFREE_APP_ID", default="")
SECRET = config("CASHFREE_SECRET_KEY", default="")
API_VERSION = config("CASHFREE_API_VERSION", default="2025-01-01")
BACKEND = config("PUBLIC_BACKEND_URL", default="https://lavernaevents.onrender.com").rstrip("/")
RETURN_URL = config("FRONTEND_URL", default="https://lavernaevents.pages.dev").rstrip("/") + "/payment/success?session_id={order_id}"

if not APP_ID or not SECRET:
    sys.exit("CASHFREE_APP_ID / CASHFREE_SECRET_KEY are missing in backend/.env")

HEADERS = {
    "x-client-id": APP_ID,
    "x-client-secret": SECRET,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
}


def create(label, with_notify, version=None):
    order_id = f"DIAG_{uuid.uuid4().hex[:20]}"
    meta = {"return_url": RETURN_URL.format(order_id=order_id)}
    if with_notify:
        meta["notify_url"] = f"{BACKEND}/api/payments/webhook/"

    headers = dict(HEADERS)
    if version:
        headers["x-api-version"] = version

    reply = requests.post(
        "https://sandbox.cashfree.com/pg/orders",
        headers=headers,
        timeout=20,
        json={
            "order_id": order_id,
            "order_amount": 10.0,
            "order_currency": "INR",
            "customer_details": {"customer_id": "diag_user", "customer_phone": "9999999999"},
            "order_meta": meta,
        },
    )
    print(f"[{label}] HTTP {reply.status_code}")

    if reply.status_code >= 400:
        print("   Cashfree said:", reply.text[:300])
        return []

    session = reply.json().get("payment_session_id", "")
    print(f"   session id length={len(session)}  ends with {session[-20:]!r}")
    print(f"   ends with 'paymentpayment': {session.endswith('paymentpayment')}")

    return [(f"{label} (session id exactly as returned)", session)]


buttons = (
    create("A: no webhook address (return_url only)", False)
    + create("B: with webhook address (notify_url)", True)
)

html = """<!doctype html><meta charset="utf-8"><title>Cashfree check</title>
<body style="font-family:sans-serif;max-width:640px;margin:2rem auto">
<h2>Cashfree sandbox check</h2><p>Press a button. A new tab should show the payment page.</p>
<div id="b"></div>
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<script>
const items = %s;
const cf = Cashfree({ mode: "sandbox" });
const box = document.getElementById("b");
items.forEach(([label, id]) => {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = "display:block;margin:10px 0;padding:10px";
  btn.onclick = () => cf.checkout({ paymentSessionId: id, redirectTarget: "_blank" });
  box.appendChild(btn);
});
</script></body>""" % json.dumps(buttons)

with open("cashfree_check.html", "w", encoding="utf-8") as handle:
    handle.write(html)

print("\nNow open cashfree_check.html in Chrome and press each button.")
print("Delete cashfree_check.py and cashfree_check.html afterwards.")