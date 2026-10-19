import { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  MenuItem,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Skeleton,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CategoryIcon from '@mui/icons-material/Category';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { useSalesPerformance, useItemsSold } from '@/hooks/useReports';
import { useDashboardStore } from '@/store';
import { ProductSalesDialog } from '@/pages/reports/ProductSalesDialog';

export function SalesMerchandisingTab() {
  const { dateRange } = useDashboardStore();
  const { data: salesPerf, isLoading: isPerfLoading } = useSalesPerformance();
  const { data: itemsSold = [], isLoading: isItemsLoading } = useItemsSold();

  // Filters & Pagination for Product Profitability Matrix
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [marginFilter, setMarginFilter] = useState<'ALL' | 'HIGH' | 'HEALTHY' | 'LOW' | 'NEGATIVE'>('ALL');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Drill-down dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);

  // Categories list for filter dropdown
  const categories = useMemo(() => {
    const set = new Set<string>();
    itemsSold.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [itemsSold]);

  // Filtered Items Sold list
  const filteredItems = useMemo(() => {
    return itemsSold.filter((item) => {
      // Search
      const search = searchTerm.toLowerCase();
      const matchSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        (item.sku && item.sku.toLowerCase().includes(search));
      if (!matchSearch) return false;

      // Category
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;

      // Margin
      const margin = item.grossMarginPct ?? item.gross_margin_pct ?? 0;
      if (marginFilter === 'HIGH' && margin < 25) return false;
      if (marginFilter === 'HEALTHY' && (margin < 15 || margin >= 25)) return false;
      if (marginFilter === 'LOW' && (margin < 0 || margin >= 15)) return false;
      if (marginFilter === 'NEGATIVE' && margin >= 0) return false;

      return true;
    });
  }, [itemsSold, searchTerm, selectedCategory, marginFilter]);

  const paginatedItems = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, page, rowsPerPage]);

  const handleOpenDialog = (productId: string, productName: string) => {
    setSelectedProduct({ id: productId, name: productName });
    setDialogOpen(true);
  };

  const tenderMixList = useMemo(() => {
    return salesPerf?.tenderMix || salesPerf?.tender_mix || [];
  }, [salesPerf]);

  const dailyTrendList = useMemo(() => {
    const raw = salesPerf?.dailyTrend || salesPerf?.daily_trend || [];
    return raw.map((d) => ({
      date: d.date,
      netRevenue: d.netRevenue ?? d.net_revenue ?? 0,
      grossProfit: d.grossProfit ?? d.gross_profit ?? 0,
    }));
  }, [salesPerf]);

  if (isPerfLoading && !salesPerf) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
        <Skeleton variant="rounded" height={450} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const categoryList = salesPerf?.categories || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. DEPARTMENT & CATEGORY CONTRIBUTION */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CategoryIcon sx={{ color: '#0284C7' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Department & Category Contribution Matrix
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Revenue Share vs. True Gross Profit Generation
          </Typography>
        </Box>

        <TableContainer sx={{ maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Category Name</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Units Sold</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Gross Sales</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Discounts</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Net Revenue</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>COGS</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Gross Profit</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Margin %</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 120 }}>Revenue Share</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 120 }}>Profit Share</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categoryList.map((cat) => {
                const unitsSold = cat.unitsSold ?? cat.units_sold ?? 0;
                const grossSales = cat.grossSales ?? cat.gross_sales ?? 0;
                const discounts = cat.discounts ?? 0;
                const netRevenue = cat.netRevenue ?? cat.net_revenue ?? 0;
                const cogs = cat.cogs ?? 0;
                const grossProfit = cat.grossProfit ?? cat.gross_profit ?? 0;
                const grossMarginPct = cat.grossMarginPct ?? cat.gross_margin_pct ?? 0;
                const revenueSharePct = cat.revenueSharePct ?? cat.revenue_share_pct ?? 0;
                const profitSharePct = cat.profitSharePct ?? cat.profit_share_pct ?? 0;

                return (
                  <TableRow key={cat.category} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{cat.category}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {unitsSold.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(grossSales)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                      {discounts > 0 ? `-${formatCurrency(discounts)}` : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {formatCurrency(netRevenue)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(cogs)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: grossProfit >= 0 ? '#10B981' : '#F43F5E',
                      }}
                    >
                      {formatCurrency(grossProfit)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {Number(grossMarginPct).toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, Math.max(0, revenueSharePct))}
                          sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'rgba(2, 132, 199, 0.1)' }}
                        />
                        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>
                          {Number(revenueSharePct).toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          color={profitSharePct >= 0 ? 'success' : 'error'}
                          value={Math.min(100, Math.max(0, profitSharePct))}
                          sx={{ flex: 1, height: 6, borderRadius: 3 }}
                        />
                        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>
                          {Number(profitSharePct).toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 2. PRODUCT PROFITABILITY MATRIX (ITEMS SOLD WITH TRUE MARGINS) */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MonetizationOnIcon sx={{ color: '#6366F1' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Product Profitability Matrix (Items Sold)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Exact FEFO batch acquisition costs & proportional bill discount allocation ({filteredItems.length} SKUs)
              </Typography>
            </Box>
          </Box>

          {/* Filters */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search product or SKU..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ width: 220 }}
            />

            <TextField
              select
              size="small"
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setPage(0); }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="ALL">All Categories</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              value={marginFilter}
              onChange={(e) => { setMarginFilter(e.target.value as any); setPage(0); }}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="ALL">All Margins</MenuItem>
              <MenuItem value="HIGH">High (&gt;25%)</MenuItem>
              <MenuItem value="HEALTHY">Healthy (15–25%)</MenuItem>
              <MenuItem value="LOW">Low (&lt;15%)</MenuItem>
              <MenuItem value="NEGATIVE">Negative (&lt;0%)</MenuItem>
            </TextField>
          </Box>
        </Box>

        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Product Name & SKU</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Sold Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Avg Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Unit Cost</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Gross Sales</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Discounts</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Net Revenue</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>COGS</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Gross Profit</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Margin %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isItemsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No products found matching the selected search and margin criteria.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item) => {
                  const grossMarginPct = item.grossMarginPct ?? item.gross_margin_pct ?? 0;
                  const quantitySold = item.quantitySold ?? item.quantity_sold ?? 0;
                  const avgSellingPrice = item.avgSellingPrice ?? item.avg_selling_price ?? 0;
                  const unitCost = item.unitCost ?? item.unit_cost ?? 0;
                  const grossSales = item.grossSales ?? item.gross_sales ?? 0;
                  const totalDiscount = item.totalDiscount ?? item.total_discount ?? 0;
                  const netRevenue = item.netRevenue ?? item.net_revenue ?? 0;
                  const totalCogs = item.totalCogs ?? item.total_cogs ?? 0;
                  const grossProfit = item.grossProfit ?? item.gross_profit ?? 0;
                  const productId = item.productId ?? item.product_id ?? '';
                  const sellUom = item.sellUom ?? item.sell_uom ?? 'pcs';

                  let chipColor: 'success' | 'warning' | 'error' | 'default' = 'default';
                  if (grossMarginPct >= 20) chipColor = 'success';
                  else if (grossMarginPct >= 10) chipColor = 'warning';
                  else chipColor = 'error';

                  return (
                    <TableRow key={productId || item.name} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.sku || 'No SKU'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={item.category || 'Other'} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => handleOpenDialog(productId, item.name)}
                          sx={{
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            p: 0,
                            minWidth: 'auto',
                            textDecoration: 'underline',
                          }}
                        >
                          {quantitySold.toLocaleString()} {sellUom}
                        </Button>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(avgSellingPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(unitCost)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(grossSales)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                        {totalDiscount > 0 ? `-${formatCurrency(totalDiscount)}` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {formatCurrency(netRevenue)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(totalCogs)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color: grossProfit >= 0 ? '#10B981' : '#F43F5E',
                        }}
                      >
                        {formatCurrency(grossProfit)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${Number(grossMarginPct).toFixed(1)}%`}
                          size="small"
                          color={chipColor}
                          sx={{ fontWeight: 700, minWidth: 64 }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={filteredItems.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>

      {/* 3. STORE FOOT TRAFFIC & TENDER MIX ACCORDION */}
      <Accordion
        elevation={0}
        sx={{
          borderRadius: '12px !important',
          border: '1px solid',
          borderColor: 'divider',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon sx={{ color: '#F59E0B' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Store Traffic, Tender Mix & Daily Trends
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 1, pb: 3 }}>
          <Grid container spacing={3}>
            {/* Tender Mix Strip */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Payment Method (Tender) Distribution
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Payment Method</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Transactions</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Collected</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Share %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tenderMixList.map((t) => {
                      const txCount = t.transactionCount ?? t.transaction_count ?? 0;
                      const amount = t.amount ?? 0;
                      const sharePct = t.sharePct ?? t.share_pct ?? 0;

                      return (
                        <TableRow key={t.method} hover>
                          <TableCell sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{t.method}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {txCount.toLocaleString()}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {formatCurrency(amount)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {Number(sharePct).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            {/* Daily Trend Chart */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Daily Sales Revenue & Gross Profit Trend
              </Typography>
              <Box sx={{ width: '100%', height: 260 }}>
                {dailyTrendList.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrendList}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(v) => `Rs. ${v.toLocaleString()}`} />
                      <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val ?? 0))} />
                      <Legend />
                      <Area type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="#0284C7" fill="rgba(2, 132, 199, 0.2)" />
                      <Area type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#10B981" fill="rgba(16, 185, 129, 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography variant="body2" color="text.secondary">No trend data available for selected dates</Typography>
                  </Box>
                )}
              </Box>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Drill-down dialog from quantity sold to individual bills */}
      {selectedProduct && (
        <ProductSalesDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setSelectedProduct(null); }}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          dateRange={dateRange}
        />
      )}
    </Box>
  );
}
