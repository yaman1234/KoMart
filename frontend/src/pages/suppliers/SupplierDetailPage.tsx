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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  TablePagination,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PaymentsIcon from '@mui/icons-material/Payments';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import TagIcon from '@mui/icons-material/Tag';
import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useSupplier } from '@/hooks/useSuppliers';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useProducts } from '@/hooks/useProducts';
import {
  useSupplierPurchaseReturns,
} from '@/hooks/usePurchaseReturns';
import { SupplierReturnDialog } from '@/pages/suppliers/components/SupplierReturnDialog';
import { useAuthStore } from '@/store';
import { formatCurrency, getInitials, canManageSuppliers, canManagePurchaseOrders, navigateBack } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { PO_PAYMENT_STATUS_LABELS, PO_STATUS_LABELS, supplierPaymentMethodLabel } from '@/constants';
import { StatCard } from '@/components/common/StatCard';
import type { PurchaseOrder, PurchaseOrderPaymentStatus, PurchaseOrderStatus, Product } from '@/types';

const STATUS_COLORS: Record<PurchaseOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  ordered: 'warning',
  partial: 'info',
  received: 'success',
  cancelled: 'error',
};

const PAYMENT_COLORS: Record<PurchaseOrderPaymentStatus, 'default' | 'warning' | 'success'> = {
  unpaid: 'default',
  partial: 'warning',
  paid: 'success',
};

const PO_SORT_KEY_MAP: Record<string, string> = {
  orderNumber: 'order_number',
  status: 'status',
  paymentStatus: 'payment_status',
  items: 'items_count',
  totalAmount: 'total_amount',
  expectedDelivery: 'expected_delivery',
  createdAt: 'created_at',
};

