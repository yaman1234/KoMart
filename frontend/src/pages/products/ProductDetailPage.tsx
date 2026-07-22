import {
  Box,
  Button,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Alert,
  Link,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ImageIcon from '@mui/icons-material/Image';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useProduct, useDeleteProduct } from '@/hooks/useProducts';
import { useAuthStore } from '@/store';
import { PriceWithUom } from '@/components/products/PriceWithUom';
import { UomConversionHint } from '@/components/uom/UomUi';
import { isAdminOrManager, productStatusColor, productStatusLabel, uomLabel } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { formatConversion, formatStockQty } from '@/utils/uomDisplay';
import { canSellAsPack, canSellAsPiece, packSellOption } from '@/utils/uomSell';
import { showApiError, showSuccess } from '@/utils/toast';
import { PRODUCT_FIELD_LABELS } from '@/constants/productFieldLabels';

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const formatDate = useFormatDate();
  const { data: product, isLoading, isError } = useProduct(id ?? '');
  const user = useAuthStore((s) => s.user);
  const deleteMutation = useDeleteProduct();
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const stockStatus =
    product.stock === 0
      ? { label: 'Out of Stock', color: 'error' as const }
      : product.stock <= product.lowStockThreshold
        ? { label: 'Low Stock', color: 'warning' as const }
        : { label: 'In Stock', color: 'success' as const };

  const showPackPrice = canSellAsPack(product);
  const packOption = packSellOption(product);
  const packPriceIsDerived = showPackPrice && (product.packSellingPrice ?? 0) <= 0;

  const quickInfoItems = [
    { label: 'SKU', value: product.sku },
    { label: 'Barcode', value: product.barcode },
    { label: 'Brand', value: product.brand },
    { label: 'Category', value: product.category },
    { label: 'Country', value: product.countryOfOrigin },
    {
      label: 'Supplier',
      value: product.supplierName ?? '—',
      href: product.supplierId ? `/suppliers/${product.supplierId}` : undefined,
    },
    { label: 'Added', value: formatDate(product.createdAt) },
    { label: PRODUCT_FIELD_LABELS.buyUom, value: uomLabel(product.buyUom ?? product.uom ?? '') },
    { label: PRODUCT_FIELD_LABELS.baseUom, value: uomLabel(product.uom ?? '') },
    {
      label: PRODUCT_FIELD_LABELS.unitsPerPack,
      value: formatConversion(
        product.buyUom ?? '',
        product.uom ?? '',
        product.unitsPerBuyUom ?? 1,
      ) || '—',
    },
    {
      label: 'Cost effective from',
      value: product.costPriceEffectiveFrom ? formatDate(product.costPriceEffectiveFrom) : '—',
    },
    {
      label: 'Selling effective from',
      value: product.sellingPriceEffectiveFrom ? formatDate(product.sellingPriceEffectiveFrom) : '—',
    },
    {
      label: 'Most Popular',
      value: product.isPopular ? 'Yes' : 'No',
    },
    {
      label: 'Trending',
      value: product.isTrending ? 'Yes' : 'No',
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

      {/* ── Hero: Image + Quick Info ── */}
      <Paper sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Product image */}
          <Box
            sx={{
              width: { xs: '100%', md: 340 },
              minHeight: { xs: 260, md: 340 },
              flexShrink: 0,
              position: 'relative',
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {product.images[0] ? (
              <Box
                component="img"
                src={product.images[0]}
                alt={product.name}
                sx={{
                  width: '100%',
                  height: { xs: 260, md: 340 },
                  objectFit: 'cover',
                  display: 'block',
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <Box sx={{ textAlign: 'center', color: 'text.disabled' }}>
                <ImageIcon sx={{ fontSize: 64 }} />
                <Typography variant="body2" sx={{ mt: 1 }}>No image</Typography>
              </Box>
            )}
          </Box>

          {/* Quick info panel */}
          <Box sx={{ flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Price + status row */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {canSellAsPiece(product) && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Piece price
                    </Typography>
                    <PriceWithUom
                      price={product.sellingPrice}
                      uom={product.uom ?? ''}
                      priceSx={{ fontSize: '1.75rem' }}
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
                      priceSx={{ fontSize: '1.75rem' }}
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
                    priceSx={{ fontSize: '1.75rem' }}
                  />
                )}
              </Box>
              <Chip
                label={`Stock: ${formatStockQty(product.stock, product.uom ?? '')}`}
                color={stockStatus.color}
                sx={{ fontWeight: 600 }}
              />
              <Chip label={stockStatus.label} color={stockStatus.color} variant="outlined" sx={{ fontWeight: 600 }} />
              <Chip
                label={productStatusLabel(product.status)}
                color={productStatusColor(product.status)}
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Box>

            {canSeeCostPrice && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Cost Price
                  </Typography>
                  <PriceWithUom
                    price={product.costPrice}
                    uom={product.uom ?? ''}
                    priceSx={{ fontSize: '1rem', color: 'text.primary' }}
                  />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Margin
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>
                    {(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100).toFixed(1)}%
                  </Typography>
                </Box>
              </Box>
            )}

            {canEdit && (
              <Button
                variant="outlined"
                onClick={() => navigate(`/inventory/${product.id}`)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Manage in Inventory
              </Button>
            )}

            <Divider />
            <UomConversionHint
              buyUom={product.buyUom ?? product.uom ?? ''}
              baseUom={product.uom ?? ''}
              factor={product.unitsPerBuyUom ?? 1}
            />
            <Grid container spacing={0.5} sx={{ mt: 1 }}>
              {quickInfoItems.map((item) => (
                <Grid key={item.label} size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', gap: 1, py: 0.75 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minWidth: 90, flexShrink: 0 }}
                    >
                      {item.label}
                    </Typography>
                    {item.href ? (
                      <Link
                        component={RouterLink}
                        to={item.href}
                        variant="body2"
                        sx={{ fontWeight: 600 }}
                      >
                        {item.value}
                      </Link>
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.value ?? '—'}
                      </Typography>
                    )}
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Paper>

      {/* ── Description & Product Details ── */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Description & Details</Typography>
        <Divider sx={{ mb: 2 }} />

        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {product.description || 'No description provided.'}
        </Typography>

        {(product.nutritionInfo || product.allergenInfo) && (
          <>
            <Divider sx={{ my: 2 }} />
            <List dense disablePadding>
              {product.nutritionInfo && (
                <ListItem disableGutters>
                  <ListItemText
                    primary="Nutrition Information"
                    secondary={product.nutritionInfo}
                    slotProps={{ primary: { style: { fontWeight: 600 } } }}
                  />
                </ListItem>
              )}
              {product.allergenInfo && (
                <ListItem disableGutters>
                  <ListItemText
                    primary="Allergen Information"
                    secondary={product.allergenInfo}
                    slotProps={{ primary: { style: { fontWeight: 600 } } }}
                  />
                </ListItem>
              )}
            </List>
          </>
        )}
      </Paper>
    </Box>
  );
}
