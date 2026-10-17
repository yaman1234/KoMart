import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Link,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ImageIcon from '@mui/icons-material/Image';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProductCommerceSummary } from '@/components/products/ProductCommerceSummary';
import { UomConversionHint } from '@/components/uom/UomUi';
import { PO_LABELS, sellAsLabel } from '@/pages/purchase-orders/poTerminology';
import { useAuthStore } from '@/store';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useProduct, useDeleteProduct } from '@/hooks/useProducts';
import {
  isAdminOrManager,
  productStatusColor,
  productStatusLabel,
  uomLabel,
} from '@/utils';
import { formatConversion, formatStockQty, getProductApproxPackStock } from '@/utils/uomDisplay';
import { showApiError, showSuccess } from '@/utils/toast';

function displayValue(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const text = String(value).trim();
  return text || '—';
}

function DetailField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      {children ?? (
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: value === '—' ? 'text.disabled' : 'text.primary' }}
        >
          {value}
        </Typography>
      )}
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

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const formatDate = useFormatDate();
  const { data: product, isLoading, isError } = useProduct(id ?? '');
  const user = useAuthStore((s) => s.user);
  const deleteMutation = useDeleteProduct();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const canSeeCostPrice = isAdminOrManager(user?.role);
  const canEdit = isAdminOrManager(user?.role);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !product) {
    return <Alert severity="error">Product not found.</Alert>;
  }

  const validImages = (product.images ?? []).filter((url) => Boolean(url?.trim()));
  const activeImage = validImages[selectedImageIndex] ?? validImages[0] ?? '';
  const tags = product.tags ?? [];
  const stockColor =
    product.stock === 0
      ? 'error'
      : product.stock <= product.lowStockThreshold
        ? 'warning'
        : 'success';
  const approxPackStock = getProductApproxPackStock(product);

  const details: {
    label: string;
    value?: string;
    render?: () => ReactNode;
  }[] = [
    { label: PO_LABELS.sku, value: displayValue(product.sku) },
    { label: 'Barcode', value: displayValue(product.barcode) },
    { label: 'Brand', value: displayValue(product.brand) },
    { label: 'Category', value: displayValue(product.category) },
    { label: 'Country', value: displayValue(product.countryOfOrigin) },
    {
      label: 'Supplier',
      render: () =>
        product.supplierId ? (
          <Link
            component={RouterLink}
            to={`/suppliers/${product.supplierId}`}
            variant="body2"
            sx={{
              fontWeight: 600,
              color: 'primary.main',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {product.supplierName || '—'}
          </Link>
        ) : (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: !product.supplierName ? 'text.disabled' : 'text.primary',
            }}
          >
            {displayValue(product.supplierName)}
          </Typography>
        ),
    },
    {
      label: PO_LABELS.buyUom,
      value: displayValue(uomLabel(product.buyUom ?? product.uom ?? '')),
    },
    {
      label: PO_LABELS.sellUnit,
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
    ...(canSeeCostPrice
      ? [
          {
            label: 'Margin',
            value:
              product.sellingPrice > 0
                ? `${(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100).toFixed(1)}%`
                : '—',
          },
        ]
      : []),
    {
      label: 'Low stock alert',
      value:
        product.lowStockThreshold != null
          ? `${product.lowStockThreshold} ${uomLabel(product.uom ?? '')}`
          : '—',
    },
    { label: 'Added', value: formatDate(product.createdAt) },
    {
      label: 'Cost effective from',
      value: product.costPriceEffectiveFrom ? formatDate(product.costPriceEffectiveFrom) : '—',
    },
    {
      label: 'Selling effective from',
      value: product.sellingPriceEffectiveFrom ? formatDate(product.sellingPriceEffectiveFrom) : '—',
    },
  ];

  return (
    <Box>
      <PageHeader
        title={product.name}
        breadcrumbs={[{ label: 'Products', path: '/products' }, { label: product.name }]}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/products')}>
              Back
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => navigate(`/products/${product.id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              </>
            )}
          </Box>
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Product"
        message={`Soft-delete "${product.name}"? It will be hidden from catalog and POS but kept for history.`}
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate(product.id, {
            onSuccess: () => {
              showSuccess('Product deleted.');
              setConfirmDelete(false);
              navigate('/products');
            },
            onError: (err) => showApiError(err, 'Product could not be deleted.'),
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* ── Main Product Details Card (matches ProductQuickViewDialog structure) ── */}
      <Paper sx={{ mb: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        <Grid container>
          {/* ── Left Column: Media, Title, Stock & Status ── */}
          <Grid
            size={{ xs: 12, md: 5 }}
            sx={{
              bgcolor: 'action.hover',
              borderRight: { md: 1 },
              borderColor: 'divider',
              p: { xs: 2.5, sm: 3 },
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            }}
          >
            {/* Main Image Container */}
            <Box
              sx={{
                width: '100%',
                aspectRatio: '1 / 1',
                maxHeight: { xs: 300, sm: 380 },
                borderRadius: 1.5,
                overflow: 'hidden',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 1.5,
              }}
            >
              {activeImage ? (
                <Box
                  component="img"
                  src={activeImage}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    e.currentTarget.style.display = 'none';
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

            {/* Thumbnail selector when multiple images exist */}
            {validImages.length > 1 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                {validImages.map((img, idx) => (
                  <Box
                    key={`${img}-${idx}`}
                    component="button"
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    sx={{
                      width: 52,
                      height: 52,
                      p: 0.5,
                      borderRadius: 1,
                      border: '2px solid',
                      borderColor: idx === selectedImageIndex ? 'primary.main' : 'divider',
                      bgcolor: 'background.paper',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s',
                      '&:hover': { borderColor: 'primary.light' },
                    }}
                  >
                    <Box
                      component="img"
                      src={img}
                      alt={`${product.name} ${idx + 1}`}
                      sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  </Box>
                ))}
              </Box>
            )}

            {/* Product Identity & Stock */}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h5"
                component="h2"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1.3,
                  fontSize: { xs: '1.25rem', sm: '1.375rem' },
                  mb: 1.5,
                }}
              >
                {displayValue(product.name)}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Available stock
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                <Chip
                  label={formatStockQty(product.stock, product.uom ?? '')}
                  color={stockColor}
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
                {approxPackStock && (
                  <Tooltip title={approxPackStock.tooltip}>
                    <Chip
                      label={approxPackStock.label}
                      color={stockColor}
                      variant="outlined"
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </Tooltip>
                )}
                <Chip
                  label={productStatusLabel(product.status)}
                  color={productStatusColor(product.status)}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
                {product.discountPercent != null && product.discountPercent > 0 && (
                  <Chip
                    icon={<LocalOfferIcon sx={{ fontSize: '0.875rem !important' }} />}
                    label={`${product.discountPercent}% off`}
                    size="small"
                    color="success"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                {product.isPopular && (
                  <Chip
                    label="Popular"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                {product.isTrending && (
                  <Chip
                    label="Trending"
                    size="small"
                    color="secondary"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                )}
              </Box>
            </Box>

            <Divider />

            {/* Unit conversion hint & Inventory shortcut */}
            <UomConversionHint
              buyUom={product.buyUom ?? product.uom ?? ''}
              baseUom={product.uom ?? ''}
              factor={product.unitsPerBuyUom ?? 1}
            />

            {canEdit && (
              <Button
                variant="outlined"
                startIcon={<Inventory2OutlinedIcon />}
                onClick={() => navigate(`/inventory/${product.id}`)}
                fullWidth
                sx={{ mt: 0.5 }}
              >
                Manage in Inventory
              </Button>
            )}
          </Grid>

          {/* ── Right Column: Pricing, Detailed Attributes & Info ── */}
          <Grid size={{ xs: 12, md: 7 }} sx={{ p: { xs: 2.5, sm: 3 } }}>
            {/* Commerce pricing summary (Buy & Sell panels) */}
            <ProductCommerceSummary
              product={product}
              canSeeCostPrice={canSeeCostPrice}
              priceSize="md"
            />

            <Divider sx={{ my: 2.5 }} />

            {/* Details Section */}
            <Typography
              variant="overline"
              sx={{
                display: 'block',
                fontWeight: 700,
                letterSpacing: 0.6,
                color: 'text.secondary',
                mb: 1.5,
              }}
            >
              Details
            </Typography>
            <Grid container spacing={1.5}>
              {details.map((row) => (
                <DetailField
                  key={row.label}
                  label={row.label}
                  value={row.value}
                >
                  {row.render ? row.render() : undefined}
                </DetailField>
              ))}
            </Grid>

            <Divider sx={{ my: 2.5 }} />

            {/* Tags */}
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

            <Divider sx={{ my: 2.5 }} />

            {/* Description */}
            <LabeledBlock label="Description">
              <Typography
                variant="body2"
                color={product.description?.trim() ? 'text.secondary' : 'text.disabled'}
                sx={{
                  fontWeight: product.description?.trim() ? 400 : 600,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {displayValue(product.description)}
              </Typography>
            </LabeledBlock>

            <Divider sx={{ my: 2.5 }} />

            {/* Nutrition */}
            <LabeledBlock label="Nutrition">
              <Typography
                variant="body2"
                color={product.nutritionInfo?.trim() ? 'text.secondary' : 'text.disabled'}
                sx={{
                  fontWeight: product.nutritionInfo?.trim() ? 400 : 600,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {displayValue(product.nutritionInfo)}
              </Typography>
            </LabeledBlock>

            <Divider sx={{ my: 2.5 }} />

            {/* Allergens */}
            <LabeledBlock label="Allergens">
              <Typography
                variant="body2"
                color={product.allergenInfo?.trim() ? 'text.secondary' : 'text.disabled'}
                sx={{
                  fontWeight: product.allergenInfo?.trim() ? 400 : 600,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {displayValue(product.allergenInfo)}
              </Typography>
            </LabeledBlock>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
