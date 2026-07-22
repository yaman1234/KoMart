export interface ProductUomFields {
  buyUom: string;
  uom: string;
  unitsPerBuyUom: number;
}

/** True when Primary packs into more than one Secondary unit. */
export function hasUomConversion(factor: number | undefined | null): boolean {
  return Math.max(1, Math.floor(Number(factor) || 1)) > 1;
}

/**
 * When no conversion: Secondary mirrors Primary and factor is 1.
 * Does not invent UOM codes — empty Primary stays empty.
 */
export function normalizeProductUoms(fields: ProductUomFields): ProductUomFields {
  const buyUom = (fields.buyUom ?? '').trim();
  const factor = Math.max(1, Math.floor(Number(fields.unitsPerBuyUom) || 1));
  if (!hasUomConversion(factor)) {
    return { buyUom, uom: buyUom, unitsPerBuyUom: 1 };
  }
  const uom = (fields.uom ?? '').trim() || buyUom;
  return { buyUom, uom, unitsPerBuyUom: factor };
}

/** Prefer Settings code `pcs` when present; otherwise empty (force pick). */
export function defaultPrimaryUom(
  options: ReadonlyArray<{ value: string; label?: string }>,
): string {
  const pcs = options.find((o) => o.value.toLowerCase() === 'pcs');
  return pcs?.value ?? '';
}
