import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { StatCard } from '@/components/common/StatCard';
import { useDailySummary, useUpsertDayClose } from '@/hooks/useReports';
import { PAYMENT_METHODS } from '@/constants';
import { formatCurrency, formatDate } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function paymentLabel(method: string): string {
  const normalized =
    method === 'card' ? 'bank' : method === 'khalti' ? 'esewa' : method;
  return PAYMENT_METHODS.find((p) => p.value === normalized)?.label ?? method;
}

export function DailyReportPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading, isError, refetch } = useDailySummary(date);
  const upsertMutation = useUpsertDayClose();

  useEffect(() => {
    if (!data) return;
    setOpeningCash(String(data.cash.opening ?? 0));
    setClosingCash(String(data.cash.closing ?? 0));
    setNotes(data.dayClose?.notes ?? '');
  }, [data]);

  const handleSaveCash = async () => {
    setError('');
    const opening = parseFloat(openingCash);
    const closing = parseFloat(closingCash);
    if (!Number.isFinite(opening) || opening < 0 || !Number.isFinite(closing) || closing < 0) {
      setError('Opening and closing cash must be valid non-negative amounts.');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        date,
        data: { openingCash: opening, closingCash: closing, notes: notes.trim() || undefined },
      });
      showSuccess('Day close cash saved.');
      await refetch();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const sales = data?.sales.totalRevenue ?? 0;
  const expenses = data?.expenses.total ?? 0;
  const net = sales - expenses;
  const cash = data?.cash;
  const methods = ['cash', 'bank', 'esewa'] as const;
  const methodRows = methods.map((method) => {
    const row = data?.byPaymentMethod.find((p) => {
      const m = p.paymentMethod === 'card' ? 'bank' : p.paymentMethod === 'khalti' ? 'esewa' : p.paymentMethod;
      return m === method;
    });
    // Merge legacy khalti into esewa totals
    let revenue = row?.revenue ?? 0;
    let count = row?.count ?? 0;
    if (method === 'esewa') {
      const legacy = data?.byPaymentMethod.find((p) => p.paymentMethod === 'khalti');
      revenue += legacy?.revenue ?? 0;
      count += legacy?.count ?? 0;
    }
    return {
      method,
      label: paymentLabel(method),
      revenue,
      count,
    };
  });
  const bankTotal = methodRows.find((r) => r.method === 'bank')?.revenue ?? 0;
  const esewaTotal = methodRows.find((r) => r.method === 'esewa')?.revenue ?? 0;

  return (
    <Box className="daily-report-page">
      <PageHeader
        title="Daily Report"
        subtitle="End-of-day summary for stakeholders"
        breadcrumbs={[{ label: 'Reports', path: '/reports' }, { label: 'Daily Report' }]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} className="no-print">
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/reports')}>
              Back
            </Button>
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>
              Print
            </Button>
          </Box>
        }
      />

      <Paper
        variant="outlined"
        className="no-print"
        sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <NepaliAwareDatePicker
          label="Report date"
          value={date}
          onChange={setDate}
          size="small"
        />
        <Typography variant="body2" color="text.secondary">
          Select the business day, enter opening/closing cash, then print for stakeholders.
        </Typography>
      </Paper>

      {(error || isError) && (
        <Alert severity="error" sx={{ mb: 2 }} className="no-print">
          {error || 'Could not load daily summary.'}
        </Alert>
      )}

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }} className="print-only-block">
        KoMart Daily Report — {formatDate(date)}
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Total Sales"
            value={isLoading ? '—' : formatCurrency(sales)}
            subtitle={data ? `${data.sales.transactionCount} transactions` : undefined}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Total Expenses"
            value={isLoading ? '—' : formatCurrency(expenses)}
            subtitle={data ? `Operating ${formatCurrency(data.expenses.operating)}` : undefined}
            color="error.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Net (Sales − Expenses)"
            value={isLoading ? '—' : formatCurrency(net)}
            color={net >= 0 ? 'primary.main' : 'error.main'}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Payments received
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Method</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Txns</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {methodRows.map((row) => (
                  <TableRow key={row.method}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell align="right">{row.count}</TableCell>
                    <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Bank</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(bankTotal)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">eSewa</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(esewaTotal)}</Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Cash on counter
            </Typography>
            <Grid container spacing={1.5} className="no-print">
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Opening cash"
                  type="number"
                  size="small"
                  fullWidth
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Closing cash (counted)"
                  type="number"
                  size="small"
                  fullWidth
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Notes"
                  size="small"
                  fullWidth
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  minRows={2}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={() => void handleSaveCash()}
                  loading={upsertMutation.isPending}
                >
                  Save day close
                </Button>
              </Grid>
            </Grid>

            <Box className="print-only-block" sx={{ display: 'none', mb: 1 }}>
              <Typography variant="body2">Opening: {formatCurrency(cash?.opening ?? 0)}</Typography>
              <Typography variant="body2">Closing: {formatCurrency(cash?.closing ?? 0)}</Typography>
              {notes && <Typography variant="body2">Notes: {notes}</Typography>}
            </Box>

            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Cash sales</Typography>
              <Typography variant="body2">{formatCurrency(cash?.cashSales ?? 0)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Cash expenses</Typography>
              <Typography variant="body2">{formatCurrency(cash?.cashExpenses ?? 0)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Expected cash</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatCurrency(cash?.expected ?? 0)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Variance</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  color: (cash?.variance ?? 0) === 0
                    ? 'text.primary'
                    : (cash?.variance ?? 0) > 0
                      ? 'success.main'
                      : 'error.main',
                }}
              >
                {formatCurrency(cash?.variance ?? 0)}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Expected = Opening + Cash sales − Cash expenses
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only-block { display: block !important; }
          .MuiDrawer-root, .MuiAppBar-root { display: none !important; }
          body { background: #fff !important; }
        }
        .print-only-block { display: none; }
      `}</style>
    </Box>
  );
}
