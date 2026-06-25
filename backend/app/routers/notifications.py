from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.notification import Notification
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
async def list_notifications(_: User = Depends(get_current_user)):
    notifications = await Notification.find().sort("-created_at").to_list()
    return [
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "read": n.read,
            "link": n.link,
            "createdAt": n.created_at.isoformat(),
        }
        for n in notifications
    ]


@router.patch("/{notification_id}/read", response_model=MessageResponse)
async def mark_read(notification_id: str, _: User = Depends(get_current_user)):
    notification = await Notification.get(notification_id)
    if notification:
        await notification.set({"read": True})
    return MessageResponse(message="Marked as read")
