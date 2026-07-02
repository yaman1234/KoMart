# Migration: Refresh Token Authentication

**Date:** June 2026  
**Feature:** Priority 1 — Refresh Token Authentication  
**Breaking changes:** None for existing API consumers that read `access_token` only

---

## Summary

Adds long-lived refresh tokens with rotation, revocation, and multi-device session support.

## Database Changes

### New collection: `refresh_tokens`

| Field | Type | Notes |
|-------|------|-------|
| `user_id` | string | User reference |
| `token_hash` | string | SHA-256 of plain refresh token (unique index) |
| `family_id` | string | Rotation family for reuse detection |
| `device_label` | string | Truncated user-agent |
| `user_agent` | string | Full UA (max 512 chars) |
| `ip_address` | string | Client IP |
| `expires_at` | datetime | Default 7 days |
| `revoked_at` | datetime | null when active |
| `replaced_by_hash` | string | Set when rotated |
| `created_at` | datetime | UTC |

**Migration action:** None required. Beanie creates collection and indexes on first startup.

**Rollback:** Drop collection `refresh_tokens` if reverting feature.

## Environment Variables

Add to `backend/.env`:

```env
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
```

Previous default access token TTL was 60 minutes. Existing deployments should update `.env` explicitly if they need a different value.

## API Changes

| Endpoint | Change |
|----------|--------|
| `POST /auth/login` | Response now includes `refresh_token`, `token_type`, `expires_in` |
| `POST /auth/refresh` | **New** — rotate refresh token, issue new access token |
| `POST /auth/logout` | **New** — revoke refresh token; `all_devices` requires access token |

## Frontend Changes

- `komart-auth` localStorage now stores `refreshToken`
- Axios interceptor auto-refreshes on 401
- Logout calls `POST /auth/logout` before clearing store

## Deployment Steps

1. Deploy backend (new model + endpoints)
2. Deploy frontend (refresh interceptor)
3. Set `REFRESH_TOKEN_EXPIRE_DAYS` in production env
4. Users must re-login once after deploy (no refresh token in old sessions)

## Risks

| Risk | Mitigation |
|------|------------|
| Old sessions without refresh token | User re-login on first 401 |
| Token reuse attack | Family revocation on detected reuse |
| Refresh token in localStorage | XSS risk — follow CSP best practices |

## Verification

```bash
cd backend
pytest tests/test_auth_refresh.py -v
```

Manual:

1. Login → verify `refresh_token` in network response
2. Wait for access expiry or force 401 → verify silent refresh
3. Logout → verify refresh token no longer works
