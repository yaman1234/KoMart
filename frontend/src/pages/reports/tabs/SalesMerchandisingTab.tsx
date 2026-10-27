import { useState, useMemo } from 'react';
import {
  Box,
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
  TableFooter,
  TableSortLabel,
  TablePagination,
  Chip,
  Skeleton,
  LinearProgress,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CategoryIcon from '@mui/icons-material/Category';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useDashboardStore } from '@/store';
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
import { ProductSalesDialog } from '@/pages/reports/ProductSalesDialog';

type SortField =
  | 'name'
  | 'quantitySold'
  | 'avgSellingPrice'
  | 'unitCost'
  | 'grossSales'
  | 'totalDiscount'
  | 'netRevenue'
  | 'totalCogs'
  | 'grossProfit'
  | 'grossMarginPct';

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
  const [sortField, setSortField] = useState<SortField>('netRevenue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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
        (item.name || '').toLowerCase().includes(search) ||
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(0);
  };

  const sortedAndFilteredItems = useMemo(() => {
    const result = [...filteredItems];
    result.sort((a, b) => {
      let aVal = 0;
      let bVal = 0;
      switch (sortField) {
        case 'name': {
          const comp = (a.name || '').localeCompare(b.name || '');
          return sortDirection === 'asc' ? comp : -comp;
        }
        case 'quantitySold':
          aVal = a.quantitySold ?? a.quantity_sold ?? 0;
          bVal = b.quantitySold ?? b.quantity_sold ?? 0;
          break;
        case 'avgSellingPrice':
          aVal = a.avgSellingPrice ?? a.avg_selling_price ?? 0;
          bVal = b.avgSellingPrice ?? b.avg_selling_price ?? 0;
          break;
        case 'unitCost':
          aVal = a.unitCost ?? a.unit_cost ?? 0;
          bVal = b.unitCost ?? b.unit_cost ?? 0;
          break;
        case 'grossSales':
          aVal = a.grossSales ?? a.gross_sales ?? 0;
          bVal = b.grossSales ?? b.gross_sales ?? 0;
          break;
        case 'totalDiscount':
          aVal = a.totalDiscount ?? a.total_discount ?? 0;
          bVal = b.totalDiscount ?? b.total_discount ?? 0;
          break;
        case 'netRevenue':
          aVal = a.netRevenue ?? a.net_revenue ?? 0;
          bVal = b.netRevenue ?? b.net_revenue ?? 0;
          break;
        case 'totalCogs':
          aVal = a.totalCogs ?? a.total_cogs ?? 0;
          bVal = b.totalCogs ?? b.total_cogs ?? 0;
          break;
        case 'grossProfit':
          aVal = a.grossProfit ?? a.gross_profit ?? 0;
          bVal = b.grossProfit ?? b.gross_profit ?? 0;
          break;
        case 'grossMarginPct':
          aVal = a.grossMarginPct ?? a.gross_margin_pct ?? 0;
          bVal = b.grossMarginPct ?? b.gross_margin_pct ?? 0;
          break;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return result;
  }, [filteredItems, sortField, sortDirection]);

  const paginatedItems = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedAndFilteredItems.slice(start, start + rowsPerPage);
  }, [sortedAndFilteredItems, page, rowsPerPage]);

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

  const categoryList = salesPerf?.categories || [];

  const categoryTotals = useMemo(() => {
    let units = 0;
    let gross = 0;
    let disc = 0;
    let net = 0;
    let cogs = 0;
    let profit = 0;
    categoryList.forEach((c) => {
      units += c.unitsSold ?? c.units_sold ?? 0;
      gross += c.grossSales ?? c.gross_sales ?? 0;
      disc += c.discounts ?? 0;
      net += c.netRevenue ?? c.net_revenue ?? 0;
      cogs += c.cogs ?? 0;
      profit += c.grossProfit ?? c.gross_profit ?? 0;
    });
    const margin = net > 0 ? (profit / net) * 100 : 0;
    return { units, gross, disc, net, cogs, profit, margin };
  }, [categoryList]);

  const productTotals = useMemo(() => {
    let units = 0;
    let gross = 0;
    let disc = 0;
    let net = 0;
    let cogs = 0;
    let profit = 0;
    filteredItems.forEach((item) => {
      units += item.quantitySold ?? item.quantity_sold ?? 0;
      gross += item.grossSales ?? item.gross_sales ?? 0;
      disc += item.totalDiscount ?? item.total_discount ?? 0;
      net += item.netRevenue ?? item.net_revenue ?? 0;
      cogs += item.totalCogs ?? item.total_cogs ?? 0;
      profit += item.grossProfit ?? item.gross_profit ?? 0;
    });
    const margin = net > 0 ? (profit / net) * 100 : 0;
    return { units, gross, disc, net, cogs, profit, margin };
  }, [filteredItems]);

  const tenderTotals = useMemo(() => {
    let count = 0;
    let amount = 0;
    tenderMixList.forEach((t) => {
      count += t.transactionCount ?? t.transaction_count ?? 0;
      amount += t.amount ?? 0;
    });
    return { count, amount };
  }, [tenderMixList]);

  if (isPerfLoading && !salesPerf) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
        <Skeleton variant="rounded" height={450} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 0. DAILY REVENUE & GROSS PROFIT TREND CHART */}
      {dailyTrendList.length > 1 && (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUpIcon sx={{ color: '#0284C7' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Daily Revenue & Gross Profit Velocity
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Realized sales and gross margin per business day across selected date range
            </Typography>
          </Box>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrendList} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284C7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickFormatter={(v) => `Rs. ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val) || 0)} />
                <Legend />
                <Area type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="#0284C7" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

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
                <TableCell sx={{ fontWeight: 700, width: 45 }}>#</TableCell>
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
              {categoryList.map((cat, idx) => {
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
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 45 }}>
                      {idx + 1}
                    </TableCell>
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
            {categoryList.length > 0 && (
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow
                  sx={{
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    '& td': {
                      fontWeight: 800,
                      borderTop: '2px solid',
                      borderColor: 'divider',
                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    },
                  }}
                >
                  <TableCell>—</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Total ({categoryList.length} Categories)</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {categoryTotals.units.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(categoryTotals.gross)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#F43F5E' }}>
                    {categoryTotals.disc > 0 ? `-${formatCurrency(categoryTotals.disc)}` : 'Rs. 0.00'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(categoryTotals.net)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(categoryTotals.cogs)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 800,
                      color: categoryTotals.profit >= 0 ? '#10B981' : '#F43F5E',
                    }}
                  >
                    {formatCurrency(categoryTotals.profit)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {categoryTotals.margin.toFixed(1)}%
                  </TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    100.0%
                  </TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    100.0%
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
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
                <TableCell sx={{ fontWeight: 700, width: 45 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'name'}
                    direction={sortField === 'name' ? sortDirection : 'asc'}
                    onClick={() => handleSort('name')}
                  >
                    Product Name & SKU
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'quantitySold'}
                    direction={sortField === 'quantitySold' ? sortDirection : 'desc'}
                    onClick={() => handleSort('quantitySold')}
                  >
                    Sold Qty
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'avgSellingPrice'}
                    direction={sortField === 'avgSellingPrice' ? sortDirection : 'desc'}
                    onClick={() => handleSort('avgSellingPrice')}
                  >
                    Avg Price
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'unitCost'}
                    direction={sortField === 'unitCost' ? sortDirection : 'desc'}
                    onClick={() => handleSort('unitCost')}
                  >
                    Unit Cost
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'grossSales'}
                    direction={sortField === 'grossSales' ? sortDirection : 'desc'}
                    onClick={() => handleSort('grossSales')}
                  >
                    Gross Sales
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'totalDiscount'}
                    direction={sortField === 'totalDiscount' ? sortDirection : 'desc'}
                    onClick={() => handleSort('totalDiscount')}
                  >
                    Discounts
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'netRevenue'}
                    direction={sortField === 'netRevenue' ? sortDirection : 'desc'}
                    onClick={() => handleSort('netRevenue')}
                  >
                    Net Revenue
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'totalCogs'}
                    direction={sortField === 'totalCogs' ? sortDirection : 'desc'}
                    onClick={() => handleSort('totalCogs')}
                  >
                    COGS
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'grossProfit'}
                    direction={sortField === 'grossProfit' ? sortDirection : 'desc'}
                    onClick={() => handleSort('grossProfit')}
                  >
                    Gross Profit
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'grossMarginPct'}
                    direction={sortField === 'grossMarginPct' ? sortDirection : 'desc'}
                    onClick={() => handleSort('grossMarginPct')}
                  >
                    Margin %
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isItemsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No products found matching the selected search and margin criteria.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item, idx) => {
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
                      <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 45 }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
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
            {filteredItems.length > 0 && (
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow
                  sx={{
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    '& td': {
                      fontWeight: 800,
                      borderTop: '2px solid',
                      borderColor: 'divider',
                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    },
                  }}
                >
                  <TableCell>—</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Total ({filteredItems.length} Products)</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {productTotals.units.toLocaleString()}
                  </TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(productTotals.gross)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#F43F5E' }}>
                    {productTotals.disc > 0 ? `-${formatCurrency(productTotals.disc)}` : 'Rs. 0.00'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(productTotals.net)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(productTotals.cogs)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 800,
                      color: productTotals.profit >= 0 ? '#10B981' : '#F43F5E',
                    }}
                  >
                    {formatCurrency(productTotals.profit)}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${productTotals.margin.toFixed(1)}%`}
                      size="small"
                      color={productTotals.margin >= 20 ? 'success' : productTotals.margin >= 10 ? 'warning' : 'error'}
                      sx={{ fontWeight: 800, minWidth: 64 }}
                    />
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
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

      {/* 3. PAYMENT METHOD (TENDER) DISTRIBUTION */}
      {tenderMixList.length > 0 && (
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
              <AccessTimeIcon sx={{ color: '#F59E0B' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Payment Method (Tender) Distribution
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Cash, digital wallets (Fonepay/eSewa), and bank card settlement mix
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 45 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Payment Method</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Transactions</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total Collected</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Share %</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tenderMixList.map((t, idx) => {
                  const txCount = t.transactionCount ?? t.transaction_count ?? 0;
                  const amount = t.amount ?? 0;
                  const sharePct = t.sharePct ?? t.share_pct ?? 0;

                  return (
                    <TableRow key={t.method} hover>
                      <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 45 }}>
                        {idx + 1}
                      </TableCell>
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
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow
                  sx={{
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    '& td': {
                      fontWeight: 800,
                      borderTop: '2px solid',
                      borderColor: 'divider',
                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    },
                  }}
                >
                  <TableCell>—</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {tenderTotals.count.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(tenderTotals.amount)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    100.0%
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        </Paper>
      )}

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
