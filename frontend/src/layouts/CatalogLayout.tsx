import { AppBar, Box, Container, IconButton, Toolbar, Typography } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { Outlet, useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/store';
import { APP_NAME } from '@/constants';

export function CatalogLayout() {
  const navigate = useNavigate();
  const mode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <Box
            component="img"
            src="/koMart_logo.png"
            alt="KoMart Logo"
            sx={{ height: 36, width: 'auto', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          />
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, cursor: 'pointer', color: 'primary.main' }}
            onClick={() => navigate('/')}
          >
            {APP_NAME}
          </Typography>

          <Box sx={{ flex: 1 }} />

          <IconButton onClick={toggleMode} size="small" aria-label="Toggle theme">
            {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ flex: 1, py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
