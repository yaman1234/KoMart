import { useState, useCallback } from 'react';
import {
  Box,
  Chip,
  Divider,
  Grid,
  IconButton,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import DeliveryDiningIcon from '@mui/icons-material/DeliveryDining';
import { formatAmount, formatCurrency, formatDateTime } from '@/utils';
import { PAYMENT_METHODS } from '@/constants';
import { TransactionDiscountSummary } from '@/components/sales/TransactionDiscountSummary';
import { getTransactionDiscountBreakdown } from '@/utils/transactionDiscounts';
import { ProductQuickViewDialog } from '@/components/products/ProductQuickViewDialog';
import { useProduct } from '@/hooks/useProducts';
import { useCustomer } from '@/hooks/useCustomers';
import type { Transaction } from '@/types';

const ORDER_SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  phone_call: 'Phone Call',
};

const ORDER_SOURCE_STYLES: Record<string, object> = {
  whatsapp: { bgcolor: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' },
  instagram: { bgcolor: '#fce4ec', color: '#c2185b', border: '1px solid #f48fb1' },
  tiktok: { bgcolor: '#f3e5f5', color: '#6a1b9a', border: '1px solid #ce93d8' },
  facebook: { bgcolor: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' },
  phone_call: { bgcolor: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' },
};

interface SaleDetailViewProps {
  transaction: Transaction;
}

export function SaleDetailView({ transaction: txn }: SaleDetailViewProps) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const handleCopyPhone = useCallback((phone: string) => {
    void navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);
  const { data: selectedProduct } = useProduct(selectedProductId ?? '');
  const { data: customer } = useCustomer(txn.customerId ?? '');
  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.value === txn.paymentMethod)?.label
    ?? txn.paymentMethod.toUpperCase();
  const discountBreakdown = getTransactionDiscountBreakdown(txn);

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Paper variant="outlined" sx={{ p: 2.5, height: '100%', background: 'linear-gradient(135deg, #e8f4fd 0%, #f0f7ff 60%, #fafcff 100%)' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Sale Information
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <DetailRow label="Bill No." value={txn.transactionNumber} />
          <DetailRow label="Date" value={formatDateTime(txn.createdAt)} />
          <DetailRow label="Cashier" value={txn.createdBy} />
          <DetailRow label="Payment" value={paymentLabel} />
          {txn.isOnlineOrder && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.25 }}>
                <Typography variant="body2" color="text.secondary">Order Type</Typography>
                <Chip
                  icon={<DeliveryDiningIcon sx={{ fontSize: '14px !important' }} />}
                  label="Online / Delivery"
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: 11 }}
                />
              </Box>
              {txn.orderSource && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.25 }}>
                  <Typography variant="body2" color="text.secondary">Source</Typography>
                  <Chip label={ORDER_SOURCE_LABELS[txn.orderSource]} size="small" sx={{ fontWeight: 600, fontSize: 11, ...ORDER_SOURCE_STYLES[txn.orderSource] }} />
                </Box>
              )}
            </>
          )}
          {txn.notes?.trim() && (
            <DetailRow label="Remarks" value={txn.notes.trim()} />
          )}
          {txn.customerId ? (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.25 }}>
                <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.3 }}>
                  CUSTOMER
                </Typography>
              </Box>
              <DetailRow label="Name" value={txn.customerName ?? '—'} />
              {customer?.phone && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.25 }}>
                  <Typography variant="body2" color="text.secondary">Phone</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Link href={`tel:${customer.phone}`} variant="body2" sx={{ fontWeight: 500 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <PhoneIcon sx={{ fontSize: 13 }} />
                        {customer.phone}
                      </Box>
                    </Link>
                    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                      <IconButton size="small" onClick={() => handleCopyPhone(customer.phone!)} sx={{ p: 0.25 }}>
                        {copied ? <CheckIcon sx={{ fontSize: 13, color: 'success.main' }} /> : <ContentCopyIcon sx={{ fontSize: 13 }} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              )}
              {customer?.email && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1.25 }}>
                  <Typography variant="body2" color="text.secondary">Email</Typography>
                  <Link href={`mailto:${customer.email}`} variant="body2" sx={{ fontWeight: 500 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <EmailIcon sx={{ fontSize: 13 }} />
                      {customer.email}
                    </Box>
                  </Link>
                </Box>
              )}
            </>
          ) : (
            <DetailRow label="Customer" value="Walk-In Customer" />
          )}
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Paper variant="outlined" sx={{ overflow: 'hidden', background: 'linear-gradient(135deg, #f3f0ff 0%, #f8f5ff 60%, #fdfcff 100%)' }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" color="text.secondary">
              Line Items
            </Typography>
          </Box>
          <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600, width: 40 }}>S.N</TableCell>
                  <TableCell sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>Product</TableCell>
                  <TableCell sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>SKU</TableCell>
                  <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>Qty</TableCell>
                  <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>Unit Price</TableCell>
                  <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>Line Discount</TableCell>
                  <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {txn.items.map((item, index) => {
                  const lineDiscount = (item.discount ?? 0) * item.quantity;
                  const lineTotal = item.price * item.quantity - lineDiscount;
                  const isEvenRow = index % 2 === 0;
                  return (
                    <TableRow key={`${item.productId}-${item.sku}`} sx={{ backgroundColor: isEvenRow ? '#ffffff' : '#fafafa' }}>
                      <TableCell sx={{ border: '1px solid', borderColor: 'divider', fontWeight: 600, textAlign: 'center', width: 40 }}>{index + 1}</TableCell>
                      <TableCell sx={{ border: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                          {item.productId && (
                            <IconButton
                              size="small"
                              aria-label="View product details"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (item.productId) {
                                  setSelectedProductId(item.productId);
                                }
                              }}
                              sx={{
                                width: 26,
                                height: 26,
                                color: 'primary.main',
                                border: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ border: '1px solid', borderColor: 'divider' }}>{item.sku}</TableCell>
                      <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider' }}>{item.quantity}</TableCell>
                      <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider' }}>{formatAmount(item.price)}</TableCell>
                      <TableCell align="right" sx={{ color: lineDiscount > 0 ? 'success.main' : 'text.secondary', border: '1px solid', borderColor: 'divider' }}>
                        {lineDiscount > 0 ? `− ${formatAmount(lineDiscount)}` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ border: '1px solid', borderColor: 'divider' }}>{formatAmount(lineTotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: discountBreakdown.hasDiscounts ? 6 : 12 }}>
        <Paper variant="outlined" sx={{ p: 2.5, maxWidth: discountBreakdown.hasDiscounts ? undefined : 360, ml: discountBreakdown.hasDiscounts ? 0 : 'auto', background: 'linear-gradient(135deg, #e8f5e9 0%, #f1faf2 60%, #fafffe 100%)' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Bill Summary
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography color="text.secondary">Subtotal</Typography>
            <Typography>{formatCurrency(txn.subtotal)}</Typography>
          </Box>
          {txn.tax > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography color="text.secondary">Tax</Typography>
              <Typography>{formatCurrency(txn.tax)}</Typography>
            </Box>
          )}
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Total</Typography>
            <Chip label={formatCurrency(txn.total)} color="primary" sx={{ fontWeight: 700, fontSize: '1rem' }} />
          </Box>
        </Paper>
      </Grid>

      {discountBreakdown.hasDiscounts && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: '100%', background: 'linear-gradient(135deg, #fff8e1 0%, #fffbf0 60%, #fffef8 100%)' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Discounts
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <TransactionDiscountSummary transaction={txn} />
          </Paper>
        </Grid>
      )}

      <ProductQuickViewDialog
        product={selectedProduct ?? null}
        open={!!selectedProductId && !!selectedProduct}
        onClose={() => setSelectedProductId(null)}
      />
    </Grid>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1.25 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

