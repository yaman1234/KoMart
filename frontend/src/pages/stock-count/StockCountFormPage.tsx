import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
  Paper,
  Alert,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { PRODUCT_SEARCH_PAGE_SIZE } from '@/constants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useProducts } from '@/hooks/useProducts';
import { stockCountService, categoryService } from '@/services';
import { showApiError } from '@/utils/toast';
import { navigateBack } from '@/utils';
import type { Product, StockCountType, StockCountMode } from '@/types';
import dayjs from 'dayjs';

export function StockCountFormPage() {
  const navigate = useNavigate();
  const [countType, setCountType] = useState<StockCountType>('full');
  const [countMode, setCountMode] = useState<StockCountMode>('blind');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [countDate, setCountDate] = useState(dayjs().format('YYYY-MM-DD'));
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryService.getAll(),
  });

  const { data: productSearchData, isFetching: productsFetching } = useProducts(
    {
      search: debouncedProductSearch.trim() || undefined,
      pageSize: PRODUCT_SEARCH_PAGE_SIZE,
      includeImages: false,
    },
    { enabled: countType === 'selected' },
  );

  const productOptions = useMemo(() => {
    const byId = new Map<string, Product>();
    for (const product of selectedProducts) byId.set(product.id, product);
    for (const product of productSearchData?.data ?? []) {
      if (!byId.has(product.id)) byId.set(product.id, product);
    }
    return [...byId.values()];
  }, [selectedProducts, productSearchData]);

  const selectedProductIds = useMemo(
    () => new Set(selectedProducts.map((product) => product.id)),
    [selectedProducts],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      stockCountService.create({
        countType,
        countMode,
        categoryFilter: countType === 'category' ? categoryFilter : '',
        productIds: countType === 'selected' ? selectedProducts.map((product) => product.id) : [],
        notes,
        countDate,
      }),
    onSuccess: (sc) => navigate(`/stock-count/${sc.id}`),
    onError: (err) => showApiError(err, 'Failed to create stock count.'),
  });

  return (
    <Box>
      <PageHeader
        title="New Stock Count"
        subtitle="Configure and start a new physical inventory count."
      />

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            select
            label="Count Type"
            value={countType}
            onChange={(e) => setCountType(e.target.value as StockCountType)}
            fullWidth
          >
            <MenuItem value="full">Full Stock Count — all active products</MenuItem>
            <MenuItem value="category">Category — count one category</MenuItem>
            <MenuItem value="selected">Selected Products</MenuItem>
          </TextField>

          {countType === 'category' && (
            <TextField
              select
              label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              fullWidth
              required
            >
              {(categories ?? []).map((c) => (
                <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
              ))}
            </TextField>
          )}

          {countType === 'selected' && (
            <Autocomplete
              multiple
              fullWidth
              disableCloseOnSelect
              options={productOptions}
              value={selectedProducts}
              inputValue={productSearch}
              onInputChange={(_e, value, reason) => {
                if (reason === 'input' || reason === 'clear' || reason === 'reset') {
                  setProductSearch(value);
                }
              }}
              onChange={(_e, value) => setSelectedProducts(value)}
              getOptionLabel={(option) => (option.sku ? `${option.name} (${option.sku})` : option.name)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(opts) => opts.filter((product) => !selectedProductIds.has(product.id))}
              loading={productsFetching}
              noOptionsText="No products found"
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Products"
                  placeholder={selectedProducts.length === 0 ? 'Search products…' : ''}
                  required
                  helperText={
                    selectedProducts.length === 0
                      ? 'Select at least one product. The count includes only these products.'
                      : `${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'} selected`
                  }
                />
              )}
            />
          )}

          <TextField
            select
            label="Counting Mode"
            value={countMode}
            onChange={(e) => setCountMode(e.target.value as StockCountMode)}
            fullWidth
            helperText={
              countMode === 'blind'
                ? 'Recommended: counters cannot see system quantities.'
                : 'Counters can see system quantities and live variance.'
            }
          >
            <MenuItem value="blind">Blind Count (Recommended)</MenuItem>
            <MenuItem value="assisted">Assisted Count</MenuItem>
          </TextField>

          <TextField
            label="Count Date"
            type="date"
            value={countDate}
            onChange={(e) => setCountDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
            placeholder="Optional notes about this count..."
          />

          {countMode === 'blind' && (
            <Alert severity="info">
              In Blind Count mode, counters will not see system quantities until the count is submitted.
              This prevents bias and ensures accurate physical counting.
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            When you start the count, the system will snapshot current stock quantities for all
            selected products. These snapshots are frozen — sales during counting will not affect
            the variance calculation.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => navigateBack(navigate, '/stock-count')}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={
                (countType === 'category' && !categoryFilter) ||
                (countType === 'selected' && selectedProducts.length === 0)
              }
            >
              Start Count
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
