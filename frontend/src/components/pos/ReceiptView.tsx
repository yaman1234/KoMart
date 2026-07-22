import React from 'react';
import { Box, Typography } from '@mui/material';
import { formatAmount, formatCurrency, formatDateTime } from '@/utils';
import { cartLineKey } from '@/utils/cartLine';
import { formatSellLineSubtitle } from '@/utils/uomDisplay';
import { getTransactionDiscountBreakdown, getTransactionDiscountLines } from '@/utils/transactionDiscounts';
import { APP_NAME } from '@/constants';
import type { ReceiptBranding, Transaction } from '@/types';

export {
  buildReceiptHtml,
  buildPrintDocument,
  printReceipt,
  printTransactionReceipt,
  downloadReceiptPdf,
  downloadReceiptHtml,
  escapeHtml,
  receiptBrandingFromSettings,
} from '@/utils/receiptPrint';
export type { PrintResult, PrintMethod } from '@/utils/receiptPrint';

interface ReceiptViewProps {
  transaction: Transaction;
  tenderedAmount?: number;
  branding?: ReceiptBranding;
}

export function ReceiptView({ transaction: txn, tenderedAmount, branding }: ReceiptViewProps) {
  const cash = tenderedAmount;
  const cashChg = cash !== undefined ? cash - txn.total : undefined;
  const storeName = branding?.storeName || APP_NAME;
  const headerLines = branding?.receiptHeader?.split('\n').filter(Boolean) ?? [];
  const footerLines = branding?.receiptFooter?.split('\n').filter(Boolean) ?? [];
  const discountBreakdown = getTransactionDiscountBreakdown(txn);
  const discountLines = getTransactionDiscountLines(txn);

  return (
    <Box
      sx={{
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '0.75rem',
        bgcolor: '#fffef5',
        color: '#000',
        border: '1px solid #e0e0e0',
        borderRadius: 1,
        p: 2,
        lineHeight: 1.7,
        boxShadow: 'inset 0 0 6px rgba(0,0,0,0.04)',
      }}
    >
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', fontFamily: 'inherit', letterSpacing: 1 }}>
          {storeName}
        </Typography>
        {headerLines.map((line) => (
          <Typography key={line} sx={{ fontSize: '0.7rem', fontFamily: 'inherit' }}>{line}</Typography>
        ))}
        {branding?.address && (
          <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit' }}>{branding.address}</Typography>
        )}
        {branding?.phone && (
          <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit' }}>{branding.phone}</Typography>
        )}
      </Box>

      <RDivider />
      <RRow label="Date" value={formatDateTime(txn.createdAt)} />
      <RRow label="Bill No" value={txn.transactionNumber} bold />
      <RRow
        label="Customer"
        value={txn.customerName && txn.customerName !== 'Walk-In' ? txn.customerName : 'Walk-In Customer'}
      />
      <RRow label="Cashier" value={txn.createdBy} />
      <RDivider />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 28px 80px 80px',
          gap: '1px 6px',
          alignItems: 'start',
        }}
      >
        {(['Item', 'Qty', 'Rate', 'Amount'] as const).map((h, i) => (
          <Typography
            key={h}
            sx={{
              fontWeight: 700,
              fontSize: '0.68rem',
              fontFamily: 'inherit',
              textAlign: i === 0 ? 'left' : 'right',
              pb: 0.25,
              borderBottom: '1px solid #aaa',
            }}
          >
            {h}
          </Typography>
        ))}

        {txn.items.map((item) => (
          <React.Fragment key={cartLineKey(item.productId, item.sellUom)}>
            <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', wordBreak: 'break-word' }}>
              {item.name}
              {item.sellUom && (
                <Box component="span" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.6rem' }}>
                  {formatSellLineSubtitle(item.sellUom, item.unitFactor, item.uom ?? '')}
                </Box>
              )}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', textAlign: 'right' }}>
              {item.quantity}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', textAlign: 'right' }}>
              {formatAmount(item.price)}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', textAlign: 'right' }}>
              {formatAmount(item.price * item.quantity)}
            </Typography>
          </React.Fragment>
        ))}
      </Box>

      <RDivider />
      <RRow label="Subtotal" value={formatAmount(txn.subtotal)} />
      {discountLines.map((line) => (
        <RRow key={line.label} label={line.label} value={`- ${formatAmount(line.amount)}`} discount />
      ))}
      {discountBreakdown.hasDiscounts && (
        <RRow label="Total savings" value={`- ${formatAmount(discountBreakdown.totalDiscount)}`} bold discount />
      )}
      <RDivider />
      <RRow label="TOTAL" value={formatCurrency(txn.total)} bold large />
      <RDivider />
      <RRow label="Payment" value={txn.paymentMethod.toUpperCase()} />
      {cash !== undefined && <RRow label="Tendered" value={formatAmount(cash)} />}
      {cashChg !== undefined && cashChg >= 0 && <RRow label="Change" value={formatAmount(cashChg)} bold />}
      {txn.notes?.trim() && (
        <>
          <RDivider />
          <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', fontWeight: 600, mb: 0.25 }}>
            Remarks
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>
            {txn.notes.trim()}
          </Typography>
        </>
      )}
      <RDivider />
      {footerLines.length > 0 ? (
        footerLines.map((line) => (
          <Typography key={line} sx={{ textAlign: 'center', fontSize: '0.7rem', fontFamily: 'inherit', mt: 0.5 }}>
            {line}
          </Typography>
        ))
      ) : (
        <>
          <Typography sx={{ textAlign: 'center', fontSize: '0.7rem', fontFamily: 'inherit', mt: 0.5 }}>
            Thank you for shopping at {storeName}!
          </Typography>
          <Typography sx={{ textAlign: 'center', fontSize: '0.7rem', fontFamily: 'inherit' }}>
            Please come again
          </Typography>
        </>
      )}
    </Box>
  );
}

function RDivider() {
  return <Box sx={{ borderTop: '1px dashed #bbb', my: 0.75 }} />;
}

function RRow({
  label,
  value,
  bold,
  large,
  discount,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
  discount?: boolean;
}) {
  const sz = large ? '0.9rem' : '0.72rem';
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
      <Typography
        sx={{
          fontWeight: bold ? 700 : 400,
          fontSize: sz,
          fontFamily: 'inherit',
          color: discount ? '#2e7d32' : 'inherit',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: bold ? 700 : 400,
          fontSize: sz,
          fontFamily: 'inherit',
          color: discount ? '#2e7d32' : 'inherit',
          textAlign: 'right',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
