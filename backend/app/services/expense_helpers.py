from app.models.expense import Expense, ExpenseCategory

_SETUP_CATEGORY = ExpenseCategory.setup_investment.value

# MongoDB aggregation condition: expense counts as setup/investment.
SETUP_INVESTMENT_MATCH = {
    "$or": [
        {"$eq": ["$is_setup_cost", True]},
        {"$eq": ["$category", _SETUP_CATEGORY]},
    ],
}


def is_setup_investment(expense: Expense) -> bool:
    return bool(expense.is_setup_cost) or expense.category == ExpenseCategory.setup_investment


def normalize_setup_fields(data: dict) -> dict:
    """Category setup_investment implies is_setup_cost; keep explicit flag otherwise."""
    category = data.get("category")
    if category == ExpenseCategory.setup_investment or category == _SETUP_CATEGORY:
        data["is_setup_cost"] = True
    return data
