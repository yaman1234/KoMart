import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { formatCurrency, formatDateTime } from '@/utils';
import { APP_NAME } from '@/constants';
import type { Transaction } from '@/types';

interface ReceiptModalProps {
  open: boolean;
  transaction: Transaction | null;
  onNewSale: () => void;
}

export function ReceiptModal({ open, transaction, onNewSale }: ReceiptModalProps) {
  if (!transaction) return null;

  return (
    <Dialog open={open} maxWidth="xs" fullWidth>
      <DialogContent>
        <Box id="receipt-content" sx={{ fontFamily: 'monospace' }}>
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{APP_NAME}</Typography>
            <Typography variant="caption" color="text.secondary">Korean &amp; Asian Snacks</Typography>
            <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">
              Thamel, Kathmandu
            </Typography>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ display: 'block' }}>
              {formatDateTime(transaction.createdAt)}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
              #{transaction.transactionNumber}
            </Typography>
            {transaction.customerName && (
              <Typography variant="caption" sx={{ display: 'block' }}>
                Customer: {transaction.customerName}
              </Typography>
            )}
          </Box>

          <Divider sx={{ my: 1 }} />

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ p: 0.5, fontSize: '0.75rem' }}>Item</TableCell>
                <TableCell align="center" sx={{ p: 0.5, fontSize: '0.75rem' }}>Qty</TableCell>
                <TableCell align="right" sx={{ p: 0.5, fontSize: '0.75rem' }}>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transaction.items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell sx={{ p: 0.5, fontSize: '0.75rem' }}>{item.name}</TableCell>
                  <TableCell align="center" sx={{ p: 0.5, fontSize: '0.75rem' }}>{item.quantity}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, fontSize: '0.75rem' }}>
                    {formatCurrency(item.price * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Divider sx={{ my: 1 }} />

          {[
            { label: 'Subtotal', value: transaction.subtotal },
            { label: 'Discount', value: -transaction.discount },
            { label: 'Tax (13%)', value: transaction.tax },
          ].map((row) => (
            <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption">{row.label}</Typography>
              <Typography variant="caption">{formatCurrency(Math.abs(row.value))}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>TOTAL</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatCurrency(transaction.total)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              Payment: {transaction.paymentMethod.toUpperCase()}
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center' }}>
            Thank you for shopping at {APP_NAME}!
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button startIcon={<PrintIcon />} onClick={() => window.print()} variant="outlined">
          Print
        </Button>
        <Button
          startIcon={<AddShoppingCartIcon />}
          variant="contained"
          onClick={onNewSale}
          fullWidth
        >
          New Sale
        </Button>
      </DialogActions>
    </Dialog>
  );
}
