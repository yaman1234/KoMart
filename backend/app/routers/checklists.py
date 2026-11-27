from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from typing import List, Optional
from datetime import datetime, timezone

from app.auth.dependencies import get_current_user, require_manager_or_above, require_admin_only
from app.models.user import User, UserRole
from app.models.checklist import (
    ChecklistTemplate,
    DailyChecklist,
    DailyChecklistItem,
    TemplateItem,
    ChecklistStatus,
    TargetRole,
    ChecklistCategory,
)
from app.models.audit_log import AuditModule
from app.services.audit import log_audit
from app.services.attendance_engine import get_today_npt_date_str
from app.schemas.checklist import (
    ChecklistTemplateCreate,
    ChecklistTemplateUpdate,
    ChecklistTemplateResponse,
    DailyChecklistResponse,
    DailyChecklistCreate,
    ChecklistItemToggleRequest,
    ChecklistVerifyRequest,
    TemplateItemSchema,
    DailyChecklistItemSchema,
)

router = APIRouter(prefix="/checklists", tags=["Checklists"])


def _to_template_response(t: ChecklistTemplate) -> ChecklistTemplateResponse:
    return ChecklistTemplateResponse(
        id=str(t.id),
        title=t.title,
        description=t.description,
        category=t.category,
        target_role=t.target_role,
        shift_id=t.shift_id,
        shift_name=t.shift_name,
        items=[
            TemplateItemSchema(
                id=i.id,
                title=i.title,
                description=i.description,
                is_mandatory=i.is_mandatory,
                order=i.order,
                requires_numeric_input=i.requires_numeric_input,
                numeric_unit=i.numeric_unit,
                requires_note=i.requires_note,
            )
            for i in t.items
        ],
        is_active=t.is_active,
        auto_generate_daily=t.auto_generate_daily,
        days_of_week=t.days_of_week,
        created_by=t.created_by,
        created_by_name=t.created_by_name,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _to_daily_response(d: DailyChecklist) -> DailyChecklistResponse:
    return DailyChecklistResponse(
        id=str(d.id),
        template_id=d.template_id,
        title=d.title,
        description=d.description,
        category=d.category,
        date=d.date,
        target_role=d.target_role,
        assigned_to_user_id=d.assigned_to_user_id,
        assigned_to_user_name=d.assigned_to_user_name,
        assigned_by_user_id=d.assigned_by_user_id,
        assigned_by_user_name=d.assigned_by_user_name,
        shift_id=d.shift_id,
        shift_name=d.shift_name,
        items=[
            DailyChecklistItemSchema(
                id=i.id,
                title=i.title,
                description=i.description,
                is_mandatory=i.is_mandatory,
                order=i.order,
                is_completed=i.is_completed,
                completed_by_user_id=i.completed_by_user_id,
                completed_by_name=i.completed_by_name,
                completed_at=i.completed_at,
                numeric_input=i.numeric_input,
                numeric_unit=i.numeric_unit,
                notes=i.notes,
            )
            for i in d.items
        ],
        total_items_count=d.total_items_count,
        completed_items_count=d.completed_items_count,
        completion_rate=d.completion_rate,
        status=d.status,
        requires_manager_verification=d.requires_manager_verification,
        verified_by_user_id=d.verified_by_user_id,
        verified_by_name=d.verified_by_name,
        verified_at=d.verified_at,
        manager_remarks=d.manager_remarks,
        completed_at=d.completed_at,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


async def ensure_daily_checklists_for_date(date_str: str) -> None:
    """If no daily checklists exist for date_str, auto-generate instances from active ChecklistTemplates."""
    count = await DailyChecklist.find(DailyChecklist.date == date_str).count()
    if count > 0:
        return

    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        weekday = dt.weekday()
    except Exception:
        weekday = 0

    templates = await ChecklistTemplate.find(
        ChecklistTemplate.is_active == True,  # noqa: E712
        ChecklistTemplate.auto_generate_daily == True,  # noqa: E712
    ).to_list()

    for t in templates:
        if weekday in t.days_of_week:
            daily_items = [
                DailyChecklistItem(
                    id=i.id,
                    title=i.title,
                    description=i.description,
                    is_mandatory=i.is_mandatory,
                    order=i.order,
                    numeric_unit=i.numeric_unit,
                )
                for i in t.items
            ]
            daily = DailyChecklist(
                template_id=str(t.id),
                title=t.title,
                description=t.description,
                category=t.category,
                date=date_str,
                target_role=t.target_role,
                assigned_by_user_id=t.created_by,
                assigned_by_user_name=t.created_by_name,
                shift_id=t.shift_id,
                shift_name=t.shift_name,
                items=daily_items,
                total_items_count=len(daily_items),
                completed_items_count=0,
                completion_rate=0.0,
                status=ChecklistStatus.pending,
            )
            await daily.insert()


@router.get("/my-today", response_model=List[DailyChecklistResponse])
async def get_my_today_checklists(
    current_user: User = Depends(get_current_user),
):
    """Fetch daily checklists for today relevant to the logged-in user."""
    today_date = get_today_npt_date_str()
    await ensure_daily_checklists_for_date(today_date)

    user_id = str(current_user.id)
    user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    # User can see:
    # 1. Direct assignments to user_id
    # 2. Role-based broadcasts matching user_role or 'all'
    records = await DailyChecklist.find(
        DailyChecklist.date == today_date,
    ).sort("category").to_list()

    relevant = []
    for r in records:
        if r.assigned_to_user_id == user_id:
            relevant.append(r)
        elif r.assigned_to_user_id is None:
            if r.target_role in (TargetRole.all, TargetRole(user_role)):
                relevant.append(r)

    return [_to_daily_response(r) for r in relevant]


@router.patch("/{checklist_id}/items/{item_id}", response_model=DailyChecklistResponse)
async def toggle_checklist_item(
    checklist_id: str,
    item_id: str,
    body: ChecklistItemToggleRequest,
    current_user: User = Depends(get_current_user),
):
    """Toggle a checklist item completed or incomplete with optional numeric/notes data."""
    checklist = await DailyChecklist.get(checklist_id)
    if not checklist:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Daily checklist not found")

    target_item = None
    for item in checklist.items:
        if item.id == item_id:
            target_item = item
            break

    if not target_item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Item not found in checklist")

    now_utc = datetime.now(timezone.utc)
    target_item.is_completed = body.is_completed

    if body.is_completed:
        target_item.completed_by_user_id = str(current_user.id)
        target_item.completed_by_name = current_user.name
        target_item.completed_at = now_utc
        if body.numeric_input is not None:
            target_item.numeric_input = body.numeric_input
        if body.notes is not None:
            target_item.notes = body.notes
    else:
        target_item.completed_by_user_id = None
        target_item.completed_by_name = None
        target_item.completed_at = None

    # Recalculate totals
    total = len(checklist.items)
    checklist.total_items_count = total
    completed_count = sum(1 for it in checklist.items if it.is_completed)
    checklist.completed_items_count = completed_count
    checklist.completion_rate = round((completed_count / total * 100), 1) if total > 0 else 0.0

    if completed_count == total and total > 0:
        checklist.status = ChecklistStatus.completed
        checklist.completed_at = now_utc
    elif completed_count > 0:
        checklist.status = ChecklistStatus.in_progress
        checklist.completed_at = None
    else:
        checklist.status = ChecklistStatus.pending
        checklist.completed_at = None

    checklist.updated_at = now_utc
    await checklist.save()
    return _to_daily_response(checklist)


@router.get("/overview", response_model=List[DailyChecklistResponse])
async def get_checklists_overview(
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _: User = Depends(require_manager_or_above),
):
    """Manager overview: View all daily operational checklists for the store."""
    target_date = date or get_today_npt_date_str()
    await ensure_daily_checklists_for_date(target_date)

    checklists = await DailyChecklist.find(DailyChecklist.date == target_date).sort("target_role", "category").to_list()
    return [_to_daily_response(c) for c in checklists]


@router.post("", response_model=DailyChecklistResponse, status_code=status.HTTP_201_CREATED)
async def create_daily_checklist(
    body: DailyChecklistCreate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Manager creates a direct or ad-hoc daily checklist."""
    today_date = get_today_npt_date_str()
    daily_items = [
        DailyChecklistItem(
            id=i.id,
            title=i.title,
            description=i.description,
            is_mandatory=i.is_mandatory,
            order=i.order,
            numeric_unit=i.numeric_unit,
        )
        for i in body.items
    ]

    assigned_user_name = None
    if body.assigned_to_user_id:
        target_u = await User.get(body.assigned_to_user_id)
        if target_u:
            assigned_user_name = target_u.name

    daily = DailyChecklist(
        title=body.title,
        description=body.description,
        category=body.category,
        date=today_date,
        target_role=body.target_role,
        assigned_to_user_id=body.assigned_to_user_id,
        assigned_to_user_name=assigned_user_name,
        assigned_by_user_id=str(manager.id),
        assigned_by_user_name=manager.name,
        shift_id=body.shift_id,
        items=daily_items,
        total_items_count=len(daily_items),
        completed_items_count=0,
        completion_rate=0.0,
        status=ChecklistStatus.pending,
    )
    await daily.insert()

    await log_audit(
        module=AuditModule.checklists,
        action="create_daily_checklist",
        user=manager,
        request=request,
        entity_type="daily_checklist",
        entity_id=str(daily.id),
        new={"title": daily.title, "target_role": daily.target_role.value, "date": daily.date},
    )
    return _to_daily_response(daily)


@router.post("/{checklist_id}/verify", response_model=DailyChecklistResponse)
async def verify_checklist(
    checklist_id: str,
    body: ChecklistVerifyRequest,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Manager verification / sign-off on a completed or reviewed checklist."""
    checklist = await DailyChecklist.get(checklist_id)
    if not checklist:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Checklist not found")

    now_utc = datetime.now(timezone.utc)
    checklist.verified_by_user_id = str(manager.id)
    checklist.verified_by_name = manager.name
    checklist.verified_at = now_utc
    if body.remarks:
        checklist.manager_remarks = body.remarks
    checklist.updated_at = now_utc
    await checklist.save()

    await log_audit(
        module=AuditModule.checklists,
        action="verify_checklist",
        user=manager,
        request=request,
        entity_type="daily_checklist",
        entity_id=str(checklist.id),
        new={"verified_by": manager.name, "remarks": body.remarks},
    )
    return _to_daily_response(checklist)


# ── Templates CRUD ─────────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[ChecklistTemplateResponse])
async def list_templates(
    include_inactive: bool = Query(False),
    _: User = Depends(get_current_user),
):
    """List reusable checklist templates."""
    query = ChecklistTemplate.find()
    if not include_inactive:
        query = query.find(ChecklistTemplate.is_active == True)  # noqa: E712
    templates = await query.sort("target_role", "category").to_list()
    return [_to_template_response(t) for t in templates]


@router.post("/templates", response_model=ChecklistTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: ChecklistTemplateCreate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Create a new reusable checklist template."""
    items = [
        TemplateItem(
            id=i.id,
            title=i.title,
            description=i.description,
            is_mandatory=i.is_mandatory,
            order=i.order,
            requires_numeric_input=i.requires_numeric_input,
            numeric_unit=i.numeric_unit,
            requires_note=i.requires_note,
        )
        for i in body.items
    ]
    template = ChecklistTemplate(
        title=body.title,
        description=body.description,
        category=body.category,
        target_role=body.target_role,
        shift_id=body.shift_id,
        shift_name=body.shift_name,
        items=items,
        is_active=body.is_active,
        auto_generate_daily=body.auto_generate_daily,
        days_of_week=body.days_of_week,
        created_by=str(manager.id),
        created_by_name=manager.name,
    )
    await template.insert()

    await log_audit(
        module=AuditModule.checklists,
        action="create_template",
        user=manager,
        request=request,
        entity_type="checklist_template",
        entity_id=str(template.id),
        new={"title": template.title, "category": template.category.value, "target_role": template.target_role.value},
    )
    return _to_template_response(template)


@router.patch("/templates/{template_id}", response_model=ChecklistTemplateResponse)
async def update_template(
    template_id: str,
    body: ChecklistTemplateUpdate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Update a checklist template."""
    template = await ChecklistTemplate.get(template_id)
    if not template:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")

    update_dict = body.model_dump(exclude_unset=True)
    if "items" in update_dict and update_dict["items"] is not None:
        template.items = [
            TemplateItem(
                id=i["id"] if isinstance(i, dict) else i.id,
                title=i["title"] if isinstance(i, dict) else i.title,
                description=i.get("description") if isinstance(i, dict) else getattr(i, "description", None),
                is_mandatory=i.get("is_mandatory", True) if isinstance(i, dict) else getattr(i, "is_mandatory", True),
                order=i.get("order", 1) if isinstance(i, dict) else getattr(i, "order", 1),
                requires_numeric_input=i.get("requires_numeric_input", False) if isinstance(i, dict) else getattr(i, "requires_numeric_input", False),
                numeric_unit=i.get("numeric_unit") if isinstance(i, dict) else getattr(i, "numeric_unit", None),
                requires_note=i.get("requires_note", False) if isinstance(i, dict) else getattr(i, "requires_note", False),
            )
            for i in update_dict["items"]
        ]
        del update_dict["items"]

    for k, v in update_dict.items():
        setattr(template, k, v)

    template.updated_at = datetime.now(timezone.utc)
    await template.save()
    return _to_template_response(template)


@router.delete("/templates/{template_id}", status_code=status.HTTP_200_OK)
async def deactivate_template(
    template_id: str,
    admin: User = Depends(require_admin_only),
):
    """Deactivate a template."""
    template = await ChecklistTemplate.get(template_id)
    if not template:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")

    template.is_active = False
    template.updated_at = datetime.now(timezone.utc)
    await template.save()
    return {"message": f"Template '{template.title}' deactivated successfully"}
