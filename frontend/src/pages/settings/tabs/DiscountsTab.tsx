import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
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
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { SettingsSectionHeader } from '@/components/common/SettingsSectionHeader';
import { useDiscountRules, useCreateDiscountRule, useUpdateDiscountRule, useDeleteDiscountRule } from '@/hooks/useDiscounts';
import { useProducts } from '@/hooks/useProducts';
import { useCategoryNames } from '@/hooks/useCategories';
import { DISCOUNT_RULE_TYPES, PRODUCT_SEARCH_PAGE_SIZE, UOM_OPTIONS } from '@/constants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/services/apiClient';
import { productService } from '@/services';
import { useAuthStore } from '@/store';
import { isAdmin, isAdminOrManager } from '@/utils';
import { showSuccess } from '@/utils/toast';
import type { DiscountRule, DiscountRuleType, Product } from '@/types';

type ProductLabel = { name: string; sku?: string };

const EMPTY_FORM = {
  name: '',
  code: '',
  ruleType: 'category_percent' as DiscountRuleType,
  value: 10,
  productIds: [] as string[],
  category: '',
  minCartTotal: 0,
  minLineQty: 0,
  buyQty: 1,
  getQty: 1,
  sellUom: '',
  maxDiscount: 0,
  priority: 0,
};

const zebraRowSx = {
  '&:nth-of-type(odd)': { bgcolor: 'action.hover' },
};

function ruleTypeLabel(type: DiscountRuleType): string {
  return DISCOUNT_RULE_TYPES.find((t) => t.value === type)?.label ?? type;
}

function ruleValueLabel(rule: DiscountRule): string {
  if (rule.ruleType === 'product_bogo') {
    return `Buy ${rule.buyQty ?? 1} Get ${rule.getQty ?? 1}`;
  }
  return rule.ruleType.includes('percent') ? `${rule.value}%` : `Rs. ${rule.value}`;
}

function productNamesTooltipTitle(
  productIds: string[],
  productMap: Map<string, ProductLabel>,
): React.ReactNode {
  return (
    <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
      {productIds.map((id, index) => (
        <Typography key={id} component="span" variant="caption" sx={{ display: 'block' }}>
          {index + 1}. {productMap.get(id)?.name ?? 'Loading…'}
        </Typography>
      ))}
    </Box>
  );
}

function ScopeCell({
  rule,
  productMap,
}: {
  rule: DiscountRule;
  productMap: Map<string, ProductLabel>;
}) {
  if (rule.ruleType.startsWith('product_')) {
    const count = rule.productIds.length;
    if (count === 0) {
      return <Typography variant="body2" color="text.secondary">—</Typography>;
    }
    const label = count === 1 ? '1 product' : `${count} products`;
    return (
      <Tooltip title={productNamesTooltipTitle(rule.productIds, productMap)} arrow placement="top-start">
        <Link
          component="button"
          type="button"
          variant="body2"
          underline="hover"
          sx={{ cursor: 'default', textAlign: 'left' }}
          onClick={(e) => e.preventDefault()}
        >
          {label}
        </Link>
      </Tooltip>
    );
  }
  if (rule.ruleType.startsWith('category_')) {
    return <Typography variant="body2">{rule.category || '—'}</Typography>;
  }
  return <Typography variant="body2">Entire cart</Typography>;
}

