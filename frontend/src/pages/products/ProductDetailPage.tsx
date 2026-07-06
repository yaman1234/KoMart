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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ImageIcon from '@mui/icons-material/Image';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useProduct } from '@/hooks/useProducts';
import { useAuthStore } from '@/store';
import { PriceWithUom } from '@/components/products/PriceWithUom';
import { formatDate, isAdminOrManager, productStatusColor, productStatusLabel } from '@/utils';

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useProduct(id ?? '');
  const user = useAuthStore((s) => s.user);

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
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/products/${product.id}/edit`)}
              >
                Edit
              </Button>
            )}
          </Box>
        }
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <PriceWithUom
                price={product.sellingPrice}
                uom={product.uom ?? 'pcs'}
                priceSx={{ fontSize: '1.75rem' }}
              />
              <Chip
                label={`Stock: ${product.stock}`}
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
                    uom={product.uom ?? 'pcs'}
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
            <Grid container spacing={0.5}>
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
