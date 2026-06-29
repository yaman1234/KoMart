import { Box, Button, Grid, Card, CardContent, Typography, List, ListItem, ListItemText } from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import PeopleIcon from '@mui/icons-material/People';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import AddIcon from '@mui/icons-material/Add';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { ChartCard } from '@/components/charts/ChartCard';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useDashboardStats, useRevenueData, useTopProducts, useRecentTransactions } from '@/hooks/useDashboard';
import { useDashboardStore, useAuthStore } from '@/store';
import { formatCurrency, formatDate, canViewAdminReports } from '@/utils';
import type { Transaction } from '@/types';

const transactionColumns: Column<Transaction>[] = [
  { id: 'number', label: 'Transaction', accessor: 'transactionNumber' },
  { id: 'customer', label: 'Customer', render: (r) => r.customerName ?? 'Walk-in' },
  {
    id: 'total',
    label: 'Total',
    align: 'right',
    render: (r) => formatCurrency(r.total),
  },
  {
    id: 'payment',
    label: 'Payment',
    render: (r) => r.paymentMethod.toUpperCase(),
  },
  {
    id: 'date',
    label: 'Date',
    render: (r) => formatDate(r.createdAt),
  },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { dateRange, setDateRange } = useDashboardStore();
  const user = useAuthStore((s) => s.user);
  const isAdminOrManager = canViewAdminReports(user?.role);

  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: revenue = [], isLoading: revenueLoading } = useRevenueData();
  const { data: topProducts = [] } = useTopProducts();
  const { data: transactions = [] } = useRecentTransactions();

  const allQuickActions = [
    { label: 'New Sale', icon: <PointOfSaleIcon />, path: '/pos', adminOnly: false },
    { label: 'Add Product', icon: <AddIcon />, path: '/products/new', adminOnly: true },
    { label: 'View Reports', icon: <AssessmentIcon />, path: '/reports', adminOnly: true },
  ];
  const quickActions = allQuickActions.filter((a) => !a.adminOnly || isAdminOrManager);

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your store performance"
        action={
          isAdminOrManager ? (
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={setDateRange}
            />
          ) : undefined
        }
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Today's Sales"
            value={formatCurrency(stats?.todaySales ?? 0)}
            icon={<AttachMoneyIcon />}
            loading={statsLoading}
          />
        </Grid>

        {isAdminOrManager && (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Weekly Sales"
                value={formatCurrency(stats?.weeklySales ?? 0)}
                icon={<AttachMoneyIcon />}
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Monthly Sales"
                value={formatCurrency(stats?.monthlySales ?? 0)}
                icon={<AttachMoneyIcon />}
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Total Products"
                value={stats?.totalProducts ?? 0}
                icon={<InventoryIcon />}
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Low Stock"
                value={stats?.lowStockProducts ?? 0}
                icon={<WarningIcon />}
                color="warning.main"
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Expiring Soon"
                value={stats?.expiringProducts ?? 0}
                icon={<WarningIcon />}
                color="error.main"
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Inventory Value"
                value={formatCurrency(stats?.inventoryValue ?? 0)}
                icon={<InventoryIcon />}
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Customers"
                value={stats?.customerCount ?? 0}
                icon={<PeopleIcon />}
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Monthly Expenses"
                value={formatCurrency(stats?.monthlyExpenses ?? 0)}
                icon={<AttachMoneyIcon />}
                color="error.main"
                loading={statsLoading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Net Revenue"
                value={formatCurrency(stats?.netRevenue ?? 0)}
                icon={<AttachMoneyIcon />}
                color="success.main"
                loading={statsLoading}
              />
            </Grid>
          </>
        )}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {isAdminOrManager && (
          <Grid size={{ xs: 12, lg: 8 }}>
            <ChartCard title="Revenue Trend" loading={revenueLoading}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatDate(v)}
                    fontSize={12}
                  />
                  <YAxis tickFormatter={(v) => `${v / 1000}k`} fontSize={12} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(label) => formatDate(String(label))}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#E63946"
                    fill="#E63946"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>
        )}
        <Grid size={{ xs: 12, lg: isAdminOrManager ? 4 : 12 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
                Quick Actions
              </Typography>
              <Grid container spacing={1}>
                {quickActions.map((action) => (
                  <Grid key={action.path} size={12}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={action.icon}
                      onClick={() => navigate(action.path)}
                      sx={{ justifyContent: 'flex-start' }}
                    >
                      {action.label}
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {isAdminOrManager && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
                  Top Selling Products
                </Typography>
                <List disablePadding>
                  {topProducts.map((p, i) => (
                    <ListItem key={p.productId} disableGutters divider={i < topProducts.length - 1}>
                      <ListItemText
                        primary={p.name}
                        secondary={`${p.quantitySold} sold · ${formatCurrency(p.revenue)}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}
        <Grid size={{ xs: 12, md: isAdminOrManager ? 8 : 12 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Recent Transactions
          </Typography>
          <DataTable
            columns={transactionColumns}
            rows={transactions}
            getRowId={(r) => r.id}
            onRowClick={(row) => navigate(`/sales/${row.id}`)}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
