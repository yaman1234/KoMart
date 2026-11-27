import { useEffect } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PaymentsIcon from '@mui/icons-material/Payments';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuthStore } from '@/store';
import { canManageSuppliers, formatCurrency } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { supplierPaymentMethodLabel } from '@/constants';
import { useListState, stringParam, pageParam, pageSizeParam, enumParam } from '@/hooks/useListState';
import type { Supplier, SupplierKpiFilter } from '@/types';

const KPI_FILTER_OPTIONS = ['', 'has_due', 'open_orders', 'missing_payment'] as const;

const SORT_KEY_MAP: Record<string, string> = {
  name: 'name',
  country: 'country',
  contactPerson: 'contact_person',
  phone: 'phone',
  poCount: 'po_count',
  totalSpend: 'total_spend',
  dueAmount: 'due_amount',
  lastOrderDate: 'last_order_date',
  createdAt: 'created_at',
};

export function SuppliersPage() {
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const user = useAuthStore((s) => s.user);

  const { filters, setFilter, setFilters, resetFilters, clampPage } = useListState({
    routePrefix: '/suppliers',
    schema: {
      search: stringParam(''),
      page: pageParam(0),
      pageSize: pageSizeParam(25),
      kpiFilter: enumParam(KPI_FILTER_OPTIONS, ''),
      sortBy: stringParam('name'),
      sortOrder: enumParam(['asc', 'desc'] as const, 'asc'),
    },
  });

  const { search, page, pageSize, kpiFilter, sortBy, sortOrder } = filters;

  const { data, isLoading, isFetching } = useSuppliers({
    search,
    page: page + 1,
    pageSize,
    kpiFilter: (kpiFilter || undefined) as SupplierKpiFilter | undefined,
    sortBy: SORT_KEY_MAP[sortBy] ?? 'name',
    sortOrder,
    includeSummary: true,
  });
  const canManage = canManageSuppliers(user?.role);
  const summary = data?.summary;
  const hasActiveFilters = Boolean(search.trim() || kpiFilter);

  useEffect(() => {
    clampPage(data?.total);
  }, [clampPage, data?.total]);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setFilters({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: 0 });
    } else {
      const defaultDesc = key === 'dueAmount' || key === 'totalSpend' || key === 'poCount' || key === 'lastOrderDate' || key === 'createdAt';
      setFilters({ sortBy: key, sortOrder: defaultDesc ? 'desc' : 'asc', page: 0 });
    }
  };

  const toggleKpiFilter = (target: Exclude<SupplierKpiFilter, ''>) => {
    setFilters({ kpiFilter: kpiFilter === target ? '' : target, page: 0 });
  };

  const columns: Column<Supplier>[] = [
    {
      id: 'sn',
      label: 'SN',
      align: 'center',
      minWidth: 48,
      render: (_, index) => index + 1,
    },
    {
      id: 'name',
      label: 'Name',
      minWidth: 180,
      accessor: 'name',
      sortable: true,
      sortKey: 'name',
    },
    {
      id: 'country',
      label: 'Country',
      minWidth: 100,
      accessor: 'country',
      sortable: true,
      sortKey: 'country',
    },
    {
      id: 'contact',
      label: 'Contact Person',
      minWidth: 140,
      accessor: 'contactPerson',
      sortable: true,
      sortKey: 'contactPerson',
    },
    {
      id: 'phone',
      label: 'Phone',
      minWidth: 120,
      accessor: 'phone',
      sortable: true,
      sortKey: 'phone',
    },
    {
      id: 'paymentInfo',
      label: 'Payment Info',
      minWidth: 140,
      render: (row) => {
        const methods = Array.from(
          new Set((row.paymentDetails ?? []).map((d) => supplierPaymentMethodLabel(d.method))),
        );
        if (methods.length === 0) {
          return (
            <Typography variant="caption" color="text.secondary">
              Not set
            </Typography>
          );
        }
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {methods.slice(0, 2).map((label) => (
              <Chip key={label} label={label} size="small" variant="outlined" />
            ))}
            {methods.length > 2 && (
              <Chip label={`+${methods.length - 2}`} size="small" variant="outlined" />
            )}
          </Box>
        );
      },
    },
    {
      id: 'poCount',
      label: 'POs',
      align: 'right',
      minWidth: 80,
      sortable: true,
      sortKey: 'poCount',
      render: (row) => {
        const totalPos = row.poCount ?? 0;
        const openPos = row.openPoCount ?? 0;
        return (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2">{totalPos}</Typography>
            {openPos > 0 && (
              <Typography variant="caption" color="info.main" sx={{ fontWeight: 600 }}>
                ({openPos} open)
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      id: 'totalSpend',
      label: 'Total Spend',
      align: 'right',
      minWidth: 120,
      sortable: true,
      sortKey: 'totalSpend',
      render: (row) => formatCurrency(row.totalSpend ?? 0),
    },
    {
      id: 'dueAmount',
      label: 'Due',
      align: 'right',
      minWidth: 120,
      sortable: true,
      sortKey: 'dueAmount',
      render: (row) => {
        if ((row.poCount ?? 0) === 0) {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        }
        const due = row.dueAmount ?? 0;
        if (due <= 0) {
          return (
            <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
              Rs. 0.00
            </Typography>
          );
        }
        return (
          <Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>
            {formatCurrency(due)}
          </Typography>
        );
      },
    },
    {
      id: 'lastOrderDate',
      label: 'Last Order',
      minWidth: 110,
      sortable: true,
      sortKey: 'lastOrderDate',
      render: (row) => (row.lastOrderDate ? formatDate(row.lastOrderDate) : '—'),
    },
    {
      id: 'added',
      label: 'Added',
      minWidth: 110,
      sortable: true,
      sortKey: 'createdAt',
      render: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Suppliers"
        subtitle={`${data?.total ?? 0} suppliers`}
        action={
          canManage ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/suppliers/new')}
            >
              Add Supplier
            </Button>
          ) : undefined
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <StatCard
          title="Total Suppliers"
          value={summary?.totalSuppliers ?? data?.total ?? 0}
          subtitle={`Total spend: ${formatCurrency(summary?.totalSpendAmount ?? 0)}`}
          icon={<StorefrontIcon />}
          color="primary.main"
          loading={isLoading && !data}
          onClick={() => setFilters({ kpiFilter: '', page: 0 })}
          sx={{
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...(!kpiFilter && {
              outline: '2px solid',
              outlineColor: 'primary.main',
              boxShadow: 2,
            }),
          }}
        />

        <StatCard
          title="Payable Due"
          value={formatCurrency(summary?.totalDueAmount ?? 0)}
          subtitle={`${summary?.suppliersWithDue ?? 0} suppliers with balance`}
          icon={<AccountBalanceWalletIcon />}
          color="#b26a00"
          gradient={['rgba(245, 124, 0, 0.14)', 'rgba(245, 124, 0, 0.02)']}
          loading={isLoading && !data}
          onClick={() => toggleKpiFilter('has_due')}
          sx={{
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...(kpiFilter === 'has_due' && {
              outline: '2px solid',
              outlineColor: '#ed6c02',
              boxShadow: 2,
            }),
          }}
        />

        <StatCard
          title="Open Deliveries"
          value={`${summary?.suppliersWithOpenOrders ?? 0} suppliers`}
          subtitle={`${formatCurrency(summary?.totalOpenOrdersAmount ?? 0)} in-transit`}
          icon={<LocalShippingIcon />}
          color="#0288d1"
          gradient={['rgba(2, 136, 209, 0.12)', 'rgba(2, 136, 209, 0.02)']}
          loading={isLoading && !data}
          onClick={() => toggleKpiFilter('open_orders')}
          sx={{
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...(kpiFilter === 'open_orders' && {
              outline: '2px solid',
              outlineColor: '#0288d1',
              boxShadow: 2,
            }),
          }}
        />

        <StatCard
          title="Missing Payment Info"
          value={`${summary?.suppliersMissingPayment ?? 0} suppliers`}
          subtitle="No bank/QR details on file"
          icon={<PaymentsIcon />}
          color="#c62828"
          gradient={['rgba(211, 47, 47, 0.12)', 'rgba(211, 47, 47, 0.02)']}
          loading={isLoading && !data}
          onClick={() => toggleKpiFilter('missing_payment')}
          sx={{
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...(kpiFilter === 'missing_payment' && {
              outline: '2px solid',
              outlineColor: '#c62828',
              boxShadow: 2,
            }),
          }}
        />
      </Box>

      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setFilter('search', v); }}
            placeholder="Search name, country, contact, phone, or email..."
            debounceMs={300}
          />
        </Box>
        {hasActiveFilters && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={() => resetFilters()}
          >
            Reset
          </Button>
        )}
        {isFetching && <CircularProgress size={22} sx={{ flexShrink: 0 }} aria-label="Searching suppliers" />}
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading && !data}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(size) => { setFilters({ pageSize: size, page: 0 }); }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/suppliers/${r.id}`)}
        emptyMessage={hasActiveFilters ? 'No suppliers match the current filters' : 'No suppliers found'}
      />
    </Box>
  );
}
