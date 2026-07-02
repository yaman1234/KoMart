import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ReceiptView } from '@/components/pos/ReceiptView';
import { ReceiptActions } from '@/components/pos/ReceiptActions';
import { SaleDetailView } from './SaleDetailView';
import { SaleEditDialog } from './SaleEditDialog';
import { useTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useStoreSettings } from '@/hooks/useSettings';
import { receiptBrandingFromSettings } from '@/utils/receiptPrint';
import { useAuthStore } from '@/store';
import { isAdminOrManager } from '@/utils';

export function SaleDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const canEdit = isAdminOrManager(user?.role);

  const { data: txn, isLoading, isError } = useTransaction(id ?? '');
  const { data: storeSettings } = useStoreSettings();
  const receiptBranding = storeSettings ? receiptBrandingFromSettings(storeSettings) : undefined;
  const updateMutation = useUpdateTransaction();

  const [editOpen, setEditOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

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
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<ReceiptIcon />}
              onClick={() => setReceiptOpen(true)}
            >
              View Receipt
            </Button>
            <ReceiptActions transaction={txn} showReprintLabel branding={receiptBranding} />
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/sales')}>
              Back
            </Button>
          </Box>
        }
      />

      <SaleDetailView transaction={txn} />

      <SaleEditDialog
        open={editOpen}
        transaction={txn}
        onClose={() => setEditOpen(false)}
        saving={updateMutation.isPending}
        onSave={async (payload) => {
          await updateMutation.mutateAsync({ id: txn.id, ...payload });
        }}
      />

      <Dialog open={receiptOpen} onClose={() => setReceiptOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Receipt — {txn.transactionNumber}</DialogTitle>
        <DialogContent>
          <ReceiptView transaction={txn} branding={receiptBranding} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiptOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
