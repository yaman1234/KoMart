import { Box, Chip, Divider, Typography } from '@mui/material';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { formatAmount, formatCurrency } from '@/utils';
import {
  getTransactionDiscountBreakdown,
  getTransactionDiscountLines,
} from '@/utils/transactionDiscounts';
import type { Transaction } from '@/types';

interface TransactionDiscountSummaryProps {
  transaction: Transaction;
  /** Compact single-column layout for narrow panels */
  compact?: boolean;
}

export function TransactionDiscountSummary({ transaction, compact }: TransactionDiscountSummaryProps) {
  const breakdown = getTransactionDiscountBreakdown(transaction);
  const lines = getTransactionDiscountLines(transaction);

  if (!breakdown.hasDiscounts) {
    return (
      <Typography variant="body2" color="text.secondary">
        No discounts applied
      </Typography>
    );
  }

  return (
    <Box>
      {lines.map((line) => (
        <Box
          key={line.label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            mb: compact ? 0.5 : 0.75,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            <LocalOfferOutlinedIcon sx={{ fontSize: 14, color: 'success.main', flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary" noWrap title={line.label}>
              {line.label}
            </Typography>
          </Box>
          <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            − {formatAmount(line.amount)}
          </Typography>
        </Box>
      ))}

      {breakdown.linePromotionDiscount > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Includes {formatAmount(breakdown.linePromotionDiscount)} off line items
        </Typography>
      )}

      <Divider sx={{ my: compact ? 1 : 1.25 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant={compact ? 'body2' : 'subtitle2'} sx={{ fontWeight: 700 }}>
          Total savings
        </Typography>
        <Chip
          label={`− ${formatCurrency(breakdown.totalDiscount)}`}
          size="small"
          color="success"
          sx={{ fontWeight: 700 }}
        />
      </Box>
    </Box>
  );
}
