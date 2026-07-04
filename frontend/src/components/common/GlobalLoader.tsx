import { LinearProgress, Box } from '@mui/material';
import { useLoadingStore } from '@/store/loading';

/** Non-blocking top progress bar while any API request is in flight. */
export function GlobalLoader() {
  const busy = useLoadingStore((s) => s.pendingRequests > 0);

  if (!busy) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.modal + 2,
        pointerEvents: 'none',
      }}
    >
      <LinearProgress />
    </Box>
  );
}
