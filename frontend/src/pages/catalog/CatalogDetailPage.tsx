import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ImageIcon from '@mui/icons-material/Image';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { useNavigate, useParams } from 'react-router-dom';
import { useCatalogProduct, useCatalogOffers } from '@/hooks/useCatalog';
import { getCatalogDiscountLabel } from '@/utils/catalogDiscounts';
import { formatCurrency, productStatusOf, productStatusLabel, productStatusColor } from '@/utils';

export function CatalogDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useCatalogProduct(id ?? '');
  const { data: offers = [] } = useCatalogOffers();

  const discountLabel = product ? getCatalogDiscountLabel(product, offers) : null;

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

  const quickInfoItems = [
    { label: 'SKU', value: product.sku },
    { label: 'Barcode', value: product.barcode },
    { label: 'Brand', value: product.brand },
    { label: 'Category', value: product.category },
    { label: 'Country', value: product.countryOfOrigin },
  ];

  return (
    <Box>
      {/* Back button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/')}
        sx={{ mb: 2 }}
      >
        Back to Catalog
      </Button>

      {/* Hero: Image + Quick Info */}
      <Paper sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Product image */}
          <Box
            sx={{
              width: { xs: '100%', md: 400 },
              minHeight: { xs: 280, md: 400 },
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
                  height: { xs: 280, md: 400 },
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

          {/* Info panel */}
          <Box sx={{ flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {product.name}
            </Typography>

            {/* Price + status + discount row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: product.inStock === false ? 'text.disabled' : 'primary.main' }}>
                {formatCurrency(product.sellingPrice)}
              </Typography>
              {product.inStock === false && (
                <Chip
                  label="Out of Stock"
                  color="error"
                  sx={{ fontWeight: 700 }}
                />
              )}
              {discountLabel && product.inStock !== false && (
                <Chip
                  icon={<LocalOfferIcon sx={{ fontSize: '1rem !important' }} />}
                  label={discountLabel}
                  color="success"
                  sx={{ fontWeight: 700 }}
                />
              )}
              {productStatusOf(product.status) === 'seasonal' && (
                <Chip
                  label={productStatusLabel(product.status)}
                  color={productStatusColor(product.status)}
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {product.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" color="info" variant="outlined" />
                ))}
              </Box>
            )}

            <Divider />

            {/* Key-value quick info */}
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
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {item.value ?? '—'}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Paper>

      {/* Description & Details */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Description &amp; Details
        </Typography>
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
