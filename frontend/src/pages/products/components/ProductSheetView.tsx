import { memo, useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
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
  TableSortLabel,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/services/apiClient';
import type { ListQueryParams, Product, ProductBulkUpdateItem, ProductStatus, Supplier } from '@/types';
import { showSuccess, showWarning, showError } from '@/utils/toast';
import { copyProductsToClipboard } from '@/pages/products/productPasteExport';
import {
  filterByStock,
  type StockFilter,
} from '@/pages/products/productStockFilter';
import {
  PRODUCT_SHEET_COLUMNS,
  EXTRA_COLUMN_START_INDEX,
  isPoPasteColumn,
  isSheetColumnRightAligned,
  productSheetColWidths,
  productSheetTableMinWidth,
  getSheetCellValue,
  applyDraftPricing,
  type ProductSheetColumnDef,
} from '@/pages/products/productSheetColumnDefs';
import { PO_LABELS } from '@/pages/purchase-orders/poTerminology';
import { useBulkUpdateProducts } from '@/hooks/useProducts';
import {
  COUNTRIES,
  DROPDOWN_PAGE_SIZE,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUS_OPTIONS,
} from '@/constants';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCategoryNames } from '@/hooks/useCategories';
import { useUomOptions } from '@/hooks/useUoms';

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
  canCreatePo?: boolean;
  canBulkEdit?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: 'name' | 'sku') => void;
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

const poHeaderSx = { ...headerSx, bgcolor: 'action.selected' };

const cellSx = {
  py: 0.5,
  px: 0.5,
  fontSize: '0.8125rem',
  borderBottom: '1px solid',
  borderColor: 'divider',
};

const extraColBorder = {
  borderLeft: '2px solid',
  borderColor: 'divider',
};

const nativeInputSx = {
  width: '100%',
  font: 'inherit',
  fontSize: '0.8125rem',
  lineHeight: 1.4,
  py: 0.5,
  px: 0.75,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 0.5,
  bgcolor: 'background.paper',
  boxSizing: 'border-box',
  '&:focus': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: 0,
  },
};

