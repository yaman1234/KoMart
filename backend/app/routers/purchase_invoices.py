from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.purchase_invoice import PurchaseInvoice, SupplierPayment
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderPaymentCreate
from app.services.purchase_invoice_service import (
    invoice_to_dict,
    list_invoices_for_po,
    pay_invoice,
    supplier_outstanding,
)

router = APIRouter(tags=["Purchase Invoices"])


@router.get("/purchase-invoices")
async def list_purchase_invoices(
    purchase_order_id: str = Query(""),
    supplier_id: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_user),
):
    query: dict = {}
    if purchase_order_id.strip():
        query["purchase_order_id"] = purchase_order_id.strip()
    if supplier_id.strip():
        query["supplier_id"] = supplier_id.strip()
    total = await PurchaseInvoice.find(query).count()
    skip = (page - 1) * page_size
    docs = (
        await PurchaseInvoice.find(query)
        .sort([("created_at", -1)])
        .skip(skip)
        .limit(page_size)
        .to_list()
    )
    return {"data": [invoice_to_dict(d) for d in docs], "total": total}


@router.get("/purchase-invoices/{invoice_id}")
async def get_purchase_invoice(invoice_id: str, _: User = Depends(get_current_user)):
    inv = await PurchaseInvoice.get(invoice_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase invoice not found")
    return invoice_to_dict(inv)


@router.post("/purchase-invoices/{invoice_id}/payments")
async def pay_purchase_invoice(
    invoice_id: str,
    body: PurchaseOrderPaymentCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    inv, _po = await pay_invoice(
        invoice_id, body, current_user=current_user, request=request,
    )
    return invoice_to_dict(inv)


@router.get("/supplier-payments")
async def list_supplier_payments(
    purchase_invoice_id: str = Query(""),
    purchase_order_id: str = Query(""),
    _: User = Depends(get_current_user),
):
    query: dict = {}
    if purchase_invoice_id.strip():
        query["purchase_invoice_id"] = purchase_invoice_id.strip()
    if purchase_order_id.strip():
        query["purchase_order_id"] = purchase_order_id.strip()
    docs = await SupplierPayment.find(query).sort([("created_at", -1)]).limit(100).to_list()
    return {
        "data": [
            {
                "id": str(p.id),
                "payment_number": p.payment_number,
                "purchase_invoice_id": p.purchase_invoice_id,
                "purchase_order_id": p.purchase_order_id,
                "supplier_id": p.supplier_id,
                "supplier_name": p.supplier_name,
                "amount": p.amount,
                "payment_date": p.payment_date,
                "payment_method": p.payment_method,
                "bill_no": p.bill_no,
                "notes": p.notes,
                "expense_id": p.expense_id,
                "created_by": p.created_by,
                "created_at": p.created_at.isoformat() if p.created_at else "",
            }
            for p in docs
        ],
        "total": len(docs),
    }


@router.get("/suppliers/{supplier_id}/outstanding")
async def get_supplier_outstanding(supplier_id: str, _: User = Depends(get_current_user)):
    return await supplier_outstanding(supplier_id)
