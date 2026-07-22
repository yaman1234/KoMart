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
import { useUomOptions } from '@/hooks/useUoms';
import { formatCurrency } from '@/utils';
import { defaultPrimaryUom } from '@/utils/uomNormalize';
import { showSuccess } from '@/utils/toast';
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
import { PO_LABELS, PO_PASTE_HINT } from '@/pages/purchase-orders/poTerminology';
import { PoProductAutocompleteCell } from '@/pages/purchase-orders/components/PoProductAutocompleteCell';

const EDITABLE_COLS = [0, 1, 2, 3, 4] as const;
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

export interface PoLineItemsGridProps {
  lines: PoLineItem[];
  onChange: (lines: PoLineItem[]) => void;
  catalogIndex: ProductCatalogIndex;
  pasteWarning?: string;
  onPasteWarning?: (message: string) => void;
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

export function PoLineItemsGrid({
  lines,
  onChange,
  catalogIndex,
  pasteWarning,
  onPasteWarning,
}: PoLineItemsGridProps) {
  const uomOptions = useUomOptions();
  const primaryUom = defaultPrimaryUom(uomOptions);
  const nextIdRef = useRef(Math.max(0, ...lines.map((l) => l.id)) + 1);
  const [focusedRow, setFocusedRow] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };

  const emptyLine = () => emptyPoLineItem(nextId(), primaryUom);

  const updateLine = (index: number, patch: Partial<PoLineItem>) => {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
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
    let next = lines.map((l, i) => (i === index ? updatedLine : l));
    if (updatedLine.product && index === lines.length - 1) {
      next = [...next, emptyLine()];
    }
    onChange(next);
  };

  const handleSkuBlur = (index: number) => {
    const resolved = resolveLineSku(lines[index], catalogIndex);
    let next = lines.map((l, i) => (i === index ? resolved : l));
    if (resolved.product && index === lines.length - 1) {
      next = [...next, emptyLine()];
    }
    onChange(next);
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
        <Typography variant="caption" color="text.secondary">
          Copy from Excel: <strong>{PO_PASTE_HINT}</strong> — click a row, then Ctrl+V
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
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
            minWidth: poFormTableMinWidth(),
            borderCollapse: 'collapse',
          }}
        >
          <colgroup>
            {poFormColWidths().map((w, i) => (
              <col key={i} style={{ width: w, minWidth: w }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={headerSx}>#</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.sku}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.product}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.packQty}</TableCell>
              <TableCell sx={headerSx}>{PO_LABELS.buyUom}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.unitsPerPack}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.unitCost}</TableCell>
              <TableCell align="right" sx={headerSx}>{PO_LABELS.lineTotal}</TableCell>
              <TableCell sx={headerSx} />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => {
              const qty = parseQuantity(line.quantityInput);
              const locked = line.receivedQuantity > 0;
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
                    <PoProductAutocompleteCell
                      line={line}
                      catalogIndex={catalogIndex}
                      disabled={locked}
                      onFocus={() => setFocusedRow(index)}
                      onLineChange={(updated) => handleProductChange(index, updated)}
                    />
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
                  <TableCell align="right" sx={cellPadSx}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      value={line.unitCost}
                      disabled={locked || (!line.product && !line.skuInput.trim())}
                      onFocus={() => setFocusedRow(index)}
                      onChange={(e) =>
                        updateLine(index, { unitCost: parseFloat(e.target.value) || 0 })
                      }
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
    </Paper>
  );
}
