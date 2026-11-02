import type { SxProps, Theme } from '@mui/material/styles';

/** Sticky first body/header cell for wide report matrices on mobile. */
export const stickyFirstColumnSx: SxProps<Theme> = {
  position: 'sticky',
  left: 0,
  zIndex: 2,
  bgcolor: 'background.paper',
  boxShadow: '4px 0 8px -6px rgba(15, 23, 42, 0.35)',
};

export const stickyFirstHeaderSx: SxProps<Theme> = {
  ...stickyFirstColumnSx,
  zIndex: 3,
  bgcolor: 'background.default',
};
