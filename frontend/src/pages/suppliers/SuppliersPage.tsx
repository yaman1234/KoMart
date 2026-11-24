import { useEffect } from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuthStore } from '@/store';
import { canManageSuppliers } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useListState, stringParam, pageParam, pageSizeParam, enumParam } from '@/hooks/useListState';
import type { Supplier } from '@/types';

export function SuppliersPage() {
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const user = useAuthStore((s) => s.user);

  const { filters, setFilter, setFilters, clampPage } = useListState({
    routePrefix: '/suppliers',
    schema: {
      search: stringParam(''),
      page: pageParam(0),
      pageSize: pageSizeParam(10),
      sortBy: stringParam('name'),
      sortOrder: enumParam(['asc', 'desc'] as const, 'asc'),
    },
  });

  const { search, page, pageSize, sortBy, sortOrder } = filters;

  const { data, isLoading, isFetching } = useSuppliers({
    search,
    page: page + 1,
    pageSize,
    sortBy,
    sortOrder,
  });
  const canManage = canManageSuppliers(user?.role);

  useEffect(() => {
    clampPage(data?.total);
  }, [clampPage, data?.total]);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setFilters({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: 0 });
    } else {
      setFilters({ sortBy: key, sortOrder: 'asc', page: 0 });
    }
  };

  const columns: Column<Supplier>[] = [
    { id: 'name', label: 'Name', minWidth: 180, accessor: 'name', sortable: true, sortKey: 'name' },
    { id: 'country', label: 'Country', accessor: 'country' },
    { id: 'contact', label: 'Contact Person', accessor: 'contactPerson' },
    { id: 'phone', label: 'Phone', accessor: 'phone' },
    { id: 'email', label: 'Email', minWidth: 180, render: (row) => row.email || '—' },
    {
      id: 'added',
      label: 'Added',
      sortable: true,
      sortKey: 'created_at',
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

      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setFilter('search', v); }}
            placeholder="Search name, contact, or phone..."
            debounceMs={300}
          />
        </Box>
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
      />
    </Box>
  );
}
