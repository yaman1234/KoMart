import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { CircularProgress, Box } from '@mui/material';
import { useAuthStore } from '@/store';
import type { UserRole } from '@/types';

function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if ((useAuthStore.persist as unknown as { hasHydrated: () => boolean }).hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);
  return hydrated;
}

function HydrationLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <CircularProgress />
    </Box>
  );
}

export function ProtectedRoute() {
  const hydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!hydrated) return <HydrationLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const hydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!hydrated) return <HydrationLoader />;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

interface RoleGuardProps {
  allow: UserRole[];
  redirectTo?: string;
}

export function RoleGuard({ allow, redirectTo = '/dashboard' }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);
  if (!user || !allow.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}
