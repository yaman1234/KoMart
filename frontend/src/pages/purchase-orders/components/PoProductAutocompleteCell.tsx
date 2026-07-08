import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';
import { excelCellSx } from '@/pages/purchase-orders/inputStyles';
import type { PoLineItem } from '@/pages/purchase-orders/poFormTypes';
import {
  applyProductToLine,
  searchProducts,
  type ProductCatalogIndex,
} from '@/pages/purchase-orders/poProductResolver';

export interface PoProductAutocompleteCellProps {
  line: PoLineItem;
  catalogIndex: ProductCatalogIndex;
  disabled?: boolean;
  onLineChange: (line: PoLineItem) => void;
  onFocus?: () => void;
}

export function PoProductAutocompleteCell({
  line,
  catalogIndex,
  disabled = false,
  onLineChange,
  onFocus,
}: PoProductAutocompleteCellProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      <Autocomplete
        size="small"
        fullWidth
        disabled={disabled}
        options={catalogIndex.products}
        value={line.product}
        onChange={(_e, product) => {
          if (!product) {
            onLineChange({
              ...line,
              product: null,
              productNameFallback: '',
              skuInput: '',
              resolveError: undefined,
            });
            return;
          }
          onLineChange(applyProductToLine(line, product));
        }}
        onFocus={onFocus}
        filterOptions={(_opts, { inputValue }) => searchProducts(inputValue, catalogIndex)}
        getOptionLabel={(p) => p.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          const buyUom = option.buyUom ?? option.uom ?? 'pcs';
          return (
            <Box component="li" key={key} {...rest}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                  {option.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {option.sku || '—'} · {buyUom}
                </Typography>
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search product…"
            sx={excelCellSx}
          />
        )}
        slotProps={{
          popper: { sx: { zIndex: 1400 } },
        }}
      />
      {line.receivedQuantity > 0 && (
        <Chip
          label={`${line.receivedQuantity} received`}
          size="small"
          sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', alignSelf: 'flex-start' }}
        />
      )}
    </Box>
  );
}
