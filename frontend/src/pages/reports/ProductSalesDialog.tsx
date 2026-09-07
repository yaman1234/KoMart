import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency, formatDateTime } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import type { DateRange, Transaction } from '@/types';
import { SaleDetailView } from '@/pages/sales/SaleDetailView';

interface ProductSalesDialogProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  dateRange: DateRange;
}

export function ProductSalesDialog({
  open,
  onClose,
  productId,
  productName,
  dateRange,
}: ProductSalesDialogProps) {
  const formatDate = useFormatDate();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (open) {
      setPage(0);
      setSelectedTransaction(null);
    }
  }, [open, productId]);

  const { data, isLoading } = useTransactions(
    open
      ? {
          productId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          page: page + 1,
          pageSize,
          sortBy: 'created_at',
          sortOrder: 'desc',
        }
      : undefined,
  );

  const columns = useMemo<Column<Transaction>[]>(
    () => [
      {
        id: 'serial',
        label: 'S.N',
        minWidth: 60,
        align: 'center',
        render: (_, index) => String(index + 1),
      },
      {
        id: 'number',
        label: 'Bill No',
        minWidth: 160,
        accessor: 'transactionNumber',
      },
      {
        id: 'customer',
        label: 'Customer',
        render: (r) => r.customerName ?? 'Walk-In',
      },
      {
        id: 'items',
        label: 'Items',
        align: 'right',
        render: (r) => (
          <Typography
            component="button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedTransaction(r);
            }}
            sx={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'primary.main',
              textDecoration: 'underline',
              fontWeight: 600,
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            {r.items.length}
          </Typography>
        ),
      },
      {
        id: 'total',
        label: 'Total',
        align: 'right',
        render: (r) => formatCurrency(r.total),
      },
      {
        id: 'discount',
        label: 'Discount',
        align: 'right',
        render: (r) => {
          const saved = (r.subtotal ?? 0) - (r.total ?? 0) + (r.tax ?? 0);
          return saved > 0 ? (
            <Typography
              component="span"
              variant="body2"
              color="success.main"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              − {formatCurrency(saved)}
            </Typography>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'payment',
        label: 'Payment',
        render: (r) => r.paymentMethod.toUpperCase(),
      },
      { id: 'cashier', label: 'Cashier', accessor: 'createdBy' },
      {
        id: 'date',
        label: 'Date',
        render: (r) => formatDateTime(r.createdAt),
      },
      {
        id: 'status',
        label: 'Status',
        minWidth: 110,
        align: 'center',
        render: (r) => (
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
              backgroundColor: r.status === 'voided' ? 'error.light' : 'success.light',
              color: r.status === 'voided' ? 'error.dark' : 'success.dark',
            }}
          >
            {r.status === 'voided' ? 'Voided' : 'Completed'}
          </Typography>
        ),
      },
    ],
    [],
  );

  const handleClose = () => {
    setSelectedTransaction(null);
    setPage(0);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          Sales — {productName}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
            {formatDate(dateRange.startDate)} → {formatDate(dateRange.endDate)}
            {data?.total != null ? ` · ${data.total} transaction${data.total === 1 ? '' : 's'}` : ''}
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2 }}>
          <Box sx={{ mb: data?.totalAmount ? 1.5 : 0 }}>
            {data?.totalAmount != null && data.total > 0 && (
              <Typography variant="body2" color="text.secondary">
                Total Amount:{' '}
                <Typography component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {formatCurrency(data.totalAmount)}
                </Typography>
              </Typography>
            )}
          </Box>
          <DataTable
            columns={columns}
            rows={data?.data ?? []}
            loading={isLoading}
            page={page}
            pageSize={pageSize}
            total={data?.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
            emptyMessage="No sales found for this product in the selected period"
            getRowId={(r) => r.id}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="contained" onClick={handleClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Sale Detail — {selectedTransaction?.transactionNumber}</DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          {selectedTransaction && <SaleDetailView transaction={selectedTransaction} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="contained" onClick={() => setSelectedTransaction(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
