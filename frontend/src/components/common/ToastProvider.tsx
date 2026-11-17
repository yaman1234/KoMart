import { useEffect } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { Alert, Button, IconButton, Snackbar, Stack } from '@mui/material';
import { useToastStore, type ToastItem } from '@/store/toast';
import { API_TIMEOUT_MESSAGE } from '@/utils/apiTimeout';
import { isMockEnabled } from '@/config/mock';

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

function ApiTimeoutNotice() {
  const dismiss = useToastStore((s) => s.dismissTimeoutNotice);

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      onClose={(_event, reason) => {
        if (reason === 'clickaway') return;
        dismiss();
      }}
      sx={{ position: 'relative', transform: 'none', top: 'auto', right: 'auto', left: 'auto', bottom: 'auto' }}
    >
      <Alert
        severity="error"
        variant="filled"
        sx={{
          width: '100%',
          minWidth: 280,
          maxWidth: 520,
          boxShadow: 3,
          alignItems: 'center',
          '& .MuiAlert-action': { alignItems: 'center', pt: 0 },
        }}
        action={
          <>
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
              Refresh
            </Button>
            <IconButton aria-label="Close" color="inherit" size="small" onClick={dismiss}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      >
        {API_TIMEOUT_MESSAGE}
      </Alert>
    </Snackbar>
  );
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);
  const timeoutNoticeOpen = useToastStore((s) => s.timeoutNoticeOpen);
  const showTimeoutNotice = timeoutNoticeOpen && !isMockEnabled();

  if (toasts.length === 0 && !showTimeoutNotice) return null;

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
      {showTimeoutNotice && <ApiTimeoutNotice />}
      {toasts.map((toast) => (
        <ToastSnackbar key={toast.id} toast={toast} />
      ))}
    </Stack>
  );
}
