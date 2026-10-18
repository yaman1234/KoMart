import { useState, useMemo } from 'react';
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
import DeleteIcon from '@mui/icons-material/Delete';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { useProducts } from '@/hooks/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useExpenseCategoryOptions } from '@/hooks/useExpenseCategories';
import { useRecordProductConsumption } from '@/hooks/useExpenses';
import { useUsers } from '@/hooks/useUsers';
import { useAuthStore } from '@/store';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { formatCurrency } from '@/utils';
import { formatStockQty } from '@/utils/uomDisplay';
import { showApiError, showSuccess, showWarning } from '@/utils/toast';
import type { Product } from '@/types';

interface ConsumedItemRow {
  product: Product;
  quantity: number;
}

interface StaffProductExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  defaultStaffName?: string;
}

export function StaffProductExpenseDialog({
  open,
  onClose,
  defaultStaffName = '',
}: StaffProductExpenseDialogProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [staffName, setStaffName] = useState(() => defaultStaffName || currentUser?.name || '');
  const [category, setCategory] = useState('supplies');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<ConsumedItemRow[]>([]);
  const [searchInput, setSearchInput] = useState('');

  const { data: users = [], isLoading: usersLoading } = useUsers();
  const staffOptions = useMemo(() => {
    return users
      .filter((u) => u.isActive !== false)
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }));
  }, [users]);

  const categoryOptions = useExpenseCategoryOptions();
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const recordMutation = useRecordProductConsumption();

  const { data: searchResults, isFetching: searchLoading } = useProducts(
    {
      search: debouncedSearch.trim() || undefined,
      pageSize: 30,
      includeImages: false,
    },
    { enabled: open && debouncedSearch.trim().length > 0 },
  );

  const productOptions = useMemo(() => {
    return (searchResults?.data ?? []).filter((p) => p.status !== 'discontinued');
  }, [searchResults]);

  const handleAddProduct = (product: Product | null) => {
    if (!product) return;
    if (product.stock <= 0) {
      showWarning(`"${product.name}" has 0 on-hand stock.`);
      return;
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const currentQty = prev[idx].quantity;
        if (currentQty + 1 > product.stock) {
          showWarning(`Cannot add more than on-hand stock (${product.stock}).`);
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: currentQty + 1 };
        return updated;
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearchInput('');
  };

  const handleUpdateQuantity = (productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const validQty = Math.max(1, Math.min(qty, i.product.stock));
        return { ...i, quantity: validQty };
      }),
    );
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const totalExpenseCost = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity * (item.product.costPrice || 0), 0);
  }, [items]);

  const handleResetAndClose = () => {
    setStaffName(defaultStaffName || currentUser?.name || '');
    setCategory('supplies');
    setDate(new Date().toISOString().slice(0, 10));
    setRemarks('');
    setItems([]);
    setSearchInput('');
    onClose();
  };

  const handleSubmit = () => {
    if (!staffName.trim()) {
      showWarning('Please enter the staff or manager name.');
      return;
    }
    if (items.length === 0) {
      showWarning('Please add at least one product.');
      return;
    }
    for (const item of items) {
      if (item.quantity <= 0 || item.quantity > item.product.stock) {
        showWarning(`Invalid quantity for "${item.product.name}". Available: ${item.product.stock}`);
        return;
      }
    }

    recordMutation.mutate(
      {
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
        })),
        staff_name: staffName.trim(),
        category,
        date,
        remarks: remarks.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          showSuccess(`Store usage recorded: ${res.title} (${formatCurrency(res.amount)})`);
          handleResetAndClose();
        },
        onError: (err) => showApiError(err, 'Failed to record store product usage.'),
      },
    );
  };

  return (
    <Dialog open={open} onClose={handleResetAndClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Inventory2OutlinedIcon color="primary" />
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            Record Staff & Store Product Usage
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Track products taken from inventory for staff consumption or internal store operations.
          Expense is recorded at <strong>cost price (COGS)</strong> and will not affect cash drawer balances.
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 2.5 }}>
        {/* Basic metadata */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Autocomplete
            freeSolo
            options={staffOptions.map((s) => s.name)}
            value={staffName}
            loading={usersLoading}
            onChange={(_e, val) => setStaffName(val || '')}
            onInputChange={(_e, val) => setStaffName(val)}
            renderOption={(props, option) => {
              const { key, ...rest } = props;
              const staff = staffOptions.find((s) => s.name === option);
              return (
                <Box
                  component="li"
                  key={key}
                  {...rest}
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75 }}
                >
                  <Typography variant="body2">{option}</Typography>
                  {staff?.role && (
                    <Chip
                      label={staff.role}
                      size="small"
                      variant="outlined"
                      color={staff.role === 'admin' ? 'error' : staff.role === 'manager' ? 'primary' : 'default'}
                      sx={{ height: 20, fontSize: '0.7rem', textTransform: 'capitalize' }}
                    />
                  )}
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Staff / Manager Name"
                placeholder="Select staff or type custom name"
                required
                fullWidth
                size="small"
                autoFocus
              />
            )}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Expense Category</InputLabel>
            <Select
              label="Expense Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <NepaliAwareDatePicker
            label="Date of Usage"
            value={date}
            onChange={(val) => setDate(val)}
          />
          <TextField
            label="Purpose / Remarks (Optional)"
            placeholder="e.g. Refreshments for staff meeting, pantry cleaning"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            fullWidth
            size="small"
          />
        </Box>

        {/* Product Search & Add */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>
            Search & Add Products
          </Typography>
          <Autocomplete
            options={productOptions}
            loading={searchLoading}
            inputValue={searchInput}
            onInputChange={(_e, val) => setSearchInput(val)}
            onChange={(_e, val) => handleAddProduct(val)}
            getOptionLabel={(option) => `${option.name} (${option.sku})`}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            renderOption={(props, option) => {
              const { key, ...rest } = props;
              return (
                <Box
                  component="li"
                  key={key}
                  {...rest}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {option.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      SKU: {option.sku} {option.category ? `• ${option.category}` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Chip
                      size="small"
                      label={`Cost: ${formatCurrency(option.costPrice)}`}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                    <Chip
                      size="small"
                      color={option.stock > 0 ? 'success' : 'error'}
                      label={formatStockQty(option.stock, option.uom ?? 'pcs')}
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </Box>
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="Type product name, SKU, or barcode to add…"
              />
            )}
          />
        </Box>

        {/* Consumed Products Table */}
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 280 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, width: 110 }}>
                    Stock
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 110 }}>
                    Cost Price
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, width: 120 }}>
                    Qty Used
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 120 }}>
                    Total Cost
                  </TableCell>
                  <TableCell align="right" sx={{ width: 50 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <AddShoppingCartIcon sx={{ fontSize: 32, opacity: 0.4 }} />
                        <Typography variant="body2">No products added yet.</Typography>
                        <Typography variant="caption">Search or scan above to select products.</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => {
                    const lineCost = row.quantity * (row.product.costPrice || 0);
                    return (
                      <TableRow key={row.product.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.product.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            SKU: {row.product.sku}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            variant="outlined"
                            label={formatStockQty(row.product.stock, row.product.uom ?? 'pcs')}
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatCurrency(row.product.costPrice)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <TextField
                            type="number"
                            size="small"
                            value={row.quantity}
                            slotProps={{
                              htmlInput: {
                                min: 1,
                                max: row.product.stock,
                                style: { textAlign: 'center' },
                              },
                            }}
                            onChange={(e) =>
                              handleUpdateQuantity(row.product.id, parseInt(e.target.value, 10) || 1)
                            }
                            sx={{ width: 80 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {formatCurrency(lineCost)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Remove item">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveItem(row.product.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {items.length > 0 && (
            <Box
              sx={{
                p: 1.5,
                bgcolor: 'action.hover',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {items.length} product{items.length === 1 ? '' : 's'} selected
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                Total Cost: {formatCurrency(totalExpenseCost)}
              </Typography>
            </Box>
          )}
        </Paper>

        <Alert severity="info" sx={{ fontSize: '0.825rem' }}>
          <strong>Non-cash inventory deduction:</strong> This action permanently deducts stock from inventory batches using FEFO costing. It generates an expense tagged as <em>Store Inventory</em> and does <strong>not</strong> deduct cash from the register.
        </Alert>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleResetAndClose} color="inherit" disabled={recordMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={recordMutation.isPending || items.length === 0 || !staffName.trim()}
          startIcon={
            recordMutation.isPending ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <Inventory2OutlinedIcon />
            )
          }
        >
          {recordMutation.isPending ? 'Recording...' : `Record Usage (${formatCurrency(totalExpenseCost)})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
