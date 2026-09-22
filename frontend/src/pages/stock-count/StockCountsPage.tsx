import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  TextField,
  Tooltip,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { SearchBar } from '@/components/common/SearchBar';
import { stockCountService } from '@/services';
import { formatCurrency } from '@/utils';
import { QUERY_KEYS } from '@/constants';
import type { StockCountListItem, StockCountStatus } from '@/types';

const STATUS_COLORS: Record<StockCountStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary' | 'secondary'> = {
  draft: 'default',
  counting: 'info',
  submitted: 'primary',
  under_review: 'warning',
  recount_required: 'warning',
  approved: 'success',
  completed: 'success',
  cancelled: 'error',
};

const STATUS_LABELS: Record<StockCountStatus, string> = {
  draft: 'Draft',
  counting: 'Counting',
  submitted: 'Submitted',
  under_review: 'Under Review',
  recount_required: 'Recount Required',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const COUNT_TYPE_LABELS: Record<string, string> = {
  full: 'Full Count',
  category: 'Category',
  section: 'Section',
  selected: 'Selected',
};

export function StockCountsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [countTypeFilter, setCountTypeFilter] = useState('');

  const filtersKey = JSON.stringify({ page, pageSize, search, statusFilter, countTypeFilter });

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.stockCountList(filtersKey),
    refetchOnMount: 'always',
    queryFn: () =>
      stockCountService.getAll({
        page: page + 1,
        pageSize,
        status: statusFilter || undefined,
        countType: countTypeFilter || undefined,
        search: search || undefined,
      }),
  });

  const rows = data?.data ?? [];

  const columns: Column<StockCountListItem>[] = [
    { id: 'countNumber', label: 'Count ID', accessor: 'countNumber', minWidth: 130 },
    {
      id: 'countType',
      label: 'Type',
      render: (row) => COUNT_TYPE_LABELS[row.countType] ?? row.countType,
    },
    { id: 'countDate', label: 'Date', accessor: 'countDate', minWidth: 110 },
    { id: 'totalProducts', label: 'Products', align: 'right', accessor: 'totalProducts' },
    {
      id: 'countedProducts',
      label: 'Counted',
      align: 'right',
      render: (row) => `${row.countedProducts} / ${row.totalProducts}`,
    },
    { id: 'matchedCount', label: 'Matched', align: 'right', accessor: 'matchedCount' },
    {
      id: 'shortCount',
      label: 'Short',
      align: 'right',
      render: (row) => (
        <Chip
          label={row.shortCount}
          size="small"
          color={row.shortCount > 0 ? 'error' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      id: 'excessCount',
      label: 'Excess',
      align: 'right',
      render: (row) => (
        <Chip
          label={row.excessCount}
          size="small"
          color={row.excessCount > 0 ? 'warning' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      id: 'netVarianceValue',
      label: 'Net Variance',
      align: 'right',
      render: (row) => (
        <Box
          component="span"
          sx={{ color: row.netVarianceValue < 0 ? 'error.main' : row.netVarianceValue > 0 ? 'warning.main' : 'text.secondary' }}
        >
          {formatCurrency(row.netVarianceValue)}
        </Box>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      render: (row) => (
        <Chip
          label={STATUS_LABELS[row.status]}
          size="small"
          color={STATUS_COLORS[row.status]}
        />
      ),
    },
    { id: 'createdBy', label: 'Created By', accessor: 'createdBy' },
    { id: 'approvedBy', label: 'Approved By', render: (row) => row.approvedBy || '—' },
    {
      id: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          <Tooltip title="View">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/stock-count/${row.id}`); }}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Stock Count"
        subtitle="Physical inventory counting — compare system stock vs physical count."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/stock-count/new')}
          >
            New Stock Count
          </Button>
        }
      />

      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(0); }}
            placeholder="Search by Count ID..."
          />
        </Box>
        <TextField
          select
          label="Status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>{l}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Count Type"
          value={countTypeFilter}
          onChange={(e) => { setCountTypeFilter(e.target.value); setPage(0); }}
          size="small"
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All Types</MenuItem>
          {Object.entries(COUNT_TYPE_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>{l}</MenuItem>
          ))}
        </TextField>
      </Box>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
        onRowClick={(row) => navigate(`/stock-count/${row.id}`)}
        getRowId={(r) => r.id}
      />
    </Box>
  );
}
