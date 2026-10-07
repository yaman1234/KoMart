import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, FormControlLabel, Grid,
  Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, Tab, TextField, Typography, useTheme,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { StatCard } from '@/components/common/StatCard';
import {
  useReconciliationByDate,
  useReconciliationDayData,
  useReconciliationList,
  useSaveReconciliation,
} from '@/hooks/useReconciliation';
import { formatCurrency } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import type { BankReconciliation } from '@/types';
import { todayIso, shiftDate, LineRow, StatusChip, SectionHeader } from './shared';

function BankEntryTab({ onSaved }: { onSaved: () => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [date, setDate] = useState(todayIso);
  const [isInitial, setIsInitial] = useState(false);
  const [initialBank, setInitialBank] = useState('0');
  const [initialFonePay, setInitialFonePay] = useState('0');
  const [otherBankIn, setOtherBankIn] = useState('0');
  const [bankBalance, setBankBalance] = useState('0');
  const [fonePayBalance, setFonePayBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState('');

  const { data: existing, isLoading: loadingExisting } = useReconciliationByDate(date);
  const { data: dayData, isLoading: loadingDay } = useReconciliationDayData(date);
  const saveMutation = useSaveReconciliation();
  const isLoading = loadingExisting || loadingDay;
  const hasExisting = !!existing;
  const isReadOnly = hasExisting && !editMode;

  useEffect(() => {
    if (existing) {
      setIsInitial(existing.isInitial);
      setInitialBank(String(existing.previousBankBalance));
      setInitialFonePay(String(existing.previousFonePayBalance));
      setOtherBankIn(String(existing.todayOtherBankIn));
      setBankBalance(String(existing.todayBankBalance));
      setFonePayBalance(String(existing.todayFonePayBalance));
      setNotes(existing.notes ?? '');
      setEditMode(false);
    } else {
      setIsInitial(!dayData?.previousRecord);
      setInitialBank('0'); setInitialFonePay('0');
      setOtherBankIn('0'); setBankBalance('0'); setFonePayBalance('0');
      setNotes('');
      setEditMode(false);
    }
  }, [existing, dayData?.previousRecord]);

  const prevBank = useMemo(() => {
    if (isInitial) return parseFloat(initialBank) || 0;
    return dayData?.previousRecord?.todayBankBalance ?? 0;
  }, [isInitial, initialBank, dayData?.previousRecord]);

  const prevFonePay = useMemo(() => {
    if (isInitial) return parseFloat(initialFonePay) || 0;
    return dayData?.previousRecord?.todayFonePayBalance ?? 0;
  }, [isInitial, initialFonePay, dayData?.previousRecord]);

  const todayBankSalesIn = dayData?.todayBankSalesIn ?? 0;
  const todayBankExpenses = dayData?.todayBankExpenses ?? 0;
  const todayTransfersIn = dayData?.todayTransfersIn ?? 0;
  const todayTransfersOut = dayData?.todayTransfersOut ?? 0;
  const todayAdjustmentsIn = dayData?.todayAdjustmentsIn ?? 0;
  const todayAdjustmentsOut = dayData?.todayAdjustmentsOut ?? 0;
  const todayCustodyIn = dayData?.todayCustodyIn ?? 0;
  const todayCustodyOut = dayData?.todayCustodyOut ?? 0;
  const otherIn = parseFloat(otherBankIn) || 0;
  const bankVal = parseFloat(bankBalance) || 0;
  const fonePayVal = parseFloat(fonePayBalance) || 0;

  const expectedBalance =
    prevBank + prevFonePay + todayBankSalesIn + otherIn
    + todayTransfersIn + todayAdjustmentsIn + todayCustodyIn
    - todayBankExpenses - todayTransfersOut - todayAdjustmentsOut - todayCustodyOut;
  const actualBalance = bankVal + fonePayVal;
  const difference = actualBalance - expectedBalance;
  const isReconciled = Math.abs(difference) < 0.01;

  const handleSave = async () => {
    setError('');
    const bv = parseFloat(bankBalance);
    const fv = parseFloat(fonePayBalance);
    if (isNaN(bv) || isNaN(fv) || bv < 0 || fv < 0) {
      setError('Bank Balance and FonePay Balance are required and must be non-negative.');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        date, isInitial,
        previousBankBalance: isInitial ? prevBank : undefined,
        previousFonePayBalance: isInitial ? prevFonePay : undefined,
        todayOtherBankIn: otherIn,
        todayBankBalance: bv,
        todayFonePayBalance: fv,
        notes: notes.trim() || undefined,
      });
      showSuccess('Bank reconciliation saved.');
      setEditMode(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{
          p: 2, mb: 2,
          background: isDark
            ? 'linear-gradient(135deg, #1A2332 0%, #1D3557 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #EEF4FB 100%)',
          borderColor: isDark ? '#2A3F5F' : '#C5D8EE',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="small" variant="outlined" onClick={() => { setDate(d => shiftDate(d, -1)); setError(''); }} sx={{ minWidth: 36, px: 0 }}>
            <ChevronLeftIcon />
          </Button>
          <NepaliAwareDatePicker label="Reconciliation Date" value={date} onChange={d => { setDate(d); setError(''); }} size="small" />
          <Button size="small" variant="outlined" onClick={() => { setDate(d => shiftDate(d, 1)); setError(''); }} disabled={date >= todayIso()} sx={{ minWidth: 36, px: 0 }}>
            <ChevronRightIcon />
          </Button>
          {hasExisting && <StatusChip difference={existing!.difference} />}
          {hasExisting && !editMode && (
            <Button size="small" startIcon={<EditIcon />} variant="outlined" onClick={() => setEditMode(true)}>Edit</Button>
          )}
          <Box sx={{ width: '1px', height: 32, bgcolor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', mx: 0.5 }} />
          {[
            { label: 'Prev Bank (A)', value: prevBank, color: 'text.secondary' },
            { label: 'Prev FonePay (B)', value: prevFonePay, color: 'text.secondary' },
            { label: 'Inflows', value: todayBankSalesIn + otherIn + todayTransfersIn + todayAdjustmentsIn + todayCustodyIn, color: 'success.main' },
            { label: 'Outflows', value: todayBankExpenses + todayTransfersOut + todayAdjustmentsOut + todayCustodyOut, color: 'error.main' },
            { label: 'Expected', value: expectedBalance, color: 'primary.main' },
            { label: 'Actual', value: actualBalance, color: 'text.primary' },
            { label: 'Difference', value: difference, color: isReconciled ? 'success.main' : difference > 0 ? 'warning.main' : 'error.main' },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`, minWidth: 80 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color, fontSize: '0.8rem' }}>
                {label === 'Difference'
                  ? (isReconciled ? 'Rs. 0.00' : `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`)
                  : formatCurrency(value)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!isLoading && !hasExisting && !dayData?.previousRecord && (
        <Alert severity="info" sx={{ mb: 2 }}>No previous reconciliation found. Enable "Initial Reconciliation" to enter opening balances manually.</Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', height: '100%' }}>
            <SectionHeader title="Entry" />
            <Box sx={{ p: 2 }}>
              <FormControlLabel
                control={<Switch checked={isInitial} onChange={e => setIsInitial(e.target.checked)} disabled={isReadOnly} />}
                label="Initial Reconciliation (no previous record)"
                sx={{ mb: 2, display: 'block' }}
              />
              {isInitial && (
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  <Grid size={{ xs: 6 }}>
                    <TextField label="Initial Bank Balance (A)" type="number" size="small" fullWidth value={initialBank} onChange={e => setInitialBank(e.target.value)} disabled={isReadOnly} helperText="Opening bank balance" slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField label="Initial FonePay Balance (B)" type="number" size="small" fullWidth value={initialFonePay} onChange={e => setInitialFonePay(e.target.value)} disabled={isReadOnly} helperText="Opening FonePay balance" slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
                  </Grid>
                </Grid>
              )}
              <TextField label="Today's Other Bank In (D)" type="number" size="small" fullWidth value={otherBankIn} onChange={e => setOtherBankIn(e.target.value)} helperText="Owner deposit, transfers, misc bank income" sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Actual Closing Balances</Typography>
                {!isReadOnly && (prevBank > 0 || prevFonePay > 0) && (
                  <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => { setBankBalance(String(prevBank)); setFonePayBalance(String(prevFonePay)); }}>
                    Use Previous
                  </Button>
                )}
              </Box>
              <TextField label="Today's Bank Balance (L)" type="number" size="small" fullWidth required value={bankBalance} onChange={e => setBankBalance(e.target.value)} disabled={isReadOnly} sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
              <TextField label="Today's FonePay Balance (M)" type="number" size="small" fullWidth required value={fonePayBalance} onChange={e => setFonePayBalance(e.target.value)} disabled={isReadOnly} sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
              <TextField
                label="Notes" size="small" fullWidth multiline minRows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                disabled={isReadOnly} placeholder="Any remarks or observations for this reconciliation"
                sx={{ mb: 2 }}
              />
              {(!isReadOnly) && (
                <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void handleSave()} loading={saveMutation.isPending} fullWidth
                  sx={{ background: 'linear-gradient(90deg, #E63946 0%, #C1121F 100%)', '&:hover': { background: 'linear-gradient(90deg, #C1121F 0%, #a00e18 100%)' } }}>
                  Save Reconciliation
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', mb: 2 }}>
            <SectionHeader title="Expected Balance" />
            <Box sx={{ p: 1.5 }}>
              {/* Column headers */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, pb: 0.75, borderBottom: `2px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)'}` }}>
                <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'text.secondary' }}>Description</Typography>
                <Box sx={{ borderLeft: `2px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)'}`, pl: 1.5, pr: 0.5, minWidth: 95, textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'text.secondary' }}>Amount</Typography>
                </Box>
                <Box sx={{ borderLeft: `2px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)'}`, pl: 1.5, minWidth: 105, textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'text.secondary' }}>Subtotal</Typography>
                </Box>
              </Box>
              {/* Previous Balances */}
              <Box sx={{
                px: 1.5, py: 1, mb: 1, borderRadius: 1,
                background: isDark ? 'linear-gradient(90deg, rgba(29,53,87,0.45) 0%, rgba(42,63,95,0.3) 100%)' : 'linear-gradient(90deg, rgba(29,53,87,0.07) 0%, rgba(69,123,157,0.05) 100%)',
                border: `1px solid ${isDark ? 'rgba(69,123,157,0.25)' : 'rgba(29,53,87,0.1)'}`,
              }}>
                <LineRow label="Previous Bank Balance (A)" value={prevBank} />
                <LineRow label="Previous FonePay Balance (B)" value={prevFonePay} bold subtotal={prevBank + prevFonePay} />
              </Box>

              {/* Inflows */}
              <Box sx={{
                px: 1.5, py: 1, mb: 1, borderRadius: 1,
                background: isDark ? 'linear-gradient(90deg, rgba(42,157,143,0.18) 0%, rgba(26,122,110,0.1) 100%)' : 'linear-gradient(90deg, rgba(42,157,143,0.08) 0%, rgba(42,157,143,0.04) 100%)',
                border: `1px solid ${isDark ? 'rgba(42,157,143,0.3)' : 'rgba(42,157,143,0.18)'}`,
              }}>
                <Typography variant="caption" color="success.main" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', mb: 0.75 }}>Inflows</Typography>
                <LineRow label="Bank Sales In (C)" value={todayBankSalesIn} />
                <LineRow label="Other Bank In (D)" value={otherIn} />
                <LineRow label="Transfers In (E)" value={todayTransfersIn} />
                <LineRow label="Adjustments In (F)" value={todayAdjustmentsIn} />
                <LineRow label="Custody In / Return (G)" value={todayCustodyIn} subtotal={todayBankSalesIn + otherIn + todayTransfersIn + todayAdjustmentsIn + todayCustodyIn} />
              </Box>

              {/* Outflows */}
              <Box sx={{
                px: 1.5, py: 1, mb: 1, borderRadius: 1,
                background: isDark ? 'linear-gradient(90deg, rgba(230,57,70,0.15) 0%, rgba(193,18,31,0.08) 100%)' : 'linear-gradient(90deg, rgba(230,57,70,0.06) 0%, rgba(193,18,31,0.03) 100%)',
                border: `1px solid ${isDark ? 'rgba(230,57,70,0.25)' : 'rgba(230,57,70,0.15)'}`,
              }}>
                <Typography variant="caption" color="error.main" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', mb: 0.75 }}>Outflows</Typography>
                <LineRow label="Bank Expenses (H) −" value={todayBankExpenses} minus />
                <LineRow label="Transfers Out (I) −" value={todayTransfersOut} minus />
                <LineRow label="Adjustments Out (J) −" value={todayAdjustmentsOut} minus />
                <LineRow label="Custody Out / Take (K) −" value={todayCustodyOut} minus subtotal={todayBankExpenses + todayTransfersOut + todayAdjustmentsOut + todayCustodyOut} />
              </Box>

              {/* Expected */}
              <Box sx={{
                px: 1.5, py: 1, borderRadius: 1,
                background: isDark ? 'linear-gradient(90deg, rgba(69,123,157,0.35) 0%, rgba(29,53,87,0.25) 100%)' : 'linear-gradient(90deg, rgba(29,53,87,0.1) 0%, rgba(69,123,157,0.06) 100%)',
                border: `1px solid ${isDark ? 'rgba(69,123,157,0.4)' : 'rgba(29,53,87,0.15)'}`,
              }}>
                <LineRow label="Expected (A+B+C+D+E+F+G−H−I−J−K)" value={expectedBalance} bold subtotal={expectedBalance} />
              </Box>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <SectionHeader title="Actual vs Expected" />
            <Box sx={{ p: 1.5 }}>
              <Box sx={{
                px: 1.5, py: 1, mb: 1, borderRadius: 1,
                background: isDark ? 'linear-gradient(90deg, rgba(29,53,87,0.45) 0%, rgba(42,63,95,0.3) 100%)' : 'linear-gradient(90deg, rgba(29,53,87,0.07) 0%, rgba(69,123,157,0.05) 100%)',
                border: `1px solid ${isDark ? 'rgba(69,123,157,0.25)' : 'rgba(29,53,87,0.1)'}`,
              }}>
                <LineRow label="Today's Bank Balance (L)" value={bankVal} />
                <LineRow label="Today's FonePay Balance (M)" value={fonePayVal} />
                <LineRow label="Actual Balance (L+M)" value={actualBalance} bold />
              </Box>

              {/* Expected */}
              <Box sx={{
                px: 1.5, py: 1, mb: 1, borderRadius: 1,
                background: isDark ? 'linear-gradient(90deg, rgba(69,123,157,0.35) 0%, rgba(29,53,87,0.25) 100%)' : 'linear-gradient(90deg, rgba(29,53,87,0.1) 0%, rgba(69,123,157,0.06) 100%)',
                border: `1px solid ${isDark ? 'rgba(69,123,157,0.4)' : 'rgba(29,53,87,0.15)'}`,
              }}>
                <LineRow label="Expected Balance" value={expectedBalance} bold />
              </Box>

              {/* Difference */}
              <Box sx={{
                px: 1.5, py: 1, borderRadius: 1,
                background: isReconciled
                  ? isDark ? 'linear-gradient(90deg, rgba(42,157,143,0.2) 0%, rgba(26,122,110,0.12) 100%)' : 'linear-gradient(90deg, rgba(42,157,143,0.1) 0%, rgba(42,157,143,0.05) 100%)'
                  : difference > 0
                    ? isDark ? 'linear-gradient(90deg, rgba(233,196,106,0.2) 0%, rgba(201,160,48,0.12) 100%)' : 'linear-gradient(90deg, rgba(233,196,106,0.12) 0%, rgba(233,196,106,0.06) 100%)'
                    : isDark ? 'linear-gradient(90deg, rgba(230,57,70,0.2) 0%, rgba(193,18,31,0.12) 100%)' : 'linear-gradient(90deg, rgba(230,57,70,0.08) 0%, rgba(193,18,31,0.04) 100%)',
                border: `1px solid ${isReconciled ? isDark ? 'rgba(42,157,143,0.35)' : 'rgba(42,157,143,0.2)' : difference > 0 ? isDark ? 'rgba(233,196,106,0.35)' : 'rgba(233,196,106,0.25)' : isDark ? 'rgba(230,57,70,0.35)' : 'rgba(230,57,70,0.2)'}`,
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>Difference</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: isReconciled ? 'success.main' : difference > 0 ? 'warning.main' : 'error.main' }}>
                      {isReconciled ? 'Rs. 0.00' : `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`}
                    </Typography>
                    <StatusChip difference={difference} />
                  </Box>
                </Box>
                {!isReconciled && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    {difference > 0 ? `Surplus of ${formatCurrency(Math.abs(difference))} — actual exceeds expected.` : `Deficit of ${formatCurrency(Math.abs(difference))} — actual is less than expected.`}
                  </Alert>
                )}
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function BankHistoryTab({ onEdit }: { onEdit: (date: string) => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const formatDate = useFormatDate();
  const { data, isLoading } = useReconciliationList();
  const records = data?.data ?? [];
  const [selected, setSelected] = useState<BankReconciliation | null>(null);

  const colBorder = `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`;
  const groupColBorder = `2px solid ${isDark ? '#3A5070' : '#A8C4DC'}`;
  const headSx = {
    fontWeight: 700, color: '#fff', fontSize: '0.75rem',
    borderRight: colBorder,
    '&:last-child': { borderRight: 'none' },
    whiteSpace: 'nowrap' as const, py: 1.25,
  };
  const groupHeadSx = { ...headSx, borderLeft: groupColBorder };

  return (
    <Box>
      {records.length === 0 && !isLoading && (
        <Alert severity="info">No bank reconciliations saved yet. Use the Entry tab to create one.</Alert>
      )}
      {selected && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {formatDate(selected.date)}
              <Chip label={selected.isInitial ? 'Initial' : 'Regular'} size="small" color={selected.isInitial ? 'warning' : 'default'} variant="outlined" sx={{ ml: 1 }} />
              <StatusChip difference={selected.difference} />
            </Typography>
            <Button size="small" variant="outlined" onClick={() => setSelected(null)}>Close</Button>
          </Box>
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {[
              { title: 'Prev Bank (A)', val: selected.previousBankBalance },
              { title: 'Prev FonePay (B)', val: selected.previousFonePayBalance },
              { title: 'Bank Sales (C)', val: selected.todayBankSalesIn },
              { title: 'Other In (D)', val: selected.todayOtherBankIn },
              { title: 'Bank Expenses (H)', val: selected.todayBankExpenses },
              { title: 'Expected', val: selected.expectedBalance },
              { title: 'Bank Bal (L)', val: selected.todayBankBalance },
              { title: 'FonePay Bal (M)', val: selected.todayFonePayBalance },
              { title: 'Actual', val: selected.actualBalance },
              { title: 'Difference', val: selected.difference },
            ].map(({ title, val }) => (
              <Grid key={title} size={{ xs: 6, sm: 3 }}>
                <StatCard title={title} value={formatCurrency(val)} gradient={['#1D3557', '#457B9D']} color="#fff" sx={{ '& .MuiTypography-root': { color: '#fff !important' } }} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      {records.length > 0 && (
        <Paper variant="outlined" sx={{ overflowX: 'auto', borderRadius: 2, border: `1px solid ${isDark ? '#2A3F5F' : '#C5D8EE'}` }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow sx={{ background: isDark ? 'linear-gradient(90deg, #1D3557 0%, #2A3F5F 100%)' : 'linear-gradient(90deg, #1D3557 0%, #457B9D 100%)' }}>
                <TableCell sx={headSx}>Date</TableCell>
                <TableCell sx={headSx}>Type</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Prev Bank (A)</TableCell>
                <TableCell align="right" sx={headSx}>Prev FonePay (B)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Bank Sales (C)</TableCell>
                <TableCell align="right" sx={headSx}>Other In (D)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Expenses (H)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Expected</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Bank Bal (L)</TableCell>
                <TableCell align="right" sx={headSx}>FonePay Bal (M)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Actual</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Difference</TableCell>
                <TableCell sx={headSx}>Status</TableCell>
                <TableCell sx={headSx}>Saved By</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((r: BankReconciliation, idx: number) => {
                const reconciled = Math.abs(r.difference) < 0.01;
                const isSelected = selected?.date === r.date;
                const stripe = isDark ? idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)' : idx % 2 === 0 ? 'transparent' : 'rgba(29,53,87,0.03)';
                const cellSx = { borderBottom: `1px solid ${isDark ? '#2A3F5F' : '#E8ECF0'}`, borderRight: colBorder, '&:last-child': { borderRight: 'none' } };
                const grpSx = { ...cellSx, borderLeft: groupColBorder };
                return (
                  <TableRow key={r.date} hover selected={isSelected} onClick={() => setSelected(isSelected ? null : r)} sx={{ backgroundColor: stripe, cursor: 'pointer' }}>
                    <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{formatDate(r.date)}</TableCell>
                    <TableCell sx={cellSx}><Chip label={r.isInitial ? 'Initial' : 'Regular'} size="small" variant="outlined" color={r.isInitial ? 'warning' : 'default'} /></TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.previousBankBalance)}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(r.previousFonePayBalance)}</TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.todayBankSalesIn)}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(r.todayOtherBankIn)}</TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.todayBankExpenses)}</TableCell>
                    <TableCell align="right" sx={{ ...grpSx, fontWeight: 700 }}>{formatCurrency(r.expectedBalance)}</TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.todayBankBalance)}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(r.todayFonePayBalance)}</TableCell>
                    <TableCell align="right" sx={{ ...grpSx, fontWeight: 700 }}>{formatCurrency(r.actualBalance)}</TableCell>
                    <TableCell align="right" sx={grpSx}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: reconciled ? 'success.main' : r.difference > 0 ? 'warning.main' : 'error.main' }}>
                        {reconciled ? '—' : `${r.difference > 0 ? '+' : ''}${formatCurrency(r.difference)}`}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}><StatusChip difference={r.difference} /></TableCell>
                    <TableCell sx={cellSx}><Typography variant="caption" color="text.secondary">{r.updatedBy || r.createdBy}<br />{formatDate(r.updatedAt)}</Typography></TableCell>
                    <TableCell align="right" sx={cellSx}><Button size="small" onClick={e => { e.stopPropagation(); onEdit(r.date); }}>Edit</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}

export function BankReconciliationPanel() {
  const [tab, setTab] = useState(0);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box>
      <Paper variant="outlined" sx={{ mb: 2, background: isDark ? 'linear-gradient(90deg, #1A2332 0%, #1D3557 100%)' : 'linear-gradient(90deg, #1D3557 0%, #457B9D 100%)', borderColor: 'transparent', borderRadius: 2, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,0.65)', fontWeight: 600 }, '& .Mui-selected': { color: '#fff !important' }, '& .MuiTabs-indicator': { backgroundColor: '#E63946', height: 3 } }}>
          <Tab label="Entry" />
          <Tab label="History" />
        </Tabs>
      </Paper>
      {tab === 0 && <BankEntryTab onSaved={() => setTab(1)} />}
      {tab === 1 && <BankHistoryTab onEdit={date => { sessionStorage.setItem('recon_edit_date', date); setTab(0); }} />}
    </Box>
  );
}
