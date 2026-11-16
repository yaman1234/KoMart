import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import type { Product } from '@/types';

interface PosBarcodeChoiceDialogProps {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onSelect: (product: Product) => void;
}

/** Named SKU picker when a scanned barcode matches more than one product. */
export function PosBarcodeChoiceDialog({
  open,
  products,
  onClose,
  onSelect,
}: PosBarcodeChoiceDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="pos-barcode-choice-title"
    >
      <DialogTitle id="pos-barcode-choice-title" sx={{ fontWeight: 700 }}>
        Multiple products share this barcode
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Select the product to add.
        </Typography>
        <List disablePadding>
          {products.map((product) => (
            <ListItemButton key={product.id} onClick={() => onSelect(product)}>
              <ListItemText
                primary={product.name}
                secondary={`SKU ${product.sku}${product.stock === 0 ? ' · Out of stock' : ''}`}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
