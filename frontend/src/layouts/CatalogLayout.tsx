import { AppBar, Avatar, Box, Button, Container, IconButton, ListItemIcon, Menu, MenuItem, Toolbar, Typography } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import { Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useThemeStore, useAuthStore } from '@/store';
import { APP_NAME } from '@/constants';

function AuthButton() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  if (!isAuthenticated) {
    return (
      <Button variant="outlined" size="small" startIcon={<LoginIcon />} onClick={() => navigate('/login')}>
        Login
      </Button>
    );
  }

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  return (
    <>
      <Button
        size="small"
        startIcon={<DashboardIcon />}
        variant="contained"
        onClick={() => navigate('/dashboard')}
      >
        Dashboard
      </Button>
      <Avatar
        sx={{ width: 32, height: 32, fontSize: 13, cursor: 'pointer', bgcolor: 'primary.main' }}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {initials}
      </Avatar>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <Typography variant="caption" color="text.secondary">
            {user?.name}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            logout();
            navigate('/login');
          }}
        >
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </>
  );
}

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

          <AuthButton />

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
