import {
  Alert,
  Box,
  CircularProgress,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useProductPurchasePriceHistory } from '@/hooks/useProducts';
import { formatCurrency } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';

interface PurchasePriceHistoryTabProps {
  productId: string;
}

export function PurchasePriceHistoryTab({ productId }: PurchasePriceHistoryTabProps) {
  const formatDate = useFormatDate();
  const { data, isLoading, isError } = useProductPurchasePriceHistory(productId, Boolean(productId));

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

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        No purchase receipts yet.
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Bill no</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>PO #</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Purchase price</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Landed / unit</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{formatDate(row.receivedDate)}</TableCell>
              <TableCell>{row.billNo?.trim() || '—'}</TableCell>
              <TableCell>
                <Link
                  component={RouterLink}
                  to={`/purchase-orders/${row.purchaseOrderId}`}
                  variant="body2"
                >
                  {row.orderNumber}
                </Link>
              </TableCell>
              <TableCell align="right">{formatCurrency(row.unitCost)}</TableCell>
              <TableCell align="right">{formatCurrency(row.landedUnitCost)}</TableCell>
              <TableCell align="right">{row.quantity}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
