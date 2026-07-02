"""Store settings helpers."""

from __future__ import annotations

from app.models.settings import StoreSettings


async def get_store_settings() -> StoreSettings:
    settings = await StoreSettings.find_one()
    if not settings:
        settings = StoreSettings()
        await settings.insert()
    return settings


def settings_to_api(settings: StoreSettings) -> dict:
    return {
        "storeName": settings.store_name,
        "address": settings.address,
        "phone": settings.phone,
        "email": settings.email,
        "logoUrl": settings.logo_url,
        "pan": settings.pan,
        "vatNumber": settings.vat_number,
        "currency": settings.currency,
        "taxRate": settings.tax_rate,
        "taxInclusive": settings.tax_inclusive,
        "receiptHeader": settings.receipt_header,
        "receiptFooter": settings.receipt_footer,
        "autoPrint": settings.auto_print,
        "defaultPaymentMethod": settings.default_payment_method,
        "defaultLowStockThreshold": settings.default_low_stock_threshold,
        "expiryWarningDays": settings.expiry_warning_days,
        "autoSku": settings.auto_sku,
        "barcodeFormat": settings.barcode_format,
        "loyaltyPointsPerCurrency": settings.loyalty_points_per_currency,
        "loyaltyRedeemRate": settings.loyalty_redeem_rate,
        "transactionPrefix": settings.transaction_prefix,
        "purchaseOrderPrefix": settings.purchase_order_prefix,
        "dateFormat": settings.date_format,
        "timeFormat": settings.time_format,
    }
