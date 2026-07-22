import * as XLSX from 'xlsx';
import type { Product } from '@/types';
import { formatConversion } from '@/utils/uomDisplay';
import { productStatusLabel } from '@/utils';
import { PRODUCT_FIELD_LABELS } from '@/constants/productFieldLabels';

export function exportProductsToExcel(
  products: Product[],
  options?: { includeCost?: boolean },
): void {
  const includeCost = options?.includeCost ?? true;
  const headers = [
    PRODUCT_FIELD_LABELS.sku,
    PRODUCT_FIELD_LABELS.name,
    PRODUCT_FIELD_LABELS.barcode,
    PRODUCT_FIELD_LABELS.category,
    PRODUCT_FIELD_LABELS.stock,
    ...(includeCost ? [PRODUCT_FIELD_LABELS.unitCost] : []),
    PRODUCT_FIELD_LABELS.unitPrice,
    PRODUCT_FIELD_LABELS.buyUom,
    PRODUCT_FIELD_LABELS.baseUom,
    PRODUCT_FIELD_LABELS.unitsPerPack,
    'Conversion',
    PRODUCT_FIELD_LABELS.status,
  ];

  const rows = products.map((p) => {
    const buy = p.buyUom ?? p.uom ?? '';
    const base = p.uom ?? '';
    const factor = p.unitsPerBuyUom ?? 1;
    return [
      p.sku,
      p.name,
      p.barcode,
      p.category,
      p.stock,
      ...(includeCost ? [p.costPrice] : []),
      p.sellingPrice,
      buy,
      base,
      factor,
      formatConversion(buy, base, factor) || '',
      productStatusLabel(p.status),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `komart-products-${date}.xlsx`);
}
