import { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Skeleton,
  TextField,
  MenuItem,
  Alert,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import DiscountIcon from '@mui/icons-material/Discount';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { formatCurrency } from '@/utils';
import { useLossAudit } from '@/hooks/useReports';

export function LossAuditTab() {
  const [discountThreshold, setDiscountThreshold] = useState(20);
  const [activeCategory, setActiveCategory] = useState<'all' | 'voids' | 'discounts' | 'margins' | 'expired'>('all');
  const { data, isLoading } = useLossAudit(true, discountThreshold);

  // Pagination states
  const [voidPage, setVoidPage] = useState(0);
  const [voidRowsPerPage, setVoidRowsPerPage] = useState(10);

  const [discPage, setDiscPage] = useState(0);
  const [discRowsPerPage, setDiscRowsPerPage] = useState(10);

  const [marginPage, setMarginPage] = useState(0);
  const [marginRowsPerPage, setMarginRowsPerPage] = useState(10);

  const [expPage, setExpPage] = useState(0);
  const [expRowsPerPage, setExpRowsPerPage] = useState(10);

  const voidList = useMemo(() => data?.voided_transactions || [], [data]);
  const discList = useMemo(() => data?.large_discount_transactions || [], [data]);
  const negMarginList = useMemo(() => data?.negative_margin_products || [], [data]);
  const expList = useMemo(() => data?.expired_stock_items || [], [data]);
  const missingCloses = useMemo(() => data?.missing_day_closes || [], [data]);

  if (isLoading || !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2.5}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={i}>
              <Skeleton variant="rectangular" height={110} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rectangular" height={360} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Overview Alert / Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>
            Loss Prevention & Operational Audit
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Identify leakage, cash voids, abnormal discounts, loss-making items, expired stock, and unreconciled cash days
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Discount Alert Threshold"
          value={discountThreshold}
          onChange={(e) => {
            setDiscountThreshold(Number(e.target.value));
            setDiscPage(0);
          }}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={10}>Above 10% Discount</MenuItem>
          <MenuItem value={15}>Above 15% Discount</MenuItem>
          <MenuItem value={20}>Above 20% Discount (Default)</MenuItem>
          <MenuItem value={30}>Above 30% Discount</MenuItem>
          <MenuItem value={50}>Above 50% Discount</MenuItem>
        </TextField>
      </Box>

      {/* 5 KPI CARDS (CLICKABLE FILTERS) */}
      <Grid container spacing={2}>
        {/* Card 1: Voided Bills */}
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Paper
            elevation={0}
            onClick={() => setActiveCategory(activeCategory === 'voids' ? 'all' : 'voids')}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: 'pointer',
              border: '2px solid',
              borderColor: activeCategory === 'voids' ? '#EF4444' : data.total_void_count > 0 ? 'rgba(239, 68, 68, 0.3)' : 'divider',
              bgcolor: activeCategory === 'voids' ? 'rgba(239, 68, 68, 0.1)' : data.total_void_count > 0 ? 'rgba(239, 68, 68, 0.04)' : 'background.paper',
              transition: 'all 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <DoNotDisturbOnIcon sx={{ color: '#EF4444', fontSize: 20 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                Cancelled Bills
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#EF4444' }}>
              {data.total_void_count}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              Lost Value: {formatCurrency(data.total_void_amount)}
            </Typography>
          </Paper>
        </Grid>

        {/* Card 2: Large Discounts */}
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Paper
            elevation={0}
            onClick={() => setActiveCategory(activeCategory === 'discounts' ? 'all' : 'discounts')}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: 'pointer',
              border: '2px solid',
              borderColor: activeCategory === 'discounts' ? '#F59E0B' : data.large_discount_count > 0 ? 'rgba(245, 158, 11, 0.3)' : 'divider',
              bgcolor: activeCategory === 'discounts' ? 'rgba(245, 158, 11, 0.1)' : data.large_discount_count > 0 ? 'rgba(245, 158, 11, 0.04)' : 'background.paper',
              transition: 'all 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <DiscountIcon sx={{ color: '#F59E0B', fontSize: 20 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                High Discounts (&gt;{discountThreshold}%)
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#F59E0B' }}>
              {data.large_discount_count}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              Discount Given: {formatCurrency(data.total_large_discount_amount)}
            </Typography>
          </Paper>
        </Grid>

        {/* Card 3: Sold Below Cost */}
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Paper
            elevation={0}
            onClick={() => setActiveCategory(activeCategory === 'margins' ? 'all' : 'margins')}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: 'pointer',
              border: '2px solid',
              borderColor: activeCategory === 'margins' ? '#DC2626' : data.negative_margin_product_count > 0 ? 'rgba(220, 38, 38, 0.3)' : 'divider',
              bgcolor: activeCategory === 'margins' ? 'rgba(220, 38, 38, 0.1)' : data.negative_margin_product_count > 0 ? 'rgba(220, 38, 38, 0.04)' : 'background.paper',
              transition: 'all 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingDownIcon sx={{ color: '#DC2626', fontSize: 20 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                Sold Below Cost
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#DC2626' }}>
              {data.negative_margin_product_count}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              Gross Loss: {formatCurrency(data.total_loss_on_neg_margin)}
            </Typography>
          </Paper>
        </Grid>

        {/* Card 4: Expired Stock */}
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Paper
            elevation={0}
            onClick={() => setActiveCategory(activeCategory === 'expired' ? 'all' : 'expired')}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: 'pointer',
              border: '2px solid',
              borderColor: activeCategory === 'expired' ? '#EA580C' : data.expired_stock_count > 0 ? 'rgba(234, 88, 12, 0.3)' : 'divider',
              bgcolor: activeCategory === 'expired' ? 'rgba(234, 88, 12, 0.1)' : data.expired_stock_count > 0 ? 'rgba(234, 88, 12, 0.04)' : 'background.paper',
              transition: 'all 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <EventBusyIcon sx={{ color: '#EA580C', fontSize: 20 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                Expired On Shelf
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#EA580C' }}>
              {data.expired_stock_count}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              Write-Off: {formatCurrency(data.expired_stock_write_off_value)}
            </Typography>
          </Paper>
        </Grid>

        {/* Card 5: Missing Day Closes */}
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: data.missing_day_close_count > 0 ? 'rgba(124, 58, 237, 0.3)' : 'divider',
              bgcolor: data.missing_day_close_count > 0 ? 'rgba(124, 58, 237, 0.04)' : 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AccessTimeIcon sx={{ color: '#7C3AED', fontSize: 20 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                Unreconciled Days
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#7C3AED' }}>
              {data.missing_day_close_count}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              Missing day cash closes
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* UNRECONCILED DAYS ALERT (IF ANY) */}
      {missingCloses.length > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ borderRadius: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {missingCloses.length} Day(s) Without Verified Cash Register Close:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {missingCloses.map((m) => (
              <Chip key={m.date} label={`${m.day_label} (${m.date})`} size="small" color="warning" variant="outlined" />
            ))}
          </Box>
        </Alert>
      )}

      {/* AUDIT CATEGORY PILL FILTER */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          label="All Audit Issues"
          color={activeCategory === 'all' ? 'primary' : 'default'}
          variant={activeCategory === 'all' ? 'filled' : 'outlined'}
          onClick={() => setActiveCategory('all')}
          sx={{ fontWeight: 700 }}
        />
        <Chip
          label={`Cancelled Bills (${data.total_void_count})`}
          color={activeCategory === 'voids' ? 'error' : 'default'}
          variant={activeCategory === 'voids' ? 'filled' : 'outlined'}
          onClick={() => setActiveCategory('voids')}
          sx={{ fontWeight: 600 }}
        />
        <Chip
          label={`High Discounts (${data.large_discount_count})`}
          color={activeCategory === 'discounts' ? 'warning' : 'default'}
          variant={activeCategory === 'discounts' ? 'filled' : 'outlined'}
          onClick={() => setActiveCategory('discounts')}
          sx={{ fontWeight: 600 }}
        />
        <Chip
          label={`Sold Below Cost (${data.negative_margin_product_count})`}
          color={activeCategory === 'margins' ? 'error' : 'default'}
          variant={activeCategory === 'margins' ? 'filled' : 'outlined'}
          onClick={() => setActiveCategory('margins')}
          sx={{ fontWeight: 600 }}
        />
        <Chip
          label={`Expired on Shelf (${data.expired_stock_count})`}
          color={activeCategory === 'expired' ? 'warning' : 'default'}
          variant={activeCategory === 'expired' ? 'filled' : 'outlined'}
          onClick={() => setActiveCategory('expired')}
          sx={{ fontWeight: 600 }}
        />
      </Box>

      {/* TABLE 1: CANCELLED / VOIDED BILLS */}
      {(activeCategory === 'all' || activeCategory === 'voids') && (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
            1. Cancelled & Voided Bills
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Transactions voided after ringing up items. Frequent voids by a cashier can indicate training issues or leakage.
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 44 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Bill #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cashier</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Reason Given</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {voidList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No voided transactions in this date range. Great job!
                    </TableCell>
                  </TableRow>
                ) : (
                  voidList
                    .slice(voidPage * voidRowsPerPage, voidPage * voidRowsPerPage + voidRowsPerPage)
                    .map((row, idx) => (
                      <TableRow key={row.transaction_number} hover>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                          {voidPage * voidRowsPerPage + idx + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.transaction_number}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>
                          <Chip label={row.cashier} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#EF4444' }}>
                          {formatCurrency(row.amount)}
                        </TableCell>
                        <TableCell>{row.void_reason || 'No reason specified'}</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {voidList.length > 0 && (
            <TablePagination
              component="div"
              count={voidList.length}
              page={voidPage}
              rowsPerPage={voidRowsPerPage}
              onPageChange={(_, p) => setVoidPage(p)}
              onRowsPerPageChange={(e) => {
                setVoidRowsPerPage(parseInt(e.target.value, 10));
                setVoidPage(0);
              }}
            />
          )}
        </Paper>
      )}

      {/* TABLE 2: LARGE DISCOUNTS */}
      {(activeCategory === 'all' || activeCategory === 'discounts') && (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
            2. Bills with High Discounts (&gt;{discountThreshold}%)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Bills where discounts exceeded {discountThreshold}% of the gross total. Useful for auditing cashier-level discretionary discounting.
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 44 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Bill #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cashier</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Original Price</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Discount Amount</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Discount %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Final Paid</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {discList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No bills exceeded the {discountThreshold}% discount threshold in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  discList
                    .slice(discPage * discRowsPerPage, discPage * discRowsPerPage + discRowsPerPage)
                    .map((row, idx) => (
                      <TableRow key={row.transaction_number} hover>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                          {discPage * discRowsPerPage + idx + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.transaction_number}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>
                          <Chip label={row.cashier} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{formatCurrency(row.gross_sales)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#F59E0B' }}>
                          {formatCurrency(row.total_discount)}
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${row.discount_pct}%`}
                            size="small"
                            color={row.discount_pct >= 30 ? 'error' : 'warning'}
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatCurrency(row.net_total)}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {discList.length > 0 && (
            <TablePagination
              component="div"
              count={discList.length}
              page={discPage}
              rowsPerPage={discRowsPerPage}
              onPageChange={(_, p) => setDiscPage(p)}
              onRowsPerPageChange={(e) => {
                setDiscRowsPerPage(parseInt(e.target.value, 10));
                setDiscPage(0);
              }}
            />
          )}
        </Paper>
      )}

      {/* TABLE 3: NEGATIVE MARGIN PRODUCTS */}
      {(activeCategory === 'all' || activeCategory === 'margins') && (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
            3. Products Sold Below Purchase Cost
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Items where the selling price was lower than the product's purchase cost (Cost of Goods Sold).
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 44 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Units Sold</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Revenue</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Cost (COGS)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Loss Incurred</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Margin %</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {negMarginList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      Zero items were sold below purchase cost. All sales had positive gross margin!
                    </TableCell>
                  </TableRow>
                ) : (
                  negMarginList
                    .slice(marginPage * marginRowsPerPage, marginPage * marginRowsPerPage + marginRowsPerPage)
                    .map((row, idx) => (
                      <TableRow key={row.product_id} hover>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                          {marginPage * marginRowsPerPage + idx + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell align="right">{row.units_sold}</TableCell>
                        <TableCell align="right">{formatCurrency(row.net_revenue)}</TableCell>
                        <TableCell align="right">{formatCurrency(row.total_cogs)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#DC2626' }}>
                          {formatCurrency(Math.abs(row.gross_profit))}
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${row.gross_margin_pct}%`}
                            size="small"
                            color="error"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {negMarginList.length > 0 && (
            <TablePagination
              component="div"
              count={negMarginList.length}
              page={marginPage}
              rowsPerPage={marginRowsPerPage}
              onPageChange={(_, p) => setMarginPage(p)}
              onRowsPerPageChange={(e) => {
                setMarginRowsPerPage(parseInt(e.target.value, 10));
                setMarginPage(0);
              }}
            />
          )}
        </Paper>
      )}

      {/* TABLE 4: EXPIRED STOCK ON SHELVES */}
      {(activeCategory === 'all' || activeCategory === 'expired') && (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
            4. Expired Stock Still in Inventory
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Stock batches that have passed their expiration date but are still physically showing in stock with quantity &gt; 0.
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 44 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Batch #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Expiry Date</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Unit Cost</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Write-Off Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No expired stock detected in active inventory.
                    </TableCell>
                  </TableRow>
                ) : (
                  expList
                    .slice(expPage * expRowsPerPage, expPage * expRowsPerPage + expRowsPerPage)
                    .map((row, idx) => (
                      <TableRow key={`${row.product_id}-${row.batch_number}-${idx}`} hover>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                          {expPage * expRowsPerPage + idx + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.product_name}</TableCell>
                        <TableCell>{row.batch_number || 'Default'}</TableCell>
                        <TableCell sx={{ color: '#EA580C', fontWeight: 600 }}>{row.expiry_date}</TableCell>
                        <TableCell align="right">{row.quantity}</TableCell>
                        <TableCell align="right">{formatCurrency(row.unit_cost)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#EA580C' }}>
                          {formatCurrency(row.write_off_value)}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {expList.length > 0 && (
            <TablePagination
              component="div"
              count={expList.length}
              page={expPage}
              rowsPerPage={expRowsPerPage}
              onPageChange={(_, p) => setExpPage(p)}
              onRowsPerPageChange={(e) => {
                setExpRowsPerPage(parseInt(e.target.value, 10));
                setExpPage(0);
              }}
            />
          )}
        </Paper>
      )}
    </Box>
  );
}

export default LossAuditTab;
