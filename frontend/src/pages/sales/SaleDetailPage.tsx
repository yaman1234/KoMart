import { Box, Button, CircularProgress, Alert } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ReceiptView, buildReceiptHtml, printReceipt } from '@/components/pos/ReceiptView';
import { useTransaction } from '@/hooks/useTransactions';

export function SaleDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: txn, isLoading, isError } = useTransaction(id ?? '');

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !txn) {
    return <Alert severity="error">Sale not found.</Alert>;
  }

  return (
    <Box>
      <PageHeader
        title={txn.transactionNumber}
        subtitle={`${txn.customerName ?? 'Walk-In'} · ${txn.paymentMethod.toUpperCase()}`}
        breadcrumbs={[{ label: 'Sales', path: '/sales' }, { label: txn.transactionNumber }]}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => printReceipt(buildReceiptHtml(txn))}
            >
              Print
            </Button>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/sales')}>
              Back
            </Button>
          </Box>
        }
      />

      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <ReceiptView transaction={txn} />
      </Box>
    </Box>
  );
}
