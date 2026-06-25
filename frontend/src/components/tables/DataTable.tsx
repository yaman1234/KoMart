import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Typography,
  CircularProgress,
} from '@mui/material';
import type { ReactNode } from 'react';

export interface Column<T> {
  id: string;
  label: string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => ReactNode;
  accessor?: keyof T;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  emptyMessage?: string;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  page = 0,
  pageSize = 10,
  total,
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'No data found',
  getRowId,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align ?? 'left'}
                  sx={{ minWidth: col.minWidth, fontWeight: 600 }}
                >
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">{emptyMessage}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  hover
                  onClick={() => onRowClick?.(row)}
                  sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((col) => (
                    <TableCell key={col.id} align={col.align ?? 'left'}>
                      {col.render
                        ? col.render(row)
                        : col.accessor
                          ? String(row[col.accessor] ?? '')
                          : null}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {onPageChange && (
        <TablePagination
          component="div"
          count={total ?? rows.length}
          page={page}
          onPageChange={(_, p) => onPageChange(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            onPageSizeChange?.(Number(e.target.value));
            onPageChange?.(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
    </Paper>
  );
}
