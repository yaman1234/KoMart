import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatCard } from '@/components/common/StatCard';
import { useExpenses, useExpenseStats, useDeleteExpense } from '@/hooks/useExpenses';
import { useExpenseCategoryLabelMap, useExpenseCategoryOptions } from '@/hooks/useExpenseCategories';
import { formatCurrency, isAdminOrManager } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { showApiError, showSuccess } from '@/utils/toast';
import { useAuthStore } from '@/store';
import type { Expense } from '@/types';
import { ExpenseCategoryInfoIcon } from './expenseCategoryInfo';
import { StaffProductExpenseDialog } from './StaffProductExpenseDialog';

const CATEGORY_COLOR: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  setup_investment: 'secondary',
  purchase_order: 'info',
  rent: 'primary',
  utilities: 'info',
  salaries: 'warning',
  marketing: 'success',
  supplies: 'default',
  maintenance: 'default',
  equipment: 'primary',
  other: 'default',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function ExpensesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const formatDate = useFormatDate();
  const user = useAuthStore((s) => s.user);
  const canManage = isAdminOrManager(user?.role);
  const categoryOptions = useExpenseCategoryOptions();
  const categoryLabels = useExpenseCategoryLabelMap();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [setupFilter, setSetupFilter] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(() => searchParams.get('paymentMethod') ?? '');
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') ?? monthStartIso());
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') ?? todayIso());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [staffExpenseOpen, setStaffExpenseOpen] = useState(false);
  const [viewingItemsExpense, setViewingItemsExpense] = useState<Expense | null>(null);

  const categoryLabel = (value: string) => categoryLabels.get(value) ?? value;

  const isFiltered = Boolean(
    search ||
    category ||
    setupFilter ||
    paymentMethod ||
    startDate !== monthStartIso() ||
    endDate !== todayIso()
  );

  const listParams = {
    search: search || undefined,
    category: category || undefined,
    isSetupCost: setupFilter || undefined,
    paymentMethod: paymentMethod || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page: page + 1,
    pageSize,
  };

  const { data, isLoading } = useExpenses(listParams);
  const { data: stats, isLoading: statsLoading } = useExpenseStats(listParams);
  const deleteMutation = useDeleteExpense();

  const rows = data?.data ?? [];
  const deleteTarget = deleteId ? rows.find((r) => r.id === deleteId) : undefined;

  const columns: Column<Expense>[] = [
    {
      id: 'date',
      label: 'Date',
      minWidth: 100,
      render: (row) => (
        <Typography variant="body2">{formatDate(row.date)}</Typography>
      ),
    },
    {
      id: 'title',
      label: 'Title',
      minWidth: 200,
      render: (row) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
            {row.isSetupCost && (
              <Chip label="Setup" size="small" color="secondary" sx={{ height: 18, fontSize: '0.6rem' }} />
            )}
            {row.purchaseOrderId && (
              <Chip
                label="PO payment"
                size="small"
                color="info"
                variant="outlined"
                clickable
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/purchase-orders/${row.purchaseOrderId}`);
                }}
                sx={{ height: 18, fontSize: '0.6rem' }}
              />
            )}
            {row.items && row.items.length > 0 && (
              <Tooltip
                title={
                  <Box sx={{ p: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                      Click to view full breakdown:
                    </Typography>
                    {row.items.slice(0, 5).map((it, idx) => (
                      <Typography key={idx} variant="caption" sx={{ display: 'block' }}>
                        • {it.productName} ({it.quantity} × {formatCurrency(it.unitCost)}) = {formatCurrency(it.totalCost)}
                      </Typography>
                    ))}
                    {row.items.length > 5 && (
                      <Typography variant="caption" sx={{ fontStyle: 'italic', display: 'block', mt: 0.5 }}>
                        +{row.items.length - 5} more items (click to view all)
                      </Typography>
                    )}
                  </Box>
                }
              >
                <Chip
                  icon={<Inventory2OutlinedIcon sx={{ '&&': { fontSize: '0.75rem' } }} />}
                  label={`${row.items.length} product${row.items.length === 1 ? '' : 's'}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  clickable
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingItemsExpense(row);
                  }}
                  sx={{ height: 18, fontSize: '0.6rem', cursor: 'pointer' }}
                />
              </Tooltip>
            )}
          </Box>
        </Box>
      ),
    },
    {
      id: 'category',
      label: 'Category',
      minWidth: 140,
      render: (row) => (
        <Chip
          label={categoryLabel(row.category)}
          color={CATEGORY_COLOR[row.category] ?? 'default'}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      id: 'billNo',
      label: 'Bill no.',
      minWidth: 120,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.billNo?.trim() ? row.billNo : '—'}
        </Typography>
      ),
    },
    {
      id: 'paidTo',
      label: 'Staff / Paid To',
      minWidth: 160,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.paidTo ?? '—'}
        </Typography>
      ),
    },
    {
      id: 'paymentMethod',
      label: 'Payment Method',
      minWidth: 140,
      render: (row) => {
        if (!row.paymentMethod) return <Typography variant="body2" color="text.secondary">—</Typography>;
        const gradients: Record<string, { bg: string; color: string }> = {
          cash:      { bg: 'linear-gradient(135deg, #d4edda 0%, #a8d5b5 100%)', color: '#1b5e20' },
          bank:      { bg: 'linear-gradient(135deg, #cce5ff 0%, #90c4f9 100%)', color: '#0d47a1' },
          esewa:     { bg: 'linear-gradient(135deg, #fff3cd 0%, #ffd97d 100%)', color: '#7c4a00' },
          inventory: { bg: 'linear-gradient(135deg, #ede7f6 0%, #d1c4e9 100%)', color: '#4527a0' },
        };
        const c = gradients[row.paymentMethod] ?? { bg: 'linear-gradient(135deg, #e0e0e0 0%, #bdbdbd 100%)', color: '#212121' };
        const label = row.paymentMethod === 'inventory' ? 'STORE INVENTORY' : row.paymentMethod.toUpperCase();
        return (
          <Typography
            component="span"
            variant="caption"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              px: 1.25,
              py: 0.5,
              fontWeight: 700,
              letterSpacing: 0.25,
              background: c.bg,
              color: c.color,
            }}
          >
            {label}
          </Typography>
        );
      },
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      minWidth: 120,
      render: (row) => (
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
          {formatCurrency(row.amount)}
        </Typography>
      ),
    },
    ...(canManage ? [{
      id: 'actions',
      label: '',
      align: 'right' as const,
      minWidth: 80,
      render: (row: Expense) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          {!row.purchaseOrderId && row.paymentMethod !== 'inventory' && (
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); navigate(`/expenses/${row.id}/edit`); }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip
            title={
              row.purchaseOrderId
                ? 'Delete (reverses PO payment)'
                : row.paymentMethod === 'inventory'
                ? 'Delete (restores inventory stock)'
                : 'Delete'
            }
          >
            <IconButton
              size="small"
              color="error"
              onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    }] : []),
  ];

  return (
    <Box>
      <PageHeader
        title="Expenses"
        subtitle="Track operational costs, PO payments, and setup investments"
        action={
          canManage ? (
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<Inventory2OutlinedIcon />}
                onClick={() => setStaffExpenseOpen(true)}
              >
                Record Product Usage
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/expenses/new')}>
                Add Expense
              </Button>
            </Box>
          ) : undefined
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
        <StatCard
          title={isFiltered ? 'Filtered Total' : 'Total Expenses'}
          value={statsLoading ? '—' : formatCurrency(stats?.totalExpenses ?? 0)}
          icon={<TrendingUpIcon />}
          gradient={['#fff1f2', '#fecdd3']}
          color="#be123c"
          subtitle={
            statsLoading
              ? undefined
              : stats?.inventoryConsumption
              ? `Cash: ${formatCurrency(stats.cashOutflow ?? 0)} • Store: ${formatCurrency(stats.inventoryConsumption)}`
              : isFiltered
              ? 'Matches active filter selection'
              : undefined
          }
        />
        <StatCard
          title="Operating Expenses"
          value={statsLoading ? '—' : formatCurrency(stats?.operatingExpenses ?? Math.max(0, (stats?.totalExpenses ?? 0) - (stats?.setupInvestment ?? 0)))}
          icon={<AccountBalanceWalletIcon />}
          gradient={['#fff7ed', '#fed7aa']}
          color="#c2410c"
          subtitle="Excludes setup / investment"
        />
        <StatCard
          title={isFiltered ? 'Filtered Records' : 'This Month'}
          value={
            statsLoading
              ? '—'
              : isFiltered
              ? `${stats?.expenseCount ?? 0} expense${stats?.expenseCount === 1 ? '' : 's'}`
              : formatCurrency(stats?.thisMonth ?? 0)
          }
          icon={<CalendarTodayIcon />}
          gradient={['#e0f2fe', '#7dd3fc']}
          color="#0369a1"
          subtitle={isFiltered ? 'In selected period' : 'Current calendar month'}
        />
        <StatCard
          title="Setup / Investment"
          value={statsLoading ? '—' : formatCurrency(stats?.setupInvestment ?? 0)}
          icon={<BusinessCenterIcon />}
          gradient={['#f5f3ff', '#ddd6fe']}
          color="#5b21b6"
          subtitle="Setup flag or category"
        />
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <SearchBar
              value={search}
              onChange={(v) => { setSearch(v); setPage(0); }}
              placeholder="Search expenses..."
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPage(0); }}
              >
                <MenuItem value="">All Categories</MenuItem>
                {categoryOptions.map((c) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <ExpenseCategoryInfoIcon />
          </Box>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Payment Method</InputLabel>
            <Select
              label="Payment Method"
              value={paymentMethod}
              onChange={(e) => { setPaymentMethod(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All Methods</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="bank">Bank</MenuItem>
              <MenuItem value="esewa">eSewa</MenuItem>
              <MenuItem value="inventory">Store Inventory</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Setup filter</InputLabel>
            <Select
              label="Setup filter"
              value={setupFilter}
              onChange={(e) => { setSetupFilter(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Setup only</MenuItem>
              <MenuItem value="false">Operating only</MenuItem>
            </Select>
          </FormControl>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(range) => {
              setStartDate(range.startDate);
              setEndDate(range.endDate);
              setPage(0);
            }}
          />
        </Box>
      </Paper>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
        getRowId={(r) => r.id}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Expense"
        message={
          deleteTarget?.purchaseOrderId
            ? 'This expense was created from a purchase order payment. Deleting it will reverse that payment on the PO.'
            : deleteTarget?.paymentMethod === 'inventory'
            ? 'This expense was created from store product usage. Deleting it will restore the consumed stock back to inventory.'
            : 'This will permanently delete the expense record. This action cannot be undone.'
        }
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId, {
              onSuccess: () => {
                showSuccess(
                  deleteTarget?.purchaseOrderId
                    ? 'Expense deleted and PO payment reversed.'
                    : deleteTarget?.paymentMethod === 'inventory'
                    ? 'Expense deleted and inventory stock restored.'
                    : 'Expense deleted.'
                );
                setDeleteId(null);
              },
              onError: (err) => showApiError(err, 'Expense could not be deleted.'),
            });
          }
        }}
        onCancel={() => setDeleteId(null)}
      />

      <Dialog
        open={!!viewingItemsExpense}
        onClose={() => setViewingItemsExpense(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Inventory2OutlinedIcon color="primary" />
            <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
              Consumed Store Products
            </Typography>
          </Box>
          {viewingItemsExpense && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Voucher: <strong>{viewingItemsExpense.billNo || '—'}</strong> · Staff: <strong>{viewingItemsExpense.paidTo || '—'}</strong> · Date: <strong>{viewingItemsExpense.date}</strong>
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {viewingItemsExpense?.items && (
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>SKU</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Quantity</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Batch Unit Cost</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Total Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {viewingItemsExpense.items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontWeight: 600 }}>{it.productName}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{it.sku || '—'}</TableCell>
                      <TableCell align="center">{it.quantity}</TableCell>
                      <TableCell align="right">{formatCurrency(it.unitCost)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {formatCurrency(it.totalCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {viewingItemsExpense && (
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                Total Line Items: {viewingItemsExpense.items?.length ?? 0}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                Total Cost: {formatCurrency(viewingItemsExpense.amount)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
          {viewingItemsExpense?.billNo ? (
            <Button
              size="small"
              onClick={() => {
                const voucher = viewingItemsExpense.billNo || '';
                setViewingItemsExpense(null);
                window.open(`/inventory?tab=movements&search=${encodeURIComponent(voucher)}`, '_blank');
              }}
            >
              View in Inventory Movements
            </Button>
          ) : <Box />}
          <Button onClick={() => setViewingItemsExpense(null)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {staffExpenseOpen && (
        <StaffProductExpenseDialog
          open={staffExpenseOpen}
          onClose={() => setStaffExpenseOpen(false)}
          defaultStaffName={user?.name ?? ''}
        />
      )}
    </Box>
  );
}
