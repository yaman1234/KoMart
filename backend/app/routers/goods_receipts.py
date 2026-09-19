from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import get_current_user
from app.models.goods_receipt import GoodsReceipt
from app.models.user import User
from app.services.goods_receipt_service import _gr_to_dict, list_goods_receipts_for_po

router = APIRouter(prefix="/goods-receipts", tags=["Goods Receipts"])


@router.get("")
async def list_goods_receipts(
    purchase_order_id: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_user),
):
    if purchase_order_id.strip():
        data = await list_goods_receipts_for_po(purchase_order_id.strip())
        return {"data": data, "total": len(data)}
    total = await GoodsReceipt.count()
    skip = (page - 1) * page_size
    docs = await GoodsReceipt.find_all().sort([("created_at", -1)]).skip(skip).limit(page_size).to_list()
    return {"data": [_gr_to_dict(d) for d in docs], "total": total}


@router.get("/{receipt_id}")
async def get_goods_receipt(receipt_id: str, _: User = Depends(get_current_user)):
    doc = await GoodsReceipt.get(receipt_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Goods receipt not found")
    return _gr_to_dict(doc)
