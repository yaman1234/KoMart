import { useEffect } from 'react';
import { Alert, Snackbar, Stack } from '@mui/material';
import { useToastStore, type ToastItem } from '@/store/toast';

function ToastSnackbar({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.duration, toast.id]);

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ position: 'relative', transform: 'none', top: 'auto', right: 'auto', left: 'auto', bottom: 'auto' }}
    >
      <Alert
        severity={toast.severity}
        variant="filled"
        onClose={() => dismiss(toast.id)}
        sx={{ width: '100%', minWidth: 280, maxWidth: 420, boxShadow: 3 }}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  );
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <Stack
      spacing={1}
      sx={{
        position: 'fixed',
        top: (theme) => theme.spacing(2),
        right: (theme) => theme.spacing(2),
        zIndex: (theme) => theme.zIndex.snackbar + 1,
        pointerEvents: 'none',
        '& .MuiSnackbar-root': { pointerEvents: 'auto' },
      }}
    >
      {toasts.map((toast) => (
        <ToastSnackbar key={toast.id} toast={toast} />
      ))}
    </Stack>
  );
}
