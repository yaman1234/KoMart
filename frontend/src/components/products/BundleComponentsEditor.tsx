import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useProducts } from '@/hooks/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MAX_BUNDLE_COMPONENTS, MIN_BUNDLE_COMPONENTS } from '@/constants/bundleLimits';
import { PRODUCT_SEARCH_PAGE_SIZE } from '@/constants';
import { productService } from '@/services';
import type { BundleComponent, Product } from '@/types';

type ComponentRow = BundleComponent & { name: string; sku: string };

/**
 * Editor for a bundle's component list.
 *
 * Bundles cannot nest, so this only lists non-bundle products. Quantities are
 * deducted in the component's own base unit, and the backend derives available
 * bundle stock as `min(floor(stock / quantity))`.
 */
export function BundleComponentsEditor({
  value,
  onChange,
  error,
  disabledIds = [],
}: {
  value: BundleComponent[];
  onChange: (next: BundleComponent[]) => void;
  error?: string;
  disabledIds?: string[];
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [labels, setLabels] = useState<Record<string, { name: string; sku: string }>>({});

  const { data } = useProducts(
    { search: debouncedSearch || undefined, pageSize: PRODUCT_SEARCH_PAGE_SIZE },
    { enabled: true },
  );
  const options = useMemo(
    () => (data?.data ?? []).filter((p: Product) => !p.isBundle),
    [data],
  );

  const missingIds = useMemo(
    () => value.map((c) => c.productId).filter((pid) => !labels[pid]),
    [value, labels],
  );

  useEffect(() => {
    if (missingIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        missingIds.map(async (id) => {
          try {
            const product = await productService.getById(id);
            return [id, { name: product.name, sku: product.sku }] as const;
          } catch {
            return [id, { name: 'Unknown product', sku: '' }] as const;
          }
        }),
      );
      if (cancelled) return;
      setLabels((prev) => {
        const next = { ...prev };
        for (const [id, label] of results) next[id] = label;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [missingIds]);

  const rows: ComponentRow[] = value.map((c) => ({
    ...c,
    name: labels[c.productId]?.name ?? 'Loading…',
    sku: labels[c.productId]?.sku ?? '',
  }));

  const setQuantity = (productId: string, quantity: number) => {
    onChange(
      value.map((c) =>
        c.productId === productId
          ? { ...c, quantity: Math.max(1, Math.floor(quantity) || 1) }
          : c,
      ),
    );
  };

  const remove = (productId: string) => {
    onChange(value.filter((c) => c.productId !== productId));
  };

  const add = (product: Product | null) => {
    if (!product) return;
    if (value.some((c) => c.productId === product.id)) return;
    if (value.length >= MAX_BUNDLE_COMPONENTS) return;
    setLabels((prev) => ({ ...prev, [product.id]: { name: product.name, sku: product.sku } }));
    onChange([...value, { productId: product.id, quantity: 1 }]);
    setSearch('');
  };

  const selectable = options.filter(
    (p) => !value.some((c) => c.productId === p.id) && !disabledIds.includes(p.id),
  );

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Combo Contents
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {`Pick ${MIN_BUNDLE_COMPONENTS}–${MAX_BUNDLE_COMPONENTS} products. Combos cannot be nested, and quantities are deducted from each product's own stock.`}
      </Typography>

      <Box sx={{ mt: 1.5, mb: 1.5 }}>
        <Autocomplete<Product, false, false, false>
          size="small"
          options={selectable}
          inputValue={search}
          onInputChange={(_e, next, reason) => {
            if (reason === 'input') setSearch(next);
            else if (reason === 'clear') setSearch('');
          }}
          value={null}
          onChange={(_e, next) => add(next)}
          isOptionEqualToValue={(option, selected) => option.id === selected.id}
          getOptionLabel={(option) => `${option.name} (${option.sku})`}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Add a product"
              placeholder="Search products…"
              disabled={value.length >= MAX_BUNDLE_COMPONENTS}
              error={!!error}
              helperText={error}
            />
          )}
        />
      </Box>

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No products added yet
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell align="right" width={140}>Qty</TableCell>
                <TableCell align="right" width={48} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell>
                    <Typography variant="body2">{row.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {row.sku || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={row.quantity}
                      onChange={(e) => setQuantity(row.productId, Number(e.target.value))}
                      slotProps={{ htmlInput: { min: 1, step: 1 } }}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => remove(row.productId)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}