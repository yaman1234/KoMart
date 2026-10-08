import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  Typography,
  Skeleton,
  Box,
  alpha,
  useTheme,
} from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import type { ReactNode } from 'react';

export interface Column<T> {
  id: string;
  label: string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  render?: (row: T, index: number) => ReactNode;
  accessor?: keyof T;
  sortable?: boolean;
  sortKey?: string;
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
  onRowDoubleClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (sortKey: string) => void;
}

const SKELETON_ROWS = 8;

export function DataTable<T>({
  columns,
  rows,
  loading,
  page = 0,
  pageSize = 25,
  total,
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'No data found',
  getRowId,
  onRowClick,
  onRowDoubleClick,
  sortBy,
  sortOrder = 'asc',
  onSort,
}: DataTableProps<T>) {
  const theme = useTheme();
  const stripe = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.04)
    : alpha(theme.palette.common.black, 0.025);

  return (
    <Paper
      variant="outlined"
      sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, borderColor: 'divider' }}
    >
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align ?? 'left'}
                  sortDirection={col.sortable && sortBy === col.sortKey ? sortOrder : false}
                  sx={{
                    minWidth: col.minWidth,
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'text.secondary',
                    backgroundColor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    zIndex: 2,
                  }}
                >
                  {col.sortable && col.sortKey && onSort ? (
                    <TableSortLabel
                      active={sortBy === col.sortKey}
                      direction={sortBy === col.sortKey ? sortOrder : 'asc'}
                      onClick={() => onSort(col.sortKey!)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`} sx={{ '&:last-child td, &:last-child th': { borderBottom: 0 } }}>
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align ?? 'left'}
                      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      <Skeleton
                        variant="text"
                        width={col.align === 'right' ? '55%' : col.id === 'sn' ? '30%' : '80%'}
                        height={18}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 8 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <InboxOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
                    <Typography color="text.secondary">{emptyMessage}</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => (
                <TableRow
                  key={getRowId(row)}
                  hover
                  onClick={() => onRowClick?.(row)}
                  onDoubleClick={() => onRowDoubleClick?.(row)}
                  tabIndex={onRowClick ? 0 : -1}
                  onKeyDown={(e) => {
                    if (onRowClick && e.key === 'Enter') {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  sx={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:nth-of-type(even)': { backgroundColor: stripe },
                    ...(onRowClick
                      ? { '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 } }
                      : {}),
                  }}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align ?? 'left'}
                      sx={{
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        ...(col.align === 'right' ? { fontVariantNumeric: 'tabular-nums' } : {}),
                      }}
                    >
                      {col.render
                        ? col.render(row, rowIndex + page * pageSize)
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
          sx={{ borderTop: 1, borderColor: 'divider' }}
        />
      )}
    </Paper>
  );
}
