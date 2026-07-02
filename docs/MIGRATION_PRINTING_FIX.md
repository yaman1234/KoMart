# Printing Fix — Receipt / Bill

**Date:** June 2026  
**Feature:** Priority 1 — Printing bug fix  
**Breaking changes:** None (`printReceipt` return type extended to `PrintResult`)

---

## Problem

Receipt print showed a **blank/white screen** due to:

1. `document.write()` on an empty `window.open('')` before content painted
2. `noopener` flag blocking reliable document access
3. Window closed via fixed 400ms timeout before print rendered
4. No PDF download or reprint workflow

## Solution

| Fix | Detail |
|-----|--------|
| **Blob URL printing** | Full HTML loaded via `URL.createObjectURL` — browser renders complete document |
| **Iframe fallback** | Used when pop-ups blocked |
| **Thermal CSS** | 80mm width, `@page size: 80mm auto`, monospace font |
| **PDF download** | jsPDF text layout at 80mm width |
| **HTML download** | Standalone `.html` receipt archive |
| **ReceiptActions** | Shared Print / Reprint / PDF / HTML buttons |

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/utils/receiptPrint.ts` | **New** — print, PDF, HTML utilities |
| `frontend/src/components/pos/ReceiptActions.tsx` | **New** — UI actions |
| `frontend/src/components/pos/ReceiptView.tsx` | UI only; re-exports utilities |
| `frontend/src/components/pos/PaymentModal.tsx` | Uses `ReceiptActions` |
| `frontend/src/pages/sales/SaleDetailPage.tsx` | Reprint + PDF |
| `frontend/package.json` | Added `jspdf` |

## Database / API Impact

None.

## Manual Test Checklist

- [ ] Complete POS sale → Print → receipt content visible in print preview
- [ ] Block pop-ups → print still works via iframe
- [ ] Download PDF → opens valid 80mm PDF
- [ ] Sales detail → Reprint works
- [ ] Chrome, Edge, Firefox print preview shows items and totals

## Thermal Printer Notes

Select **80mm** paper in OS print dialog. Margins set to minimum. Use "Download PDF" to send file to printer software if browser print fails.
