# Global Audit Logging — Migration Notes

**Date:** June 2026  
**Feature:** Priority 1 #4 — Global audit logging  
**Breaking changes:** None

---

## Overview

Centralized audit trail for security-sensitive and business-critical actions. Complements inventory-specific `stock_adjustments` history with a unified `audit_logs` collection.

## Backend

| Component | Path |
|-----------|------|
| Model | `backend/app/models/audit_log.py` |
| Service | `backend/app/services/audit.py` |
| API | `backend/app/routers/audit_logs.py` |
| Request ID | `X-Request-ID` middleware in `main.py` |

### Logged modules

| Module | Actions |
|--------|---------|
| `auth` | `login`, `logout` |
| `products` | `create`, `update`, `price_change`, `delete` |
| `inventory` | `receive`, `adjust` |
| `sales` | `create` |
| `purchase_orders` | `create`, `update`, `status_change`, `receive` |
| `settings` | `update` |
| `users` | `create`, `update`, `deactivate` |

### API

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/v1/audit-logs` | Manager+ |
| GET | `/api/v1/audit-logs/{id}` | Manager+ |

Query filters: `module`, `action`, `user_id`, `entity_type`, `entity_id`, `start_date`, `end_date`, pagination.

### Security

- Passwords and tokens redacted in `previous_value` / `new_value`
- IP from `X-Forwarded-For` when present
- Browser/device parsed from `User-Agent`

## Frontend

| File | Change |
|------|--------|
| `services/index.ts` | `auditLogService` |
| `hooks/useAuditLogs.ts` | **New** |
| `pages/settings/tabs/AuditLogsTab.tsx` | **New** — Settings → Audit Logs |
| `types/index.ts` | `AuditLog` types |
| `constants/index.ts` | `AUDIT_MODULE_LABELS`, query keys |

## Database

New collection: `audit_logs` with indexes on `created_at`, `module`, `user_id`, `entity_type`+`entity_id`, `action`, `request_id`.

No migration script required — collection created on first insert.

## Manual Test Checklist

- [ ] Login as manager → Settings → Audit Logs tab visible
- [ ] Login as cashier → Audit Logs tab hidden; API returns 403
- [ ] Create product → audit row with `module=products`, `action=create`
- [ ] Update store settings (admin) → `module=settings`
- [ ] Filter by module and date range
- [ ] Click row → detail dialog shows previous/new JSON
- [ ] Login/logout → `module=auth` entries with IP and browser

## Retention

No automatic purge in v1. Plan archival/TTL policy for production if volume grows.
