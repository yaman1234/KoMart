import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Alert,
  IconButton,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { DROPDOWN_PAGE_SIZE } from '@/constants';
import { useCreateProduct } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCategoryNames } from '@/hooks/useCategories';
import { useUomOptions } from '@/hooks/useUoms';
import { productService } from '@/services';
import { defaultPrimaryUom, normalizeProductUoms } from '@/utils/uomNormalize';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess, showWarning, showApiError } from '@/utils/toast';
import type { Product } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  category: z.string().min(1, 'Category is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  buyUom: z.string().min(1),
  uom: z.string().min(1),
  unitsPerBuyUom: z.number().int().min(1),
});

type FormValues = z.infer<typeof schema>;

interface ProductCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (product: Product) => void;
  initialSku?: string;
  initialName?: string;
}

export function ProductCreateDialog({
  open,
  onClose,
  onCreated,
  initialSku = '',
  initialName = '',
}: ProductCreateDialogProps) {
  const createMutation = useCreateProduct();
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const categoryNames = useCategoryNames();
  const uomOptions = useUomOptions();
  const primaryUom = defaultPrimaryUom(uomOptions);
  const suppliers = suppliersData?.data ?? [];
  const [error, setError] = useState('');
  const [skuGenerating, setSkuGenerating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      category: '',
      supplierId: '',
      costPrice: 0,
      sellingPrice: 0,
      buyUom: primaryUom || 'pcs',
      uom: primaryUom || 'pcs',
      unitsPerBuyUom: 1,
    },
  });

  const category = watch('category');
  const skuReg = register('sku');

  useEffect(() => {
    if (!open) return;
    reset({
      name: initialName,
      sku: initialSku,
      category: '',
      supplierId: '',
      costPrice: 0,
      sellingPrice: 0,
      buyUom: primaryUom || 'pcs',
      uom: primaryUom || 'pcs',
      unitsPerBuyUom: 1,
    });
    setError('');
  }, [open, initialName, initialSku, primaryUom, reset]);

  const handleGenerateSku = () => {
    const categoryVal = watch('category');
    const currentSku = watch('sku');
    if (!categoryVal?.trim()) {
      showWarning('Select a category to generate SKU.');
      return;
    }
    setSkuGenerating(true);
    void productService
      .suggestSkus([{ brand: '', category: categoryVal }], currentSku ? [currentSku] : [])
      .then(({ skus }) => {
        if (skus[0]) setValue('sku', skus[0], { shouldValidate: true });
      })
      .catch((err) => {
        showApiError(err, 'Could not generate SKU.');
      })
      .finally(() => setSkuGenerating(false));
  };

  const onSubmit = async (values: FormValues) => {
    setError('');
    try {
      const uoms = normalizeProductUoms({
        buyUom: values.buyUom,
        uom: values.uom,
        unitsPerBuyUom: values.unitsPerBuyUom,
      });
      const supplier = suppliers.find((s) => s.id === values.supplierId);
      const created = await createMutation.mutateAsync({
        name: values.name,
        sku: values.sku,
        barcode: values.sku,
        brand: '',
        countryOfOrigin: '',
        category: values.category,
        supplierId: values.supplierId,
        supplierName: supplier?.name ?? '',
        description: '',
        ...uoms,
        sellMode: 'unit',
        costPrice: values.costPrice,
        sellingPrice: values.sellingPrice,
        images: [],
        stock: 0,
        lowStockThreshold: 10,
        status: 'active',
        tags: [],
        isPopular: false,
        isTrending: false,
      });
      showSuccess('Product created.');
      onCreated(created);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create product</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Name"
              fullWidth
              size="small"
              required
              error={!!errors.name}
              helperText={errors.name?.message}
              {...register('name')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="SKU"
              fullWidth
              size="small"
              required
              error={!!errors.sku}
              helperText={
                errors.sku?.message
                || 'Select a category, then use the icon to generate SKU.'
              }
              {...skuReg}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={category ? 'Generate SKU from category' : 'Select a category to generate SKU'}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={handleGenerateSku}
                            tabIndex={-1}
                            disabled={!category || skuGenerating}
                            aria-label="Generate SKU"
                          >
                            <AutorenewIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </InputAdornment>
                  ),
                },
              }}
            />          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Category"
              fullWidth
              size="small"
              required
              error={!!errors.category}
              helperText={errors.category?.message}
              {...register('category')}
            >
              {categoryNames.map((name) => (
                <MenuItem key={name} value={name}>{name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              select
              label="Supplier"
              fullWidth
              size="small"
              required
              error={!!errors.supplierId}
              helperText={errors.supplierId?.message}
              {...register('supplierId')}
            >
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              label="Cost price"
              type="number"
              fullWidth
              size="small"
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              {...register('costPrice', { valueAsNumber: true })}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              label="Selling price"
              type="number"
              fullWidth
              size="small"
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              {...register('sellingPrice', { valueAsNumber: true })}
            />
          </Grid>
          <Grid size={{ xs: 4 }}>
            <TextField
              select
              label="Buy UOM"
              fullWidth
              size="small"
              {...register('buyUom')}
            >
              {uomOptions.map((u) => (
                <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <TextField
              select
              label="Base UOM"
              fullWidth
              size="small"
              {...register('uom')}
            >
              {uomOptions.map((u) => (
                <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <TextField
              label="Units / pack"
              type="number"
              fullWidth
              size="small"
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              {...register('unitsPerBuyUom', { valueAsNumber: true })}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          loading={isSubmitting || createMutation.isPending}
          onClick={() => void handleSubmit(onSubmit)()}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
