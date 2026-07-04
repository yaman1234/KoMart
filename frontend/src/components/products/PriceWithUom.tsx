import { Box, type SxProps, type Theme } from '@mui/material';
import { formatCurrency } from '@/utils';

interface PriceWithUomProps {
  price: number;
  uom?: string;
  priceSx?: SxProps<Theme>;
}

/** Price with a compact UOM suffix (e.g. Rs. 120 / pcs). */
export function PriceWithUom({ price, uom = 'pcs', priceSx }: PriceWithUomProps) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.25,
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <Box
        component="span"
        sx={{
          fontWeight: 700,
          color: 'primary.main',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.2,
          ...priceSx,
        }}
      >
        {formatCurrency(price)}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: '0.55rem',
          color: 'text.secondary',
          fontWeight: 500,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        / {uom}
      </Box>
    </Box>
  );
}
