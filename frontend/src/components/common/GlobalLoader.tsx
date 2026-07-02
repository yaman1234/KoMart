import { Backdrop, CircularProgress, LinearProgress, Box } from '@mui/material';
import { useLoadingStore } from '@/store/loading';

/** Top progress bar + subtle backdrop while any API request is in flight. */
export function GlobalLoader() {
  const busy = useLoadingStore((s) => s.pendingRequests > 0);

  if (!busy) return null;

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: (theme) => theme.zIndex.modal + 2,
        }}
      >
        <LinearProgress />
      </Box>
      <Backdrop
        open
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 1,
          bgcolor: 'rgba(0,0,0,0.08)',
          pointerEvents: 'all',
        }}
      >
        <CircularProgress color="primary" size={48} />
      </Backdrop>
    </>
  );
}
