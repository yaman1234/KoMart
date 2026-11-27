from fastapi import APIRouter, HTTPException, status, Depends, Query
from math import ceil
from typing import Any
import re

from pydantic import ValidationError
from pymongo import ASCENDING, DESCENDING

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.purchase_order import (
    POStatus,
    committed_po_status_match,
    normalized_po_status_expr,
    payable_outstanding_expr,
)
from app.models.user import User
from app.models.supplier import Supplier, SupplierPaymentDetail
from app.schemas.supplier import (
    SupplierCreate,
    SupplierListResponse,
    SupplierResponse,
    SupplierSummary,
    SupplierUpdate,
)

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

_SORT_FIELDS = {
    "name": "name",
    "country": "country",
    "contact_person": "contact_person",
    "contactperson": "contact_person",
    "phone": "phone",
    "email": "email",
    "po_count": "po_count",
    "pocount": "po_count",
    "open_po_count": "open_po_count",
    "total_spend": "total_spend",
    "totalspend": "total_spend",
    "total_paid": "total_paid",
    "due_amount": "due_amount",
    "dueamount": "due_amount",
    "last_order_date": "last_order_date",
    "lastorderdate": "last_order_date",
    "created_at": "created_at",
    "createdat": "created_at",
    "added": "created_at",
}

_KPI_FILTER_MATCHES: dict[str, dict[str, Any]] = {
    "has_due": {"due_amount": {"$gt": 0}},
    "open_orders": {"open_po_count": {"$gt": 0}},
    "missing_payment": {"payment_methods_count": 0},
}


async def _load_supplier(supplier_id: str) -> Supplier:
    try:
        supplier = await Supplier.get(supplier_id)
    except (ValidationError, ValueError):
        supplier = None
    if not supplier:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _iso_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _to_response(s: Supplier) -> SupplierResponse:
    return SupplierResponse(
        id=str(s.id),
        name=s.name,
        country=s.country,
        contact_person=s.contact_person,
        phone=s.phone,
        email=s.email,
        address=s.address,
        payment_details=list(s.payment_details or []),
        created_at=s.created_at.isoformat(),
    )


def _agg_doc_to_response(doc: dict[str, Any]) -> SupplierResponse:
    raw_details = doc.get("payment_details") or []
    payment_details = [
        d if isinstance(d, SupplierPaymentDetail) else SupplierPaymentDetail.model_validate(d)
        for d in raw_details
    ]
    return SupplierResponse(
        id=str(doc["_id"]),
        name=str(doc.get("name") or ""),
        country=str(doc.get("country") or ""),
        contact_person=str(doc.get("contact_person") or ""),
        phone=str(doc.get("phone") or ""),
        email=doc.get("email"),
        address=str(doc.get("address") or ""),
        payment_details=payment_details,
        created_at=_iso_or_none(doc.get("created_at")) or "",
        po_count=int(doc.get("po_count") or 0),
        open_po_count=int(doc.get("open_po_count") or 0),
        total_spend=round(float(doc.get("total_spend") or 0.0), 2),
        total_paid=round(float(doc.get("total_paid") or 0.0), 2),
        due_amount=round(float(doc.get("due_amount") or 0.0), 2),
        last_order_date=_iso_or_none(doc.get("last_order_date")),
    )


