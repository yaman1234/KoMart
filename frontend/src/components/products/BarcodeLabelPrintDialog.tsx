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
  LABEL_SHEET_WIDTH_MM,
  LABEL_WIDTH_MM,
} from '@/utils/labelPrint';
import type { LabelProduct } from '@/utils/labelCode';
import { showError, showInfo, showWarning } from '@/utils/toast';

interface BarcodeLabelPrintDialogProps {
  open: boolean;
  product: LabelProduct | null;
  onClose: () => void;
}

const PREVIEW_SCALE = 1.5;

export function BarcodeLabelPrintDialog({ open, product, onClose }: BarcodeLabelPrintDialogProps) {
  const [copies, setCopies] = useState(2);
  const valid = labelCopiesValid(copies);
  const previewHtml = useMemo(
    () => (product ? buildLabelPreviewHtml(product, copies) : ''),
    [product, copies],
  );

  useEffect(() => {
    if (open) setCopies(2);
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Print barcode label</DialogTitle>
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
          Physical roll preview ({LABEL_SHEET_WIDTH_MM}mm roll: two {LABEL_WIDTH_MM}mm × {LABEL_HEIGHT_MM}mm stickers).
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            p: 1.5,
            bgcolor: 'grey.100',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: `${LABEL_SHEET_WIDTH_MM * PREVIEW_SCALE}mm`,
              height: `${LABEL_HEIGHT_MM * PREVIEW_SCALE}mm`,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${LABEL_SHEET_WIDTH_MM}mm`,
                height: `${LABEL_HEIGHT_MM}mm`,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: 'top left',
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </Box>
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
