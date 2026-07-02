from typing import Any, Optional

from pydantic import BaseModel

from app.models.audit_log import AuditModule


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_email: str
    module: AuditModule
    action: str
    entity_type: str
    entity_id: str
    previous_value: dict[str, Any]
    new_value: dict[str, Any]
    ip_address: str
    user_agent: str
    browser: str
    device: str
    request_id: str
    created_at: str
