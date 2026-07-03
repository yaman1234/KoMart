import { useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Grid,
  TextField,
  MenuItem,
  Typography,
  Paper,
  Divider,
  CircularProgress,
  Avatar,
  IconButton,
  Tooltip,
  Autocomplete,
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useProduct, useCreateProduct, useUpdateProduct } from '@/hooks/useProducts';
import { useStoreSettings } from '@/hooks/useSettings';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCategoryNames } from '@/hooks/useCategories';
import { PRODUCT_CATEGORIES, COUNTRIES, UOM_OPTIONS, PRODUCT_STATUS_OPTIONS } from '@/constants';
import { showApiError, showSuccess } from '@/utils/toast';

// ── SKU generator ─────────────────────────────────────────────────────────────
function generateSku(brand: string, category: string): string {
  const b = (brand || 'PRD').replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const c = (category || 'GEN')
    .split(/[\s&]+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3);
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `${b}-${c}-${rand}`;
}

const schema = z.object({
  name:            z.string().min(1, 'Name is required'),
  sku:             z.string().min(1, 'SKU is required'),
  barcode:         z.string().min(1, 'Barcode is required'),
  brand:           z.string().min(1, 'Brand is required'),
  countryOfOrigin: z.string().min(1, 'Country is required'),
  category:        z.string().min(1, 'Category is required'),
  supplierId:      z.string().min(1, 'Supplier is required'),
  uom:             z.string().min(1, 'UOM is required'),
  description:     z.string(),
  imageUrl:        z.string().url('Enter a valid URL').or(z.literal('')),
  costPrice:       z.number().min(0, 'Must be ≥ 0'),
  sellingPrice:    z.number().min(0.01, 'Must be > 0'),
  lowStockThreshold: z.number().int().min(0, 'Must be ≥ 0'),
  status:            z.enum(['active', 'discontinued', 'seasonal']),
  tags:              z.array(z.string().min(1)),
  nutritionInfo:   z.string(),
  allergenInfo:    z.string(),
});

type FormValues = z.infer<typeof schema>;

