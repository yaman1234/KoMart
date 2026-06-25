import re
from fastapi import APIRouter, HTTPException, status, Depends, Query
from math import ceil

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.customer import Customer
from app.models.transaction import Transaction
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.schemas.transaction import TransactionResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/customers", tags=["Customers"])


def _phone_digit_pattern(digits: str) -> str:
    """Match a digit sequence anywhere in a formatted phone (+, spaces, dashes ignored)."""
    return '.*'.join(re.escape(d) for d in digits)


def _customer_search_filter(search: str) -> dict | None:
    term = search.strip()
    if not term:
        return None
    escaped = re.escape(term)
    clauses: list[dict] = [
        {"name": {"$regex": escaped, "$options": "i"}},
        {"email": {"$regex": escaped, "$options": "i"}},
        {"phone": {"$regex": escaped, "$options": "i"}},
    ]
    digits = re.sub(r"\D", "", term)
    if len(digits) >= 3:
        clauses.append({"phone": {"$regex": _phone_digit_pattern(digits)}})
    return {"$or": clauses}


def _to_response(c: Customer) -> CustomerResponse:
    return CustomerResponse(
        id=str(c.id),
        name=c.name,
        phone=c.phone,
        email=c.email,
        birthday=c.birthday,
        loyalty_points=c.loyalty_points,
        membership_tier=c.membership_tier,
        total_spent=c.total_spent,
        created_at=c.created_at.isoformat(),
    )


@router.get("", response_model=PaginatedResponse[CustomerResponse])
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    _: User = Depends(get_current_user),
):
    query = Customer.find()
    search_filter = _customer_search_filter(search)
    if search_filter:
        query = query.find(search_filter)

    total = await query.count()
    customers = await query.sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()
    return PaginatedResponse(
        data=[_to_response(c) for c in customers],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(body: CustomerCreate, _: User = Depends(get_current_user)):
    customer = Customer(**body.model_dump())
    await customer.insert()
    return _to_response(customer)


@router.get("/lookup", response_model=list[CustomerResponse])
async def lookup_customers(
    q: str = Query("", max_length=100),
    limit: int = Query(15, ge=1, le=50),
    _: User = Depends(get_current_user),
):
    """Fast autocomplete — no pagination count."""
    query = Customer.find()
    search_filter = _customer_search_filter(q)
    if search_filter:
        query = query.find(search_filter)
    customers = await query.sort("-created_at").limit(limit).to_list()
    return [_to_response(c) for c in customers]


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, _: User = Depends(get_current_user)):
    customer = await Customer.get(customer_id)
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return _to_response(customer)


@router.get("/{customer_id}/transactions", response_model=list[TransactionResponse])
async def get_customer_transactions(customer_id: str, _: User = Depends(get_current_user)):
    txns = await Transaction.find(
        Transaction.customer_id == customer_id
    ).sort("-created_at").to_list()
    return [
        TransactionResponse(
            id=str(t.id),
            transaction_number=t.transaction_number,
            customer_id=t.customer_id,
            customer_name=t.customer_name,
            items=t.items,
            subtotal=t.subtotal,
            discount=t.discount,
            tax=t.tax,
            loyalty_points_redeemed=t.loyalty_points_redeemed,
            total=t.total,
            payment_method=t.payment_method,
            created_by=t.created_by,
            created_at=t.created_at.isoformat(),
        )
        for t in txns
    ]


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str, body: CustomerUpdate, _: User = Depends(get_current_user)
):
    customer = await Customer.get(customer_id)
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Customer not found")
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if update_data:
        await customer.set(update_data)
    return _to_response(customer)
