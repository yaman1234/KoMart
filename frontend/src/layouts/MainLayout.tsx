import { Box, Container } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface MainLayoutProps {
  title?: string;
}

export function MainLayout({ title }: MainLayoutProps) {
  const { pathname } = useLocation();
  const isPos = pathname === '/pos';
  const isFullWidth = isPos || pathname === '/products/bulk-add';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar />
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          width: 0,
        }}
      >
        <TopBar title={title} />
        <Container
          maxWidth={isFullWidth ? false : 'xl'}
          disableGutters={isFullWidth}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            py: isFullWidth ? 1.5 : 3,
            ...(isFullWidth
              ? { pl: { xs: 1.5, sm: 2 }, pr: { xs: 1.5, sm: 2 }, overflowX: 'hidden' }
              : {}),
          }}
        >
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
