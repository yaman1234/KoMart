import { useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { ChartCard } from '@/components/charts/ChartCard';
import { StatCard } from '@/components/common/StatCard';
import { useRevenueData, useTopProducts } from '@/hooks/useDashboard';
import { useDashboardStore } from '@/store';
import { formatCurrency, formatDate } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services';

type ReportTab = 'sales' | 'inventory' | 'financial';

const PIE_COLORS = ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#264653'];

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('sales');
  const { dateRange, setDateRange } = useDashboardStore();

  const { data: revenue = [], isLoading: revenueLoading } = useRevenueData();
  const { data: topProducts = [] } = useTopProducts();
  const { data: salesByCategory = [] } = useQuery({
    queryKey: ['reports', 'salesByCategory'],
    queryFn: () => dashboardService.getSalesByCategory(),
  });

  const totalRevenue = revenue.reduce((s, d) => s + d.revenue, 0);
  const avgDaily = revenue.length > 0 ? totalRevenue / revenue.length : 0;
  const maxDay = revenue.reduce((max, d) => d.revenue > max.revenue ? d : max, revenue[0] ?? { revenue: 0, date: '' });

  return (
    <Box>
      <PageHeader
        title="Reports"
        subtitle="Sales, inventory and financial analytics"
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={setDateRange}
            />
            <Button variant="outlined" startIcon={<DownloadIcon />} size="small">
              Export
            </Button>
          </Box>
        }
      />

      <Tabs value={tab} onChange={(_, v: ReportTab) => setTab(v)} sx={{ mb: 3, bgcolor: 'background.paper', borderRadius: 2, px: 1 }}>
        <Tab value="sales" label="Sales Report" />
        <Tab value="inventory" label="Inventory Report" />
        <Tab value="financial" label="Financial Summary" />
      </Tabs>

      {/* ── Sales Tab ── */}
      {tab === 'sales' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Avg. Daily Revenue" value={formatCurrency(avgDaily)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Best Day" value={formatCurrency(maxDay?.revenue ?? 0)} subtitle={maxDay?.date ? formatDate(maxDay.date) : ''} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total Transactions" value={topProducts.reduce((s, p) => s + p.quantitySold, 0)} />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ChartCard title="Revenue Over Time" loading={revenueLoading} height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenue}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(l) => formatDate(String(l))} />
                    <Area type="monotone" dataKey="revenue" stroke="#E63946" fill="#E63946" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Sales by Category" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={salesByCategory} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={false}>
                      {salesByCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
          </Grid>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Top Selling Products</Typography>
            <Divider sx={{ mb: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Units Sold</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topProducts.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="right">{p.quantitySold.toLocaleString()}</TableCell>
                    <TableCell align="right">{formatCurrency(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* ── Inventory Tab ── */}
      {tab === 'inventory' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ChartCard title="Revenue by Category" height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <YAxis type="category" dataKey="category" width={130} fontSize={11} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="revenue" fill="#E63946" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ChartCard title="Transactions by Category" height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="category" width={130} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" name="Transactions" fill="#457B9D" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── Financial Tab ── */}
      {tab === 'financial' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="success.main" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Est. COGS (60%)" value={formatCurrency(totalRevenue * 0.6)} color="error.main" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Gross Profit" value={formatCurrency(totalRevenue * 0.4)} color="primary.main" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Gross Margin" value="40%" color="info.main" />
            </Grid>
          </Grid>

          <ChartCard title="Revenue vs Estimated Cost" height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(l) => formatDate(String(l))} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#E63946" fill="#E63946" fillOpacity={0.2} strokeWidth={2} />
                <Area
                  type="monotone"
                  data={revenue.map((d) => ({ ...d, cost: d.revenue * 0.6 }))}
                  dataKey="cost"
                  name="Est. Cost"
                  stroke="#457B9D"
                  fill="#457B9D"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </Box>
      )}
    </Box>
  );
}