export function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: product, isLoading: productLoading } = useProduct(id ?? '');
  const { data: storeSettings } = useStoreSettings();
  const { data: suppliersData } = useSuppliers({ pageSize: 100 });
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  // DB-backed categories; fall back to hardcoded list while loading
  const dbCategories = useCategoryNames();
  const categoryOptions = dbCategories.length > 0 ? dbCategories : [...PRODUCT_CATEGORIES];

  const suppliers = suppliersData?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: '',
      imageUrl: '',
      uom: 'pcs',
      costPrice: 0,
      sellingPrice: 0,
      lowStockThreshold: 10,
      status: 'active',
      tags: [],
      nutritionInfo: '',
      allergenInfo: '',
    },
  });

  useEffect(() => {
    if (product) {
      reset({
        name:             product.name,
        sku:              product.sku,
        barcode:          product.barcode,
        brand:            product.brand,
        countryOfOrigin:  product.countryOfOrigin,
        category:         product.category,
        supplierId:       product.supplierId,
        uom:              product.uom ?? 'pcs',
        description:      product.description,
        imageUrl:         product.images[0] ?? '',
        costPrice:        product.costPrice,
        sellingPrice:     product.sellingPrice,
        lowStockThreshold: product.lowStockThreshold,
        status:            product.status ?? 'active',
        tags:              product.tags ?? [],
        nutritionInfo:    product.nutritionInfo ?? '',
        allergenInfo:     product.allergenInfo ?? '',
      });
    }
  }, [product, reset]);

  useEffect(() => {
    if (!isEditing && storeSettings?.defaultLowStockThreshold != null) {
      setValue('lowStockThreshold', storeSettings.defaultLowStockThreshold);
    }
  }, [isEditing, storeSettings, setValue]);

  const brand = watch('brand');
  const category = watch('category');

  useEffect(() => {
    if (!isEditing && storeSettings?.autoSku && brand && category) {
      setValue('sku', generateSku(brand, category), { shouldValidate: true });
    }
  }, [isEditing, storeSettings?.autoSku, brand, category, setValue]);

  // ── Auto SKU ──────────────────────────────────────────────────────────────
  const handleGenerateSku = useCallback(() => {
    const brand    = watch('brand');
    const category = watch('category');
    setValue('sku', generateSku(brand, category), { shouldValidate: true });
  }, [watch, setValue]);

  // ── Image file picker ────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setValue('imageUrl', reader.result as string, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
    // reset the input so the same file can be re-selected
    e.target.value = '';
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async (values: FormValues) => {
    try {
      const { imageUrl, ...rest } = values;
      const images = imageUrl ? [imageUrl] : [];
      const supplier = suppliers.find((s) => s.id === values.supplierId);
      const payload = {
        ...rest,
        images,
        stock: product?.stock ?? 0,
        supplierName: supplier?.name ?? product?.supplierName ?? '',
      };
      if (isEditing && id) {
        await updateMutation.mutateAsync({ id, data: payload });
        showSuccess('Product updated.');
        navigate(`/products/${id}`);
      } else {
        const created = await createMutation.mutateAsync(payload);
        showSuccess('Product created.');
        navigate(`/products/${created.id}`);
      }
    } catch (err) {
      showApiError(err, isEditing ? 'Product could not be saved.' : 'Product could not be created.');
    }
  };

  const imageUrl = watch('imageUrl');

  if (isEditing && productLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const pending = isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <PageHeader
        title={isEditing ? 'Edit Product' : 'Add Product'}
        breadcrumbs={[{ label: 'Products', path: '/products' }, { label: isEditing ? 'Edit' : 'New' }]}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveIcon />}
              loading={pending}
            >
              {isEditing ? 'Update' : 'Create'} Product
            </Button>
          </Box>
        }
      />

      <Grid container spacing={3}>
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Basic Information</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  {...register('name')}
                  label="Product Name"
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              </Grid>

              {/* SKU with auto-generate */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  {...register('sku')}
                  label="SKU"
                  fullWidth
                  error={!!errors.sku}
                  helperText={errors.sku?.message}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <Tooltip title="Auto-generate SKU from brand & category">
                          <IconButton size="small" onClick={handleGenerateSku} tabIndex={-1}>
                            <AutorenewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ),
                    },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  {...register('barcode')}
                  label="Barcode"
                  fullWidth
                  error={!!errors.barcode}
                  helperText={errors.barcode?.message}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  {...register('brand')}
                  label="Brand"
                  fullWidth
                  error={!!errors.brand}
                  helperText={errors.brand?.message}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="countryOfOrigin"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Country of Origin"
                      fullWidth
                      error={!!errors.countryOfOrigin}
                      helperText={errors.countryOfOrigin?.message}
                    >
                      {COUNTRIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 8 }}>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Category"
                      fullWidth
                      error={!!errors.category}
                      helperText={errors.category?.message}
                    >
                      {categoryOptions.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      multiple
                      freeSolo
                      options={[]}
                      value={field.value}
                      onChange={(_, value) => {
                        const normalized = value
                          .map((tag) => tag.trim())
                          .filter(Boolean);
                        field.onChange([...new Set(normalized)]);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Tags"
                          placeholder="Type and press Enter"
                          helperText="Labels like organic, imported, bestseller"
                        />
                      )}
                    />
                  )}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Controller
                  name="supplierId"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Primary Supplier"
                      fullWidth
                      required
                      error={!!errors.supplierId}
                      helperText={errors.supplierId?.message}
                    >
                      {suppliers.map((s) => (
                        <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Controller
                  name="uom"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Unit of Measure"
                      fullWidth
                      error={!!errors.uom}
                      helperText={errors.uom?.message}
                    >
                      {UOM_OPTIONS.map((u) => (
                        <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <TextField
                  {...register('description')}
                  label="Description"
                  fullWidth
                  multiline
                  rows={3}
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Additional Info</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  {...register('nutritionInfo')}
                  label="Nutrition Information"
                  fullWidth
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  {...register('allergenInfo')}
                  label="Allergen Information"
                  fullWidth
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, lg: 4 }}>
          {/* Image */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Product Image</Typography>
            <Divider sx={{ mb: 3 }} />

            {/* Preview */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Avatar
                src={imageUrl || undefined}
                variant="rounded"
                sx={{ width: 140, height: 140, bgcolor: 'grey.100' }}
              >
                <ImageIcon sx={{ fontSize: 56, color: 'grey.400' }} />
              </Avatar>
            </Box>

            {/* Upload button */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ mb: 1.5 }}
            >
              Upload Image
            </Button>

            {/* URL fallback */}
            <TextField
              {...register('imageUrl')}
              label="or paste Image URL"
              fullWidth
              size="small"
              placeholder="https://…"
              error={!!errors.imageUrl}
              helperText={errors.imageUrl?.message}
            />

            {/* Clear button */}
            {imageUrl && (
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setValue('imageUrl', '')}
                sx={{ mt: 1 }}
              >
                Remove Image
              </Button>
            )}
          </Paper>

          {/* Pricing */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Pricing</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField
                  {...register('costPrice', { valueAsNumber: true })}
                  label="Cost Price (NPR)"
                  type="number"
                  fullWidth
                  error={!!errors.costPrice}
                  helperText={errors.costPrice?.message}
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  {...register('sellingPrice', { valueAsNumber: true })}
                  label="Selling Price (NPR)"
                  type="number"
                  fullWidth
                  error={!!errors.sellingPrice}
                  helperText={errors.sellingPrice?.message}
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              </Grid>
            </Grid>
          </Paper>

          {/* Stock settings (threshold only — actual stock is managed via Inventory) */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>Stock Settings</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Stock is managed from the Inventory page.
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <TextField
              {...register('lowStockThreshold', { valueAsNumber: true })}
              label="Low Stock Alert Threshold"
              type="number"
              fullWidth
              error={!!errors.lowStockThreshold}
              helperText={errors.lowStockThreshold?.message ?? 'Alert triggers when stock falls below this'}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ mb: 2 }}
            />
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Product Status"
                  fullWidth
                  helperText="Discontinued items are hidden from POS"
                >
                  {PRODUCT_STATUS_OPTIONS.map((s) => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