export function DiscountsTab() {
  const user = useAuthStore((s) => s.user);
  const canManage = isAdminOrManager(user?.role);
  const canDelete = isAdmin(user?.role);

  const { data: rules = [], isLoading } = useDiscountRules(false);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const categories = useCategoryNames();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DiscountRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [productLabelCache, setProductLabelCache] = useState<Map<string, ProductLabel>>(() => new Map());

  const needsProduct = form.ruleType.startsWith('product_');
  const needsCategory = form.ruleType.startsWith('category_');
  const isBogo = form.ruleType === 'product_bogo';
  const isPercent = form.ruleType.includes('percent');
  const isLineRule = needsProduct || needsCategory;

  const { data: searchProductsData } = useProducts(
    { search: debouncedProductSearch || undefined, pageSize: PRODUCT_SEARCH_PAGE_SIZE },
    { enabled: dialogOpen && needsProduct && canManage },
  );

  const products = searchProductsData?.data ?? [];

  const allProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of rules) {
      for (const id of rule.productIds) ids.add(id);
    }
    for (const id of form.productIds) ids.add(id);
    return [...ids];
  }, [rules, form.productIds]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const missing = await new Promise<string[]>((resolve) => {
        setProductLabelCache((prev) => {
          resolve(allProductIds.filter((id) => !prev.has(id)));
          return prev;
        });
      });
      if (cancelled || missing.length === 0) return;

      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const product = await productService.getById(id);
            return { id, name: product.name, sku: product.sku };
          } catch {
            return { id, name: 'Unknown product', sku: undefined as string | undefined };
          }
        }),
      );
      if (cancelled) return;

      setProductLabelCache((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const { id, name, sku } of results) {
          if (next.has(id)) continue;
          next.set(id, { name, sku });
          changed = true;
        }
        return changed ? next : prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [allProductIds]);

  useEffect(() => {
    if (!products.length) return;
    setProductLabelCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const p of products) {
        const existing = next.get(p.id);
        if (!existing || existing.name !== p.name || existing.sku !== p.sku) {
          next.set(p.id, { name: p.name, sku: p.sku });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [products]);

  const createMutation = useCreateDiscountRule();
  const updateMutation = useUpdateDiscountRule();
  const deleteMutation = useDeleteDiscountRule();

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)),
    [rules],
  );

  const selectedProducts = useMemo(
    () => form.productIds.map((id) => {
      const fromSearch = products.find((p) => p.id === id);
      if (fromSearch) return fromSearch;
      const label = productLabelCache.get(id);
      return {
        id,
        name: label?.name ?? 'Loading…',
        sku: label?.sku ?? '',
      } as Product;
    }),
    [products, form.productIds, productLabelCache],
  );

  const productOptions = useMemo(() => {
    const byId = new Map<string, Product>();
    for (const p of products) byId.set(p.id, p);
    return [...byId.values()];
  }, [products]);

  const openCreate = () => {
    if (!canManage) return;
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setProductSearch('');
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (rule: DiscountRule) => {
    if (!canManage) return;
    setEditTarget(rule);
    setProductSearch('');
    setForm({
      name: rule.name,
      code: '',
      ruleType: rule.ruleType,
      value: rule.value,
      productIds: rule.productIds,
      category: rule.category,
      minCartTotal: rule.minCartTotal,
      minLineQty: rule.minLineQty ?? 0,
      buyQty: rule.buyQty ?? 1,
      getQty: rule.getQty ?? 1,
      sellUom: rule.sellUom ?? '',
      maxDiscount: rule.maxDiscount,
      priority: rule.priority,
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!canManage) return;
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (isBogo && (form.buyQty < 1 || form.getQty < 1)) {
      setError('Buy qty and get qty must be at least 1');
      return;
    }
    if (needsProduct && form.productIds.length === 0) {
      setError('Select at least one product');
      return;
    }
    setError('');
    const payload = {
      ...form,
      code: '',
      value: isBogo ? 0 : form.value,
      category: isBogo ? '' : form.category,
    };
    try {
      if (editTarget) {
        await updateMutation.mutateAsync({ id: editTarget.id, ...payload });
        showSuccess('Discount rule updated.');
      } else {
        await createMutation.mutateAsync(payload);
        showSuccess('Discount rule created.');
      }
      setDialogOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggleActive = async (rule: DiscountRule) => {
    if (!canManage) return;
    try {
      await updateMutation.mutateAsync({ id: rule.id, isActive: !rule.isActive });
      showSuccess(rule.isActive ? 'Discount rule deactivated.' : 'Discount rule activated.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (rule: DiscountRule) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete discount rule "${rule.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(rule.id);
      showSuccess('Discount rule deleted.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const addProduct = (product: Product | null) => {
    if (!product) return;
    setProductLabelCache((prev) => {
      const next = new Map(prev);
      next.set(product.id, { name: product.name, sku: product.sku });
      return next;
    });
    setForm((f) => (
      f.productIds.includes(product.id)
        ? f
        : { ...f, productIds: [...f.productIds, product.id] }
    ));
    setProductSearch('');
  };

  const removeProduct = (productId: string) => {
    setForm((f) => ({ ...f, productIds: f.productIds.filter((id) => id !== productId) }));
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <SettingsSectionHeader
        title="Discount Rules"
        description="Auto-apply promotions at POS when cart conditions match."
        action={canManage ? (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            Add Rule
          </Button>
        ) : undefined}
      />

      {error && !dialogOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Scope</TableCell>
              <TableCell>Value</TableCell>
              <TableCell align="right">Min Cart</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No discount rules yet
                </TableCell>
              </TableRow>
            ) : (
              sortedRules.map((rule) => (
                <TableRow key={rule.id} sx={{ opacity: rule.isActive ? 1 : 0.55 }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{rule.name}</Typography>
                    {rule.priority > 0 && (
                      <Typography variant="caption" color="text.secondary">Priority {rule.priority}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{ruleTypeLabel(rule.ruleType)}</TableCell>
                  <TableCell>
                    <ScopeCell rule={rule} productMap={productLabelCache} />
                  </TableCell>
                  <TableCell>{ruleValueLabel(rule)}</TableCell>
                  <TableCell align="right">
                    {rule.minCartTotal > 0 ? `Rs. ${rule.minCartTotal}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={rule.isActive ? 'Active' : 'Inactive'}
                      size="small"
                      color={rule.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {canManage && (
                      <>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(rule)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={rule.isActive ? 'Deactivate' : 'Activate'}>
                          <IconButton
                            size="small"
                            color={rule.isActive ? 'warning' : 'success'}
                            onClick={() => void handleToggleActive(rule)}
                            disabled={updateMutation.isPending}
                          >
                            {rule.isActive
                              ? <BlockIcon fontSize="small" />
                              : <CheckCircleIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {canDelete && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void handleDelete(rule)}
                          disabled={deleteMutation.isPending}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {editTarget ? 'Edit Discount Rule' : 'New Discount Rule'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            size="small"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            required
          />
          <FormControl fullWidth size="small">
            <InputLabel>Rule Type</InputLabel>
            <Select
              label="Rule Type"
              value={form.ruleType}
              onChange={(e) => {
                const nextType = e.target.value as DiscountRuleType;
                setForm((f) => ({
                  ...f,
                  ruleType: nextType,
                  value: nextType === 'product_bogo' ? 0 : f.value || 10,
                  buyQty: f.buyQty || 1,
                  getQty: f.getQty || 1,
                }));
              }}
            >
              {DISCOUNT_RULE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {needsProduct && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Autocomplete<Product, false, false, false>
                size="small"
                options={productOptions}
                inputValue={productSearch}
                onInputChange={(_e, value, reason) => {
                  if (reason === 'input') setProductSearch(value);
                  else if (reason === 'clear') setProductSearch('');
                }}
                getOptionLabel={(option: Product) => option.name}
                value={null}
                onChange={(_e, newValue) => addProduct(newValue)}
                isOptionEqualToValue={(option: Product, value: Product) => option.id === value.id}
                filterOptions={(opts) => opts.filter((p) => !form.productIds.includes(p.id))}
                renderInput={(params) => (
                  <TextField {...params} size="small" label="Add products" placeholder="Search products…" />
                )}
              />
              {selectedProducts.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell width={48}>SN</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>SKU</TableCell>
                        <TableCell align="right" width={48} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedProducts.map((product, index) => (
                        <TableRow key={product.id} sx={zebraRowSx}>
                          <TableCell>
                            <Typography variant="body2">{index + 1}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{product.name}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {product.sku || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Remove">
                              <IconButton size="small" onClick={() => removeProduct(product.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No products selected
                </Typography>
              )}
            </Box>
          )}
          {needsCategory && (
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {isBogo ? (
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="Buy Qty (X)"
                size="small"
                type="number"
                value={form.buyQty}
                onChange={(e) => setForm((f) => ({ ...f, buyQty: Math.max(1, Number(e.target.value) || 1) }))}
                fullWidth
                required
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                helperText="Paid units per set"
              />
              <TextField
                label="Get Free (Y)"
                size="small"
                type="number"
                value={form.getQty}
                onChange={(e) => setForm((f) => ({ ...f, getQty: Math.max(1, Number(e.target.value) || 1) }))}
                fullWidth
                required
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                helperText="Free units per set"
              />
            </Box>
          ) : (
            <TextField
              label={isPercent ? 'Discount (%)' : 'Discount (NPR)'}
              size="small"
              type="number"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
              fullWidth
              slotProps={{ htmlInput: { min: 0, max: isPercent ? 100 : undefined, step: isPercent ? 1 : 10 } }}
            />
          )}
          <TextField
            label="Min Cart Total (NPR)"
            size="small"
            type="number"
            value={form.minCartTotal}
            onChange={(e) => setForm((f) => ({ ...f, minCartTotal: Number(e.target.value) || 0 }))}
            fullWidth
          />
          {!isBogo && isLineRule && (
            <TextField
              label="Min Line Qty"
              size="small"
              type="number"
              value={form.minLineQty || ''}
              onChange={(e) => setForm((f) => ({ ...f, minLineQty: Number(e.target.value) || 0 }))}
              fullWidth
              helperText="Optional — qty in sell UOM"
            />
          )}
          {isLineRule && (
            <FormControl fullWidth size="small">
              <InputLabel>Sell UOM</InputLabel>
              <Select
                label="Sell UOM"
                value={form.sellUom}
                onChange={(e) => setForm((f) => ({ ...f, sellUom: e.target.value }))}
              >
                <MenuItem value="">Any</MenuItem>
                {UOM_OPTIONS.map((uom) => (
                  <MenuItem key={uom.value} value={uom.value}>{uom.label}</MenuItem>
                ))}
              </Select>
              <FormHelperText>Any = all units</FormHelperText>
            </FormControl>
          )}
          <TextField
            label="Max Cap (NPR, 0 = none)"
            size="small"
            type="number"
            value={form.maxDiscount}
            onChange={(e) => setForm((f) => ({ ...f, maxDiscount: Number(e.target.value) || 0 }))}
            fullWidth
          />
          <TextField
            label="Priority"
            size="small"
            type="number"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
            fullWidth
            helperText="Higher priority evaluated first"
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => void handleSave()}
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {editTarget ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
