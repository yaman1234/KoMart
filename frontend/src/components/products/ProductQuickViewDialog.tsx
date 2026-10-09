import type { ReactNode } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { ProductCommerceSummary } from '@/components/products/ProductCommerceSummary';
import { PO_LABELS, sellAsLabel } from '@/pages/purchase-orders/poTerminology';
import { useAuthStore } from '@/store';
import {
  isAdminOrManager,
  productStatusColor,
  productStatusLabel,
  productStatusOf,
  uomLabel,
} from '@/utils';
import { formatConversion, formatStockQty } from '@/utils/uomDisplay';
import type { Product } from '@/types';

interface ProductQuickViewDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  discountLabel?: string | null;
}

function displayValue(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const text = String(value).trim();
  return text || '—';
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: value === '—' ? 'text.disabled' : 'text.primary' }}
      >
        {value}
      </Typography>
    </Grid>
  );
}

function LabeledBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
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

  const imageSrc = product.images?.find((url) => Boolean(url?.trim())) ?? '';
  const tags = product.tags ?? [];
  const stockColor =
    product.stock === 0 ? 'error' : product.stock <= product.lowStockThreshold ? 'warning' : 'success';

  const details: { label: string; value: string }[] = [
    { label: PO_LABELS.sku, value: displayValue(product.sku) },
    { label: 'Barcode', value: displayValue(product.barcode) },
    { label: 'Brand', value: displayValue(product.brand) },
    { label: 'Category', value: displayValue(product.category) },
    { label: 'Country', value: displayValue(product.countryOfOrigin) },
    { label: 'Supplier', value: displayValue(product.supplierName) },
    {
      label: PO_LABELS.buyUom,
      value: displayValue(uomLabel(product.buyUom ?? product.uom ?? '')),
    },
    {
      label: 'Sell unit',
      value: displayValue(uomLabel(product.uom ?? '')),
    },
    {
      label: PO_LABELS.sellAs,
      value: displayValue(sellAsLabel(product.sellMode)),
    },
    {
      label: PO_LABELS.pcsInPack,
      value: displayValue(
        formatConversion(
          product.buyUom ?? '',
          product.uom ?? '',
          product.unitsPerBuyUom ?? 1,
        ) || String(product.unitsPerBuyUom ?? 1),
      ),
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pr: 1,
          py: 1.5,
        }}
      >
        <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          Product details
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Grid container>
          <Grid
            size={{ xs: 12, sm: 5 }}
            sx={{
              bgcolor: 'action.hover',
              borderRight: { sm: 1 },
              borderColor: 'divider',
              p: { xs: 2, sm: 3 },
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: '100%',
                aspectRatio: '1 / 1',
                maxHeight: { xs: 280, sm: 340 },
                borderRadius: 1.5,
                overflow: 'hidden',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {imageSrc ? (
                <Box
                  component="img"
                  src={imageSrc}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.disabled',
                    gap: 1,
                    p: 2,
                  }}
                >
                  <ImageIcon sx={{ fontSize: 72 }} />
                  <Typography variant="body2" color="text.secondary">
                    No image
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h5"
                component="h2"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1.3,
                  fontSize: { xs: '1.25rem', sm: '1.375rem' },
                  mb: 1.25,
                }}
              >
                {displayValue(product.name)}
              </Typography>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Available stock
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                <Chip
                  label={formatStockQty(product.stock, product.uom ?? '')}
                  color={stockColor}
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
                {discountLabel && (
                  <Chip
                    icon={<LocalOfferIcon sx={{ fontSize: '0.875rem !important' }} />}
                    label={discountLabel}
                    size="small"
                    color="success"
                    sx={{ fontWeight: 600 }}
                  />
                )}
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 7 }} sx={{ p: { xs: 2, sm: 3 } }}>
            <ProductCommerceSummary
              product={product}
              canSeeCostPrice={canSeeCostPrice}
              priceSize="md"
            />

            <Divider sx={{ my: 2.5 }} />
            <Typography
              variant="overline"
              sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.6, color: 'text.secondary', mb: 1.25 }}
            >
              Details
            </Typography>
            <Grid container spacing={1.5}>
              {details.map((row) => (
                <DetailField key={row.label} label={row.label} value={row.value} />
              ))}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <LabeledBlock label="Tags">
              {tags.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" color="info" variant="outlined" />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ fontWeight: 600 }}>
                  —
                </Typography>
              )}
            </LabeledBlock>

            <Divider sx={{ my: 2 }} />
            <LabeledBlock label="Description">
              <Typography
                variant="body2"
                color={product.description?.trim() ? 'text.secondary' : 'text.disabled'}
                sx={{ fontWeight: product.description?.trim() ? 400 : 600 }}
              >
                {displayValue(product.description)}
              </Typography>
            </LabeledBlock>

            <Divider sx={{ my: 2 }} />
            <LabeledBlock label="Nutrition">
              <Typography
                variant="body2"
                color={product.nutritionInfo?.trim() ? 'text.secondary' : 'text.disabled'}
                sx={{ fontWeight: product.nutritionInfo?.trim() ? 400 : 600 }}
              >
                {displayValue(product.nutritionInfo)}
              </Typography>
            </LabeledBlock>

            <Box sx={{ mt: 1.5 }}>
              <LabeledBlock label="Allergens">
                <Typography
                  variant="body2"
                  color={product.allergenInfo?.trim() ? 'text.secondary' : 'text.disabled'}
                  sx={{ fontWeight: product.allergenInfo?.trim() ? 400 : 600 }}
                >
                  {displayValue(product.allergenInfo)}
                </Typography>
              </LabeledBlock>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
}
