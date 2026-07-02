import { useState } from 'react';
import { Box, Button, Alert, ButtonGroup } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';
import type { ReceiptBranding, Transaction } from '@/types';
import {
  printTransactionReceipt,
  downloadReceiptPdf,
  downloadReceiptHtml,
} from '@/utils/receiptPrint';

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
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; text: string } | null>(null);

  const handlePrint = () => {
    setBusy(true);
    setFeedback(null);
    const result = printTransactionReceipt(transaction, tenderedAmount, branding);
    if (!result.ok) {
      setFeedback({
        severity: 'error',
        text: result.message ?? 'Print blocked. Allow pop-ups or use Download PDF.',
      });
    } else {
      setFeedback({
        severity: 'info',
        text: result.method === 'iframe'
          ? 'Print dialog opened (embedded mode).'
          : 'Print dialog opened.',
      });
    }
    setBusy(false);
  };

  const handlePdf = () => {
    setFeedback(null);
    try {
      downloadReceiptPdf(transaction, tenderedAmount, branding);
      setFeedback({ severity: 'success', text: 'PDF downloaded.' });
    } catch {
      setFeedback({ severity: 'error', text: 'Failed to generate PDF.' });
    }
  };

  const handleHtml = () => {
    setFeedback(null);
    downloadReceiptHtml(transaction, tenderedAmount, branding);
    setFeedback({ severity: 'success', text: 'HTML receipt downloaded.' });
  };

  const printLabel = showReprintLabel ? 'Reprint' : 'Print';

  if (compact) {
    return (
      <Box sx={{ width: '100%' }}>
        {feedback && (
          <Alert severity={feedback.severity} sx={{ mb: 1 }} onClose={() => setFeedback(null)}>
            {feedback.text}
          </Alert>
        )}
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
    <Box>
      {feedback && (
        <Alert severity={feedback.severity} sx={{ mb: 1 }} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}
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
    </Box>
  );
}
