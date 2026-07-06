#!/usr/bin/env python3
"""API regression smoke for reliability upgrade manual matrix."""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.user import User, UserRole

PREFIX = "/api/v1"


async def main() -> int:
    await init_db()
    results: list[tuple[str, str, str]] = []
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30) as client:
        token = None
        for email, pwd in [
            ("admin@komart.com", "changeme123"),
            ("admin@komart.com", "password"),
            ("manager@komart.com", "password"),
        ]:
            res = await client.post(f"{PREFIX}/auth/login", json={"email": email, "password": pwd})
            if res.status_code == 200:
                token = res.json()["access_token"]
                break
        if not token:
            user = User(
                email="regression-smoke@komart.com",
                name="Regression Smoke",
                hashed_password=hash_password("regression-pass"),
                role=UserRole.manager,
                is_active=True,
            )
            existing = await User.find_one(User.email == user.email)
            if existing:
                await existing.delete()
            await user.insert()
            res = await client.post(
                f"{PREFIX}/auth/login",
                json={"email": user.email, "password": "regression-pass"},
            )
            if res.status_code == 200:
                token = res.json()["access_token"]
        if not token:
            print("FAIL: Could not authenticate admin user")
            return 1

        headers = {"Authorization": f"Bearer {token}"}
        sku = f"REG-{uuid.uuid4().hex[:8]}"

        res = await client.post(
            f"{PREFIX}/products",
            json={
                "name": f"Regression {sku}",
                "sku": sku,
                "cost_price": 10,
                "selling_price": 20,
                "category": "Snacks",
                "low_stock_threshold": 5,
            },
            headers=headers,
        )
        pid = res.json().get("id") if res.status_code == 201 else None
        ok = res.status_code == 201 and res.json().get("stock") == 0
        results.append(("Create product (stock=0)", "PASS" if ok else "FAIL", str(res.status_code)))

        if pid:
            recv = await client.post(
                f"{PREFIX}/inventory/batches",
                json={
                    "product_id": pid,
                    "batch_number": f"REG-B-{sku}",
                    "quantity": 10,
                    "unit_cost": 12,
                    "selling_price": 22,
                },
                headers=headers,
            )
            product = (await client.get(f"{PREFIX}/products/{pid}", headers=headers)).json()
            stock = product.get("stock", 0)
            cost = product.get("cost_price")
            ok = recv.status_code == 201 and stock >= 10 and cost == 12
            results.append(
                ("Inventory receive (stock++, cost sync)", "PASS" if ok else "FAIL", f"stock={stock} cost={cost}"),
            )

        stats = await client.get(f"{PREFIX}/dashboard/stats", headers=headers)
        inv_val = stats.json().get("inventory_value") if stats.status_code == 200 else None
        results.append(
            ("Dashboard inventory value", "PASS" if inv_val is not None else "FAIL", str(inv_val)),
        )

        if pid:
            sale = await client.post(
                f"{PREFIX}/transactions",
                json={
                    "customer_name": "Walk-In",
                    "items": [
                        {
                            "product_id": pid,
                            "name": f"Regression {sku}",
                            "sku": sku,
                            "price": 20,
                            "quantity": 2,
                            "discount": 0,
                        },
                    ],
                    "subtotal": 40,
                    "discount": 0,
                    "tax": 0,
                    "total": 40,
                    "payment_method": "cash",
                    "created_by": "Regression",
                },
                headers=headers,
            )
            txn_id = sale.json().get("id") if sale.status_code == 201 else None
            stock_after = (await client.get(f"{PREFIX}/products/{pid}", headers=headers)).json().get("stock")
            ok = sale.status_code == 201 and stock_after is not None and stock_after < 10
            results.append(("POS sale (stock--)", "PASS" if ok else "FAIL", f"stock={stock_after}"))

            if txn_id:
                void = await client.post(
                    f"{PREFIX}/transactions/{txn_id}/void",
                    json={"reason": "Regression void"},
                    headers=headers,
                )
                txn = (await client.get(f"{PREFIX}/transactions/{txn_id}", headers=headers)).json()
                stock_void = (await client.get(f"{PREFIX}/products/{pid}", headers=headers)).json().get("stock")
                ok = void.status_code == 200 and txn.get("status") == "voided" and stock_void is not None and stock_void >= 8
                results.append(
                    ("Sale void (stock restored)", "PASS" if ok else "FAIL", f"status={txn.get('status')} stock={stock_void}"),
                )

        report = await client.get(f"{PREFIX}/reports/inventory-summary", headers=headers)
        results.append(
            ("Reports inventory-summary", "PASS" if report.status_code == 200 else "FAIL", str(report.status_code)),
        )

    print("=== API Regression Smoke ===")
    fails = 0
    for name, status, detail in results:
        print(f"[{status}] {name}: {detail}")
        if status == "FAIL":
            fails += 1
    print(f"--- {len(results) - fails}/{len(results)} API flows passed ---")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
