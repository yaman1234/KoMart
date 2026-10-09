import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { PriceWithUom } from '@/components/products/PriceWithUom';
import { PO_LABELS } from '@/pages/purchase-orders/poTerminology';
import { packSellOption } from '@/utils/uomSell';
import type { Product } from '@/types';

interface ProductCommerceSummaryProps {
  product: Product;
  canSeeCostPrice?: boolean;
  priceSize?: 'md' | 'lg';
}

const panelSx = {
  p: 1.75,
  borderRadius: 1.5,
  border: '1px solid',
  borderColor: 'divider',
  height: '100%',
} as const;

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: 'block',
        fontWeight: 700,
        letterSpacing: 0.6,
        color: 'text.secondary',
        mb: 1.25,
      }}
    >
      {children}
    </Typography>
  );
}

function PriceBlock({
  label,
  price,
  uom,
  priceSx,
}: {
  label: string;
  price: number;
  uom: string;
  priceSx: object;
}) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 0.35, fontWeight: 500 }}
      >
        {label}
      </Typography>
      <PriceWithUom price={price} uom={uom} priceSx={priceSx} />
    </Box>
  );
}

/**
 * Buy / Sell:
 *   Cost / pc · Price / pc always
 *   Cost / pack · Price / pack only when pack conversion applies
 */
export function ProductCommerceSummary({
  product,
  canSeeCostPrice = false,
  priceSize = 'md',
}: ProductCommerceSummaryProps) {
  const packOption = packSellOption(product);
  const size = priceSize === 'lg' ? '1.375rem' : '1.125rem';
  const buyPriceSx = {
    fontSize: size,
    fontWeight: 700,
    color: 'text.primary',
  };
  const sellPriceSx = {
    fontSize: size,
    fontWeight: 700,
    color: 'success.main',
  };
  const unitsPerPack = product.unitsPerBuyUom ?? 1;
  const hasPack = unitsPerPack > 1;
  const pieceUom = product.uom || product.buyUom || 'pcs';
  const packUom = product.buyUom || product.uom || 'pack';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: canSeeCostPrice ? '1fr 1fr' : '1fr' },
        gap: 2,
      }}
    >
      {canSeeCostPrice && (
        <Box sx={{ ...panelSx, bgcolor: 'action.hover' }}>
          <SectionLabel>Buy</SectionLabel>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
            {hasPack && (
              <PriceBlock
                label={PO_LABELS.costPack}
                price={product.costPrice * unitsPerPack}
                uom={packUom}
                priceSx={buyPriceSx}
              />
            )}
            <PriceBlock
              label={PO_LABELS.costPc}
              price={product.costPrice}
              uom={pieceUom}
              priceSx={buyPriceSx}
            />
          </Box>
        </Box>
      )}

      <Box
        sx={{
          ...panelSx,
          bgcolor: (t) => alpha(t.palette.success.main, t.palette.mode === 'dark' ? 0.12 : 0.06),
          borderColor: (t) => alpha(t.palette.success.main, t.palette.mode === 'dark' ? 0.35 : 0.22),
        }}
      >
        <SectionLabel>Sell</SectionLabel>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
          {packOption && (
            <PriceBlock
              label={PO_LABELS.packPrice}
              price={packOption.price}
              uom={packUom}
              priceSx={sellPriceSx}
            />
          )}
          <PriceBlock
            label={PO_LABELS.piecePrice}
            price={product.sellingPrice}
            uom={pieceUom}
            priceSx={sellPriceSx}
          />
        </Box>
      </Box>
    </Box>
  );
}