const basePoColumns: Column<PurchaseOrder>[] = [
  { id: 'orderNumber', label: 'PO Number', minWidth: 140, accessor: 'orderNumber', sortable: true, sortKey: 'orderNumber' },
  {
    id: 'status',
    label: 'Status',
    sortable: true,
    sortKey: 'status',
    render: (row) => (
      <Chip
        label={PO_STATUS_LABELS[row.status] ?? row.status}
        color={STATUS_COLORS[row.status]}
        size="small"
      />
    ),
  },
  {
    id: 'payment',
    label: 'Payment',
    sortable: true,
    sortKey: 'paymentStatus',
    render: (row) => {
      const pay = row.paymentStatus ?? 'unpaid';
      return (
        <Chip
          label={PO_PAYMENT_STATUS_LABELS[pay] ?? pay}
          color={PAYMENT_COLORS[pay]}
          size="small"
          variant="outlined"
        />
      );
    },
  },
  {
    id: 'items',
    label: 'Items',
    align: 'right',
    sortable: true,
    sortKey: 'items',
    render: (row) => row.itemsCount ?? row.items.length,
  },
  {
    id: 'total',
    label: 'Total',
    align: 'right',
    sortable: true,
    sortKey: 'totalAmount',
    render: (row) => formatCurrency(row.totalAmount),
  },
  {
    id: 'due',
    label: 'Due',
    align: 'right',
    render: (row) => {
      if (row.status !== 'received') {
        return (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        );
      }
      const due = Math.max(
        0,
        Math.round((row.totalAmount - (row.amountPaid ?? 0)) * 100) / 100,
      );
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
  startIndex = 0,
): Column<T>[] {
  return [
    {
      id: 'sn',
      label: 'SN',
      align: 'center',
      minWidth: 48,
      render: (row) => startIndex + rows.findIndex((r) => r.id === row.id) + 1,
    },
    ...columns,
  ];
}

export function SupplierDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const formatDate = useFormatDate();
  const canManage = canManageSuppliers(user?.role);
  const canReturn = canManagePurchaseOrders(user?.role);
  const [returnOpen, setReturnOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<{ url: string; title: string } | null>(null);
  const [poPage, setPoPage] = useState(0);
  const [poPageSize, setPoPageSize] = useState(10);
  const [poSortBy, setPoSortBy] = useState('createdAt');
  const [poSortOrder, setPoSortOrder] = useState<'asc' | 'desc'>('desc');
  const [productPage, setProductPage] = useState(0);
  const [productPageSize, setProductPageSize] = useState(10);
  const [returnPage, setReturnPage] = useState(0);
  const [returnPageSize, setReturnPageSize] = useState(10);

  const handlePoSort = (key: string) => {
    if (poSortBy === key) {
      setPoSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setPoSortBy(key);
      setPoSortOrder('desc');
    }
    setPoPage(0);
  };

  const { data: supplier, isLoading, isError } = useSupplier(id ?? '');
  const { data: poData, isLoading: poLoading, isFetching: poFetching } = usePurchaseOrders(
    {
      supplierId: id,
      page: poPage + 1,
      pageSize: poPageSize,
      sortBy: PO_SORT_KEY_MAP[poSortBy] ?? 'created_at',
      sortOrder: poSortOrder,
      lean: true,
      includeSummary: true,
    },
    { enabled: !!id },
  );
  const { data: productsData, isLoading: productsLoading, isFetching: productsFetching } = useProducts(
    { supplierId: id, page: productPage + 1, pageSize: productPageSize },
    { enabled: !!id },
  );
  const { data: returnsData, isLoading: returnsLoading, isFetching: returnsFetching } = useSupplierPurchaseReturns(
    id ?? '',
    Boolean(id && canReturn),
    { page: returnPage + 1, pageSize: returnPageSize },
  );
  const returns = returnsData?.data ?? [];

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={280} height={40} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 3, mt: 2 }}>
          <Skeleton variant="rounded" height={220} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={96} />
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  if (isError || !supplier) {
    return <Alert severity="error">Supplier not found.</Alert>;
  }

  const purchaseOrders = poData?.data ?? [];
  const catalogProducts = productsData?.data ?? [];
  const summary = poData?.summary;
  const paymentDetails = supplier.paymentDetails ?? [];
  const poColumns = withSnColumn(purchaseOrders, [
    ...basePoColumns,
    {
      id: 'delivery',
      label: 'Expected Delivery',
      sortable: true,
      sortKey: 'expectedDelivery',
      render: (row) => (row.expectedDelivery ? formatDate(row.expectedDelivery) : '—'),
    },
  ], poPage * poPageSize);
  const productColumns = withSnColumn(catalogProducts, baseProductColumns, productPage * productPageSize);

  return (
    <Box>
      <PageHeader
        title={supplier.name}
        breadcrumbs={[{ label: 'Suppliers', path: '/suppliers' }, { label: supplier.name }]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canReturn && (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<AssignmentReturnIcon />}
                onClick={() => setReturnOpen(true)}
              >
                Return goods
              </Button>
            )}
            {canManage && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}
              >
                Edit
              </Button>
            )}
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigateBack(navigate, '/suppliers')}>
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

          <Paper sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Payment details</Typography>
            <Divider sx={{ mb: 2 }} />
            {paymentDetails.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No payment details on file.
              </Typography>
            ) : (
              paymentDetails.map((detail, index) => {
                const methodLabel = supplierPaymentMethodLabel(detail.method);
                const title = detail.label?.trim() || methodLabel;
                return (
                  <Box
                    key={`${detail.method}-${index}`}
                    sx={{
                      py: 1.5,
                      borderBottom: index < paymentDetails.length - 1 ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
                      <Chip label={methodLabel} size="small" variant="outlined" />
                    </Box>
                    {[
                      { label: 'Account name', value: detail.accountName },
                      { label: 'Account number', value: detail.accountNumber },
                      { label: 'Bank', value: detail.bankName },
                    ].filter((row) => row.value).map((row) => (
                      <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>{row.value}</Typography>
                      </Box>
                    ))}
                    {detail.qrImageUrl && (
                      <Box
                        component="button"
                        type="button"
                        aria-label={`View ${title} QR code`}
                        onClick={() => setQrPreview({ url: detail.qrImageUrl!, title })}
                        sx={{
                          mt: 1,
                          p: 0,
                          border: 0,
                          bgcolor: 'transparent',
                          cursor: 'pointer',
                          display: 'inline-flex',
                        }}
                      >
                        <Box
                          component="img"
                          src={detail.qrImageUrl}
                          alt=""
                          sx={{
                            width: 72,
                            height: 72,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'divider',
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                );
              })
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 1.5,
              mb: 2.5,
            }}
          >
            <StatCard
              title="Total PO amount"
              value={formatCurrency(summary?.committedAmount ?? 0)}
              subtitle="Committed orders"
              icon={<ShoppingCartIcon />}
              color="primary.main"
              loading={poLoading}
            />
            <StatCard
              title="No. of POs"
              value={summary?.committedCount ?? 0}
              subtitle="Excludes draft & cancelled"
              icon={<TagIcon />}
              loading={poLoading}
            />
            <StatCard
              title="Received"
              value={formatCurrency(summary?.receivedAmount ?? 0)}
              subtitle={`${summary?.receivedCount ?? 0} received`}
              icon={<Inventory2Icon />}
              color="#1b5e20"
              gradient={['rgba(46, 125, 50, 0.12)', 'rgba(46, 125, 50, 0.02)']}
              loading={poLoading}
            />
            <StatCard
              title="Pending"
              value={formatCurrency(summary?.pendingAmount ?? 0)}
              subtitle={`${summary?.pendingCount ?? 0} ordered or partial`}
              icon={<LocalShippingIcon />}
              color="#0288d1"
              gradient={['rgba(2, 136, 209, 0.12)', 'rgba(2, 136, 209, 0.02)']}
              loading={poLoading}
            />
            <StatCard
              title="Paid"
              value={formatCurrency(summary?.paidAmount ?? 0)}
              subtitle="Paid to supplier"
              icon={<PaymentsIcon />}
              color="#1b5e20"
              gradient={['rgba(46, 125, 50, 0.12)', 'rgba(46, 125, 50, 0.02)']}
              loading={poLoading}
            />
            <StatCard
              title="Remaining to pay"
              value={formatCurrency(summary?.payableOutstanding ?? 0)}
              subtitle="Outstanding payable"
              icon={<AccountBalanceWalletIcon />}
              color="#b26a00"
              gradient={['rgba(245, 124, 0, 0.14)', 'rgba(245, 124, 0, 0.02)']}
              loading={poLoading}
            />
            <StatCard
              title="Returned goods"
              value={formatCurrency(summary?.returnedAmount ?? 0)}
              subtitle={`${summary?.returnedCount ?? 0} returns`}
              icon={<AssignmentReturnIcon />}
              color="#6d28d9"
              gradient={['rgba(109, 40, 217, 0.12)', 'rgba(109, 40, 217, 0.02)']}
              loading={poLoading}
            />
            <StatCard
              title="Amount receivable"
              value={formatCurrency(summary?.receivableAmount ?? 0)}
              subtitle={`${summary?.receivableCount ?? 0} open refund${(summary?.receivableCount ?? 0) === 1 ? '' : 's'}`}
              icon={<PaymentsIcon />}
              color="#0369a1"
              gradient={['rgba(3, 105, 161, 0.12)', 'rgba(3, 105, 161, 0.02)']}
              loading={poLoading}
            />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Purchase Orders</Typography>
          <DataTable
            columns={poColumns}
            rows={purchaseOrders}
            loading={poLoading && !poData}
            page={poPage}
            pageSize={poPageSize}
            total={poData?.total}
            onPageChange={setPoPage}
            onPageSizeChange={(size) => { setPoPageSize(size); setPoPage(0); }}
            sortBy={poSortBy}
            sortOrder={poSortOrder}
            onSort={handlePoSort}
            getRowId={(r) => r.id}
            onRowClick={(row) => navigate(`/purchase-orders/${row.id}`)}
            emptyMessage={poFetching ? 'Loading purchase orders…' : 'No purchase orders for this supplier'}
          />

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>Products</Typography>
          <DataTable
            columns={productColumns}
            rows={catalogProducts}
            loading={productsLoading && !productsData}
            page={productPage}
            pageSize={productPageSize}
            total={productsData?.total}
            onPageChange={setProductPage}
            onPageSizeChange={(size) => { setProductPageSize(size); setProductPage(0); }}
            getRowId={(r) => r.id}
            onRowClick={(row) => navigate(`/products/${row.id}`)}
            emptyMessage={productsFetching ? 'Loading products…' : 'No products linked to this supplier'}
          />

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 4 }}>
            Purchase returns
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Aged / expired take-backs (not linked to a PO bill). Use Return goods above when leftover stock exists.
          </Typography>
          {returnsLoading && !returnsData ? (
            <CircularProgress size={24} />
          ) : returns.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {returnsFetching ? 'Loading purchase returns…' : 'No supplier returns yet.'}
            </Typography>
          ) : (
            <Paper sx={{ p: 2 }}>
              {returns.map((ret, index) => (
                <Box
                  key={ret.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 1,
                    borderBottom: index < returns.length - 1 ? 1 : 0,
                    borderColor: 'divider',
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {ret.returnNumber}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {ret.returnDate} · {ret.settlementType.replace('_', ' ')} · {ret.reason.replace('_', ' ')}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {ret.items.map((i) => `${i.productName} × ${i.returnQty}`).join(', ')}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatCurrency(ret.totalAmount)}
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}
          {canReturn && (
            <TablePagination
              component="div"
              count={returnsData?.total ?? 0}
              page={returnPage}
              onPageChange={(_, nextPage) => setReturnPage(nextPage)}
              rowsPerPage={returnPageSize}
              onRowsPerPageChange={(event) => {
                setReturnPageSize(Number(event.target.value));
                setReturnPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          )}
        </Grid>
      </Grid>

      <SupplierReturnDialog
        open={returnOpen}
        supplierId={supplier.id}
        onClose={() => setReturnOpen(false)}
      />

      <Dialog open={Boolean(qrPreview)} onClose={() => setQrPreview(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {qrPreview?.title ?? 'Payment QR'}
          <IconButton aria-label="Close QR preview" onClick={() => setQrPreview(null)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {qrPreview && (
            <Box
              component="img"
              src={qrPreview.url}
              alt={`${qrPreview.title} QR code`}
              sx={{ width: '100%', height: 'auto', borderRadius: 1 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrPreview(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
