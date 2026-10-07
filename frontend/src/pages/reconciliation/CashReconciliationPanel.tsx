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
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { StatCard } from '@/components/common/StatCard';
import {
  useCashReconciliationByDate,
  useCashReconciliationDayData,
  useCashReconciliationList,
  useSaveCashReconciliation,
} from '@/hooks/useReconciliation';
import { formatCurrency } from '@/utils';
import { useFormatDate } from '@/hooks/useFormatDate';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import type { CashReconciliation } from '@/types';
import { todayIso, shiftDate, LineRow, ColHeader, StatusChip, SectionHeader } from './shared';

const DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 2, 1];

type DenomMap = Record<number, string>;

function denomTotal(denoms: DenomMap): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * (parseInt(denoms[d] || '0', 10) || 0), 0);
}
function CashEntryTab({ onSaved }: { onSaved: () => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const formatDate = useFormatDate();
  const [date, setDate] = useState(todayIso);
  const [isInitial, setIsInitial] = useState(false);
  const [openingCash, setOpeningCash] = useState('0');
  const [otherCashIn, setOtherCashIn] = useState('0');
  const [actualClosing, setActualClosing] = useState('0');
  const [denomMode, setDenomMode] = useState(false);
  const [denoms, setDenoms] = useState<DenomMap>({});
  const [notes, setNotes] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState('');

  const { data: existing, isLoading: loadingExisting } = useCashReconciliationByDate(date);
  const { data: dayData, isLoading: loadingDay } = useCashReconciliationDayData(date);
  const saveMutation = useSaveCashReconciliation();
  const isLoading = loadingExisting || loadingDay;
  const hasExisting = !!existing;
  const isReadOnly = hasExisting && !editMode;

  useEffect(() => {
    if (existing) {
      setIsInitial(existing.isInitial);
      setOpeningCash(String(existing.openingCash));
      setOtherCashIn(String(existing.todayOtherCashIn));
      setActualClosing(String(existing.actualClosingCash));
      setNotes(existing.notes ?? '');
      const savedMode = existing.cashCountMode === 'denomination';
      setDenomMode(savedMode);
      if (savedMode && existing.denominations?.length) {
        const map: DenomMap = {};
        existing.denominations.forEach(d => { map[d.denomination] = String(d.quantity); });
        setDenoms(map);
      } else {
        setDenoms({});
      }
      setEditMode(false);
    } else {
      setIsInitial(!dayData?.previousRecord);
      setOpeningCash('0');
      setOtherCashIn('0');
      setActualClosing('0');
      setDenoms({});
      setDenomMode(false);
      setNotes('');
      setEditMode(false);
    }
  }, [existing, dayData?.previousRecord]);

  const opening = useMemo(() => {
    if (isInitial) return parseFloat(openingCash) || 0;
    return dayData?.previousRecord?.actualClosingCash ?? 0;
  }, [isInitial, openingCash, dayData?.previousRecord]);

  const cashSalesIn = dayData?.todayCashSalesIn ?? 0;
  const cashExpenses = dayData?.todayCashExpenses ?? 0;
  const transfersIn = dayData?.todayTransfersIn ?? 0;
  const transfersOut = dayData?.todayTransfersOut ?? 0;
  const adjustmentsIn = dayData?.todayAdjustmentsIn ?? 0;
  const adjustmentsOut = dayData?.todayAdjustmentsOut ?? 0;
  const custodyIn = dayData?.todayCustodyIn ?? 0;
  const custodyOut = dayData?.todayCustodyOut ?? 0;
  const otherCashInVal = parseFloat(otherCashIn) || 0;
  const denomTotalVal = denomTotal(denoms);
  const actualVal = denomTotalVal > 0 ? denomTotalVal : (parseFloat(actualClosing) || 0);

  const inflowsSum = cashSalesIn + otherCashInVal + transfersIn + adjustmentsIn + custodyIn;
  const outflowsSum = cashExpenses + transfersOut + adjustmentsOut + custodyOut;
  const expectedClosing = opening + inflowsSum - outflowsSum;
  const difference = actualVal - expectedClosing;
  const isReconciled = Math.abs(difference) < 0.01;

  const handleSave = async () => {
    setError('');
    const av = actualVal;
    if (isNaN(av) || av < 0) {
      setError('Actual closing cash is required and must be non-negative.');
      return;
    }
    try {
      const denomEntries = DENOMINATIONS
        .filter(d => parseInt(denoms[d] || '0', 10) > 0)
        .map(d => ({ denomination: d, quantity: parseInt(denoms[d], 10), amount: d * parseInt(denoms[d], 10) }));
      await saveMutation.mutateAsync({
        date, isInitial,
        openingCash: isInitial ? opening : undefined,
        todayOtherCashIn: otherCashInVal,
        actualClosingCash: av,
        notes: notes.trim() || undefined,
        cashCountMode: denomMode ? 'denomination' : 'direct',
        denominations: denomMode && denomEntries.length > 0 ? denomEntries : undefined,
      });
      showSuccess('Cash reconciliation saved.');
      setEditMode(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const sectionBg = {
    opening: isDark
      ? 'linear-gradient(90deg, rgba(29,53,87,0.45) 0%, rgba(42,63,95,0.3) 100%)'
      : 'linear-gradient(90deg, rgba(29,53,87,0.07) 0%, rgba(69,123,157,0.05) 100%)',
    openingBorder: isDark ? 'rgba(69,123,157,0.25)' : 'rgba(29,53,87,0.1)',
    inflow: isDark
      ? 'linear-gradient(90deg, rgba(42,157,143,0.18) 0%, rgba(26,122,110,0.1) 100%)'
      : 'linear-gradient(90deg, rgba(42,157,143,0.08) 0%, rgba(42,157,143,0.04) 100%)',
    inflowBorder: isDark ? 'rgba(42,157,143,0.3)' : 'rgba(42,157,143,0.18)',
    outflow: isDark
      ? 'linear-gradient(90deg, rgba(230,57,70,0.15) 0%, rgba(193,18,31,0.08) 100%)'
      : 'linear-gradient(90deg, rgba(230,57,70,0.06) 0%, rgba(193,18,31,0.03) 100%)',
    outflowBorder: isDark ? 'rgba(230,57,70,0.25)' : 'rgba(230,57,70,0.15)',
    expected: isDark
      ? 'linear-gradient(90deg, rgba(69,123,157,0.35) 0%, rgba(29,53,87,0.25) 100%)'
      : 'linear-gradient(90deg, rgba(29,53,87,0.1) 0%, rgba(69,123,157,0.06) 100%)',
    expectedBorder: isDark ? 'rgba(69,123,157,0.4)' : 'rgba(29,53,87,0.15)',
    diff: isReconciled
      ? isDark ? 'linear-gradient(90deg, rgba(42,157,143,0.2) 0%, rgba(26,122,110,0.12) 100%)' : 'linear-gradient(90deg, rgba(42,157,143,0.1) 0%, rgba(42,157,143,0.05) 100%)'
      : difference > 0
        ? isDark ? 'linear-gradient(90deg, rgba(233,196,106,0.2) 0%, rgba(201,160,48,0.12) 100%)' : 'linear-gradient(90deg, rgba(233,196,106,0.12) 0%, rgba(233,196,106,0.06) 100%)'
        : isDark ? 'linear-gradient(90deg, rgba(230,57,70,0.2) 0%, rgba(193,18,31,0.12) 100%)' : 'linear-gradient(90deg, rgba(230,57,70,0.08) 0%, rgba(193,18,31,0.04) 100%)',
    diffBorder: isReconciled
      ? isDark ? 'rgba(42,157,143,0.35)' : 'rgba(42,157,143,0.2)'
      : difference > 0
        ? isDark ? 'rgba(233,196,106,0.35)' : 'rgba(233,196,106,0.25)'
        : isDark ? 'rgba(230,57,70,0.35)' : 'rgba(230,57,70,0.2)',
  };

  const sectionBox = (bg: string, border: string, mb = 1) => ({
    px: 1.5, py: 1, mb, borderRadius: 1,
    background: bg,
    border: `1px solid ${border}`,
  });

  return (
    <Box>
      {/* Date navigator + reference figures */}
      <Paper variant="outlined" sx={{
        p: 2, mb: 2,
        background: isDark ? 'linear-gradient(135deg, #1A2332 0%, #1a3a2a 100%)' : 'linear-gradient(135deg, #f8fafc 0%, #eef8f2 100%)',
        borderColor: isDark ? '#2A4F3F' : '#b2d8c4',
      }}>
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
            { label: 'Opening', value: opening, color: 'text.secondary' },
            { label: 'Inflows', value: inflowsSum, color: 'success.main' },
            { label: 'Outflows', value: outflowsSum, color: 'error.main' },
            { label: 'Expected', value: expectedClosing, color: 'primary.main' },
            { label: 'Actual', value: actualVal, color: 'text.primary' },
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
        <Alert severity="info" sx={{ mb: 2 }}>No previous cash reconciliation found. Enable "Initial Reconciliation" to enter opening cash manually.</Alert>
      )}

      <Grid container spacing={2}>
        {/* Left: entry form */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', height: '100%' }}>
            <SectionHeader title="Cash Book Entry" />
            <Box sx={{ p: 2 }}>
              <FormControlLabel
                control={<Switch checked={isInitial} onChange={e => setIsInitial(e.target.checked)} disabled={isReadOnly} />}
                label="Initial Reconciliation (no previous record)"
                sx={{ mb: 2, display: 'block' }}
              />
              {isInitial && (
                <TextField
                  label="Opening Cash (A)" type="number" size="small" fullWidth
                  value={openingCash} onChange={e => setOpeningCash(e.target.value)}
                  disabled={isReadOnly} helperText="Physical cash at start of day"
                  sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              )}
              {!isInitial && dayData?.previousRecord && (
                <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: isDark ? 'rgba(42,157,143,0.1)' : 'rgba(42,157,143,0.08)', border: '1px solid', borderColor: isDark ? '#2A9D8F' : '#b2d8c4' }}>
                  <Typography variant="caption" color="text.secondary">Opening Cash (from {formatDate(dayData.previousRecord.date)})</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>{formatCurrency(opening)}</Typography>
                </Box>
              )}
              <TextField
                label="Today's Other Cash In" type="number" size="small" fullWidth
                value={otherCashIn} onChange={e => setOtherCashIn(e.target.value)}
                disabled={isReadOnly} helperText="Owner cash deposit, misc cash income"
                sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              />
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Physical Cash Count</Typography>
                {!isReadOnly && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant={!denomMode ? 'contained' : 'outlined'}
                      onClick={() => setDenomMode(false)}
                      sx={{ fontSize: '0.7rem' }}
                    >
                      Direct Entry
                    </Button>
                    <Button
                      size="small"
                      variant={denomMode ? 'contained' : 'outlined'}
                      onClick={() => setDenomMode(true)}
                      sx={{ fontSize: '0.7rem' }}
                    >
                      By Denomination
                    </Button>
                  </Box>
                )}
              </Box>

              {/* Direct entry */}
              {(!denomMode || isReadOnly) && (
                <TextField
                  label="Actual Closing Cash (Physical Count)" type="number" size="small" fullWidth required
                  value={denomMode && isReadOnly ? String(actualVal) : actualClosing}
                  onChange={e => setActualClosing(e.target.value)}
                  disabled={isReadOnly} helperText="Count the physical cash in the till"
                  sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              )}

              {/* Denomination table */}
              {denomMode && !isReadOnly && (
                <Paper variant="outlined" sx={{
                  mb: 2, borderRadius: 1.5, overflow: 'hidden',
                  border: `1px solid ${isDark ? 'rgba(42,157,143,0.35)' : 'rgba(42,157,143,0.3)'}`,
                }}>
                  {/* Table header */}
                  <Box sx={{
                    display: 'grid', gridTemplateColumns: '1fr 120px 120px',
                    px: 1.5, py: 1,
                    background: isDark
                      ? 'linear-gradient(90deg, #1a3a2a 0%, #1D3557 100%)'
                      : 'linear-gradient(90deg, #1a7a6e 0%, #2A9D8F 100%)',
                  }}>
                    {['Denomination', 'Quantity', 'Amount (Rs.)'].map((h, i) => (
                      <Typography key={h} variant="caption" sx={{
                        fontWeight: 700, color: '#fff', fontSize: '0.68rem',
                        textTransform: 'uppercase', letterSpacing: 0.6,
                        textAlign: i === 0 ? 'left' : 'right',
                      }}>{h}</Typography>
                    ))}
                  </Box>

                  {/* Rows */}
                  {DENOMINATIONS.map((d, idx) => {
                    const qty = parseInt(denoms[d] || '0', 10) || 0;
                    const amt = d * qty;
                    const isActive = qty > 0;
                    const stripe = idx % 2 === 1
                      ? isDark ? 'rgba(255,255,255,0.025)' : 'rgba(42,157,143,0.03)'
                      : 'transparent';
                    return (
                      <Box key={d} sx={{
                        display: 'grid', gridTemplateColumns: '1fr 120px 120px',
                        alignItems: 'center', px: 1.5, py: 0.6,
                        bgcolor: isActive
                          ? isDark ? 'rgba(42,157,143,0.1)' : 'rgba(42,157,143,0.07)'
                          : stripe,
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        transition: 'background 0.15s',
                      }}>
                        {/* Denomination badge */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{
                            px: 1, py: 0.25, borderRadius: 1,
                            bgcolor: isActive
                              ? isDark ? 'rgba(42,157,143,0.3)' : 'rgba(42,157,143,0.15)'
                              : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                            border: `1px solid ${isActive
                              ? isDark ? '#2A9D8F' : 'rgba(42,157,143,0.4)'
                              : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            minWidth: 52, textAlign: 'center',
                          }}>
                            <Typography variant="body2" sx={{
                              fontWeight: 700,
                              color: 'text.primary',
                            }}>
                              Rs. {d.toLocaleString()}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Stepper input */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          <Box
                            component="button"
                            onClick={() => setDenoms(prev => ({ ...prev, [d]: String(Math.max(0, (parseInt(prev[d] || '0', 10) || 0) - 1) ) }))}
                            sx={{
                              width: 22, height: 22, border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                              borderRadius: 0.5, bgcolor: 'transparent', cursor: 'pointer',
                              color: 'text.secondary', fontSize: '1rem', lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                            }}
                          >−</Box>
                          <TextField
                            size="small" type="number" variant="outlined"
                            value={denoms[d] ?? ''}
                            onChange={e => setDenoms(prev => ({ ...prev, [d]: e.target.value }))}
                            sx={{
                              width: 52,
                              '& .MuiOutlinedInput-root': { borderRadius: 0.5 },
                              '& .MuiOutlinedInput-input': {
                                textAlign: 'center', py: 0.4, px: 0.5,
                                fontSize: '0.875rem', fontWeight: isActive ? 700 : 400,
                              },
                            }}
                            slotProps={{ htmlInput: { min: 0, step: 1 } }}
                          />
                          <Box
                            component="button"
                            onClick={() => setDenoms(prev => ({ ...prev, [d]: String((parseInt(prev[d] || '0', 10) || 0) + 1) }))}
                            sx={{
                              width: 22, height: 22, border: `1px solid ${isDark ? 'rgba(42,157,143,0.5)' : 'rgba(42,157,143,0.4)'}`,
                              borderRadius: 0.5, bgcolor: isDark ? 'rgba(42,157,143,0.15)' : 'rgba(42,157,143,0.1)',
                              cursor: 'pointer', color: 'success.main', fontSize: '1rem', lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              '&:hover': { bgcolor: isDark ? 'rgba(42,157,143,0.25)' : 'rgba(42,157,143,0.18)' },
                            }}
                          >+</Box>
                        </Box>

                        {/* Amount */}
                        <Typography variant="body2" sx={{
                          textAlign: 'right', fontWeight: isActive ? 700 : 400,
                          color: isActive ? 'text.primary' : 'text.disabled',
                        }}>
                          {isActive ? formatCurrency(amt) : '—'}
                        </Typography>
                      </Box>
                    );
                  })}

                  {/* Total row */}
                  <Box sx={{
                    display: 'grid', gridTemplateColumns: '1fr 120px 120px',
                    alignItems: 'center', px: 1.5, py: 1,
                    background: isDark
                      ? 'linear-gradient(90deg, rgba(42,157,143,0.22) 0%, rgba(26,122,110,0.15) 100%)'
                      : 'linear-gradient(90deg, rgba(42,157,143,0.12) 0%, rgba(42,157,143,0.07) 100%)',
                    borderTop: `2px solid ${isDark ? '#2A9D8F' : 'rgba(42,157,143,0.5)'}`,
                  }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.72rem', color: 'text.secondary' }}>
                      Total Cash Counted
                    </Typography>
                    <Box />
                    <Typography variant="body1" sx={{
                      textAlign: 'right', fontWeight: 800,
                      color: denomTotalVal > 0 ? 'success.main' : 'text.disabled',
                      fontFamily: 'monospace', fontSize: '0.95rem',
                    }}>
                      {denomTotalVal > 0
                        ? `Rs. ${denomTotalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : '—'}
                    </Typography>
                  </Box>
                </Paper>
              )}
              <TextField
                label="Notes" size="small" fullWidth multiline minRows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                disabled={isReadOnly} placeholder="Any remarks or observations for this reconciliation"
                sx={{ mb: 2 }}
              />
              {!isReadOnly && (
                <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void handleSave()} loading={saveMutation.isPending} fullWidth
                  sx={{ background: 'linear-gradient(90deg, #2A9D8F 0%, #1a7a6e 100%)', '&:hover': { background: 'linear-gradient(90deg, #1a7a6e 0%, #115e55 100%)' } }}>
                  Save Cash Reconciliation
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Right: calculation panels */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', mb: 2 }}>
            <SectionHeader title="Cash Book Calculation" />
            <Box sx={{ p: 1.5 }}>
              <ColHeader />
              <Box sx={sectionBox(sectionBg.opening, sectionBg.openingBorder)}>
                <LineRow label="Opening Cash (A)" value={opening} bold subtotal={opening} />
              </Box>
              <Box sx={sectionBox(sectionBg.inflow, sectionBg.inflowBorder)}>
                <Typography variant="caption" color="success.main" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', mb: 0.75 }}>Inflows</Typography>
                <LineRow label="Cash Sales In (B)" value={cashSalesIn} />
                <LineRow label="Other Cash In (C)" value={otherCashInVal} />
                <LineRow label="Transfers In (D)" value={transfersIn} />
                <LineRow label="Adjustments In (E)" value={adjustmentsIn} />
                <LineRow label="Custody Return (F)" value={custodyIn} subtotal={inflowsSum} />
              </Box>
              <Box sx={sectionBox(sectionBg.outflow, sectionBg.outflowBorder)}>
                <Typography variant="caption" color="error.main" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', mb: 0.75 }}>Outflows</Typography>
                <LineRow label="Cash Expenses (G) −" value={cashExpenses} minus />
                <LineRow label="Transfers Out (H) −" value={transfersOut} minus />
                <LineRow label="Adjustments Out (I) −" value={adjustmentsOut} minus />
                <LineRow label="Custody Take (J) −" value={custodyOut} minus subtotal={outflowsSum} />
              </Box>
              <Box sx={sectionBox(sectionBg.expected, sectionBg.expectedBorder, 0)}>
                <LineRow label="Expected Closing (A+B+C+D+E+F−G−H−I−J)" value={expectedClosing} bold subtotal={expectedClosing} />
              </Box>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <SectionHeader title="Actual vs Expected" />
            <Box sx={{ p: 1.5 }}>
              <ColHeader />
              <Box sx={sectionBox(sectionBg.opening, sectionBg.openingBorder)}>
                <LineRow label="Actual Closing Cash (Physical Count)" value={null} bold subtotal={actualVal} />
              </Box>
              <Box sx={sectionBox(sectionBg.expected, sectionBg.expectedBorder)}>
                <LineRow label="Expected Closing Cash" value={null} bold subtotal={expectedClosing} />
              </Box>
              <Box sx={sectionBox(sectionBg.diff, sectionBg.diffBorder, 0)}>
                <LineRow
                  label="Difference"
                  value={null}
                  bold
                  minus={!isReconciled && difference < 0}
                  subtotal={difference}
                />
                {!isReconciled && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    {difference > 0
                      ? `Cash surplus of ${formatCurrency(Math.abs(difference))} — more cash than expected.`
                      : `Cash shortage of ${formatCurrency(Math.abs(difference))} — less cash than expected.`}
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

function CashHistoryTab({ onEdit }: { onEdit: (date: string) => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const formatDate = useFormatDate();
  const { data, isLoading } = useCashReconciliationList();
  const records = data?.data ?? [];
  const [selected, setSelected] = useState<CashReconciliation | null>(null);

  const colBorder = `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`;
  const groupColBorder = `2px solid ${isDark ? '#2A9D8F' : '#b2d8c4'}`;
  const headSx = {
    fontWeight: 700, color: '#fff', fontSize: '0.75rem',
    borderRight: colBorder, '&:last-child': { borderRight: 'none' },
    whiteSpace: 'nowrap' as const, py: 1.25,
  };
  const groupHeadSx = { ...headSx, borderLeft: groupColBorder };

  return (
    <Box>
      {records.length === 0 && !isLoading && (
        <Alert severity="info">No cash reconciliations saved yet. Use the Entry tab to create one.</Alert>
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
          <Grid container spacing={1.5}>
            {[
              { title: 'Opening Cash (A)', val: selected.openingCash },
              { title: 'Cash Sales (B)', val: selected.todayCashSalesIn },
              { title: 'Other Cash In (C)', val: selected.todayOtherCashIn },
              { title: 'Cash Expenses (G)', val: selected.todayCashExpenses },
              { title: 'Expected Closing', val: selected.expectedClosingCash },
              { title: 'Actual Closing', val: selected.actualClosingCash },
              { title: 'Difference', val: selected.difference },
            ].map(({ title, val }) => (
              <Grid key={title} size={{ xs: 6, sm: 4 }}>
                <StatCard title={title} value={formatCurrency(val)} gradient={['#1D3557', '#2A9D8F']} color="#fff" sx={{ '& .MuiTypography-root': { color: '#fff !important' } }} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      {records.length > 0 && (
        <Paper variant="outlined" sx={{ overflowX: 'auto', borderRadius: 2, border: `1px solid ${isDark ? '#2A4F3F' : '#b2d8c4'}` }}>
          <Table size="small" sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow sx={{ background: isDark ? 'linear-gradient(90deg, #1a3a2a 0%, #1D3557 100%)' : 'linear-gradient(90deg, #1a7a6e 0%, #2A9D8F 100%)' }}>
                <TableCell sx={headSx}>Date</TableCell>
                <TableCell sx={headSx}>Type</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Opening Cash (A)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Cash Sales (B)</TableCell>
                <TableCell align="right" sx={headSx}>Other In (C)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Cash Expenses (G)</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Expected Closing</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Actual Closing</TableCell>
                <TableCell align="right" sx={groupHeadSx}>Difference</TableCell>
                <TableCell sx={headSx}>Status</TableCell>
                <TableCell sx={headSx}>Saved By</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((r: CashReconciliation, idx: number) => {
                const reconciled = Math.abs(r.difference) < 0.01;
                const isSelected = selected?.date === r.date;
                const stripe = isDark ? idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)' : idx % 2 === 0 ? 'transparent' : 'rgba(42,157,143,0.03)';
                const cellSx = { borderBottom: `1px solid ${isDark ? '#2A4F3F' : '#E8ECF0'}`, borderRight: colBorder, '&:last-child': { borderRight: 'none' } };
                const grpSx = { ...cellSx, borderLeft: groupColBorder };
                return (
                  <TableRow key={r.date} hover selected={isSelected} onClick={() => setSelected(isSelected ? null : r)} sx={{ backgroundColor: stripe, cursor: 'pointer' }}>
                    <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{formatDate(r.date)}</TableCell>
                    <TableCell sx={cellSx}><Chip label={r.isInitial ? 'Initial' : 'Regular'} size="small" variant="outlined" color={r.isInitial ? 'warning' : 'default'} /></TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.openingCash)}</TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.todayCashSalesIn)}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(r.todayOtherCashIn)}</TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.todayCashExpenses)}</TableCell>
                    <TableCell align="right" sx={{ ...grpSx, fontWeight: 700 }}>{formatCurrency(r.expectedClosingCash)}</TableCell>
                    <TableCell align="right" sx={grpSx}>{formatCurrency(r.actualClosingCash)}</TableCell>
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

export function CashReconciliationPanel() {
  const [tab, setTab] = useState(0);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box>
      <Paper variant="outlined" sx={{ mb: 2, background: isDark ? 'linear-gradient(90deg, #1a3a2a 0%, #1D3557 100%)' : 'linear-gradient(90deg, #1a7a6e 0%, #2A9D8F 100%)', borderColor: 'transparent', borderRadius: 2, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,0.65)', fontWeight: 600 }, '& .Mui-selected': { color: '#fff !important' }, '& .MuiTabs-indicator': { backgroundColor: '#fff', height: 3 } }}>
          <Tab label="Entry" />
          <Tab label="History" />
        </Tabs>
      </Paper>
      {tab === 0 && <CashEntryTab onSaved={() => setTab(1)} />}
      {tab === 1 && <CashHistoryTab onEdit={date => { sessionStorage.setItem('cash_recon_edit_date', date); setTab(0); }} />}
    </Box>
  );
}
