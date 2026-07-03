import { useState } from 'react';
import { Box, Button, ButtonGroup } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';
import type { ReceiptBranding, Transaction } from '@/types';
import {
  printTransactionReceipt,
  downloadReceiptPdf,
  downloadReceiptHtml,
} from '@/utils/receiptPrint';
import { showApiError, showError, showInfo, showSuccess } from '@/utils/toast';

interface ReceiptActionsProps {
  transaction: Transaction;
  tenderedAmount?: number;
  branding?: ReceiptBranding;
  /** Compact layout for payment modal footer */
  compact?: boolean;
  /** Show reprint label on print button (sale detail) */
  showReprintLabel?: boolean;
}

export function ReceiptActions({
  transaction,
  tenderedAmount,
  branding,
  compact = false,
  showReprintLabel = false,
}: ReceiptActionsProps) {
  const [busy, setBusy] = useState(false);

  const handlePrint = () => {
    setBusy(true);
    const result = printTransactionReceipt(transaction, tenderedAmount, branding);
    if (!result.ok) {
      showError(result.message ?? 'Print blocked. Allow pop-ups or use Download PDF.');
    } else {
      showInfo(
        result.method === 'iframe'
          ? 'Print dialog opened.'
          : 'Print dialog opened.',
      );
    }
    setBusy(false);
  };

  const handlePdf = () => {
    try {
      downloadReceiptPdf(transaction, tenderedAmount, branding);
      showSuccess('PDF downloaded.');
    } catch (err) {
      showApiError(err, 'Failed to generate PDF.');
    }
  };

  const handleHtml = () => {
    try {
      downloadReceiptHtml(transaction, tenderedAmount, branding);
      showSuccess('HTML receipt downloaded.');
    } catch (err) {
      showApiError(err, 'Failed to download receipt.');
    }
  };

  const printLabel = showReprintLabel ? 'Reprint' : 'Print';

  if (compact) {
    return (
      <Box sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            disabled={busy}
            sx={{ flex: 1, minWidth: 100 }}
          >
            {printLabel}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdfIcon />}
            onClick={handlePdf}
            sx={{ flex: 1, minWidth: 100 }}
          >
            PDF
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <ButtonGroup variant="outlined" size="small">
      <Button startIcon={<PrintIcon />} onClick={handlePrint} disabled={busy}>
        {printLabel}
      </Button>
      <Button startIcon={<PictureAsPdfIcon />} onClick={handlePdf}>
        Download PDF
      </Button>
      <Button startIcon={<DownloadIcon />} onClick={handleHtml}>
        Download HTML
      </Button>
    </ButtonGroup>
  );
}
