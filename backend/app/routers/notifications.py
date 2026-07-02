from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.notification import Notification, NotificationType
from app.schemas.common import MessageResponse
from app.services.notifications import sync_notifications

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _serialize(notification: Notification) -> dict:
    return {
        "id": str(notification.id),
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "read": notification.read,
        "link": notification.link,
        "createdAt": notification.created_at.isoformat(),
    }


@router.get("")
async def list_notifications(
    unread_only: bool = Query(False, alias="unreadOnly"),
    type: Optional[NotificationType] = Query(None),
    sync: bool = Query(True),
    _: User = Depends(get_current_user),
):
    if sync:
        await sync_notifications()

    filters: list = []
    if unread_only:
        filters.append(Notification.read == False)
    if type is not None:
        filters.append(Notification.type == type)

    if filters:
        notifications = await Notification.find(*filters).sort("-created_at").to_list()
    else:
        notifications = await Notification.find().sort("-created_at").to_list()

    return [_serialize(n) for n in notifications]


@router.post("/sync", response_model=MessageResponse)
async def refresh_notifications(_: User = Depends(get_current_user)):
    await sync_notifications()
    return MessageResponse(message="Notifications synced")


@router.patch("/read-all", response_model=MessageResponse)
async def mark_all_read(_: User = Depends(get_current_user)):
    unread = await Notification.find(Notification.read == False).to_list()
    for notification in unread:
        await notification.set({"read": True})
    return MessageResponse(message="All notifications marked as read")


@router.patch("/{notification_id}/read", response_model=MessageResponse)
async def mark_read(notification_id: str, _: User = Depends(get_current_user)):
    notification = await Notification.get(notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notification.read:
        await notification.set({"read": True})
    return MessageResponse(message="Marked as read")
