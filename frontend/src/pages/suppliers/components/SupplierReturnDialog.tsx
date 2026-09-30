import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { FormModal } from '@/components/common/FormModal';
import {
  useCreatePurchaseReturn,
  useSupplierReturnableLines,
} from '@/hooks/usePurchaseReturns';
import { formatCurrency } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import type { PurchaseReturnReason, PurchaseReturnSettlement } from '@/types';

const REASONS: { value: PurchaseReturnReason; label: string }[] = [
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Slow / take-back' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'quality', label: 'Quality' },
  { value: 'wrong_item', label: 'Wrong item' },
];

interface SupplierReturnDialogProps {
  open: boolean;
  supplierId: string;
  onClose: () => void;
}

interface LineDraft {
  selected: boolean;
  qty: number;
}

export function SupplierReturnDialog({ open, supplierId, onClose }: SupplierReturnDialogProps) {
  const { data, isLoading, isFetching, isSuccess } = useSupplierReturnableLines(supplierId, open);
  const lines = isSuccess ? (data ?? []) : [];
  const createMutation = useCreatePurchaseReturn();
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState<PurchaseReturnReason>('expired');
  const [settlement, setSettlement] = useState<PurchaseReturnSettlement>('stock_only');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setError('');
    setRemarks('');
    setReason('expired');
    setSettlement('stock_only');
  }, [open, supplierId]);

  useEffect(() => {
    if (!open || !isSuccess) return;
    const next: Record<string, LineDraft> = {};
    for (const line of lines) {
      next[line.productId] = { selected: false, qty: line.availableQty };
    }
    setDrafts(next);
  }, [open, isSuccess, lines]);

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        l.productName.toLowerCase().includes(q) ||
        (l.sku || '').toLowerCase().includes(q),
    );
  }, [lines, search]);

  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const d = drafts[line.productId];
      if (!d?.selected) continue;
      total += line.unitCost * Math.min(d.qty, line.availableQty);
    }
    return Math.round(total * 100) / 100;
  }, [drafts, lines]);

  const handleSubmit = async () => {
    const items = lines
      .filter((l) => drafts[l.productId]?.selected)
      .map((l) => ({
        productId: l.productId,
        returnQty: Math.min(drafts[l.productId]?.qty ?? 0, l.availableQty),
      }))
      .filter((i) => i.returnQty > 0);

    if (items.length === 0) {
      setError('Select at least one product with a return quantity.');
      return;
    }

    setError('');
    try {
      await createMutation.mutateAsync({
        returnMode: 'supplier',
        supplierId,
        items,
        settlementType: settlement,
        reason,
        paymentMethod: settlement === 'refund' ? paymentMethod : undefined,
        remarks: remarks.trim() || undefined,
      });
      showSuccess(
        settlement === 'refund'
          ? `Return requested — ${formatCurrency(selectedTotal)}. Confirm payment received to close it.`
          : `Return closed (stock only) — ${formatCurrency(selectedTotal)}.`,
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const busy = createMutation.isPending || isLoading || isFetching;

  return (
    <FormModal
      open={open}
      title="Return goods to supplier"
      onClose={onClose}
      onSubmit={() => void handleSubmit()}
      submitLabel={settlement === 'refund' ? 'Request return' : 'Confirm return'}
      loading={busy}
      maxWidth="md"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        For expired or slow-moving stock. Does not change any purchase order totals. Only leftover
        stock from this supplier&apos;s POs can be returned.
      </Typography>

      {(isLoading || isFetching) && !isSuccess && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {isSuccess && lines.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No returnable leftover from this supplier&apos;s purchase orders.
        </Alert>
      )}

      {isSuccess && lines.length > 0 && (
        <>
          <TextField
            size="small"
            fullWidth
            label="Search products"
            placeholder="Name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Showing {filteredLines.length} of {lines.length} returnable
          </Typography>

          <Box sx={{ maxHeight: 320, overflow: 'auto', mb: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Available</TableCell>
                  <TableCell align="right">Return qty</TableCell>
                  <TableCell align="right">Unit cost</TableCell>
                  <TableCell align="right">Line total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        No matching returnable products.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {filteredLines.map((line) => {
                  const d = drafts[line.productId] ?? { selected: false, qty: line.availableQty };
                  const qty = d.selected ? Math.min(d.qty, line.availableQty) : 0;
                  const lineTotal = Math.round(line.unitCost * qty * 100) / 100;
                  return (
                    <TableRow key={line.productId}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={d.selected}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [line.productId]: { ...d, selected: e.target.checked },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {line.productName}
                        </Typography>
                        {line.sku ? (
                          <Typography variant="caption" color="text.secondary">
                            {line.sku}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="right">{line.availableQty}</TableCell>
                      <TableCell align="right" sx={{ width: 110 }}>
                        <TextField
                          size="small"
                          type="number"
                          value={d.qty}
                          disabled={!d.selected}
                          onChange={(e) => {
                            const nextQty = Math.max(
                              1,
                              Math.min(line.availableQty, Number(e.target.value) || 1),
                            );
                            setDrafts((prev) => ({
                              ...prev,
                              [line.productId]: { ...d, qty: nextQty },
                            }));
                          }}
                          slotProps={{ htmlInput: { min: 1, max: line.availableQty } }}
                        />
                      </TableCell>
                      <TableCell align="right">{formatCurrency(line.unitCost)}</TableCell>
                      <TableCell align="right">{formatCurrency(lineTotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} align="right">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Total
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {formatCurrency(selectedTotal)}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Box>
        </>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2, mt: 2 }}>
        <TextField
          select
          size="small"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as PurchaseReturnReason)}
          sx={{ minWidth: 160 }}
        >
          {REASONS.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Settlement"
          value={settlement}
          onChange={(e) => setSettlement(e.target.value as PurchaseReturnSettlement)}
          sx={{ minWidth: 180 }}
          helperText={
            settlement === 'refund'
              ? 'Stock leaves now. Cash is recorded when you confirm payment received.'
              : 'Stock only — return closes immediately'
          }
        >
          <MenuItem value="stock_only">Stock only</MenuItem>
          <MenuItem value="refund">Refund to wallet</MenuItem>
        </TextField>
        {settlement === 'refund' && (
          <TextField
            select
            size="small"
            label="Wallet"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="bank">Bank</MenuItem>
            <MenuItem value="esewa">eSewa</MenuItem>
          </TextField>
        )}
      </Box>

      <TextField
        fullWidth
        size="small"
        label="Remarks"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />
    </FormModal>
  );
}
