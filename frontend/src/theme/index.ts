import { createTheme, type ThemeOptions } from '@mui/material/styles';

const sharedTypography: ThemeOptions['typography'] = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: { fontWeight: 700, fontSize: '2rem' },
  h2: { fontWeight: 700, fontSize: '1.5rem' },
  h3: { fontWeight: 600, fontSize: '1.25rem' },
  h4: { fontWeight: 600, fontSize: '1.125rem' },
  h5: { fontWeight: 600, fontSize: '1rem' },
  h6: { fontWeight: 600, fontSize: '0.875rem' },
  subtitle1: { fontWeight: 500 },
  subtitle2: { fontWeight: 500, fontSize: '0.8125rem' },
  body1: { fontSize: '0.9375rem' },
  body2: { fontSize: '0.875rem' },
  button: { textTransform: 'none', fontWeight: 600 },
};

const sharedComponents: ThemeOptions['components'] = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: { borderRadius: 8 },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: { borderRadius: 12 },
    },
  },
  MuiPaper: {
    styleOverrides: {
      rounded: { borderRadius: 12 },
    },
  },
  MuiTextField: {
    defaultProps: { size: 'small' },
  },
  MuiChip: {
    styleOverrides: {
      root: { borderRadius: 6 },
    },
  },
};

export function createAppTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'light' ? '#E63946' : '#FF6B6B',
        light: '#FF8A94',
        dark: '#C1121F',
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: mode === 'light' ? '#1D3557' : '#457B9D',
        light: '#A8DADC',
        dark: '#0D1B2A',
      },
      success: { main: '#2A9D8F' },
      warning: { main: '#E9C46A' },
      error: { main: '#E63946' },
      info: { main: '#457B9D' },
      background: {
        default: mode === 'light' ? '#F4F6F8' : '#0F1419',
        paper: mode === 'light' ? '#FFFFFF' : '#1A2332',
      },
      divider: mode === 'light' ? '#E8ECF0' : '#2A3544',
    },
    typography: sharedTypography,
    shape: { borderRadius: 8 },
    components: sharedComponents,
    spacing: 8,
  });
}
