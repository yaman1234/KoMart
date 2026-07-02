import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
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
import BlockIcon from '@mui/icons-material/Block';
import { useDiscountRules, useCreateDiscountRule, useUpdateDiscountRule, useDeleteDiscountRule } from '@/hooks/useDiscounts';
import { useProducts } from '@/hooks/useProducts';
import { useCategoryNames } from '@/hooks/useCategories';
import { DISCOUNT_RULE_TYPES } from '@/constants';
import { getErrorMessage } from '@/services/apiClient';
import type { DiscountRule, DiscountRuleType } from '@/types';

const EMPTY_FORM = {
  name: '',
  code: '',
  ruleType: 'category_percent' as DiscountRuleType,
  value: 10,
  productId: '',
  category: '',
  minCartTotal: 0,
  maxDiscount: 0,
  priority: 0,
};

function ruleTypeLabel(type: DiscountRuleType): string {
  return DISCOUNT_RULE_TYPES.find((t) => t.value === type)?.label ?? type;
}

function ruleScopeLabel(rule: DiscountRule): string {
  if (rule.ruleType.startsWith('product_')) return rule.productId ? `Product` : '—';
  if (rule.ruleType.startsWith('category_')) return rule.category || '—';
  return 'Entire cart';
}

function ruleValueLabel(rule: DiscountRule): string {
  return rule.ruleType.includes('percent') ? `${rule.value}%` : `Rs. ${rule.value}`;
}

export function DiscountsTab() {
  const { data: rules = [], isLoading } = useDiscountRules(false);
  const { data: productsData } = useProducts({ pageSize: 200 });
  const categories = useCategoryNames();
  const products = productsData?.data ?? [];

  const createMutation = useCreateDiscountRule();
  const updateMutation = useUpdateDiscountRule();
  const deleteMutation = useDeleteDiscountRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DiscountRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const needsProduct = form.ruleType.startsWith('product_');
  const needsCategory = form.ruleType.startsWith('category_');
  const isPercent = form.ruleType.includes('percent');

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)),
    [rules],
  );

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (rule: DiscountRule) => {
    setEditTarget(rule);
    setForm({
      name: rule.name,
      code: rule.code,
      ruleType: rule.ruleType,
      value: rule.value,
      productId: rule.productId,
      category: rule.category,
      minCartTotal: rule.minCartTotal,
      maxDiscount: rule.maxDiscount,
      priority: rule.priority,
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setError('');
    try {
      if (editTarget) {
        await updateMutation.mutateAsync({ id: editTarget.id, ...form });
      } else {
        await createMutation.mutateAsync(form);
      }
      setDialogOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDeactivate = async (rule: DiscountRule) => {
    try {
      await deleteMutation.mutateAsync(rule.id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Discount Rules</Typography>
          <Typography variant="body2" color="text.secondary">
            Auto-apply promotions at POS. Leave coupon code empty for automatic rules.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Rule
        </Button>
      </Box>

      {error && !dialogOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Scope</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Coupon</TableCell>
              <TableCell align="right">Min Cart</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
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
                  <TableCell>{ruleScopeLabel(rule)}</TableCell>
                  <TableCell>{ruleValueLabel(rule)}</TableCell>
                  <TableCell>{rule.code || 'Auto'}</TableCell>
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
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(rule)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {rule.isActive && (
                      <Tooltip title="Deactivate">
                        <IconButton size="small" color="error" onClick={() => void handleDeactivate(rule)}>
                          <BlockIcon fontSize="small" />
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
        <DialogTitle>{editTarget ? 'Edit Discount Rule' : 'New Discount Rule'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            required
          />
          <FormControl fullWidth>
            <InputLabel>Rule Type</InputLabel>
            <Select
              label="Rule Type"
              value={form.ruleType}
              onChange={(e) => setForm((f) => ({ ...f, ruleType: e.target.value as DiscountRuleType }))}
            >
              {DISCOUNT_RULE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {needsProduct && (
            <FormControl fullWidth>
              <InputLabel>Product</InputLabel>
              <Select
                label="Product"
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
              >
                {products.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {needsCategory && (
            <FormControl fullWidth>
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
          <TextField
            label={isPercent ? 'Discount (%)' : 'Discount (NPR)'}
            type="number"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
            fullWidth
            slotProps={{ htmlInput: { min: 0, max: isPercent ? 100 : undefined, step: isPercent ? 1 : 10 } }}
          />
          <TextField
            label="Coupon Code (optional)"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            fullWidth
            helperText="Leave blank to auto-apply when conditions match"
          />
          <TextField
            label="Minimum Cart Total (NPR)"
            type="number"
            value={form.minCartTotal}
            onChange={(e) => setForm((f) => ({ ...f, minCartTotal: Number(e.target.value) || 0 }))}
            fullWidth
          />
          <TextField
            label="Max Discount Cap (NPR, 0 = none)"
            type="number"
            value={form.maxDiscount}
            onChange={(e) => setForm((f) => ({ ...f, maxDiscount: Number(e.target.value) || 0 }))}
            fullWidth
          />
          <TextField
            label="Priority"
            type="number"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
            fullWidth
            helperText="Higher priority rules are evaluated first"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
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
