import { useState } from 'react';
import { Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuthStore } from '@/store';
import { formatDate, canManageSuppliers } from '@/utils';
import type { Supplier } from '@/types';

export function SuppliersPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useSuppliers({ search, page: page + 1, pageSize });
  const canManage = canManageSuppliers(user?.role);

  const columns: Column<Supplier>[] = [
    { id: 'name', label: 'Name', minWidth: 180, accessor: 'name' },
    { id: 'country', label: 'Country', accessor: 'country' },
    { id: 'contact', label: 'Contact Person', accessor: 'contactPerson' },
    { id: 'phone', label: 'Phone', accessor: 'phone' },
    { id: 'email', label: 'Email', minWidth: 180, render: (row) => row.email || '—' },
    {
      id: 'added',
      label: 'Added',
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

      <Box sx={{ mb: 3 }}>
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(0); }}
          placeholder="Search by supplier name..."
        />
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/suppliers/${r.id}`)}
      />
    </Box>
  );
}
