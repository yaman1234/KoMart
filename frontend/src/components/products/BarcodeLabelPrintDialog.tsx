import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import {
  buildLabelPreviewHtml,
  labelCopiesValid,
  printProductLabels,
  LABEL_COPIES_MAX,
  LABEL_COPIES_MIN,
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
} from '@/utils/labelPrint';
import type { LabelProduct } from '@/utils/labelCode';
import { showError, showInfo, showWarning } from '@/utils/toast';

interface BarcodeLabelPrintDialogProps {
  open: boolean;
  product: LabelProduct | null;
  onClose: () => void;
}

export function BarcodeLabelPrintDialog({ open, product, onClose }: BarcodeLabelPrintDialogProps) {
  const [copies, setCopies] = useState(1);
  const valid = labelCopiesValid(copies);
  const previewHtml = useMemo(
    () => (product ? buildLabelPreviewHtml(product) : ''),
    [product],
  );

  useEffect(() => {
    if (open) setCopies(1);
  }, [open]);

  const handlePrint = () => {
    if (!product || !valid) return;
    const result = printProductLabels([product], copies);
    if (!result.ok) {
      showError(result.message ?? 'Print blocked. Allow pop-ups for this site.');
      return;
    }
    if (result.skipped > 0) {
      showWarning('This product has no barcode or SKU to print.');
      return;
    }
    showInfo('Print dialog opened.');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Print barcode</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {product?.name}
        </Typography>
        <TextField
          label="Copies"
          type="number"
          size="small"
          value={copies}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            setCopies(Number.isNaN(next) ? 0 : next);
          }}
          slotProps={{ htmlInput: { min: LABEL_COPIES_MIN, max: LABEL_COPIES_MAX, step: 1 } }}
          error={!valid}
          helperText={valid ? 'Labels to print for this product' : `Enter ${LABEL_COPIES_MIN}–${LABEL_COPIES_MAX}`}
          sx={{ mb: 2, width: 160 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Preview enlarged ×2. Printed label is {LABEL_WIDTH_MM}mm × {LABEL_HEIGHT_MM}mm.
        </Typography>
        <Box
          sx={{
            width: `${LABEL_WIDTH_MM * 2}mm`,
            height: `${LABEL_HEIGHT_MM * 2}mm`,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: '#fff',
          }}
        >
          <Box
            sx={{
              width: `${LABEL_WIDTH_MM}mm`,
              height: `${LABEL_HEIGHT_MM}mm`,
              transform: 'scale(2)',
              transformOrigin: 'top left',
            }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          disabled={!product || !valid}
          onClick={handlePrint}
        >
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}
