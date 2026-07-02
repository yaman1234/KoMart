from beanie import Document


class StoreSettings(Document):
    # Store / legal
    store_name: str = "KoMart"
    address: str = ""
    phone: str = ""
    email: str = ""
    logo_url: str = ""
    pan: str = ""
    vat_number: str = ""

    # Tax & currency
    currency: str = "NPR"
    tax_rate: float = 13.0
    tax_inclusive: bool = False

    # POS / receipts
    receipt_header: str = ""
    receipt_footer: str = ""
    auto_print: bool = False
    default_payment_method: str = "cash"

    # Inventory defaults
    default_low_stock_threshold: int = 10
    expiry_warning_days: int = 30
    auto_sku: bool = False
    barcode_format: str = "any"

    # Business / loyalty
    loyalty_points_per_currency: int = 100
    loyalty_redeem_rate: int = 1
    transaction_prefix: str = "TXN"
    purchase_order_prefix: str = "PO"

    # Appearance
    date_format: str = "en-US"
    time_format: str = "12h"

    class Settings:
        name = "store_settings"
