import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { Box, Button, Typography, Paper } from '@mui/material';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred. Please try again.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = (error.data as { message?: string })?.message || error.statusText;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        p: 3,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          borderRadius: 3,
        }}
      >
        <ErrorOutlineOutlinedIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, wordBreak: 'break-word' }}>
          {message}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => window.location.reload()}
          >
            Reload Page
          </Button>
          <Button
            variant="contained"
            startIcon={<HomeIcon />}
            onClick={() => navigate('/')}
          >
            Go to Home
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
