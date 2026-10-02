import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { formatCurrency } from '@/utils';
import type { PurchaseReturn, PurchaseReturnMode, PurchaseReturnSettlement } from '@/types';

const MODE_LABELS: Record<PurchaseReturnMode, string> = {
  po_linked: 'PO-linked',
  supplier: 'Supplier',
};

const SETTLEMENT_LABELS: Record<PurchaseReturnSettlement, string> = {
  refund: 'Refund',
  reduce_payable: 'Reduce payable',
  stock_only: 'Stock only',
};

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  closed: 'Closed',
  confirmed: 'Closed',
};

interface PurchaseReturnDetailDialogProps {
  detail: PurchaseReturn | null;
  onClose: () => void;
  onRecordPayment: (row: PurchaseReturn) => void;
  onOpenAccounts: (row: PurchaseReturn) => void;
  onOpenPo: (row: PurchaseReturn) => void;
  onOpenSupplier: (row: PurchaseReturn) => void;
}

function MoneyStat({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: 'default' | 'warning' | 'success' | 'muted';
}) {
  const color =
    tone === 'warning'
      ? 'warning.main'
      : tone === 'success'
        ? 'success.main'
        : tone === 'muted'
          ? 'text.secondary'
          : 'text.primary';

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        variant={emphasize ? 'subtitle1' : 'body2'}
        sx={{ fontWeight: emphasize ? 700 : 600, color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}

export function PurchaseReturnDetailDialog({
  detail,
  onClose,
  onRecordPayment,
  onOpenAccounts,
  onOpenPo,
  onOpenSupplier,
}: PurchaseReturnDetailDialogProps) {
  if (!detail) return null;

  const status = detail.status;
  const isRequested = status === 'requested';
  const isRefund = detail.settlementType === 'refund';
  const received = detail.amountReceived ?? 0;
  const writeOff = detail.writeOffAmount ?? 0;
  const outstanding =
    detail.amountOutstanding ??
    Math.max(0, detail.totalAmount - received - writeOff);
  const canRecordPayment = isRequested && isRefund;
  const reasonLabel = (detail.reason || 'other').replace(/_/g, ' ');

  const showWriteOff = writeOff > 0;
  const showOutstanding = isRefund && (isRequested || outstanding > 0);
  const showReceived = isRefund;
  const moneyCols = 1 + (showReceived ? 1 : 0) + (showWriteOff ? 1 : 0) + (showOutstanding ? 1 : 0);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          pb: 1,
          pr: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700, display: 'block' }}>
            {detail.returnNumber}
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            <Chip
              size="small"
              label={STATUS_LABELS[status] ?? status}
              color={isRequested ? 'warning' : 'success'}
              variant="outlined"
            />
            <Chip
              size="small"
              label={SETTLEMENT_LABELS[detail.settlementType] ?? detail.settlementType}
              variant="outlined"
            />
            <Chip
              size="small"
              label={MODE_LABELS[detail.returnMode] ?? detail.returnMode}
              color={detail.returnMode === 'po_linked' ? 'primary' : 'default'}
              variant="outlined"
            />
          </Stack>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ mt: -0.25 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 0, py: 0 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: moneyCols === 1 ? '1fr' : '1fr 1fr',
              sm: `repeat(${moneyCols}, minmax(0, 1fr))`,
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: 'action.hover',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <MoneyStat label="Total" value={formatCurrency(detail.totalAmount)} emphasize />
          {showReceived && (
            <MoneyStat
              label="Received"
              value={formatCurrency(received)}
              tone={received > 0 ? 'success' : 'muted'}
            />
          )}
          {showWriteOff && (
            <MoneyStat label="Written off" value={formatCurrency(writeOff)} tone="muted" />
          )}
          {showOutstanding && (
            <MoneyStat
              label="Still due"
              value={formatCurrency(outstanding)}
              tone={outstanding > 0 ? 'warning' : 'muted'}
              emphasize={outstanding > 0}
            />
          )}
        </Box>

        <Box sx={{ px: 3, py: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>
            Details
          </Typography>
          <MetaRow label="Supplier" value={detail.supplierName || '—'} />
          {detail.orderNumber ? <MetaRow label="Purchase order" value={detail.orderNumber} /> : null}
          <MetaRow label="Return date" value={detail.returnDate || '—'} />
          <MetaRow label="Reason" value={reasonLabel} />
          <MetaRow label="Created by" value={detail.createdBy || '—'} />
          {detail.remarks ? <MetaRow label="Remarks" value={detail.remarks} /> : null}
          {detail.writeOffReason ? (
            <MetaRow label="Write-off note" value={detail.writeOffReason} />
          ) : null}
        </Box>

        <Divider />

        <Box sx={{ px: 3, py: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Returned items
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 0 }}>Product</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right" sx={{ pr: 0 }}>
                  Line total
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.items.map((item) => (
                <TableRow key={`${item.productId}-${item.productName}`}>
                  <TableCell sx={{ pl: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.productName}
                    </Typography>
                    {item.baseUom ? (
                      <Typography variant="caption" color="text.secondary">
                        @ {formatCurrency(item.unitCost)} / {item.baseUom}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {item.returnQty}
                    {item.baseUom ? ` ${item.baseUom}` : ''}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ pr: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatCurrency(item.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {(detail.payments?.length ?? 0) > 0 && (
          <>
            <Divider />
            <Box sx={{ px: 3, py: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Payments received
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 0 }}>Date</TableCell>
                    <TableCell>Wallet</TableCell>
                    <TableCell align="right" sx={{ pr: 0 }}>
                      Amount
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.payments!.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell sx={{ pl: 0 }}>{p.date}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{p.wallet}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ pr: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatCurrency(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 2.5,
          py: 1.5,
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {isRefund && (
            <Button
              size="small"
              startIcon={<AccountBalanceWalletOutlinedIcon />}
              onClick={() => onOpenAccounts(detail)}
            >
              Accounts
            </Button>
          )}
          {detail.purchaseOrderId ? (
            <Button
              size="small"
              startIcon={<LocalShippingOutlinedIcon />}
              onClick={() => onOpenPo(detail)}
            >
              Open PO
            </Button>
          ) : detail.supplierId ? (
            <Button
              size="small"
              startIcon={<StorefrontOutlinedIcon />}
              onClick={() => onOpenSupplier(detail)}
            >
              Supplier
            </Button>
          ) : null}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} color="inherit">
            Close
          </Button>
          {canRecordPayment && (
            <Button variant="contained" onClick={() => onRecordPayment(detail)}>
              Record payment
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
