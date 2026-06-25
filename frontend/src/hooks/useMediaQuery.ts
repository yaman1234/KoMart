import { useMediaQuery, useTheme } from '@mui/material';

export function useIsMobile() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

export function useIsTablet() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.between('md', 'lg'));
}
