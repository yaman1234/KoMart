"""Refresh token issuance, rotation, and revocation."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import settings
from app.models.refresh_token import RefreshToken


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_plain_token() -> str:
    return secrets.token_urlsafe(48)


async def issue_refresh_token(
    user_id: str,
    *,
    device_label: str = "",
    user_agent: str = "",
    ip_address: str = "",
    family_id: str | None = None,
) -> tuple[str, RefreshToken]:
    """Create a new refresh token row and return (plain_token, document)."""
    plain = _new_plain_token()
    token_hash = _hash_token(plain)
    now = datetime.now(timezone.utc)
    doc = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        family_id=family_id or str(uuid4()),
        device_label=device_label,
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )
    await doc.insert()
    return plain, doc


async def revoke_token_family(family_id: str) -> None:
    now = datetime.now(timezone.utc)
    tokens = await RefreshToken.find(
        RefreshToken.family_id == family_id,
        RefreshToken.revoked_at == None,  # noqa: E711
    ).to_list()
    for token in tokens:
        await token.set({"revoked_at": now})


async def revoke_token_by_plain(plain_token: str) -> bool:
    token_hash = _hash_token(plain_token)
    doc = await RefreshToken.find_one(RefreshToken.token_hash == token_hash)
    if not doc or doc.revoked_at:
        return False
    await doc.set({"revoked_at": datetime.now(timezone.utc)})
    return True


async def revoke_all_user_tokens(user_id: str) -> int:
    now = datetime.now(timezone.utc)
    tokens = await RefreshToken.find(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked_at == None,  # noqa: E711
    ).to_list()
    for token in tokens:
        await token.set({"revoked_at": now})
    return len(tokens)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def rotate_refresh_token(
    plain_token: str,
    *,
    user_agent: str = "",
    ip_address: str = "",
) -> tuple[str, RefreshToken, str]:
    """
    Validate refresh token, rotate it, and return (new_plain, new_doc, user_id).
    Revokes the entire family if reuse of a rotated token is detected.
    """
    token_hash = _hash_token(plain_token)
    doc = await RefreshToken.find_one(RefreshToken.token_hash == token_hash)
    now = datetime.now(timezone.utc)

    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if doc.revoked_at:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

    if _ensure_utc(doc.expires_at) < now:
        await doc.set({"revoked_at": now})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Token reuse detection (rotation already consumed this token)
    if doc.replaced_by_hash:
        await revoke_token_family(doc.family_id)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected; session revoked",
        )

    new_plain, new_doc = await issue_refresh_token(
        doc.user_id,
        device_label=doc.device_label,
        user_agent=user_agent or doc.user_agent,
        ip_address=ip_address or doc.ip_address,
        family_id=doc.family_id,
    )

    await doc.set({
        "revoked_at": now,
        "replaced_by_hash": new_doc.token_hash,
    })

    return new_plain, new_doc, doc.user_id
