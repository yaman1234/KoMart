import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import AddIcon from '@mui/icons-material/Add';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import type { ReactNode } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '@/components/common/StatCard';
import { DashboardChartCard, type ChartViewMode } from '@/components/charts/DashboardChartCard';
import {
  useDashboardStats,
  useDashboardKpi,
  useDashboardCashFlow,
  useOperationalExpenses,
  useTopProfitProducts,
  useTopSoldProducts,
  useSalesCollection,
  useKpiFlow,
  type KpiFlowMetric,
} from '@/hooks/useDashboard';
import { useAuthStore } from '@/store';
import { formatCurrency, canViewAdminReports } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';

const PIE_COLORS = ['#0d7377', '#14919b', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#264653'];

type WalletMethod = 'cash' | 'bank' | 'esewa';

const WALLET_LABELS: Record<WalletMethod, string> = {
  cash: 'Cash',
  bank: 'Bank',
  esewa: 'eSewa',
};

const KPI_FLOW_TITLES: Record<KpiFlowMetric, string> = {
  sales: 'Sales',
  purchase: 'Purchase',
  receivables: 'Receivables',
  payables: 'Payables',
  cash: 'Cash Inflow / Outflow',
  bank: 'Bank Inflow / Outflow',
  esewa: 'eSewa Inflow / Outflow',
};

const KPI_FLOW_SERIES: Record<KpiFlowMetric, { inflow: string; outflow: string }> = {
  sales: { inflow: 'Sales', outflow: '—' },
  purchase: { inflow: '—', outflow: 'Purchase paid' },
  receivables: { inflow: 'Receivables', outflow: '—' },
  payables: { inflow: '—', outflow: 'Payments' },
  cash: { inflow: 'Inflow', outflow: 'Outflow' },
  bank: { inflow: 'Inflow', outflow: 'Outflow' },
  esewa: { inflow: 'Inflow', outflow: 'Outflow' },
};

const WALLET_ICONS: Record<WalletMethod, ReactNode> = {
  cash: <PaymentsIcon sx={{ fontSize: 14 }} />,
  bank: <AccountBalanceIcon sx={{ fontSize: 14 }} />,
  esewa: <PhoneAndroidIcon sx={{ fontSize: 14 }} />,
};

function KpiTile({
  title,
  main,
  sub,
  loading,
  icon,
  onClick,
}: {
  title: string;
  main: string;
  sub: string;
  loading?: boolean;
  icon: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      sx={{
        height: '100%',
        bgcolor: 'background.paper',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
        '&:hover': onClick ? { boxShadow: 3 } : undefined,
      }}
      onClick={onClick}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ display: 'flex', color: 'action.active', lineHeight: 0 }}>{icon}</Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.4 }}>
            {title}
          </Typography>
        </Box>
        {loading ? (
          <Skeleton width="70%" height={32} />
        ) : (
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, my: 0.5 }}>
            {main}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {loading ? '…' : sub}
        </Typography>
      </CardContent>
    </Card>
  );
}

