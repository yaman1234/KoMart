import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ProductFormPage } from '@/pages/products/ProductFormPage';
import type { Product } from '@/types';

interface ProductCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (product: Product) => void;
}

/** Add Product form in a modal — always opens empty (same fields as Products → Add Product). */
export function ProductCreateDialog({
  open,
  onClose,
  onCreated,
}: ProductCreateDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      scroll="paper"
      aria-labelledby="product-create-dialog-title"
      slotProps={{
        paper: {
          sx: { maxHeight: '90vh' },
        },
      }}
    >
      <DialogTitle
        id="product-create-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pr: 1,
          py: 1.5,
        }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Add Product
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 2, md: 3 }, bgcolor: 'background.default' }}>
        {open && (
          <ProductFormPage
            key="po-add-product"
            embedded
            onCancel={onClose}
            onCreated={(product) => {
              onCreated(product);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
