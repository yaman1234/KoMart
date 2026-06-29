import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatCard } from '@/components/common/StatCard';
import { useExpenses, useDeleteExpense } from '@/hooks/useExpenses';
import { EXPENSE_CATEGORIES } from '@/constants';
import { formatCurrency, formatDate, isAdminOrManager } from '@/utils';
import { useAuthStore } from '@/store';
import type { Expense } from '@/types';

const CATEGORY_COLOR: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  setup_investment: 'secondary',
  rent: 'primary',
  utilities: 'info',
  salaries: 'warning',
  marketing: 'success',
  supplies: 'default',
  maintenance: 'default',
  equipment: 'primary',
  other: 'default',
};

function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function ExpensesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canManage = isAdminOrManager(user?.role);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useExpenses({ search, page: page + 1, pageSize });
  const deleteMutation = useDeleteExpense();

  const allExpenses = data?.data ?? [];

  // Apply client-side category filter (search is server-side via mock paginate)
  const filtered = category
    ? allExpenses.filter((e) => e.category === category)
    : allExpenses;

  // Summary stats from ALL loaded data (use a wide fetch for stat cards)
  const { data: allData } = useExpenses({ pageSize: 1000 });
  const all = allData?.data ?? [];

  const totalAll = all.reduce((s, e) => s + e.amount, 0);
  const setupTotal = all.filter((e) => e.isSetupCost).reduce((s, e) => s + e.amount, 0);
  const now = new Date();
  const thisMonthTotal = all
    .filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, e) => s + e.amount, 0);

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
          {row.isSetupCost && (
            <Chip label="Setup" size="small" color="secondary" sx={{ mt: 0.25, height: 18, fontSize: '0.6rem' }} />
          )}
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
      id: 'paidTo',
      label: 'Paid To',
      minWidth: 160,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.paidTo ?? '—'}
        </Typography>
      ),
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
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); navigate(`/expenses/${row.id}/edit`); }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
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
        subtitle="Track operational costs and setup investments"
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/expenses/new')}>
              Add Expense
            </Button>
          ) : undefined
        }
      />

      {/* ── Summary stat cards ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
        <StatCard
          title="Total Expenses"
          value={formatCurrency(totalAll)}
          icon={<TrendingUpIcon />}
          color="error.main"
        />
        <StatCard
          title="This Month"
          value={formatCurrency(thisMonthTotal)}
          icon={<CalendarTodayIcon />}
          color="warning.main"
        />
        <StatCard
          title="Setup / Investment"
          value={formatCurrency(setupTotal)}
          icon={<BusinessCenterIcon />}
          color="secondary.main"
        />
      </Box>

      {/* ── Toolbar ── */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <SearchBar
              value={search}
              onChange={(v) => { setSearch(v); setPage(0); }}
              placeholder="Search expenses..."
            />
          </Box>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All Categories</MenuItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* ── Table ── */}
      <DataTable
        columns={columns}
        rows={filtered}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={category ? filtered.length : (data?.total ?? 0)}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
        getRowId={(r) => r.id}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Expense"
        message="This will permanently delete the expense record. This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
          }
        }}
        onCancel={() => setDeleteId(null)}
      />
    </Box>
  );
}
