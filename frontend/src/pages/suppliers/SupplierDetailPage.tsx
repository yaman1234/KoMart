import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Button,
  Avatar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useSupplier } from '@/hooks/useSuppliers';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store';
import { formatCurrency, formatDate, getInitials, canManageSuppliers } from '@/utils';
import { PO_STATUS_LABELS, DROPDOWN_PAGE_SIZE } from '@/constants';
import type { PurchaseOrder, PurchaseOrderStatus, Product } from '@/types';

const STATUS_COLORS: Record<PurchaseOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  ordered: 'warning',
  partial: 'info',
  received: 'success',
  cancelled: 'error',
};

const basePoColumns: Column<PurchaseOrder>[] = [
  { id: 'orderNumber', label: 'PO Number', minWidth: 140, accessor: 'orderNumber' },
  {
    id: 'status',
    label: 'Status',
    render: (row) => (
      <Chip
        label={PO_STATUS_LABELS[row.status] ?? row.status}
        color={STATUS_COLORS[row.status]}
        size="small"
      />
    ),
  },
  {
    id: 'items',
    label: 'Items',
    align: 'right',
    render: (row) => row.items.length,
  },
  {
    id: 'total',
    label: 'Total',
    align: 'right',
    render: (row) => formatCurrency(row.totalAmount),
  },
  {
    id: 'delivery',
    label: 'Expected Delivery',
    render: (row) => (row.expectedDelivery ? formatDate(row.expectedDelivery) : '—'),
  },
];

const baseProductColumns: Column<Product>[] = [
  { id: 'name', label: 'Product', minWidth: 160, accessor: 'name' },
  { id: 'sku', label: 'SKU', accessor: 'sku' },
  { id: 'category', label: 'Category', accessor: 'category' },
  {
    id: 'cost',
    label: 'Cost',
    align: 'right',
    render: (row) => formatCurrency(row.costPrice),
  },
  {
    id: 'stock',
    label: 'Stock',
    align: 'right',
    render: (row) => row.stock,
  },
];

function withSnColumn<T extends { id: string }>(
  rows: T[],
  columns: Column<T>[],
): Column<T>[] {
  return [
    {
      id: 'sn',
      label: 'SN',
      align: 'center',
      minWidth: 48,
      render: (row) => rows.findIndex((r) => r.id === row.id) + 1,
    },
    ...columns,
  ];
}

export function SupplierDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const canManage = canManageSuppliers(user?.role);

  const { data: supplier, isLoading, isError } = useSupplier(id ?? '');
  const { data: poData, isLoading: poLoading } = usePurchaseOrders(
    { supplierId: id, pageSize: 25 },
    { enabled: !!id },
  );
  const { data: productsData, isLoading: productsLoading } = useProducts(
    { supplierId: id, pageSize: DROPDOWN_PAGE_SIZE },
    { enabled: !!id },
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !supplier) {
    return <Alert severity="error">Supplier not found.</Alert>;
  }

  const purchaseOrders = poData?.data ?? [];
  const catalogProducts = productsData?.data ?? [];
  const poColumns = withSnColumn(purchaseOrders, basePoColumns);
  const productColumns = withSnColumn(catalogProducts, baseProductColumns);

  return (
    <Box>
      <PageHeader
        title={supplier.name}
        breadcrumbs={[{ label: 'Suppliers', path: '/suppliers' }, { label: supplier.name }]}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {canManage && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}
              >
                Edit
              </Button>
            )}
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/suppliers')}>
              Back
            </Button>
          </Box>
        }
      />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, textAlign: 'center', mb: 3 }}>
            <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, bgcolor: 'primary.main', fontSize: '2rem' }}>
              {getInitials(supplier.name)}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{supplier.name}</Typography>
            <Chip label={supplier.country} color="primary" variant="outlined" sx={{ mt: 1 }} />
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Contact</Typography>
            <Divider sx={{ mb: 2 }} />
            {[
              { label: 'Contact Person', value: supplier.contactPerson },
              { label: 'Phone', value: supplier.phone },
              { label: 'Email', value: supplier.email || '—' },
              { label: 'Address', value: supplier.address },
              { label: 'Added', value: formatDate(supplier.createdAt) },
            ].map((row) => (
              <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, gap: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {row.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Purchase Orders</Typography>
          <DataTable
            columns={poColumns}
            rows={purchaseOrders}
            loading={poLoading}
            getRowId={(r) => r.id}
            onRowClick={(row) => navigate(`/purchase-orders/${row.id}`)}
            emptyMessage="No purchase orders for this supplier"
          />

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>Products</Typography>
          <DataTable
            columns={productColumns}
            rows={catalogProducts}
            loading={productsLoading}
            getRowId={(r) => r.id}
            onRowClick={(row) => navigate(`/products/${row.id}`)}
            emptyMessage="No products linked to this supplier"
          />
        </Grid>
      </Grid>
    </Box>
  );
}
