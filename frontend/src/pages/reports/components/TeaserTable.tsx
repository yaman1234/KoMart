import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { ReportEmptyState } from '@/pages/reports/components/ReportEmptyState';

export interface TeaserColumn<T> {
  id: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  render: (row: T) => ReactNode;
}

interface TeaserTableProps<T> {
  columns: TeaserColumn<T>[];
  rows: T[];
  maxRows?: number;
  emptyMessage: string;
  viewAllLabel?: string;
  onViewAll?: () => void;
  getRowKey: (row: T, index: number) => string | number;
}

export function TeaserTable<T>({
  columns,
  rows,
  maxRows = 3,
  emptyMessage,
  viewAllLabel = 'View all',
  onViewAll,
  getRowKey,
}: TeaserTableProps<T>) {
  const visible = rows.slice(0, maxRows);
  const hiddenCount = Math.max(0, rows.length - visible.length);

  if (rows.length === 0) {
    return <ReportEmptyState message={emptyMessage} />;
  }

  return (
    <Box>
      <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'background.default' }}>
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align ?? 'left'}
                  sx={{ fontWeight: 700, fontSize: '0.75rem', width: col.width }}
                >
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row, index) => (
              <TableRow key={getRowKey(row, index)} hover>
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    align={col.align ?? 'left'}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {(onViewAll || hiddenCount > 0) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.25 }}>
          <Typography variant="caption" color="text.secondary">
            {hiddenCount > 0 ? `Showing top ${visible.length} of ${rows.length}` : ' '}
          </Typography>
          {onViewAll && (
            <Button
              size="small"
              endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
              onClick={onViewAll}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}
            >
              {viewAllLabel}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
