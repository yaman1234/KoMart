from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.discount_rule import DiscountRule, DiscountRuleType
from app.models.user import User
from app.schemas.discount import (
    DiscountRuleCreate,
    DiscountRuleResponse,
    DiscountRuleUpdate,
    EvaluateDiscountRequest,
    EvaluateDiscountResponse,
)
from app.services.discounts import evaluate_discounts

router = APIRouter(prefix="/discounts", tags=["Discounts"])


def _to_response(rule: DiscountRule) -> DiscountRuleResponse:
    return DiscountRuleResponse(
        id=str(rule.id),
        name=rule.name,
        code=rule.code,
        rule_type=rule.rule_type,
        value=rule.value,
        product_ids=rule.product_ids,
        category=rule.category,
        min_cart_total=rule.min_cart_total,
        min_line_qty=getattr(rule, "min_line_qty", 0) or 0,
        sell_uom=getattr(rule, "sell_uom", "") or "",
        max_discount=rule.max_discount,
        starts_at=rule.starts_at.isoformat() if rule.starts_at else None,
        ends_at=rule.ends_at.isoformat() if rule.ends_at else None,
        is_active=rule.is_active,
        priority=rule.priority,
        created_at=rule.created_at.isoformat(),
        updated_at=rule.updated_at.isoformat(),
    )


def _validate_rule_payload(
    rule_type: DiscountRuleType,
    *,
    product_ids: list[str],
    category: str,
    value: float,
) -> None:
    if rule_type in (DiscountRuleType.product_percent, DiscountRuleType.product_flat):
        if not product_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="At least one product is required for product discounts")
    if rule_type in (DiscountRuleType.category_percent, DiscountRuleType.category_flat):
        if not category:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="category is required for category discounts")
    if rule_type in (DiscountRuleType.product_percent, DiscountRuleType.category_percent, DiscountRuleType.cart_percent):
        if value > 100:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Percentage discount cannot exceed 100")


@router.get("", response_model=list[DiscountRuleResponse])
async def list_discount_rules(
    active_only: bool = Query(True),
    _: User = Depends(get_current_user),
):
    query = DiscountRule.find()
    if active_only:
        query = query.find(DiscountRule.is_active == True)  # noqa: E712
    rules = await query.sort("-priority", "name").to_list()
    return [_to_response(r) for r in rules]


@router.post("/evaluate", response_model=EvaluateDiscountResponse)
async def evaluate_cart_discounts(
    body: EvaluateDiscountRequest,
    _: User = Depends(get_current_user),
):
    return await evaluate_discounts(body.items, coupon_code=body.coupon_code)


@router.post("", response_model=DiscountRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_discount_rule(
    body: DiscountRuleCreate,
    current_user: User = Depends(require_manager_or_above),
):
    _validate_rule_payload(
        body.rule_type,
        product_ids=body.product_ids,
        category=body.category,
        value=body.value,
    )
    if body.code:
        existing = await DiscountRule.find_one(DiscountRule.code == body.code.strip().upper())
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Coupon code already exists")
    data = body.model_dump()
    data["code"] = body.code.strip().upper() if body.code else ""
    rule = DiscountRule(**data)
    await rule.insert()
    return _to_response(rule)


@router.patch("/{rule_id}", response_model=DiscountRuleResponse)
async def update_discount_rule(
    rule_id: str,
    body: DiscountRuleUpdate,
    current_user: User = Depends(require_manager_or_above),
):
    rule = await DiscountRule.get(rule_id)
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Discount rule not found")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "code" in data:
        code = (data["code"] or "").strip().upper()
        if code:
            dup = await DiscountRule.find_one(DiscountRule.code == code)
            if dup and str(dup.id) != rule_id:
                raise HTTPException(status.HTTP_409_CONFLICT, detail="Coupon code already exists")
        data["code"] = code
    merged_type = data.get("rule_type", rule.rule_type)
    merged_products = data.get("product_ids", rule.product_ids)
    merged_category = data.get("category", rule.category)
    merged_value = data.get("value", rule.value)
    _validate_rule_payload(
        merged_type,
        product_ids=merged_products,
        category=merged_category,
        value=merged_value,
    )
    data["updated_at"] = datetime.now(timezone.utc)
    await rule.set(data)
    refreshed = await DiscountRule.get(rule_id)
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discount_rule(
    rule_id: str,
    current_user: User = Depends(require_manager_or_above),
):
    rule = await DiscountRule.get(rule_id)
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Discount rule not found")
    await rule.set({"is_active": False, "updated_at": datetime.now(timezone.utc)})