function copyToast(copied: number, skipped: number) {
  let msg = `Copied ${copied} row${copied !== 1 ? 's' : ''}`;
  if (skipped > 0) msg += ` (${skipped} skipped — no SKU)`;
  showSuccess(msg);
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeProduct(product: Product, draft?: Partial<Product>): Product {
  if (!draft) return product;
  return { ...product, ...draft };
}

function buildBulkPayload(
  product: Product,
  draft: Partial<Product>,
): ProductBulkUpdateItem | null {
  const payload: ProductBulkUpdateItem = { id: product.id };
  let changed = false;

  const keys: (keyof Product)[] = [
    'name', 'brand', 'countryOfOrigin', 'category', 'barcode', 'supplierId',
    'buyUom', 'uom', 'unitsPerBuyUom', 'sellMode', 'costPrice', 'sellingPrice',
    'packSellingPrice', 'discountPercent', 'offeredPrice', 'packDiscountPercent',
    'packOfferedPrice', 'lowStockThreshold', 'status', 'tags', 'nutritionInfo',
    'allergenInfo', 'images', 'description',
  ];

  for (const key of keys) {
    const next = draft[key];
    if (next === undefined) continue;
    const prev = product[key];
    const same = Array.isArray(next) && Array.isArray(prev)
      ? JSON.stringify(next) === JSON.stringify(prev)
      : next === prev;
    if (!same) {
      (payload as Record<string, unknown>)[key] = next;
      changed = true;
    }
  }

  return changed ? payload : null;
}

interface SelectOptions {
  suppliers: Supplier[];
  categories: string[];
  countries: readonly string[];
  uoms: { value: string; label: string }[];
  sellModes: { value: string; label: string }[];
  statuses: typeof PRODUCT_STATUS_OPTIONS;
}

interface SheetCellProps {
  product: Product;
  col: ProductSheetColumnDef;
  bulkEditMode: boolean;
  draft?: Partial<Product>;
  options: SelectOptions;
  onCellChange: (productId: string, field: keyof Product, value: unknown) => void;
}

const SheetCell = memo(function SheetCell({
  product,
  col,
  bulkEditMode,
  draft,
  options,
  onCellChange,
}: SheetCellProps) {
  const merged = useMemo(() => mergeProduct(product, draft), [product, draft]);
  const display = useMemo(() => getSheetCellValue(merged, col), [merged, col]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!bulkEditMode || !col.editable || !col.field) {
    return (
      <Typography
        variant="body2"
        sx={{
          fontSize: 'inherit',
          fontWeight: col.key === 'sku' ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={display}
      >
        {display || '—'}
      </Typography>
    );
  }

  const field = col.field;
  if (field === 'packQty' || field === 'poUnitCost' || field === 'packCost') {
    return <Typography variant="body2" sx={{ fontSize: 'inherit' }}>{display}</Typography>;
  }

  const pid = product.id;
  const inputProps = { onClick: stop, onFocus: stop };

  if (col.type === 'number') {
    const numField = field as keyof Product;
    const raw = merged[numField];
    return (
      <Box
        component="input"
        type="number"
        value={raw ?? ''}
        step={col.key.includes('discount') ? 0.1 : 0.01}
        sx={nativeInputSx}
        {...inputProps}
        onChange={(e) => {
          const v = e.target.value;
          onCellChange(pid, numField, v === '' ? 0 : Number(v));
        }}
      />
    );
  }

  if (col.type === 'select') {
    if (field === 'supplierId') {
      return (
        <Box
          component="select"
          value={merged.supplierId ?? ''}
          sx={nativeInputSx}
          {...inputProps}
          onChange={(e) => onCellChange(pid, 'supplierId', e.target.value)}
        >
          <option value="">None</option>
          {options.suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Box>
      );
    }
    if (field === 'category') {
      return (
        <Box
          component="select"
          value={merged.category ?? ''}
          sx={nativeInputSx}
          {...inputProps}
          onChange={(e) => onCellChange(pid, 'category', e.target.value)}
        >
          <option value="">None</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Box>
      );
    }
    if (field === 'countryOfOrigin') {
      return (
        <Box
          component="select"
          value={merged.countryOfOrigin ?? ''}
          sx={nativeInputSx}
          {...inputProps}
          onChange={(e) => onCellChange(pid, 'countryOfOrigin', e.target.value)}
        >
          <option value="">None</option>
          {options.countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Box>
      );
    }
    if (field === 'buyUom' || field === 'uom') {
      return (
        <Box
          component="select"
          value={(merged[field] as string) ?? 'pcs'}
          sx={nativeInputSx}
          {...inputProps}
          onChange={(e) => onCellChange(pid, field, e.target.value)}
        >
          {options.uoms.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </Box>
      );
    }
    if (field === 'sellMode') {
      return (
        <Box
          component="select"
          value={merged.sellMode ?? 'unit'}
          sx={nativeInputSx}
          {...inputProps}
          onChange={(e) => onCellChange(pid, 'sellMode', e.target.value)}
        >
          {options.sellModes.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Box>
      );
    }
    if (field === 'status') {
      return (
        <Box
          component="select"
          value={merged.status ?? 'active'}
          sx={nativeInputSx}
          {...inputProps}
          onChange={(e) => onCellChange(pid, 'status', e.target.value as ProductStatus)}
        >
          {options.statuses.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Box>
      );
    }
  }

  if (field === 'tags' || field === 'images') {
    const list = (merged[field] as string[] | undefined) ?? [];
    return (
      <Box
        component="input"
        value={list.join(', ')}
        placeholder="Comma-separated"
        sx={nativeInputSx}
        {...inputProps}
        onChange={(e) => onCellChange(pid, field, parseList(e.target.value))}
      />
    );
  }

  const textField = field as keyof Product;
  if (col.type === 'multiline') {
    return (
      <Box
        component="textarea"
        value={(merged[textField] as string) ?? ''}
        rows={2}
        sx={{ ...nativeInputSx, resize: 'vertical', minHeight: 40 }}
        {...inputProps}
        onChange={(e) => onCellChange(pid, textField, e.target.value)}
      />
    );
  }

  return (
    <Box
      component="input"
      type="text"
      value={(merged[textField] as string) ?? ''}
      sx={nativeInputSx}
      {...inputProps}
      onChange={(e) => onCellChange(pid, textField, e.target.value)}
    />
  );
});

interface SheetRowProps {
  product: Product;
  draft?: Partial<Product>;
  bulkEditMode: boolean;
  selected: boolean;
  options: SelectOptions;
  onToggle: (id: string) => void;
  onCellChange: (productId: string, field: keyof Product, value: unknown) => void;
}

const SheetRow = memo(function SheetRow({
  product,
  draft,
  bulkEditMode,
  selected,
  options,
  onToggle,
  onCellChange,
}: SheetRowProps) {
  const hasSku = (product.sku ?? '').trim().length > 0;
  const rowDirty = !!draft;

  return (
    <TableRow
      hover
      selected={selected}
      onClick={() => onToggle(product.id)}
      sx={{
        cursor: bulkEditMode ? 'default' : 'pointer',
        bgcolor: rowDirty ? 'warning.50' : undefined,
      }}
    >
      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          size="small"
          checked={selected}
          disabled={bulkEditMode}
          onChange={() => onToggle(product.id)}
        />
      </TableCell>
      {PRODUCT_SHEET_COLUMNS.map((col, index) => (
        <TableCell
          key={col.key}
          align={isSheetColumnRightAligned(index) ? 'right' : 'left'}
          sx={{
            ...cellSx,
            ...(index === EXTRA_COLUMN_START_INDEX ? extraColBorder : {}),
            color: !hasSku && col.key === 'sku' ? 'error.main' : undefined,
          }}
        >
          <SheetCell
            product={product}
            col={col}
            bulkEditMode={bulkEditMode}
            draft={draft}
            options={options}
            onCellChange={onCellChange}
          />
        </TableCell>
      ))}
    </TableRow>
  );
});

export function ProductSheetView({
  products,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  stockFilter,
  canCreatePo = false,
  canBulkEdit = false,
  sortBy,
  sortOrder = 'asc',
  onSort,
}: ProductSheetViewProps) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditActivating, setBulkEditActivating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<Product>>>({});

  const bulkMutation = useBulkUpdateProducts();
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const dbCategories = useCategoryNames();
  const categoryOptions = useMemo(
    () => (dbCategories.length > 0 ? dbCategories : [...PRODUCT_CATEGORIES]),
    [dbCategories],
  );
  const uomOptions = useUomOptions();
  const suppliers = suppliersData?.data ?? [];

  const selectOptions = useMemo<SelectOptions>(() => ({
    suppliers,
    categories: categoryOptions,
    countries: COUNTRIES,
    uoms: uomOptions,
    sellModes: [
      { value: 'unit', label: 'Pack' },
      { value: 'piece', label: 'Piece' },
      { value: 'both', label: 'Both' },
    ],
    statuses: PRODUCT_STATUS_OPTIONS,
  }), [suppliers, categoryOptions, uomOptions]);

  const productsRef = useRef(products);
  productsRef.current = products;

  const displayProducts = useMemo(
    () => filterByStock(products, stockFilter ?? ''),
    [products, stockFilter],
  );

  const isDirty = Object.keys(drafts).length > 0;

  const pageFilteredEmpty =
    !loading && products.length > 0 && displayProducts.length === 0 && !!stockFilter;

  useEffect(() => {
    if (!bulkEditMode) setDrafts({});
    setSelectedIds(new Set());
  }, [page, pageSize, products, stockFilter, bulkEditMode]);

  const allPageSelected =
    displayProducts.length > 0 && displayProducts.every((p) => selectedIds.has(p.id));
  const somePageSelected =
    displayProducts.some((p) => selectedIds.has(p.id)) && !allPageSelected;

  const selectedWithSku = useMemo(
    () => displayProducts.filter(
      (p) => selectedIds.has(p.id) && (p.sku ?? '').trim().length > 0,
    ),
    [displayProducts, selectedIds],
  );

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(displayProducts.map((p) => p.id)));
  };

  const toggleRow = useCallback((id: string) => {
    if (bulkEditMode) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [bulkEditMode]);

  const handleCopySelected = async () => {
    const selected = displayProducts.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      showWarning('Select at least one row to copy');
      return;
    }
    setCopying(true);
    try {
      const { copied, skipped } = await copyProductsToClipboard(selected);
      copyToast(copied, skipped);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setCopying(false);
    }
  };

  const handleCreatePurchaseOrder = () => {
    if (selectedWithSku.length === 0) {
      showWarning('Select at least one product with a SKU');
      return;
    }
    navigate('/purchase-orders/new', { state: { prefillProducts: selectedWithSku } });
  };

  const handleCellChange = useCallback((productId: string, field: keyof Product, value: unknown) => {
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product) return;
    setDrafts((prev) => {
      const current = { ...prev[productId], [field]: value } as Partial<Product>;
      const pricingFields: (keyof Product)[] = [
        'costPrice', 'sellingPrice', 'packSellingPrice', 'unitsPerBuyUom',
        'discountPercent', 'offeredPrice', 'packDiscountPercent', 'packOfferedPrice',
      ];
      const withPricing = pricingFields.includes(field)
        ? applyDraftPricing(product, current, field)
        : current;
      return { ...prev, [productId]: withPricing };
    });
  }, []);

  const handleEnableBulkEdit = () => {
    setBulkEditActivating(true);
    requestAnimationFrame(() => {
      startTransition(() => {
        setBulkEditMode(true);
        setBulkEditActivating(false);
      });
    });
  };

  const handleCancelEdit = () => {
    setDrafts({});
    setBulkEditMode(false);
  };

  const handleSave = async () => {
    const updates: ProductBulkUpdateItem[] = [];
    for (const product of displayProducts) {
      const draft = drafts[product.id];
      if (!draft) continue;
      const item = buildBulkPayload(product, draft);
      if (item) updates.push(item);
    }
    if (updates.length === 0) {
      showWarning('No changes to save');
      return;
    }
    try {
      const result = await bulkMutation.mutateAsync(updates);
      if (result.errors.length > 0) {
        showWarning(`Saved ${result.updated} row(s); ${result.errors.length} failed`);
      } else {
        showSuccess(`Saved ${result.updated} product${result.updated !== 1 ? 's' : ''}`);
      }
      setDrafts({});
      setBulkEditMode(false);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const colAlign = (index: number): 'left' | 'right' =>
    isSheetColumnRightAligned(index) ? 'right' : 'left';

  const colWidths = useMemo(() => productSheetColWidths(), []);
  const tableMinWidth = useMemo(() => productSheetTableMinWidth(), []);

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
          Sheet view — bulk edit catalog
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          PO paste columns: {PO_LABELS.sku} · {PO_LABELS.packQty} · {PO_LABELS.buyUom} · {PO_LABELS.unitCost} · {PO_LABELS.unitsPerPack} — copy selected rows and paste into PO line grid with Ctrl+V
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {canBulkEdit && !bulkEditMode && (
            <Button
              size="small"
              variant="contained"
              startIcon={bulkEditActivating ? <CircularProgress size={14} color="inherit" /> : <EditIcon />}
              disabled={bulkEditActivating || loading}
              onClick={handleEnableBulkEdit}
            >
              Bulk edit
            </Button>
          )}
          {canBulkEdit && bulkEditMode && (
            <>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<SaveIcon />}
                disabled={!isDirty || bulkMutation.isPending}
                onClick={() => void handleSave()}
              >
                Save changes
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CloseIcon />}
                disabled={bulkMutation.isPending}
                onClick={handleCancelEdit}
              >
                Cancel
              </Button>
            </>
          )}
          {!bulkEditMode && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              disabled={copying || selectedIds.size === 0}
              onClick={() => void handleCopySelected()}
            >
              Copy selected
            </Button>
          )}
          {canCreatePo && !bulkEditMode && (
            <Button
              size="small"
              variant="contained"
              color="secondary"
              startIcon={<ReceiptLongIcon />}
              disabled={selectedWithSku.length === 0}
              onClick={handleCreatePurchaseOrder}
            >
              Create Purchase Order
            </Button>
          )}
        </Box>
      </Box>

      {bulkEditMode && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Edit any cell below, then Save changes. SKU and Stock are read-only — adjust stock from Inventory.
          {displayProducts.length > 40 && (
            <> For smoother editing on large pages, use 25 rows per page.</>
          )}
        </Alert>
      )}

      {pageFilteredEmpty && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          No products on this page match the stock filter.
        </Alert>
      )}

      <TableContainer sx={{ overflowX: 'auto', userSelect: bulkEditMode ? 'auto' : 'text' }}>
        <Table
          size="small"
          sx={{
            tableLayout: 'fixed',
            minWidth: tableMinWidth,
            borderCollapse: 'collapse',
          }}
        >
          <colgroup>
            {colWidths.map((w, i) => (
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
                  disabled={displayProducts.length === 0 || bulkEditMode}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </TableCell>
              {PRODUCT_SHEET_COLUMNS.map((col, index) => {
                const headerStyle = {
                  ...(isPoPasteColumn(index) ? poHeaderSx : headerSx),
                  ...(index === EXTRA_COLUMN_START_INDEX ? extraColBorder : {}),
                };
                return (
                  <TableCell
                    key={col.key}
                    align={colAlign(index)}
                    sortDirection={col.sortKey && sortBy === col.sortKey ? sortOrder : false}
                    sx={headerStyle}
                  >
                    {col.sortKey && onSort && !bulkEditMode ? (
                      <TableSortLabel
                        active={sortBy === col.sortKey}
                        direction={sortBy === col.sortKey ? sortOrder : 'asc'}
                        onClick={() => onSort(col.sortKey!)}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : (
                      col.label
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading || bulkEditActivating ? (
              <TableRow>
                <TableCell colSpan={PRODUCT_SHEET_COLUMNS.length + 1} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : displayProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={PRODUCT_SHEET_COLUMNS.length + 1} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    {pageFilteredEmpty ? 'No matching products on this page' : 'No products found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              displayProducts.map((product) => (
                <SheetRow
                  key={product.id}
                  product={product}
                  draft={drafts[product.id]}
                  bulkEditMode={bulkEditMode}
                  selected={selectedIds.has(product.id)}
                  options={selectOptions}
                  onToggle={toggleRow}
                  onCellChange={handleCellChange}
                />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total ?? displayProducts.length}
        page={page}
        onPageChange={(_, p) => {
          if (isDirty) {
            showWarning('Save or cancel bulk edits before changing page');
            return;
          }
          onPageChange(p);
        }}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => {
          if (isDirty) {
            showWarning('Save or cancel bulk edits before changing page size');
            return;
          }
          onPageSizeChange(Number(e.target.value));
          onPageChange(0);
        }}
        rowsPerPageOptions={[25, 50, 100]}
      />
    </Paper>
  );
}
