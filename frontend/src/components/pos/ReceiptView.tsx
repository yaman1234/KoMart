import React from 'react';
import { Box, Typography } from '@mui/material';
import { formatAmount, formatCurrency, formatDateTime } from '@/utils';
import { APP_NAME } from '@/constants';
import type { Transaction } from '@/types';

export function printReceipt(html: string) {
  const win = window.open('', '_blank', 'width=400,height=700');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 80mm; padding: 4mm; }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .lg     { font-size: 16px; }
    .xl     { font-size: 20px; }
    .sep    { border-top: 1px dashed #000; margin: 5px 0; }
    .row    { display: flex; justify-content: space-between; margin: 1px 0; }
    table   { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th, td  { padding: 2px 2px; vertical-align: top; font-size: 11px; }
    th      { font-weight: bold; border-bottom: 1px solid #000; }
    .name   { width: 45%; }
    .qty    { width: 10%; text-align: center; }
    .rate   { width: 20%; text-align: right; }
    .amt    { width: 25%; text-align: right; }
    @media print { body { width: 80mm; } @page { margin: 0; } }
  </style>
</head>
<body>${html}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

export function buildReceiptHtml(txn: Transaction, tendered?: number): string {
  const change = tendered !== undefined ? tendered - txn.total : undefined;

  const itemRows = txn.items.map((item) => `
    <tr>
      <td class="name">${item.name}</td>
      <td class="qty">${item.quantity}</td>
      <td class="rate">${item.price.toFixed(2)}</td>
      <td class="amt">${(item.price * item.quantity).toFixed(2)}</td>
    </tr>`).join('');

  const customerLabel = txn.customerName && txn.customerName !== 'Walk-In'
    ? txn.customerName
    : 'Walk-In';

  return `
    <div class="center xl bold">${APP_NAME}</div>
    <div class="center">Korean &amp; Asian Snacks</div>
    <div class="center">Thamel, Kathmandu</div>
    <div class="sep"></div>
    <div class="row"><span>Date:</span><span>${formatDateTime(txn.createdAt)}</span></div>
    <div class="row"><span>Bill No:</span><span class="bold">${txn.transactionNumber}</span></div>
    <div class="row"><span>Customer:</span><span>${customerLabel}</span></div>
    <div class="row"><span>Cashier:</span><span>${txn.createdBy}</span></div>
    <div class="sep"></div>
    <table>
      <thead><tr>
        <th class="name">Item</th>
        <th class="qty">Qty</th>
        <th class="rate">Rate</th>
        <th class="amt">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${txn.subtotal.toFixed(2)}</span></div>
    ${txn.discount > 0 ? `<div class="row"><span>Discount</span><span>- ${txn.discount.toFixed(2)}</span></div>` : ''}
    <div class="sep"></div>
    <div class="row bold lg"><span>TOTAL</span><span>Rs. ${txn.total.toFixed(2)}</span></div>
    <div class="sep"></div>
    <div class="row"><span>Payment</span><span class="bold">${txn.paymentMethod.toUpperCase()}</span></div>
    ${tendered !== undefined ? `<div class="row"><span>Tendered</span><span>${tendered.toFixed(2)}</span></div>` : ''}
    ${change !== undefined && change >= 0 ? `<div class="row bold"><span>Change</span><span>${change.toFixed(2)}</span></div>` : ''}
    <div class="sep"></div>
    <div class="center" style="margin-top:8px">Thank you for shopping at ${APP_NAME}!</div>
    <div class="center">Please come again</div>
    <div style="margin-top:16px"></div>`;
}

interface ReceiptViewProps {
  transaction: Transaction;
  tenderedAmount?: number;
}

export function ReceiptView({ transaction: txn, tenderedAmount }: ReceiptViewProps) {
  const cash = tenderedAmount;
  const cashChg = cash !== undefined ? cash - txn.total : undefined;

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
          {APP_NAME}
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit' }}>Korean &amp; Asian Snacks</Typography>
        <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit' }}>Thamel, Kathmandu</Typography>
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
        {(['Item', 'Qty', 'Rate', 'Amount'] as const).map((h) => (
          <Typography
            key={h}
            sx={{
              fontWeight: 700,
              fontSize: '0.68rem',
              fontFamily: 'inherit',
              textAlign: h === 'Item' ? 'left' : 'right',
              pb: 0.25,
              borderBottom: '1px solid #aaa',
            }}
          >
            {h}
          </Typography>
        ))}

        {txn.items.map((item) => (
          <React.Fragment key={item.productId}>
            <Typography sx={{ fontSize: '0.7rem', fontFamily: 'inherit', wordBreak: 'break-word' }}>
              {item.name}
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
      {txn.discount > 0 && <RRow label="Discount" value={`- ${formatAmount(txn.discount)}`} />}
      <RDivider />
      <RRow label="TOTAL" value={formatCurrency(txn.total)} bold large />
      <RDivider />
      <RRow label="Payment" value={txn.paymentMethod.toUpperCase()} />
      {cash !== undefined && <RRow label="Tendered" value={formatAmount(cash)} />}
      {cashChg !== undefined && cashChg >= 0 && <RRow label="Change" value={formatAmount(cashChg)} bold />}
      <RDivider />
      <Typography sx={{ textAlign: 'center', fontSize: '0.7rem', fontFamily: 'inherit', mt: 0.5 }}>
        Thank you for shopping at {APP_NAME}!
      </Typography>
      <Typography sx={{ textAlign: 'center', fontSize: '0.7rem', fontFamily: 'inherit' }}>
        Please come again
      </Typography>
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
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
}) {
  const sz = large ? '0.9rem' : '0.72rem';
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <Typography sx={{ fontWeight: bold ? 700 : 400, fontSize: sz, fontFamily: 'inherit' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: bold ? 700 : 400, fontSize: sz, fontFamily: 'inherit' }}>
        {value}
      </Typography>
    </Box>
  );
}
