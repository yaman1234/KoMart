import { useCallback, useMemo, useRef, useState } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { productService } from '@/services';
import { useUomOptions } from '@/hooks/useUoms';
import { formatCurrency } from '@/utils';
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
import { applyVatToUnitCost, stripVatFromUnitCost } from '@/pages/purchase-orders/poPricing';
import { PO_LABELS, PO_PASTE_HINT } from '@/pages/purchase-orders/poTerminology';
import { PoProductAutocompleteCell } from '@/pages/purchase-orders/components/PoProductAutocompleteCell';

function parseQuantity(input: string): number {
  const n = parseInt(input, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

function lineFromPaste(
  id: number,
  row: ReturnType<typeof parseExcelPaste>[number],
  index: ProductCatalogIndex,
  receivedQuantity = 0,
): PoLineItem {
  const product = resolveProductFromInput(row.sku, index);
  const unitCost = row.unitCost > 0
    ? row.unitCost
    : product
      ? product.costPrice * (product.unitsPerBuyUom ?? 1)
      : 0;
  return {
    id,
    skuInput: row.sku,
    product,
    productNameFallback: product?.name ?? '',
    quantityInput: String(row.quantity),
    buyUom: row.buyUom || product?.buyUom || product?.uom || '',
    unitsPerBuyUom: row.unitsPerBuyUom || product?.unitsPerBuyUom || 1,
    unitCost,
    receivedQuantity,
    resolveError: product ? undefined : 'SKU not found',
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

function focusPoCell(container: HTMLElement | null, row: number, col: number) {
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
  colIndex: number,
  editableCols: number[],
  rowCount: number,
  container: HTMLElement | null,
) {
  const key = e.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;

  const colIdx = editableCols.indexOf(colIndex);
  if (colIdx < 0) return;
  let nextRow = rowIndex;
  let nextCol = colIndex;

  if (key === 'ArrowRight') {
    if (colIdx < editableCols.length - 1) nextCol = editableCols[colIdx + 1];
    else return;
  } else if (key === 'ArrowLeft') {
    if (colIdx > 0) nextCol = editableCols[colIdx - 1];
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

export interface PoLineItemsGridProps {
  lines: PoLineItem[];
  onChange: (lines: PoLineItem[]) => void;
  catalogIndex: ProductCatalogIndex;
  pasteWarning?: string;
  onPasteWarning?: (message: string) => void;
  onProductCreated?: (product: Product) => void;
  vatBill?: boolean;
  taxRate?: number;
}

const headerSx = {
  fontWeight: 700,
  fontSize: '0.75rem',
  whiteSpace: 'nowrap' as const,
  py: 0.75,
  px: 1,
  bgcolor: 'action.hover',
  borderBottom: '1px solid',
  borderColor: 'divider',
  position: 'sticky' as const,
  top: 0,
  zIndex: 2,
};

const cellPadSx = { p: 0, borderBottom: '1px solid', borderColor: 'divider' };

export function PoLineItemsGrid({
  lines,
  onChange,
  catalogIndex,
  pasteWarning,
  onPasteWarning,
  onProductCreated,
  vatBill = false,
  taxRate = 0,
}: PoLineItemsGridProps) {
  const uomOptions = useUomOptions();
  const primaryUom = defaultPrimaryUom(uomOptions);
  const nextIdRef = useRef(Math.max(0, ...lines.map((l) => l.id)) + 1);
  const [focusedRow, setFocusedRow] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForLineIndex, setCreateForLineIndex] = useState(0);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const editableCols = useMemo(
    () => (vatBill ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]),
    [vatBill],
  );
  const costCol = vatBill ? 5 : 4;
  const beforeVatCol = 4;

  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };

  /** Full product (images included) — catalog rows use includeImages:false. */
  const openProductQuickView = async (productId: string, fallback: Product | null) => {
    setQuickViewLoading(true);
    try {
      const full = await productService.getById(productId);
      setQuickViewProduct(full);
    } catch {
      setQuickViewProduct(fallback);
    } finally {
      setQuickViewLoading(false);
    }
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

        const line = lineFromPaste(
          next[targetIndex]?.id ?? nextId(),
          row,
          catalogIndex,
          receivedQuantity,
        );
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
    [lines, onChange, catalogIndex, onPasteWarning, primaryUom],
  );

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    applyPaste(text, focusedRow);
  };

  const handleProductChange = (index: number, updatedLine: PoLineItem) => {
    let next = lines.map((l, i) => (i === index ? { ...updatedLine, lastPurchaseUnitCost: undefined } : l));
    if (updatedLine.product && index === lines.length - 1) {
      next = [...next, emptyLine()];
    }
    onChange(next);
    if (updatedLine.product) {
      fetchLastPurchaseUnitCost(updatedLine.id, updatedLine.product.id);
    }
  };

  const handleSkuBlur = (index: number) => {
    const resolved = resolveLineSku(lines[index], catalogIndex);
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

  const onCellKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    handleSpreadsheetKeyDown(e, rowIndex, colIndex, editableCols, lines.length, tableRef.current);
  };

  const lineInactive = (line: PoLineItem) => !line.product && !line.skuInput.trim();

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
        <Typography variant="caption" color="text.secondary">
          Paste: <strong>{PO_PASTE_HINT}</strong> — Ctrl+V
        </Typography>
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

      {vatBill && taxRate > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 0.75 }}>
          Cost includes {taxRate}% VAT
        </Typography>
      )}

      <TableContainer
        ref={tableRef}
        tabIndex={0}
        onPaste={handlePaste}
        sx={{ overflowX: 'auto', outline: 'none', maxHeight: '70vh' }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            tableLayout: 'fixed',
            minWidth: poFormTableMinWidth(vatBill),
            borderCollapse: 'collapse',
          }}
        >
          <colgroup>
            {poFormColWidths(vatBill).map((w, i) => (
              <col key={i} style={{ width: w, minWidth: w }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={headerSx}>#</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.sku}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.product}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.qty}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.buyUom}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.perPack}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.totalUnits}</TableCell>
              {vatBill && (
                <TableCell align="right" sx={headerSx}>{PO_LABELS.costBeforeVat}</TableCell>
              )}
              <TableCell align="right" sx={headerSx}>{PO_LABELS.cost}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.amount}</TableCell>
              <TableCell sx={headerSx} />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => {
              const qty = parseQuantity(line.quantityInput);
              const locked = line.receivedQuantity > 0;
              const inactive = lineInactive(line);
              const totalUnits = qty * (line.unitsPerBuyUom || 1);
              const amount = line.product || line.unitCost > 0 ? qty * line.unitCost : 0;
              const beforeVat = vatBill
                ? stripVatFromUnitCost(line.unitCost, taxRate)
                : 0;

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
                      onKeyDown={(e) => onCellKeyDown(e, index, 0)}
                      error={!!line.resolveError}
                      sx={excelCellSx}
                      slotProps={{
                        htmlInput: { 'data-po-row': index, 'data-po-col': 0 },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={cellPadSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
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
                        <Tooltip title="View product">
                          <IconButton
                            size="small"
                            aria-label="View product"
                            disabled={quickViewLoading}
                            onClick={() => void openProductQuickView(line.product!.id, line.product)}
                            sx={{ flexShrink: 0 }}
                          >
                            <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
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
                      disabled={locked || inactive}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => updateLine(index, { quantityInput: e.target.value })}
                      onBlur={() =>
                        updateLine(index, { quantityInput: String(parseQuantity(line.quantityInput)) })
                      }
                      onKeyDown={(e) => onCellKeyDown(e, index, 1)}
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
                      disabled={locked || inactive}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) => updateLine(index, { buyUom: e.target.value })}
                      onKeyDown={(e) => onCellKeyDown(e, index, 2)}
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
                  <TableCell align="right" sx={cellPadSx}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      value={line.unitsPerBuyUom}
                      disabled={locked || inactive}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) =>
                        updateLine(index, {
                          unitsPerBuyUom: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      onKeyDown={(e) => onCellKeyDown(e, index, 3)}
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
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem', pr: 0.5, color: 'text.secondary' }}>
                      {!inactive ? totalUnits : '—'}
                    </Typography>
                  </TableCell>
                  {vatBill && (
                    <TableCell align="right" sx={cellPadSx}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        value={inactive ? '' : beforeVat}
                        disabled={locked || inactive}
                        onFocus={() => setFocusedRow(index)}
                        onChange={(e) => {
                          const before = parseFloat(e.target.value) || 0;
                          updateLine(index, {
                            unitCost: applyVatToUnitCost(before, taxRate),
                          });
                        }}
                        onKeyDown={(e) => onCellKeyDown(e, index, beforeVatCol)}
                        sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                        slotProps={{
                          htmlInput: {
                            min: 0,
                            step: 0.01,
                            style: { textAlign: 'right' },
                            'data-po-row': index,
                            'data-po-col': beforeVatCol,
                          },
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell align="right" sx={cellPadSx}>
                    {(() => {
                      const prev = line.lastPurchaseUnitCost;
                      const curr = line.unitCost;
                      const showDelta =
                        prev != null &&
                        prev > 0 &&
                        Number.isFinite(curr) &&
                        Math.abs(curr - prev) > 0.01;
                      const up = showDelta && curr > prev;
                      const pct = showDelta ? (((curr - prev) / prev) * 100).toFixed(1) : '';
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                          {showDelta && (
                            <Tooltip
                              title={`Previous cost ${formatCurrency(prev)} → now ${formatCurrency(curr)} (${up ? '+' : ''}${pct}%)`}
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
                            disabled={locked || inactive}
                            onFocus={() => setFocusedRow(index)}
                            onChange={(e) =>
                              updateLine(index, { unitCost: parseFloat(e.target.value) || 0 })
                            }
                            onKeyDown={(e) => onCellKeyDown(e, index, costCol)}
                            sx={{ ...excelCellSx, ...noNumberSpinnerSx }}
                            slotProps={{
                              htmlInput: {
                                min: 0,
                                step: 0.01,
                                style: { textAlign: 'right' },
                                'data-po-row': index,
                                'data-po-col': costCol,
                              },
                            }}
                          />
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right" sx={{ ...cellPadSx, px: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', pr: 0.5 }}>
                      {amount > 0 ? formatCurrency(amount) : '—'}
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
        onCreated={(product) => {
          const idx = createForLineIndex;
          const line = lines[idx] ?? emptyLine();
          const next = [...lines];
          const applied = applyProductToLine(
            { ...line, skuInput: product.sku || product.name },
            product,
          );
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
