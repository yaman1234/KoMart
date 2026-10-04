import { useEffect, useState } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import { productService } from '@/services';
import type { BundleComponent } from '@/types';

/**
 * Read-only view of a bundle's contents for the product detail page.
 *
 * A bundle's stock is derived as `min(floor(component_stock / quantity))`, so the
 * rows show each component's own availability rather than a bundle stock figure.
 */
export function BundleContentsView({
  components,
}: {
  components: BundleComponent[];
}) {
  const [labels, setLabels] = useState<
    Record<string, { name: string; sku: string; stock: number }>
  >({});

  useEffect(() => {
    if (components.length === 0) return;
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        components.map(async (component) => {
          try {
            const product = await productService.getById(component.productId);
            return [
              component.productId,
              { name: product.name, sku: product.sku, stock: product.stock },
            ] as const;
          } catch {
            return [
              component.productId,
              { name: 'Unknown product', sku: '', stock: 0 },
            ] as const;
          }
        }),
      );
      if (cancelled) return;
      setLabels(Object.fromEntries(results));
    })();
    return () => {
      cancelled = true;
    };
  }, [components]);

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        Combo Contents
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        This combo holds no stock of its own. Availability is derived from these products,
        and selling one deducts each of them.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {components.map((component) => {
          const label = labels[component.productId];
          return (
            <Box
              key={component.productId}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, flex: '1 1 auto' }}>
                {label?.name ?? 'Loading…'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {label?.sku || '—'}
              </Typography>
              <Chip
                size="small"
                label={`${component.quantity} × ${label ? `${label.stock} in stock` : '…'}`}
                color={
                  label
                    ? label.stock >= component.quantity
                      ? 'success'
                      : 'warning'
                    : 'default'
                }
                variant="outlined"
              />
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}