import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useProducts, useDeleteProduct } from '@/hooks/useProducts';
import { formatCurrency } from '@/utils';
import { PRODUCT_CATEGORIES } from '@/constants';
import type { Product } from '@/types';

export function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useProducts({
    search,
    category: category || undefined,
    page: page + 1,
    pageSize,
  });

  const deleteMutation = useDeleteProduct();

  const columns: Column<Product>[] = [
    {
      id: 'image',
      label: '',
      minWidth: 56,
      render: (row) => (
        <Avatar
          src={row.images[0]}
          variant="rounded"
          sx={{ width: 40, height: 40 }}
        >
          {row.name[0]}
        </Avatar>
      ),
    },
    { id: 'name', label: 'Product Name', minWidth: 180, accessor: 'name' },
    { id: 'sku', label: 'SKU', minWidth: 130, accessor: 'sku' },
    { id: 'category', label: 'Category', accessor: 'category' },
    { id: 'brand', label: 'Brand', accessor: 'brand' },
    {
      id: 'supplier',
      label: 'Supplier',
      minWidth: 140,
      render: (row) => row.supplierName || '—',
    },
    {
      id: 'sellingPrice',
      label: 'Price',
      align: 'right',
      render: (row) => formatCurrency(row.sellingPrice),
    },
    {
      id: 'stock',
      label: 'Stock',
      align: 'right',
      render: (row) => (
        <Chip
          label={row.stock === 0 ? 'Out of Stock' : row.stock <= row.lowStockThreshold ? `Low: ${row.stock}` : row.stock}
          color={row.stock === 0 ? 'error' : row.stock <= row.lowStockThreshold ? 'warning' : 'success'}
          size="small"
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (row) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          <Tooltip title="View">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.id}`); }}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.id}/edit`); }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Products"
        subtitle={`${data?.total ?? 0} products in catalog`}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/products/new')}>
            Add Product
          </Button>
        }
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(0); }}
            placeholder="Search by name, SKU, barcode..."
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
            {PRODUCT_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/products/${r.id}`)}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Product"
        message="This will permanently remove the product and all its inventory records. This action cannot be undone."
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
