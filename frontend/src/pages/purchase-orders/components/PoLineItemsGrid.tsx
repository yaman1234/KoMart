import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Box,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { Tooltip } from '@mui/material';
import { productService } from '@/services';
import { useUomOptions } from '@/hooks/useUoms';
import { formatCurrency, uomLabel } from '@/utils';
import { defaultPrimaryUom } from '@/utils/uomNormalize';
import { showSuccess } from '@/utils/toast';
import { ProductCreateDialog } from '@/components/products/ProductCreateDialog';
import { ProductQuickViewDialog } from '@/components/products/ProductQuickViewDialog';
import type { Product } from '@/types';
import { excelCellSx, noNumberSpinnerSx } from '@/pages/purchase-orders/inputStyles';
import {
  poFormColWidths,
  poFormTableMinWidth,
} from '@/pages/purchase-orders/poLineTableColumns';
import type { PoLineItem } from '@/pages/purchase-orders/poFormTypes';
import { emptyPoLineItem } from '@/pages/purchase-orders/poFormTypes';
import { parseExcelPaste } from '@/pages/purchase-orders/poPasteParser';
import {
  applyProductToLine,
  resolveProductFromInput,
  type ProductCatalogIndex,
} from '@/pages/purchase-orders/poProductResolver';
import { PO_LABELS, PO_PACKING_NOTE, PO_PASTE_HINT } from '@/pages/purchase-orders/poTerminology';
import { applyVatToUnitCost, packTotalUnits } from '@/pages/purchase-orders/poPricing';
import { packSellOption, sellUomOptionsFor } from '@/utils/uomSell';
import { SELL_MODE_OPTIONS } from '@/constants';
import { PoProductAutocompleteCell } from '@/pages/purchase-orders/components/PoProductAutocompleteCell';

const EDITABLE_COLS = [0, 1, 2, 3, 4, 5] as const;
type EditableCol = (typeof EDITABLE_COLS)[number];

function focusPoCell(container: HTMLElement | null, row: number, col: EditableCol) {
  const el = container?.querySelector<HTMLElement>(`[data-po-row="${row}"][data-po-col="${col}"]`);
  const input = el?.matches('input, select, textarea')
    ? el
    : el?.querySelector<HTMLElement>('input, select, textarea');
  input?.focus();
  if (input instanceof HTMLInputElement && input.type !== 'date') {
    input.select();
  }
}

function handleSpreadsheetKeyDown(
  e: React.KeyboardEvent,
  rowIndex: number,
  colIndex: EditableCol,
  rowCount: number,
  container: HTMLElement | null,
) {
  const key = e.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;

  const colIdx = EDITABLE_COLS.indexOf(colIndex);
  let nextRow = rowIndex;
  let nextCol = colIndex;

  if (key === 'ArrowRight') {
    if (colIdx < EDITABLE_COLS.length - 1) nextCol = EDITABLE_COLS[colIdx + 1];
    else return;
  } else if (key === 'ArrowLeft') {
    if (colIdx > 0) nextCol = EDITABLE_COLS[colIdx - 1];
    else return;
  } else if (key === 'ArrowDown' || key === 'Enter') {
    if (rowIndex < rowCount - 1) nextRow = rowIndex + 1;
    else return;
  } else if (key === 'ArrowUp') {
    if (rowIndex > 0) nextRow = rowIndex - 1;
    else return;
  }

  e.preventDefault();
  focusPoCell(container, nextRow, nextCol);
}

function poCellKeyDown(
  e: React.KeyboardEvent,
  rowIndex: number,
  colIndex: EditableCol,
  rowCount: number,
  container: HTMLElement | null,
) {
  handleSpreadsheetKeyDown(e, rowIndex, colIndex, rowCount, container);
}

