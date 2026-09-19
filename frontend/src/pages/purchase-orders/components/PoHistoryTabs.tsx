import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import { formatCurrency } from '@/utils';
import type { PurchaseOrder, PurchaseOrderPaymentStatus, PurchaseReturn } from '@/types';
import { PO_PAYMENT_STATUS_LABELS } from '@/constants';
import { PO_GOODS_RECEIPT_HINT, PO_INVOICE_HINT, PO_RETURN_HINT } from '@/pages/purchase-orders/poTerminology';

type HistoryTab = 'receipts' | 'invoices' | 'payments' | 'returns';

interface PoHistoryTabsProps {
  po: PurchaseOrder;
  receipts: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  returns: PurchaseReturn[];
  canPay: boolean;
  canReturn: boolean;
  paymentStatus: PurchaseOrderPaymentStatus;
  amountPaid: number;
  remaining: number;
  formatDate: (value: string) => string;
  onPay: () => void;
  onReturn: () => void;
}

export function PoHistoryTabs({
  po,
  receipts,
  invoices,
  returns,
  canPay,
  canReturn,
  paymentStatus,
  amountPaid,
  remaining,
  formatDate,
  onPay,
  onReturn,
}: PoHistoryTabsProps) {
  const [tab, setTab] = useState<HistoryTab>('receipts');

  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, mb: 2 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Documents</Typography>
        <Typography variant="caption" color="text.secondary">
          Receipts, invoices, payments, and returns for this order.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v: HistoryTab) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0, textTransform: 'none' } }}
        >
          <Tab value="receipts" label={`Receipts (${receipts.length})`} />
          <Tab value="invoices" label={`Invoices (${invoices.length})`} />
          <Tab value="payments" label={`Payments (${po.payments?.length ?? 0})`} />
          <Tab value="returns" label={`Returns (${returns.length})`} />
        </Tabs>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {tab === 'invoices' && canPay && (
            <Button size="small" startIcon={<PaymentsIcon />} onClick={onPay}>
              Pay invoice
            </Button>
          )}
          {tab === 'payments' && canPay && (
            <Button size="small" startIcon={<PaymentsIcon />} onClick={onPay}>
              Pay invoice
            </Button>
          )}
          {tab === 'returns' && canReturn && (
            <Button size="small" startIcon={<AssignmentReturnIcon />} onClick={onReturn}>
              Return
            </Button>
          )}
        </Box>
      </Box>

      {tab === 'receipts' && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {PO_GOODS_RECEIPT_HINT}
          </Typography>
          {receipts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No goods receipts yet.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Receipt #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bill no.</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {receipts.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>{String(row.receipt_number ?? row.receiptNumber ?? '—')}</TableCell>
                      <TableCell>
                        {row.receipt_date || row.receiptDate
                          ? formatDate(String(row.receipt_date ?? row.receiptDate))
                          : '—'}
                      </TableCell>
                      <TableCell>{String(row.bill_no ?? row.billNo ?? '—') || '—'}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(Number(row.total_amount ?? row.totalAmount ?? 0))}
                      </TableCell>
                      <TableCell>{String(row.received_by ?? row.receivedBy ?? '—')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {tab === 'invoices' && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {PO_INVOICE_HINT}
          </Typography>
          {invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No invoices yet — created when you confirm a goods receipt.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Invoice #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bill no.</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Paid</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>{String(row.invoice_number ?? row.invoiceNumber ?? '—')}</TableCell>
                      <TableCell>
                        {row.invoice_date || row.invoiceDate
                          ? formatDate(String(row.invoice_date ?? row.invoiceDate))
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {String(row.supplier_invoice_no ?? row.supplierInvoiceNo ?? '—') || '—'}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(Number(row.total_amount ?? row.totalAmount ?? 0))}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(Number(row.amount_paid ?? row.amountPaid ?? 0))}
                      </TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>
                        {String(row.status ?? '—')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {tab === 'payments' && (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 3, mb: 1.5, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Paid</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(amountPaid)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Remaining</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: remaining > 0 ? 'warning.main' : 'success.main' }}>
                {formatCurrency(remaining)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {PO_PAYMENT_STATUS_LABELS[paymentStatus]}
              </Typography>
            </Box>
          </Box>
          {(po.payments?.length ?? 0) === 0 ? (
            <Typography variant="body2" color="text.secondary">No payments recorded yet.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bill no.</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Method</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(po.payments ?? []).map((payment, index) => (
                    <TableRow key={`${payment.expenseId}-${index}`}>
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell>{payment.billNo?.trim() ? payment.billNo : '—'}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{payment.paymentMethod}</TableCell>
                      <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell>{payment.createdBy || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {tab === 'returns' && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {PO_RETURN_HINT}
          </Typography>
          {returns.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No purchase returns yet.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Return #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bill no.</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Settlement</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {returns.map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell>{ret.returnNumber}</TableCell>
                      <TableCell>{ret.returnDate ? formatDate(ret.returnDate) : '—'}</TableCell>
                      <TableCell>{ret.billNo?.trim() || '—'}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>
                        {(ret.settlementType || ret.paymentMethod || '—').replace('_', ' ')}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(ret.totalAmount)}</TableCell>
                      <TableCell>{ret.createdBy || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    </Paper>
  );
}