function CashWalletTile({
  total,
  cash,
  bank,
  esewa,
  loading,
  onSelect,
}: {
  total: number;
  cash: number;
  bank: number;
  esewa: number;
  loading?: boolean;
  onSelect: (method: WalletMethod) => void;
}) {
  const rows: { method: WalletMethod; amount: number }[] = [
    { method: 'cash', amount: cash },
    { method: 'bank', amount: bank },
    { method: 'esewa', amount: esewa },
  ];

  return (
    <Card sx={{ height: '100%', bgcolor: 'background.paper' }}>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ display: 'flex', color: 'action.active', lineHeight: 0 }}>
            <AccountBalanceIcon fontSize="small" />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.4 }}>
            Cash / Bank / eSewa
          </Typography>
        </Box>
        {loading ? (
          <Skeleton width="70%" height={32} />
        ) : (
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, my: 0.5 }}>
            {formatCurrency(total)}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {rows.map(({ method, amount }) => (
            <Box
              key={method}
              component="button"
              type="button"
              onClick={() => onSelect(method)}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: 0,
                bgcolor: 'transparent',
                p: 0.25,
                m: 0,
                cursor: 'pointer',
                borderRadius: 0.5,
                textAlign: 'left',
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover', color: 'primary.main' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {WALLET_ICONS[method]}
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {WALLET_LABELS[method]}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {loading ? '…' : formatCurrency(amount)}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function FlowSeriesChart({
  mode,
  height,
  data,
  inflowLabel = 'Inflow',
  outflowLabel = 'Outflow',
}: {
  mode: ChartViewMode;
  height: number;
  data: { date: string; inflow: number; outflow: number }[];
  inflowLabel?: string;
  outflowLabel?: string;
}) {
  if (mode === 'pie') {
    const inflow = data.reduce((s, d) => s + d.inflow, 0);
    const outflow = data.reduce((s, d) => s + d.outflow, 0);
    const pieData = [
      { name: inflowLabel, amount: inflow },
      { name: outflowLabel, amount: outflow },
    ].filter((d) => d.amount > 0 || (inflow === 0 && outflow === 0 && d.name === inflowLabel));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={pieData.length ? pieData : [{ name: inflowLabel, amount: 0 }]}
            dataKey="amount"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={Math.min(height / 2.8, 120)}
            label={(props: { name?: string; percent?: number }) =>
              `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            <Cell fill="#2a9d8f" />
            <Cell fill="#e76f51" />
          </Pie>
          <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Legend />
        <Area type="monotone" dataKey="inflow" name={inflowLabel} stroke="#2a9d8f" fill="#2a9d8f55" />
        <Area type="monotone" dataKey="outflow" name={outflowLabel} stroke="#e76f51" fill="#e76f5155" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CategoricalChart({
  mode,
  height,
  data,
  nameKey,
  valueKey,
  barColor = '#0d7377',
  valueIsCurrency = true,
}: {
  mode: ChartViewMode;
  height: number;
  data: Record<string, string | number>[];
  nameKey: string;
  valueKey: string;
  barColor?: string;
  valueIsCurrency?: boolean;
}) {
  const fmt = (v: number) => (valueIsCurrency ? formatCurrency(v) : String(v));
  if (mode === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius={Math.min(height / 2.8, 100)}
            label={(props: { name?: string; percent?: number }) =>
              `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => fmt(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => fmt(Number(v))} />
        <Bar dataKey={valueKey} fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const user = useAuthStore((s) => s.user);
  const isAdminOrManager = canViewAdminReports(user?.role);
  const [kpiMetric, setKpiMetric] = useState<KpiFlowMetric | null>(null);

  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: kpi, isLoading: kpiLoading } = useDashboardKpi();
  const { data: cashFlow = [], isLoading: cashFlowLoading } = useDashboardCashFlow(30);
  const { data: opex = [], isLoading: opexLoading } = useOperationalExpenses(30);
  const { data: topProfit = [], isLoading: profitLoading } = useTopProfitProducts(30, 6);
  const { data: topSold = [], isLoading: soldLoading } = useTopSoldProducts(30, 6);
  const { data: salesCollection = [], isLoading: scLoading } = useSalesCollection(30);
  const { data: kpiFlow = [], isLoading: kpiFlowLoading } = useKpiFlow(kpiMetric);

  const allQuickActions = [
    { label: 'New Sale', icon: <PointOfSaleIcon />, path: '/pos', adminOnly: false },
    { label: 'Add Product', icon: <AddIcon />, path: '/products/new', adminOnly: true },
    { label: 'Expenses', icon: <ReceiptLongIcon />, path: '/expenses', adminOnly: true },
    { label: 'Purchase Orders', icon: <LocalShippingIcon />, path: '/purchase-orders', adminOnly: true },
    { label: 'Day Cash Book', icon: <AccountBalanceWalletIcon />, path: '/reports/daily', adminOnly: true },
    { label: 'Accounts', icon: <AccountBalanceWalletIcon />, path: '/accounts', adminOnly: true },
    { label: 'View Reports', icon: <AssessmentIcon />, path: '/reports', adminOnly: true },
  ];
  const quickActions = allQuickActions.filter((a) => !a.adminOnly || isAdminOrManager);

  if (!isAdminOrManager) {
    return (
      <Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today's Sales"
              value={formatCurrency(stats?.todaySales ?? 0)}
              loading={statsLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Quick Links</Typography>
                <List dense>
                  {quickActions.map((a) => (
                    <ListItemButton key={a.path} onClick={() => navigate(a.path)}>
                      <ListItemIcon sx={{ minWidth: 40 }}>{a.icon}</ListItemIcon>
                      <ListItemText primary={a.label} />
                    </ListItemButton>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  }

  const opexChart = opex.map((r) => ({
    name: r.name.replace(/_/g, ' '),
    amount: r.amount,
  }));
  const profitChart = topProfit.map((r) => ({ name: r.name, profit: r.profit }));
  const soldChart = topSold.map((r) => ({ name: r.name, qty: r.quantitySold }));

  return (
    <Box>
      <Box
        sx={{
          pt: 0.5,
          pb: 1.5,
          mb: 2,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '1fr 1fr',
            md: 'repeat(5, minmax(0, 1fr))',
          },
          gap: 1.5,
        }}
      >
        <KpiTile
          title="Sales"
          icon={<TrendingUpIcon fontSize="small" />}
          main={formatCurrency(kpi?.sales.fiscalYear ?? 0)}
          sub={`Month ${formatCurrency(kpi?.sales.month ?? 0)} · Day ${formatCurrency(kpi?.sales.day ?? 0)}`}
          loading={kpiLoading}
          onClick={() => setKpiMetric('sales')}
        />
        <KpiTile
          title="Purchase"
          icon={<LocalShippingIcon fontSize="small" />}
          main={formatCurrency(kpi?.purchase.fiscalYear ?? 0)}
          sub={`Month ${formatCurrency(kpi?.purchase.month ?? 0)} · Day ${formatCurrency(kpi?.purchase.day ?? 0)}`}
          loading={kpiLoading}
          onClick={() => setKpiMetric('purchase')}
        />
        <KpiTile
          title="Receivables"
          icon={<CallReceivedIcon fontSize="small" />}
          main={formatCurrency(0)}
          sub="Month — · Day —"
          loading={kpiLoading}
          onClick={() => setKpiMetric('receivables')}
        />
        <KpiTile
          title="Payables"
          icon={<CallMadeIcon fontSize="small" />}
          main={formatCurrency(kpi?.payables.outstanding ?? 0)}
          sub={`Month paid ${formatCurrency(kpi?.payables.monthPaid ?? 0)} · Day ${formatCurrency(kpi?.payables.dayPaid ?? 0)}`}
          loading={kpiLoading}
          onClick={() => setKpiMetric('payables')}
        />
        <CashWalletTile
          total={kpi?.cashBank.total ?? 0}
          cash={kpi?.cashBank.cash ?? 0}
          bank={kpi?.cashBank.bank ?? 0}
          esewa={kpi?.cashBank.esewa ?? 0}
          loading={kpiLoading}
          onSelect={(method) => setKpiMetric(method)}
        />
      </Box>

      <Dialog
        open={kpiMetric != null}
        onClose={() => setKpiMetric(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          {kpiMetric ? KPI_FLOW_TITLES[kpiMetric] : ''}
          <IconButton size="small" onClick={() => setKpiMetric(null)} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Fiscal year start
            {kpi?.fiscalYearStart ? ` (${formatDate(kpi.fiscalYearStart)})` : ''} → today
          </Typography>
          <DashboardChartCard
            title={kpiMetric ? KPI_FLOW_TITLES[kpiMetric] : 'KPI Flow'}
            loading={kpiFlowLoading}
            allowPie
            filename={`${kpiMetric ?? 'kpi'}-flow`}
            height={360}
          >
            {(mode, height) => (
              <FlowSeriesChart
                mode={mode}
                height={height}
                data={kpiFlow}
                inflowLabel={kpiMetric ? KPI_FLOW_SERIES[kpiMetric].inflow : 'Inflow'}
                outflowLabel={kpiMetric ? KPI_FLOW_SERIES[kpiMetric].outflow : 'Outflow'}
              />
            )}
          </DashboardChartCard>
        </DialogContent>
      </Dialog>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <DashboardChartCard
            title="Cash Inflow / Outflow"
            loading={cashFlowLoading}
            allowPie={false}
            filename="cash-flow"
            height={300}
          >
            {(_mode, height) => (
              <ResponsiveContainer width="100%" height={height}>
                <AreaChart data={cashFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <Area type="monotone" dataKey="inflow" name="Inflow" stroke="#2a9d8f" fill="#2a9d8f55" />
                  <Area type="monotone" dataKey="outflow" name="Outflow" stroke="#e76f51" fill="#e76f5155" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </DashboardChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Quick Links</Typography>
              <List dense disablePadding>
                {quickActions.map((a) => (
                  <ListItemButton key={a.path} onClick={() => navigate(a.path)} sx={{ borderRadius: 1 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>{a.icon}</ListItemIcon>
                    <ListItemText primary={a.label} />
                  </ListItemButton>
                ))}
              </List>
              <Button
                fullWidth
                variant="outlined"
                sx={{ mt: 1 }}
                onClick={() => navigate('/pos')}
                startIcon={<PointOfSaleIcon />}
              >
                Open POS
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardChartCard title="Operational Expenses" loading={opexLoading} filename="opex">
            {(mode, height) => (
              <CategoricalChart mode={mode} height={height} data={opexChart} nameKey="name" valueKey="amount" />
            )}
          </DashboardChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardChartCard title="Top 6 Profit Items" loading={profitLoading} filename="top-profit">
            {(mode, height) => (
              <CategoricalChart
                mode={mode}
                height={height}
                data={profitChart}
                nameKey="name"
                valueKey="profit"
                barColor="#264653"
              />
            )}
          </DashboardChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardChartCard title="Top 6 Items Sold (30 Days)" loading={soldLoading} filename="top-sold">
            {(mode, height) => (
              <CategoricalChart
                mode={mode}
                height={height}
                data={soldChart}
                nameKey="name"
                valueKey="qty"
                barColor="#e9c46a"
                valueIsCurrency={false}
              />
            )}
          </DashboardChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardChartCard
            title="Sales / Collection"
            loading={scLoading}
            allowPie={false}
            filename="sales-collection"
          >
            {(_mode, height) => (
              <ResponsiveContainer width="100%" height={height}>
                <BarChart data={salesCollection} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="sales" name="Sales" fill="#0d7377" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="collection" name="Collection" fill="#e9c46a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashboardChartCard>
        </Grid>
      </Grid>
    </Box>
  );
}
