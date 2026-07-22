import type { ReactNode } from 'react';
import {
  Chip,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatConversion, formatStockQty } from '@/utils/uomDisplay';

const GROUP_BORDER = {
  borderLeft: '2px solid',
  borderColor: 'divider',
} as const;

export function UomSectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{
        fontWeight: 700,
        letterSpacing: 0.8,
        color: 'text.secondary',
        display: 'block',
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

export function UomConversionHint({
  buyUom,
  baseUom,
  factor,
  uomOptions,
}: {
  buyUom: string;
  baseUom: string;
  factor: number;
  uomOptions?: ReadonlyArray<{ value: string; label: string }>;
}) {
  const text = formatConversion(buyUom, baseUom, factor, uomOptions);
  if (!text) return null;
  return (
    <Chip
      label={text}
      size="small"
      variant="outlined"
      sx={{ fontSize: '0.75rem', height: 26 }}
    />
  );
}

export function UomStockLabel({
  qty,
  baseUom,
  uomOptions,
  variant = 'caption',
}: {
  qty: number;
  baseUom: string;
  uomOptions?: ReadonlyArray<{ value: string; label: string }>;
  variant?: 'caption' | 'body2';
}) {
  return (
    <Typography
      variant={variant}
      color={variant === 'caption' ? 'text.secondary' : 'text.primary'}
      sx={{ whiteSpace: 'nowrap' }}
    >
      {formatStockQty(qty, baseUom, uomOptions)}
    </Typography>
  );
}

export interface UomTableColumn {
  id: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
}

interface UomGroupedTableHeadProps {
  leadingColumns: UomTableColumn[];
  buyColumns: UomTableColumn[];
  baseColumns: UomTableColumn[];
  trailingColumns: UomTableColumn[];
  buyGroupLabel?: string;
  baseGroupLabel?: string;
}

function subHeaderCell(col: UomTableColumn, isFirstInGroup: boolean) {
  return (
    <TableCell
      key={col.id}
      align={col.align ?? 'left'}
      sx={{
        fontWeight: 700,
        width: col.width,
        fontSize: '0.7rem',
        py: 0.75,
        ...(isFirstInGroup ? GROUP_BORDER : {}),
      }}
    >
      {col.label}
    </TableCell>
  );
}

export function UomGroupedTableHead({
  leadingColumns,
  buyColumns,
  baseColumns,
  trailingColumns,
  buyGroupLabel = 'Primary Unit (purchase)',
  baseGroupLabel = 'Secondary Unit (stock & sell)',
}: UomGroupedTableHeadProps) {
  return (
    <TableHead>
      <TableRow sx={{ bgcolor: 'action.hover' }}>
        {leadingColumns.map((col) => (
          <TableCell
            key={`g-${col.id}`}
            align={col.align ?? 'left'}
            rowSpan={2}
            sx={{ fontWeight: 700, width: col.width, fontSize: '0.7rem', verticalAlign: 'bottom', py: 0.75 }}
          >
            {col.label}
          </TableCell>
        ))}
        {buyColumns.length > 0 && (
          <TableCell
            colSpan={buyColumns.length}
            align="center"
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'text.secondary',
              py: 0.5,
              ...GROUP_BORDER,
            }}
          >
            {buyGroupLabel}
          </TableCell>
        )}
        {baseColumns.length > 0 && (
          <TableCell
            colSpan={baseColumns.length}
            align="center"
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'text.secondary',
              py: 0.5,
              ...GROUP_BORDER,
            }}
          >
            {baseGroupLabel}
          </TableCell>
        )}
        {trailingColumns.map((col) => (
          <TableCell
            key={`g-${col.id}`}
            align={col.align ?? 'left'}
            rowSpan={2}
            sx={{ fontWeight: 700, width: col.width, fontSize: '0.7rem', verticalAlign: 'bottom', py: 0.75 }}
          >
            {col.label}
          </TableCell>
        ))}
      </TableRow>
      <TableRow sx={{ bgcolor: 'action.hover' }}>
        {buyColumns.map((col, i) => subHeaderCell(col, i === 0))}
        {baseColumns.map((col, i) => subHeaderCell(col, i === 0))}
      </TableRow>
    </TableHead>
  );
}
