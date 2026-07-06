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
  TextField,
  Chip,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ReceiptView } from '@/components/pos/ReceiptView';
import { ReceiptActions } from '@/components/pos/ReceiptActions';
import { SaleDetailView } from './SaleDetailView';
import { SaleEditDialog } from './SaleEditDialog';
import { useTransaction, useUpdateTransaction, useVoidTransaction } from '@/hooks/useTransactions';
import { useStoreSettings } from '@/hooks/useSettings';
import { receiptBrandingFromSettings } from '@/utils/receiptPrint';
import { useAuthStore } from '@/store';
import { isAdminOrManager } from '@/utils';
import { showSuccess } from '@/utils/toast';

export function SaleDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const canEdit = isAdminOrManager(user?.role);

  const { data: txn, isLoading, isError } = useTransaction(id ?? '');
  const { data: storeSettings } = useStoreSettings();
  const receiptBranding = storeSettings ? receiptBrandingFromSettings(storeSettings) : undefined;
  const updateMutation = useUpdateTransaction();
  const voidMutation = useVoidTransaction();

  const [editOpen, setEditOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

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

  const isVoided = txn.status === 'voided';

  return (
    <Box>
      <PageHeader
        title={txn.transactionNumber}
        subtitle={`${txn.customerName ?? 'Walk-In'} · ${txn.paymentMethod.toUpperCase()}`}
        breadcrumbs={[{ label: 'Sales', path: '/sales' }, { label: txn.transactionNumber }]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {isVoided && <Chip label="VOIDED" color="error" />}
            {canEdit && !isVoided && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            )}
            {canEdit && !isVoided && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<BlockIcon />}
                onClick={() => { setVoidOpen(true); setVoidReason(''); setVoidError(''); }}
              >
                Void Sale
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

      {isVoided && txn.voidReason && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Voided — {txn.voidReason}
        </Alert>
      )}

      <SaleEditDialog
        open={editOpen}
        transaction={txn}
        onClose={() => setEditOpen(false)}
        saving={updateMutation.isPending}
        onSave={async (payload) => {
          await updateMutation.mutateAsync({ id: txn.id, ...payload });
          showSuccess('Sale updated.');
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

      <Dialog open={voidOpen} onClose={() => setVoidOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Void sale {txn.transactionNumber}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Stock will be restored to original batches. This sale will be removed from revenue reports.
          </Alert>
          {voidError && <Alert severity="error" sx={{ mb: 2 }}>{voidError}</Alert>}
          <TextField
            label="Reason for void"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            loading={voidMutation.isPending}
            onClick={async () => {
              if (!voidReason.trim()) { setVoidError('Reason is required'); return; }
              try {
                await voidMutation.mutateAsync({ id: txn.id, reason: voidReason.trim() });
                showSuccess('Sale voided.');
                setVoidOpen(false);
              } catch {
                setVoidError('Could not void sale.');
              }
            }}
          >
            Void Sale
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
