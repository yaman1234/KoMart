import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { productService } from '@/services';
import { getErrorMessage } from '@/services/apiClient';
import type { ListQueryParams, Product } from '@/types';
import { showSuccess, showWarning, showError } from '@/utils/toast';
import {
  copyProductsToClipboard,
  productToSheetCells,
} from '@/pages/products/productPasteExport';
import {
  filterByStock,
  type StockFilter,
} from '@/pages/products/productStockFilter';
import {
  isPoPasteHeader,
  isSheetColumnRightAligned,
  PRODUCT_SHEET_HEADERS,
  productSheetColWidths,
  productSheetTableMinWidth,
} from '@/pages/products/productSheetColumns';
import { PO_PASTE_HINT } from '@/pages/purchase-orders/poTerminology';

export interface ProductSheetViewProps {
  products: Product[];
  loading: boolean;
  page: number;
  pageSize: number;
  total?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  filters: ListQueryParams;
  stockFilter?: StockFilter;
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

const poHeaderSx = {
  ...headerSx,
  bgcolor: 'action.selected',
};

const cellSx = {
  py: 0.75,
  px: 1,
  fontSize: '0.8125rem',
  borderBottom: '1px solid',
  borderColor: 'divider',
  userSelect: 'text' as const,
};

const extraColBorder = {
  borderLeft: '2px solid',
  borderColor: 'divider',
};

function copyToast(copied: number, skipped: number, truncatedTotal?: number) {
  if (truncatedTotal && truncatedTotal > copied) {
    let msg = `Copied first ${copied} of ${truncatedTotal} matching products`;
    if (skipped > 0) msg += ` (${skipped} skipped — no SKU)`;
    showWarning(msg);
    return;
  }
  let msg = `Copied ${copied} row${copied !== 1 ? 's' : ''}`;
  if (skipped > 0) msg += ` (${skipped} skipped — no SKU)`;
  showSuccess(msg);
}

export function ProductSheetView({
  products,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  filters,
  stockFilter,
}: ProductSheetViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);

  const displayProducts = useMemo(
    () => filterByStock(products, stockFilter ?? ''),
    [products, stockFilter],
  );

  const pageFilteredEmpty =
    !loading && products.length > 0 && displayProducts.length === 0 && !!stockFilter;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, pageSize, products, stockFilter]);

  const allPageSelected =
    displayProducts.length > 0 && displayProducts.every((p) => selectedIds.has(p.id));
  const somePageSelected =
    displayProducts.some((p) => selectedIds.has(p.id)) && !allPageSelected;

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(displayProducts.map((p) => p.id)));
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async (items: Product[]) => {
    setCopying(true);
    try {
      const { copied, skipped } = await copyProductsToClipboard(items);
      copyToast(copied, skipped);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setCopying(false);
    }
  };

  const handleCopySelected = () => {
    const selected = displayProducts.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      showWarning('Select at least one row to copy');
      return;
    }
    void handleCopy(selected);
  };

  const handleCopyPage = () => {
    if (displayProducts.length === 0) {
      showWarning('No products on this page to copy');
      return;
    }
    void handleCopy(displayProducts);
  };

  const handleCopyFiltered = async () => {
    setCopying(true);
    try {
      const result = await productService.getAll({ ...filters, page: 1, pageSize: 500 });
      const filtered = filterByStock(result.data, stockFilter ?? '');
      const { copied, skipped } = await copyProductsToClipboard(filtered);
      copyToast(copied, skipped, result.total > 500 ? result.total : undefined);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setCopying(false);
    }
  };

  const colAlign = (index: number): 'left' | 'right' =>
    isSheetColumnRightAligned(index) ? 'right' : 'left';

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Sheet view — copy rows for Purchase Orders
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          PO columns: {PO_PASTE_HINT} — paste into PO line grid with Ctrl+V
        </Typography>
        {stockFilter && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Stock filter applies per page. Use &quot;Copy all filtered&quot; to export all matching products.
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            disabled={copying || selectedIds.size === 0}
            onClick={handleCopySelected}
          >
            Copy selected
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            disabled={copying || displayProducts.length === 0}
            onClick={handleCopyPage}
          >
            Copy page
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<ContentCopyIcon />}
            disabled={copying}
            onClick={() => void handleCopyFiltered()}
          >
            Copy all filtered
          </Button>
        </Box>
      </Box>

      {pageFilteredEmpty && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          No products on this page match the stock filter. Try another page or use Copy all filtered.
        </Alert>
      )}

      <TableContainer sx={{ overflowX: 'auto', userSelect: 'text' }}>
        <Table
          size="small"
          sx={{
            tableLayout: 'fixed',
            minWidth: productSheetTableMinWidth(),
            borderCollapse: 'collapse',
          }}
        >
          <colgroup>
            {productSheetColWidths().map((w, i) => (
              <col key={i} style={{ width: w, minWidth: w }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={headerSx}>
                <Checkbox
                  size="small"
                  checked={allPageSelected}
                  indeterminate={somePageSelected}
                  disabled={displayProducts.length === 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </TableCell>
              {PRODUCT_SHEET_HEADERS.map((label, index) => (
                <TableCell
                  key={label}
                  align={colAlign(index)}
                  sx={{
                    ...(isPoPasteHeader(index) ? poHeaderSx : headerSx),
                    ...(index === 5 ? extraColBorder : {}),
                  }}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={PRODUCT_SHEET_HEADERS.length + 1} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : displayProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={PRODUCT_SHEET_HEADERS.length + 1} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    {pageFilteredEmpty ? 'No matching products on this page' : 'No products found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              displayProducts.map((product) => {
                const cells = productToSheetCells(product);
                const hasSku = (product.sku ?? '').trim().length > 0;
                return (
                  <TableRow
                    key={product.id}
                    hover
                    selected={selectedIds.has(product.id)}
                    onClick={() => toggleRow(product.id)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleRow(product.id)}
                      />
                    </TableCell>
                    {cells.map((value, index) => (
                      <TableCell
                        key={index}
                        align={colAlign(index)}
                        sx={{
                          ...cellSx,
                          ...(index === 5 ? extraColBorder : {}),
                          color: !hasSku && index === 0 ? 'error.main' : undefined,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: 'inherit',
                            fontWeight: index === 0 ? 600 : 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={value}
                        >
                          {value}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total ?? displayProducts.length}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => {
          onPageSizeChange(Number(e.target.value));
          onPageChange(0);
        }}
        rowsPerPageOptions={[25, 50, 100]}
      />
    </Paper>
  );
}
