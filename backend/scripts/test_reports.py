"""Smoke-test all Reports API endpoints. Run: python scripts/test_reports.py"""

from __future__ import annotations

import sys
from datetime import date, timedelta

import httpx

BASE = "http://localhost:8000/api/v1"
EMAIL = "admin@komart.com"
PASSWORD = "password"

END_DATE = date.today().isoformat()
START_DATE = (date.today() - timedelta(days=30)).isoformat()
RANGE = f"start_date={START_DATE}&end_date={END_DATE}"


def main() -> int:
    failed = 0
    with httpx.Client(base_url=BASE, timeout=30.0) as client:
        login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if login.status_code != 200:
            print(f"LOGIN FAIL {login.status_code}: {login.text}")
            return 1
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        endpoints = [
            f"/reports/sales-summary?{RANGE}",
            f"/reports/sales-by-payment-method?{RANGE}",
            f"/reports/revenue?{RANGE}",
            f"/reports/top-products?{RANGE}",
            f"/reports/sales-by-category?{RANGE}",
            "/reports/inventory-summary",
            "/reports/expiring-products?page=1&page_size=10",
            "/reports/low-stock?page=1&page_size=10",
            f"/reports/profit-summary?{RANGE}",
            f"/reports/margin-by-category?{RANGE}",
            f"/reports/purchasing-by-supplier?{RANGE}",
            f"/reports/purchase-orders-summary?{RANGE}",
            f"/reports/top-customers?{RANGE}",
            f"/reports/loyalty-summary?{RANGE}",
            f"/reports/sales-by-hour?{RANGE}",
            f"/reports/sales-by-day-of-week?{RANGE}",
            f"/reports/sales-by-cashier?{RANGE}",
            "/reports/dead-stock?days=30",
        ]

        for path in endpoints:
            res = client.get(path, headers=headers)
            status = "OK" if res.status_code == 200 else "FAIL"
            print(f"{status} {path} -> {res.status_code}")
            if res.status_code != 200:
                print(f"  {res.text[:200]}")
                failed += 1

    print(f"\n{len(endpoints) - failed}/{len(endpoints)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
