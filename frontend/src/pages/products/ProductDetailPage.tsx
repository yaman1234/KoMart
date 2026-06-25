import {
  Box,
  Button,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  Avatar,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Alert,
  Link,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useProduct } from '@/hooks/useProducts';
import { formatCurrency, formatDate } from '@/utils';

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useProduct(id ?? '');

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  if (isError || !product) {
    return <Alert severity="error">Product not found.</Alert>;
  }

  const stockStatus =
    product.stock === 0 ? { label: 'Out of Stock', color: 'error' as const } :
    product.stock <= product.lowStockThreshold ? { label: 'Low Stock', color: 'warning' as const } :
    { label: 'In Stock', color: 'success' as const };

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
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={() => navigate(`/products/${product.id}/edit`)}
            >
              Edit
            </Button>
          </Box>
        }
      />

      <Grid container spacing={3}>
        {/* Left column */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
            <Avatar
              src={product.images[0]}
              variant="rounded"
              sx={{ width: 180, height: 180, mx: 'auto', mb: 2, fontSize: '4rem' }}
            >
              {product.name[0]}
            </Avatar>
            <Chip label={stockStatus.label} color={stockStatus.color} sx={{ mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
              {formatCurrency(product.sellingPrice)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cost: {formatCurrency(product.costPrice)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Margin: {(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100).toFixed(1)}%
            </Typography>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Quick Info</Typography>
            <Divider sx={{ mb: 2 }} />
            {[
              { label: 'SKU', value: product.sku },
              { label: 'Barcode', value: product.barcode },
              { label: 'Brand', value: product.brand },
              { label: 'Category', value: product.category },
              { label: 'Country', value: product.countryOfOrigin },
              {
                label: 'Supplier',
                value: product.supplierName || '—',
                href: product.supplierId ? `/suppliers/${product.supplierId}` : undefined,
              },
              { label: 'Added', value: formatDate(product.createdAt) },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, gap: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {item.label}
                </Typography>
                {item.href ? (
                  <Link
                    component={RouterLink}
                    to={item.href}
                    variant="body2"
                    sx={{ fontWeight: 500, textAlign: 'right' }}
                  >
                    {item.value}
                  </Link>
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>
                    {item.value}
                  </Typography>
                )}
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Right column */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Description</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              {product.description || 'No description provided.'}
            </Typography>
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Stock Information</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              {[
                { label: 'Current Stock', value: product.stock, color: stockStatus.color },
                { label: 'Low Stock Threshold', value: product.lowStockThreshold },
                { label: 'Selling Price', value: formatCurrency(product.sellingPrice) },
                { label: 'Cost Price', value: formatCurrency(product.costPrice) },
              ].map((item) => (
                <Grid key={item.label} size={{ xs: 6, sm: 3 }}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 700 }}
                      color={item.color ? `${item.color}.main` : 'text.primary'}
                    >
                      {item.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.label}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {(product.nutritionInfo || product.allergenInfo) && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Product Details</Typography>
              <Divider sx={{ mb: 2 }} />
              <List dense disablePadding>
                {product.nutritionInfo && (
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Nutrition Information"
                      secondary={product.nutritionInfo}
                    />
                  </ListItem>
                )}
                {product.allergenInfo && (
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Allergen Information"
                      secondary={product.allergenInfo}
                    />
                  </ListItem>
                )}
              </List>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
