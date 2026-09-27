import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { productService } from '@/services';
import { formatCurrency } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import type { PurchasePriceHistoryEntry } from '@/types';

interface Props {
  productId: string;
}

export function PurchasePriceHistoryTab({ productId }: Props) {
  const formatDate = useFormatDate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-price-history', productId],
    queryFn: () => productService.getPurchasePriceHistory(productId, { page: 1, pageSize: 100 }),
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">Could not load purchase price history.</Alert>;
  }

  const rows = data?.data ?? [];

  const columns: Column<PurchasePriceHistoryEntry>[] = [
    {
      id: 'date',
      label: 'Date',
      render: (row) => formatDate(row.purchasedAt),
    },
    {
      id: 'po',
      label: 'PO #',
      accessor: 'orderNumber',
    },
    {
      id: 'supplier',
      label: 'Supplier',
      render: (row) => row.supplierName?.trim() || '—',
    },
    {
      id: 'bill',
      label: 'Bill no',
      render: (row) => row.billNumber?.trim() || '—',
    },
    {
      id: 'unitCost',
      label: 'Unit Cost',
      align: 'right',
      render: (row) => formatCurrency(row.unitCost),
    },
    {
      id: 'qty',
      label: 'Qty received',
      align: 'right',
      accessor: 'quantity',
    },
  ];

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        No purchase receives recorded for this product yet.
      </Typography>
    );
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      emptyMessage="No purchase price history"
    />
  );
}
