import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ReactNode } from 'react';

interface FormModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  loading?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
}

export function FormModal({
  open,
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  loading,
  maxWidth = 'sm',
}: FormModalProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {title}
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ pt: 1 }}>{children}</Box>
      </DialogContent>
      {onSubmit && (
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onSubmit} loading={loading}>
            {submitLabel}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