@router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    search: str = Query(""),
    kpi_filter: str = Query(""),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    include_summary: bool = Query(False),
    _: User = Depends(get_current_user),
):
    pipeline: list[dict[str, Any]] = []
    if search.strip():
        escaped = re.escape(search.strip())
        pattern = {"$regex": escaped, "$options": "i"}
        pipeline.append({
            "$match": {
                "$or": [
                    {"name": pattern},
                    {"contact_person": pattern},
                    {"phone": pattern},
                    {"country": pattern},
                    {"email": pattern},
                ]
            }
        })

    pipeline.extend([
        {"$addFields": {"_id_str": {"$toString": "$_id"}}},
        {
            "$lookup": {
                "from": "purchase_orders",
                "let": {"sid": "$_id_str"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$supplier_id", "$$sid"]}}},
                    {"$match": committed_po_status_match()},
                    {
                        "$project": {
                            "_norm_status": normalized_po_status_expr("$status"),
                            "_total": {"$ifNull": ["$total_amount", 0]},
                            "_paid": {"$ifNull": ["$amount_paid", 0]},
                            "_due": payable_outstanding_expr(),
                            "created_at": 1,
                        }
                    },
                    {
                        "$group": {
                            "_id": None,
                            "po_count": {"$sum": 1},
                            "open_po_count": {
                                "$sum": {
                                    "$cond": [{"$in": ["$_norm_status", ["ordered", "partial"]]}, 1, 0]
                                }
                            },
                            "open_orders_amount": {
                                "$sum": {
                                    "$cond": [
                                        {"$in": ["$_norm_status", ["ordered", "partial"]]},
                                        "$_total",
                                        0,
                                    ]
                                }
                            },
                            "total_spend": {"$sum": "$_total"},
                            "total_paid": {"$sum": "$_paid"},
                            "due_amount": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$_norm_status", POStatus.received.value]},
                                        "$_due",
                                        0,
                                    ]
                                }
                            },
                            "last_order_date": {"$max": "$created_at"},
                        }
                    },
                ],
                "as": "_po_stats",
            }
        },
        {"$addFields": {"_po": {"$ifNull": [{"$arrayElemAt": ["$_po_stats", 0]}, {}]}}},
        {
            "$addFields": {
                "po_count": {"$ifNull": ["$_po.po_count", 0]},
                "open_po_count": {"$ifNull": ["$_po.open_po_count", 0]},
                "open_orders_amount": {"$round": [{"$ifNull": ["$_po.open_orders_amount", 0]}, 2]},
                "total_spend": {"$round": [{"$ifNull": ["$_po.total_spend", 0]}, 2]},
                "total_paid": {"$round": [{"$ifNull": ["$_po.total_paid", 0]}, 2]},
                "due_amount": {"$round": [{"$ifNull": ["$_po.due_amount", 0]}, 2]},
                "last_order_date": "$_po.last_order_date",
                "payment_methods_count": {"$size": {"$ifNull": ["$payment_details", []]}},
            }
        },
    ])

    sort_field = _SORT_FIELDS.get((sort_by or "").strip().lower().replace("-", "_"), "name")
    direction = ASCENDING if (sort_order or "").strip().lower() == "asc" else DESCENDING
    sort_spec: dict[str, int] = {sort_field: direction}
    if sort_field != "name":
        sort_spec["name"] = ASCENDING
    sort_spec["_id"] = ASCENDING

    kpi_key = (kpi_filter or "").strip().lower()
    kpi_match_stages: list[dict[str, Any]] = (
        [{"$match": _KPI_FILTER_MATCHES[kpi_key]}] if kpi_key in _KPI_FILTER_MATCHES else []
    )

    facets: dict[str, list[dict[str, Any]]] = {
        "total": [*kpi_match_stages, {"$count": "count"}],
        "data": [
            *kpi_match_stages,
            {"$sort": sort_spec},
            {"$skip": (page - 1) * page_size},
            {"$limit": page_size},
        ],
    }
    if include_summary:
        facets["summary"] = [
            {
                "$group": {
                    "_id": None,
                    "total_suppliers": {"$sum": 1},
                    "suppliers_with_due": {"$sum": {"$cond": [{"$gt": ["$due_amount", 0]}, 1, 0]}},
                    "total_due_amount": {"$sum": "$due_amount"},
                    "suppliers_with_open_orders": {
                        "$sum": {"$cond": [{"$gt": ["$open_po_count", 0]}, 1, 0]}
                    },
                    "total_open_orders_amount": {"$sum": "$open_orders_amount"},
                    "total_spend_amount": {"$sum": "$total_spend"},
                    "suppliers_missing_payment": {
                        "$sum": {"$cond": [{"$eq": ["$payment_methods_count", 0]}, 1, 0]}
                    },
                }
            }
        ]

    pipeline.append({"$facet": facets})
    collection = Supplier.get_motor_collection()
    agg_result = await collection.aggregate(pipeline).to_list(length=1)
    facet_doc = agg_result[0] if agg_result else {}

    total_list = facet_doc.get("total") or []
    total = int(total_list[0]["count"]) if total_list else 0
    rows = [_agg_doc_to_response(doc) for doc in (facet_doc.get("data") or [])]

    summary = SupplierSummary()
    if include_summary:
        summary_list = facet_doc.get("summary") or []
        if summary_list:
            sdoc = summary_list[0]
            summary = SupplierSummary(
                total_suppliers=int(sdoc.get("total_suppliers") or 0),
                suppliers_with_due=int(sdoc.get("suppliers_with_due") or 0),
                total_due_amount=round(float(sdoc.get("total_due_amount") or 0.0), 2),
                suppliers_with_open_orders=int(sdoc.get("suppliers_with_open_orders") or 0),
                total_open_orders_amount=round(float(sdoc.get("total_open_orders_amount") or 0.0), 2),
                total_spend_amount=round(float(sdoc.get("total_spend_amount") or 0.0), 2),
                suppliers_missing_payment=int(sdoc.get("suppliers_missing_payment") or 0),
            )

    return SupplierListResponse(
        data=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
        summary=summary,
    )


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(body: SupplierCreate, _: User = Depends(require_manager_or_above)):
    supplier = Supplier(**body.model_dump())
    await supplier.insert()
    return _to_response(supplier)


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, _: User = Depends(get_current_user)):
    supplier = await _load_supplier(supplier_id)
    return _to_response(supplier)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str, body: SupplierUpdate, _: User = Depends(require_manager_or_above)
):
    supplier = await _load_supplier(supplier_id)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if update_data:
        await supplier.set(update_data)
    return _to_response(supplier)
