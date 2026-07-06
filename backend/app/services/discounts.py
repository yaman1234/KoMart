"""Discount rule evaluation for POS and sales."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.discount_rule import DiscountRule, DiscountRuleType
from app.models.transaction import AppliedPromotion
from app.schemas.discount import (
    EvaluateCartItem,
    EvaluateDiscountResponse,
    EvaluatedLineItem,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rule_is_valid(rule: DiscountRule, *, coupon_code: str, subtotal: float) -> bool:
    if not rule.is_active:
        return False
    now = _now()
    if rule.starts_at:
        start = rule.starts_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if now < start:
            return False
    if rule.ends_at:
        end = rule.ends_at
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if now > end:
            return False
    if rule.min_cart_total and subtotal < rule.min_cart_total:
        return False
    if rule.code:
        return coupon_code.strip().upper() == rule.code.strip().upper()
    return True


def _cap_discount(amount: float, rule: DiscountRule) -> float:
    if rule.max_discount and rule.max_discount > 0:
        return min(amount, rule.max_discount)
    return amount


def _line_discount_amount(rule: DiscountRule, price: float, quantity: int) -> float:
    if rule.rule_type == DiscountRuleType.product_percent:
        per_unit = round(price * rule.value / 100, 2)
    elif rule.rule_type == DiscountRuleType.product_flat:
        per_unit = min(rule.value, price)
    elif rule.rule_type == DiscountRuleType.category_percent:
        per_unit = round(price * rule.value / 100, 2)
    elif rule.rule_type == DiscountRuleType.category_flat:
        per_unit = min(rule.value, price)
    else:
        return 0.0
    total = round(per_unit * quantity, 2)
    return _cap_discount(total, rule)


def _cart_discount_amount(rule: DiscountRule, cart_base: float) -> float:
    if rule.rule_type == DiscountRuleType.cart_percent:
        amount = round(cart_base * rule.value / 100, 2)
    elif rule.rule_type == DiscountRuleType.cart_flat:
        amount = min(rule.value, cart_base)
    else:
        return 0.0
    return _cap_discount(amount, rule)


def _matches_line(rule: DiscountRule, item: EvaluateCartItem) -> bool:
    min_qty = getattr(rule, "min_line_qty", 0) or 0
    if min_qty > 0 and item.quantity < min_qty:
        return False
    rule_sell_uom = (getattr(rule, "sell_uom", None) or "").strip().lower()
    if rule_sell_uom:
        item_sell_uom = (item.sell_uom or "").strip().lower()
        if item_sell_uom != rule_sell_uom:
            return False
    if rule.rule_type in (DiscountRuleType.product_percent, DiscountRuleType.product_flat):
        return bool(rule.product_ids) and item.product_id in rule.product_ids
    if rule.rule_type in (DiscountRuleType.category_percent, DiscountRuleType.category_flat):
        return bool(rule.category) and rule.category == item.category
    return False


async def load_active_rules() -> list[DiscountRule]:
    return (
        await DiscountRule.find(DiscountRule.is_active == True)  # noqa: E712
        .sort("-priority")
        .to_list()
    )


async def evaluate_discounts(
    items: list[EvaluateCartItem],
    *,
    coupon_code: str = "",
) -> EvaluateDiscountResponse:
    if not items:
        return EvaluateDiscountResponse(
            line_items=[],
            line_discount_total=0,
            cart_discount=0,
            promotion_discount_total=0,
            applied_promotions=[],
        )

    subtotal = sum(i.price * i.quantity for i in items)
    rules = await load_active_rules()
    eligible = [r for r in rules if _rule_is_valid(r, coupon_code=coupon_code, subtotal=subtotal)]

    line_rules = [
        r for r in eligible
        if r.rule_type in (
            DiscountRuleType.product_percent,
            DiscountRuleType.product_flat,
            DiscountRuleType.category_percent,
            DiscountRuleType.category_flat,
        )
    ]
    cart_rules = [
        r for r in eligible
        if r.rule_type in (DiscountRuleType.cart_percent, DiscountRuleType.cart_flat)
    ]

    evaluated_lines: list[EvaluatedLineItem] = []
    applied: list[AppliedPromotion] = []
    line_discount_total = 0.0

    for item in items:
        best_amount = 0.0
        best_rule: DiscountRule | None = None
        for rule in line_rules:
            if not _matches_line(rule, item):
                continue
            amount = _line_discount_amount(rule, item.price, item.quantity)
            if amount > best_amount:
                best_amount = amount
                best_rule = rule

        per_unit = round(best_amount / item.quantity, 2) if item.quantity else 0.0
        evaluated_lines.append(
            EvaluatedLineItem(
                product_id=item.product_id,
                sell_uom=item.sell_uom or "",
                per_unit_discount=per_unit,
                line_discount=best_amount,
            )
        )
        line_discount_total += best_amount
        if best_rule and best_amount > 0:
            applied.append(
                AppliedPromotion(
                    rule_id=str(best_rule.id),
                    name=best_rule.name,
                    amount=best_amount,
                )
            )

    cart_base = max(0.0, subtotal - line_discount_total)
    cart_discount = 0.0
    best_cart_rule: DiscountRule | None = None
    for rule in cart_rules:
        amount = _cart_discount_amount(rule, cart_base)
        if amount > cart_discount:
            cart_discount = amount
            best_cart_rule = rule

    if best_cart_rule and cart_discount > 0:
        applied.append(
            AppliedPromotion(
                rule_id=str(best_cart_rule.id),
                name=best_cart_rule.name,
                amount=cart_discount,
            )
        )

    promotion_total = round(line_discount_total + cart_discount, 2)
    return EvaluateDiscountResponse(
        line_items=evaluated_lines,
        line_discount_total=round(line_discount_total, 2),
        cart_discount=round(cart_discount, 2),
        promotion_discount_total=promotion_total,
        applied_promotions=applied,
    )
