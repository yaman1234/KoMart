import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { PriceWithUom } from '@/components/products/PriceWithUom';
import { UomConversionHint } from '@/components/uom/UomUi';
import { useAuthStore } from '@/store';
import {
  formatCurrency,
  isAdminOrManager,
  productStatusColor,
  productStatusLabel,
  productStatusOf,
  uomLabel,
} from '@/utils';
import { formatConversion, formatStockQty } from '@/utils/uomDisplay';
import { canSellAsPack, canSellAsPiece, packSellOption } from '@/utils/uomSell';
import type { Product } from '@/types';

interface ProductQuickViewDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  discountLabel?: string | null;
}

export function ProductQuickViewDialog({
  product,
  open,
  onClose,
  discountLabel,
}: ProductQuickViewDialogProps) {
  const user = useAuthStore((s) => s.user);
  const canSeeCostPrice = isAdminOrManager(user?.role);

  if (!product) return null;

  const tags = product.tags ?? [];
  const stockStatus =
    product.stock === 0
      ? { label: 'Out of Stock', color: 'error' as const }
      : product.stock <= product.lowStockThreshold
        ? { label: `Low Stock (${product.stock})`, color: 'warning' as const }
        : { label: `In Stock (${product.stock})`, color: 'success' as const };

  const showPackPrice = canSellAsPack(product);
  const packOption = packSellOption(product);
  const packPriceIsDerived = showPackPrice && (product.packSellingPrice ?? 0) <= 0;

  const infoRows: { label: string; value: string }[] = [
    { label: 'SKU', value: product.sku },
    { label: 'Barcode', value: product.barcode },
    { label: 'Brand', value: product.brand },
    { label: 'Category', value: product.category },
    { label: 'Country', value: product.countryOfOrigin },
    { label: 'Supplier', value: product.supplierName ?? '—' },
    { label: 'Primary Unit', value: uomLabel(product.buyUom ?? product.uom ?? '') || '—' },
    { label: 'Secondary Unit', value: uomLabel(product.uom ?? '') || '—' },
    {
      label: 'Conversion',
      value: formatConversion(
        product.buyUom ?? '',
        product.uom ?? '',
        product.unitsPerBuyUom ?? 1,
      ) || '—',
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          pr: 1,
        }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {product.name}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ mt: -0.5 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Grid container sx={{ minHeight: { xs: 'auto', sm: 320 } }}>
          {/* Left — product image */}
          <Grid
            size={{ xs: 12, sm: 5 }}
            sx={{
              bgcolor: 'action.hover',
              borderRight: { sm: 1 },
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: { xs: 2, sm: 3 },
              minHeight: { xs: 200, sm: 320 },
            }}
          >
            {product.images[0] ? (
              <Box
                component="img"
                src={product.images[0]}
                alt={product.name}
                loading="lazy"
                decoding="async"
                sx={{
                  width: '100%',
                  maxHeight: { xs: 220, sm: 360 },
                  objectFit: 'contain',
                  borderRadius: 1,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: { xs: 160, sm: 280 },
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.disabled',
                  gap: 1,
                }}
              >
                <ImageIcon sx={{ fontSize: 64 }} />
                <Typography variant="body2" color="text.secondary">
                  No image
                </Typography>
              </Box>
            )}
          </Grid>

          {/* Right — product details */}
          <Grid size={{ xs: 12, sm: 7 }} sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {canSellAsPiece(product) && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Piece price
                    </Typography>
                    <PriceWithUom
                      price={product.sellingPrice}
                      uom={product.uom ?? ''}
                      priceSx={{ fontSize: '1.25rem' }}
                    />
                  </Box>
                )}
                {showPackPrice && packOption && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Pack price
                    </Typography>
                    <PriceWithUom
                      price={packOption.price}
                      uom={product.buyUom ?? ''}
                      priceSx={{ fontSize: '1.25rem' }}
                    />
                    {packPriceIsDerived && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        Derived from piece price until pack price is set in product edit.
                      </Typography>
                    )}
                  </Box>
                )}
                {!canSellAsPiece(product) && !showPackPrice && (
                  <PriceWithUom
                    price={product.sellingPrice}
                    uom={product.uom ?? ''}
                    priceSx={{ fontSize: '1.25rem' }}
                  />
                )}
              </Box>
              <Chip
                label={formatStockQty(product.stock, product.uom ?? '')}
                color={stockStatus.color}
                size="small"
                sx={{ fontWeight: 600 }}
              />
              {productStatusOf(product.status) !== 'active' && (
                <Chip
                  label={productStatusLabel(product.status)}
                  color={productStatusColor(product.status)}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>

            {canSeeCostPrice && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Cost Price (per base)
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatCurrency(product.costPrice)} / {product.uom || product.buyUom || '—'}
                </Typography>
              </Box>
            )}

            <Box sx={{ mb: 2 }}>
              <UomConversionHint
                buyUom={product.buyUom ?? product.uom ?? ''}
                baseUom={product.uom ?? ''}
                factor={product.unitsPerBuyUom ?? 1}
              />
            </Box>

            {(discountLabel || tags.length > 0) && (
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                {discountLabel && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Discount
                    </Typography>
                    <Chip
                      icon={<LocalOfferIcon sx={{ fontSize: '0.875rem !important' }} />}
                      label={discountLabel}
                      size="small"
                      color="success"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>
                )}
                {tags.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Tags
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {tags.map((tag) => (
                        <Chip key={tag} label={tag} size="small" color="info" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                )}
              </Stack>
            )}

            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={1.5}>
              {infoRows.map((row) => (
                <Grid key={row.label} size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {row.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.value || '—'}
                  </Typography>
                </Grid>
              ))}
            </Grid>

            {product.description && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Description
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {product.description}
                </Typography>
              </>
            )}

            {(product.nutritionInfo || product.allergenInfo) && (
              <>
                <Divider sx={{ my: 2 }} />
                {product.nutritionInfo && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.25 }}>
                      Nutrition
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {product.nutritionInfo}
                    </Typography>
                  </Box>
                )}
                {product.allergenInfo && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.25 }}>
                      Allergens
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {product.allergenInfo}
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
}