function parseQuantity(input: string): number {
  const n = parseInt(input, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

/** Convert a per-sell-unit selling price when the sell unit changes (pack ↔ piece). */
function convertSellingPrice(
  line: PoLineItem,
  from: string,
  to: string,
): number {
  const product = line.product;
  if (!product || line.newSellingPrice <= 0 || from === to) return line.newSellingPrice;
  const units = line.unitsPerBuyUom || 1;
  if (units <= 1) return line.newSellingPrice;
  const buy = (product.buyUom || '').trim();
  if (from === buy && to !== buy) return line.newSellingPrice / units;
  if (to === buy && from !== buy) return line.newSellingPrice * units;
  return line.newSellingPrice;
}

function lineFromPaste(
  id: number,
  row: ReturnType<typeof parseExcelPaste>[number],
  index: ProductCatalogIndex,
  receivedQuantity = 0,
): PoLineItem {
  const product = resolveProductFromInput(row.sku, index);
  const base = emptyPoLineItem(id);
  const seeded: PoLineItem = {
    ...base,
    skuInput: row.sku,
    quantityInput: String(row.quantity),
    buyUom: row.buyUom || '',
    unitsPerBuyUom: row.unitsPerBuyUom || 1,
    unitsPerPackTouched: row.unitsPerBuyUom > 1,
    unitCost: row.unitCost,
    unitCostBeforeVat: row.unitCost,
    receivedQuantity,
  };
  if (!product) {
    return { ...seeded, product: null, productNameFallback: '', resolveError: 'SKU not found' };
  }
  const applied = applyProductToLine(seeded, product);
  const unitCost = row.unitCost > 0 ? row.unitCost : applied.unitCost;
  return {
    ...applied,
    quantityInput: String(row.quantity),
    buyUom: row.buyUom || applied.buyUom,
    unitsPerBuyUom: row.unitsPerBuyUom > 1 ? row.unitsPerBuyUom : applied.unitsPerBuyUom,
    unitsPerPackTouched: row.unitsPerBuyUom > 1,
    unitCost,
    unitCostBeforeVat: row.unitCost > 0 ? row.unitCost : applied.unitCostBeforeVat,
    receivedQuantity,
  };
}

function resolveLineSku(line: PoLineItem, index: ProductCatalogIndex): PoLineItem {
  if (!line.skuInput.trim()) {
    return { ...line, product: null, productNameFallback: '', resolveError: undefined };
  }
  const product = resolveProductFromInput(line.skuInput, index);
  if (!product) {
    return { ...line, product: null, resolveError: 'SKU not found' };
  }
  return applyProductToLine(line, product);
}

function ensureTrailingEmptyRow(
  lines: PoLineItem[],
  nextId: () => number,
  primaryUom = '',
): PoLineItem[] {
  if (lines.length === 0) return [emptyPoLineItem(nextId(), primaryUom)];
  const last = lines[lines.length - 1];
  if (last.skuInput.trim() || last.product) {
    return [...lines, emptyPoLineItem(nextId(), primaryUom)];
  }
  return lines;
}

export interface PoLineItemsGridProps {
  lines: PoLineItem[];
  onChange: (lines: PoLineItem[]) => void;
  catalogIndex: ProductCatalogIndex;
  vatBill?: boolean;
  taxRate?: number;
  pasteWarning?: string;
  onPasteWarning?: (message: string) => void;
  onProductCreated?: (product: Product) => void;
}

const headerSx = {
  fontWeight: 700,
  fontSize: '0.75rem',
  whiteSpace: 'nowrap',
  py: 0.75,
  px: 1,
  bgcolor: 'action.hover',
  borderBottom: '1px solid',
  borderColor: 'divider',
};

const cellPadSx = { p: 0, borderBottom: '1px solid', borderColor: 'divider' };

function HeaderLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <Box>
      {label}
      {hint ? (
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontWeight: 400, lineHeight: 1.2 }}
        >
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

export function PoLineItemsGrid({
  lines,
  onChange,
  catalogIndex,
  vatBill = false,
  taxRate = 0,
  pasteWarning,
  onPasteWarning,
  onProductCreated,
}: PoLineItemsGridProps) {
  const uomOptions = useUomOptions();
  const primaryUom = defaultPrimaryUom(uomOptions);
  const nextIdRef = useRef(Math.max(0, ...lines.map((l) => l.id)) + 1);
  const [focusedRow, setFocusedRow] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForLineIndex, setCreateForLineIndex] = useState(0);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };

  const handleViewProduct = (product: Product) => {
    setQuickViewProduct(product);
    void productService
      .getById(product.id)
      .then((full) => {
        setQuickViewProduct((current) => (current?.id === full.id ? full : current));
      })
      .catch(() => {});
  };

  const emptyLine = () => emptyPoLineItem(nextId(), primaryUom);

  const updateLine = (index: number, patch: Partial<PoLineItem>) => {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const fetchLastPurchaseUnitCost = (lineId: number, productId: string) => {
    void productService
      .getLastPurchaseUnitCost(productId)
      .then((res) => {
        onChange(
          linesRef.current.map((l) =>
            l.id === lineId ? { ...l, lastPurchaseUnitCost: res.unitCost } : l,
          ),
        );
      })
      .catch(() => {
        onChange(
          linesRef.current.map((l) =>
            l.id === lineId ? { ...l, lastPurchaseUnitCost: null } : l,
          ),
        );
      });
  };

  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    onChange(ensureTrailingEmptyRow(next.length ? next : [emptyLine()], nextId, primaryUom));
  };

  const addLine = () => {
    onChange([...lines, emptyLine()]);
  };

  const applyPaste = useCallback(
    (text: string, startRowIndex: number) => {
      const parsed = parseExcelPaste(text);
      if (parsed.length === 0) return;

      const next = [...lines];
      let notFound = 0;

      parsed.forEach((row, offset) => {
        const targetIndex = startRowIndex + offset;
        const receivedQuantity = next[targetIndex]?.receivedQuantity ?? 0;
        if (receivedQuantity > 0) return;

        const pasted = lineFromPaste(
          next[targetIndex]?.id ?? nextId(),
          row,
          catalogIndex,
          receivedQuantity,
        );
        const line = vatBill
          ? {
              ...pasted,
              unitCostBeforeVat: pasted.unitCostBeforeVat > 0 ? pasted.unitCostBeforeVat : pasted.unitCost,
              unitCost: applyVatToUnitCost(
                pasted.unitCostBeforeVat > 0 ? pasted.unitCostBeforeVat : pasted.unitCost,
                taxRate,
              ),
            }
          : pasted;
        if (!line.product) notFound += 1;

        if (targetIndex < next.length) {
          next[targetIndex] = line;
        } else {
          next.push(line);
        }
      });

      onChange(ensureTrailingEmptyRow(next, nextId, primaryUom));
      const msg = notFound > 0
        ? `Pasted ${parsed.length} row(s) · ${notFound} SKU(s) not found`
        : `Pasted ${parsed.length} row(s)`;
      showSuccess(msg);
      if (notFound > 0) {
        onPasteWarning?.(`Unresolved SKUs: ${parsed.filter((r) => !resolveProductFromInput(r.sku, catalogIndex)).map((r) => r.sku).join(', ')}`);
      } else {
        onPasteWarning?.('');
      }
    },
    [lines, onChange, catalogIndex, onPasteWarning, primaryUom, vatBill, taxRate],
  );

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    applyPaste(text, focusedRow);
  };

  const withVat = (line: PoLineItem): PoLineItem => {
    if (!vatBill) return line;
    const before = line.unitCostBeforeVat > 0 ? line.unitCostBeforeVat : line.unitCost;
    return {
      ...line,
      unitCostBeforeVat: before,
      unitCost: applyVatToUnitCost(before, taxRate),
    };
  };

  const handleProductChange = (index: number, updatedLine: PoLineItem) => {
    const priced = withVat(updatedLine);
    let next = lines.map((l, i) => (i === index ? { ...priced, lastPurchaseUnitCost: undefined } : l));
    if (updatedLine.product && index === lines.length - 1) {
      next = [...next, emptyLine()];
    }
    onChange(next);
    if (priced.product) {
      fetchLastPurchaseUnitCost(priced.id, priced.product.id);
    }
  };

  const handleSkuBlur = (index: number) => {
    const resolved = withVat(resolveLineSku(lines[index], catalogIndex));
    let next = lines.map((l, i) =>
      i === index ? { ...resolved, lastPurchaseUnitCost: undefined } : l,
    );
    if (resolved.product && index === lines.length - 1) {
      next = [...next, emptyLine()];
    }
    onChange(next);
    if (resolved.product) {
      fetchLastPurchaseUnitCost(resolved.id, resolved.product.id);
    }
  };

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          px: 1.5,
          py: 1,
          bgcolor: 'action.hover',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {PO_PACKING_NOTE}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Copy from Excel: <strong>{PO_PASTE_HINT}</strong> — click a row, then Ctrl+V
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            aria-label="Create product"
            title="Create product"
            onClick={() => {
              setCreateForLineIndex(focusedRow);
              setCreateOpen(true);
            }}
          >
            <PersonAddAltIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Focus grid for paste"
            onClick={() => tableRef.current?.focus()}
          >
            <ContentPasteIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label="Add row" onClick={addLine}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {pasteWarning && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>{pasteWarning}</Alert>
      )}

      <TableContainer
        ref={tableRef}
        tabIndex={0}
        onPaste={handlePaste}
        sx={{ overflowX: 'auto', outline: 'none' }}
      >
        <Table
          size="small"
          sx={{
            tableLayout: 'fixed',
            minWidth: poFormTableMinWidth(vatBill),
            borderCollapse: 'collapse',
            '& .MuiTableCell-root': { overflow: 'hidden' },
          }}
        >
          <colgroup>
            {poFormColWidths(vatBill).map((w, i) => (
              <col key={i} style={{ width: w, minWidth: w }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={headerSx}>{PO_LABELS.sn}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.sku}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.product}</TableCell>
              <TableCell align="right" sx={headerSx}>
                <HeaderLabel label={PO_LABELS.packQty} hint={PO_LABELS.packQtyHint} />
              </TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.buyUom}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.sellUom}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.sellMode}</TableCell>
              <TableCell align="right" sx={headerSx}>
                <HeaderLabel label={PO_LABELS.unitsPerPack} hint={PO_LABELS.unitsPerPackHint} />
              </TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.totalUnits}</TableCell>
              <TableCell align="right" sx={headerSx}>
                <HeaderLabel label={PO_LABELS.existingCost} hint={PO_LABELS.existingCostHint} />
              </TableCell>
              <TableCell align="right" sx={headerSx}>
                <HeaderLabel label={PO_LABELS.sellingPrice} hint={PO_LABELS.sellingPriceHint} />
              </TableCell>
              <TableCell align="right" sx={headerSx}>
                <HeaderLabel label={PO_LABELS.newSellingPrice} hint={PO_LABELS.newSellingPriceHint} />
              </TableCell>
              {vatBill && (
                <TableCell align="right" sx={headerSx}>{PO_LABELS.unitCostBeforeVat}</TableCell>
              )}
              <TableCell align="right" sx={headerSx}>
                <HeaderLabel label={PO_LABELS.unitCost} hint={vatBill ? 'Includes VAT' : PO_LABELS.unitCostHint} />
              </TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.lineTotal}</TableCell>
              <TableCell sx={headerSx} />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => {
               const qty = parseQuantity(line.quantityInput);
               const locked = line.receivedQuantity > 0;
               const lineReady = Boolean(line.product || line.skuInput.trim());
               const totalUnits = packTotalUnits(qty, line.unitsPerBuyUom);
               const lineTotal = line.product || line.unitCost > 0 ? qty * line.unitCost : 0;

              return (
                <TableRow
                  key={line.id}
                  hover
                  sx={{
                    bgcolor: line.resolveError ? 'error.50' : undefined,
                  }}
                >
                  <TableCell align="center" sx={{ ...cellPadSx, color: 'text.secondary', fontSize: '0.75rem', fontWeight: 700 }}>
                    {index + 1}
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <TextField
                      fullWidth
                      size="small"
                      variant="outlined"
                      value={line.skuInput}
                      disabled={locked}
                      placeholder="SKU"
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => updateLine(index, { skuInput: e.target.value, resolveError: undefined })}
                      onBlur={() => handleSkuBlur(index)}
                      onKeyDown={(e) => poCellKeyDown(e, index, 0, lines.length, tableRef.current)}
                      error={!!line.resolveError}
                      sx={excelCellSx}
                      slotProps={{
                        htmlInput: { 'data-po-row': index, 'data-po-col': 0 },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <PoProductAutocompleteCell
                          line={line}
                          catalogIndex={catalogIndex}
                          disabled={locked}
                          onFocus={() => setFocusedRow(index)}
                          onLineChange={(updated) => handleProductChange(index, updated)}
                        />
                      </Box>
                      {line.product && (
                        <Tooltip title="View product details">
                          <IconButton
                            size="small"
                            aria-label="View product details"
                            title="View product details"
                            onClick={() => handleViewProduct(line.product!)}
                            sx={{ mt: 0.25, flexShrink: 0 }}
                          >
                            <VisibilityIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={cellPadSx}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      value={line.quantityInput}
                      disabled={locked || (!line.product && !line.skuInput.trim())}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => updateLine(index, { quantityInput: e.target.value })}
                      onBlur={() =>
                        updateLine(index, { quantityInput: String(parseQuantity(line.quantityInput)) })
                      }
                      onKeyDown={(e) => poCellKeyDown(e, index, 1, lines.length, tableRef.current)}
                      sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                      slotProps={{
                        htmlInput: {
                          min: 1,
                          style: { textAlign: 'right' },
                          'data-po-row': index,
                          'data-po-col': 1,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={line.buyUom}
                      disabled={locked || (!line.product && !line.skuInput.trim())}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => updateLine(index, { buyUom: e.target.value })}
                      onKeyDown={(e) => poCellKeyDown(e, index, 2, lines.length, tableRef.current)}
                      sx={excelCellSx}
                      slotProps={{
                        htmlInput: { 'data-po-row': index, 'data-po-col': 2 },
                      }}
                    >
                      {uomOptions.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={line.sellUom}
                      disabled={locked || !lineReady}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => {
                        const nextSellUom = e.target.value;
                        updateLine(index, {
                          sellUom: nextSellUom,
                          newSellingPrice: convertSellingPrice(line, line.sellUom, nextSellUom),
                        });
                      }}
                      sx={excelCellSx}
                    >
                      {(line.product
                        ? sellUomOptionsFor(line.product, line.sellMode, uomOptions)
                        : []
                      ).map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={line.sellMode}
                      disabled={locked || !lineReady}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => {
                        const mode = e.target.value as PoLineItem['sellMode'];
                        const options = line.product
                          ? sellUomOptionsFor(line.product, mode, uomOptions)
                          : [];
                        const valid = options.some((o) => o.value === line.sellUom);
                        const nextSellUom =
                          valid || options.length === 0 ? line.sellUom : options[0].value;
                        updateLine(index, {
                          sellMode: mode,
                          ...(nextSellUom !== line.sellUom
                            ? {
                                sellUom: nextSellUom,
                                newSellingPrice: convertSellingPrice(line, line.sellUom, nextSellUom),
                              }
                            : {}),
                        });
                      }}
                      sx={excelCellSx}
                    >
                      {SELL_MODE_OPTIONS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={cellPadSx}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      value={line.unitsPerBuyUom}
                      disabled={locked || (!line.product && !line.skuInput.trim())}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) =>
                        updateLine(index, {
                          unitsPerBuyUom: Math.max(1, parseInt(e.target.value, 10) || 1),
                          unitsPerPackTouched: true,
                        })
                      }
                      onKeyDown={(e) => poCellKeyDown(e, index, 3, lines.length, tableRef.current)}
                      sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                      slotProps={{
                        htmlInput: {
                          min: 1,
                          style: { textAlign: 'right' },
                          'data-po-row': index,
                          'data-po-col': 3,
                        },
                      }}
                    />
                  </TableCell>
                   <TableCell align="right" sx={{ ...cellPadSx, px: 1 }}>
                     <Typography
                       variant="body2"
                       sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                     >
                       {lineReady
                         ? `${line.sellUom === line.buyUom ? qty : totalUnits} ${uomLabel(line.sellUom, uomOptions)}`
                         : '—'}
                     </Typography>
                   </TableCell>
                   <TableCell align="right" sx={{ ...cellPadSx, px: 1 }}>
                     <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                       {line.product
                         ? line.snapshotUnitCost > 0
                           ? (() => {
                               const units = line.unitsPerBuyUom || 1;
                               const perSellUnit =
                                 units > 1 && line.sellUom && line.sellUom !== line.buyUom
                                   ? ` (${formatCurrency(line.snapshotUnitCost / units)} / ${uomLabel(line.sellUom, uomOptions)})`
                                   : '';
                               return `${formatCurrency(line.snapshotUnitCost)} / ${uomLabel(line.buyUom || '', uomOptions)}${perSellUnit}`;
                             })()
                           : '—'
                         : '—'}
                     </Typography>
                   </TableCell>
                   <TableCell align="right" sx={{ ...cellPadSx, px: 1 }}>
                     <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                       {line.product
                         ? (() => {
                             const buy = (line.product!.buyUom || '').trim();
                             const price = line.sellUom === buy
                               ? packSellOption(line.product!)?.price ?? line.sellingPrice
                               : line.sellingPrice;
                             return price > 0
                               ? `${formatCurrency(price)} / ${uomLabel(line.sellUom, uomOptions)}`
                               : '—';
                           })()
                         : '—'}
                     </Typography>
                   </TableCell>
                  <TableCell align="right" sx={cellPadSx}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      value={line.newSellingPrice}
                      disabled={locked || !lineReady}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) =>
                        updateLine(index, { newSellingPrice: parseFloat(e.target.value) || 0 })
                      }
                      onKeyDown={(e) => poCellKeyDown(e, index, 5, lines.length, tableRef.current)}
                      sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          step: 0.01,
                          style: { textAlign: 'right' },
                          'data-po-row': index,
                          'data-po-col': 5,
                        },
                      }}
                    />
                  </TableCell>
                  {vatBill && (
                    <TableCell align="right" sx={cellPadSx}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        value={line.unitCostBeforeVat}
                        disabled={locked || !lineReady}
                        onFocus={() => setFocusedRow(index)}
                        onChange={(e) => {
                          const before = parseFloat(e.target.value) || 0;
                          updateLine(index, {
                            unitCostBeforeVat: before,
                            unitCost: applyVatToUnitCost(before, taxRate),
                          });
                        }}
                        onKeyDown={(e) => poCellKeyDown(e, index, 4, lines.length, tableRef.current)}
                        sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                        slotProps={{
                          htmlInput: {
                            min: 0,
                            step: 0.01,
                            style: { textAlign: 'right' },
                            'data-po-row': index,
                            'data-po-col': 4,
                          },
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell align="right" sx={cellPadSx}>
                    {vatBill ? (
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem', textAlign: 'right', pr: 1, fontWeight: 600 }}>
                        {lineReady ? formatCurrency(line.unitCost) : '—'}
                      </Typography>
                    ) : (() => {
                      const existing = line.snapshotUnitCost;
                      const curr = line.unitCost;
                      const showDelta =
                        existing > 0 &&
                        Number.isFinite(curr) &&
                        Math.abs(curr - existing) > 0.01;
                      const up = showDelta && curr > existing;
                      const pct = showDelta ? (((curr - existing) / existing) * 100).toFixed(1) : '';
                      const lastPurchase = line.lastPurchaseUnitCost;
                      const lastPurchaseNote =
                        lastPurchase != null && lastPurchase > 0 && Math.abs(lastPurchase - existing) > 0.01
                          ? ` · Last purchase ${formatCurrency(lastPurchase)}`
                          : '';
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                          {showDelta && (
                            <Tooltip
                              title={`Existing ${formatCurrency(existing)} → New ${formatCurrency(curr)} (${up ? '+' : ''}${pct}%)${lastPurchaseNote}`}
                            >
                              {up ? (
                                <TrendingUpIcon color="warning" sx={{ fontSize: 18 }} />
                              ) : (
                                <TrendingDownIcon color="success" sx={{ fontSize: 18 }} />
                              )}
                             </Tooltip>
                           )}
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            value={line.unitCost}
                            disabled={locked || (!line.product && !line.skuInput.trim())}
                            onFocus={() => setFocusedRow(index)}
                            onChange={(e) => {
                              const cost = parseFloat(e.target.value) || 0;
                              updateLine(index, { unitCost: cost, unitCostBeforeVat: cost });
                            }}
                            onKeyDown={(e) => poCellKeyDown(e, index, 4, lines.length, tableRef.current)}
                            sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                            slotProps={{
                              htmlInput: {
                                min: 0,
                                step: 0.01,
                                style: { textAlign: 'right' },
                                'data-po-row': index,
                                'data-po-col': 4,
                              },
                            }}
                          />
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right" sx={{ ...cellPadSx, px: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', pr: 0.5 }}>
                      {lineTotal > 0 ? formatCurrency(lineTotal) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={locked || (lines.length === 1 && !line.skuInput && !line.product)}
                      onClick={() => removeLine(index)}
                      aria-label="Remove row"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <ProductCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialSku={lines[createForLineIndex]?.skuInput ?? ''}
        initialName={
          lines[createForLineIndex]?.resolveError
            ? lines[createForLineIndex]?.skuInput ?? ''
            : lines[createForLineIndex]?.productNameFallback ?? ''
        }
        onCreated={(product) => {
          const idx = createForLineIndex;
          const line = lines[idx] ?? emptyLine();
          const next = [...lines];
          const applied = withVat(applyProductToLine(
            { ...line, skuInput: product.sku || product.name },
            product,
          ));
          next[idx] = { ...applied, lastPurchaseUnitCost: null };
          onChange(ensureTrailingEmptyRow(next, nextId, primaryUom));
          onProductCreated?.(product);
          fetchLastPurchaseUnitCost(applied.id, product.id);
        }}
      />
      <ProductQuickViewDialog
        product={quickViewProduct}
        open={Boolean(quickViewProduct)}
        onClose={() => setQuickViewProduct(null)}
      />
    </Paper>
  );
}
