import { useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select, TextField, Typography, useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import TuneIcon from '@mui/icons-material/Tune';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { BankReconciliationPanel } from './BankReconciliationPanel';
import { CashReconciliationPanel } from './CashReconciliationPanel';
import { useTakeCashCustody, useReturnCashCustody, useDepositCashCustody, useCashCustodies, useCashCustodySummary } from '@/hooks/useCashCustody';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { useAuthStore } from '@/store';
import { formatCurrency, formatSignedCurrency, isAdminOrManager } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useWalletAdjustment, useWalletLedger } from '@/hooks/useWallets';
import { PAYMENT_METHODS } from '@/constants';

function walletLabel(code: string) {
  return PAYMENT_METHODS.find((p) => p.value === code)?.label ?? code;
}

function entryTypeLabel(type: string) {
  const map: Record<string, string> = {
    sale: 'Sale', expense: 'Expense', po_payment: 'PO Payment',
    purchase_return: 'Purchase Return', transfer: 'Transfer',
    adjustment: 'Adjustment', opening: 'Opening',
    void_reversal: 'Void Reversal', custody: 'Custody',
  };
  return map[type] ?? type;
}

function referencePath(row: WalletLedgerEntry): string | null {
  const id = row.referenceId;
  if (!id) return null;
  if (row.referenceType === 'sale' || row.referenceType === 'transaction') return `/sales/${id}`;
  if (row.referenceType === 'expense') return `/expenses/${id}`;
  if (row.referenceType === 'purchase_order' || row.referenceType === 'po') return `/purchase-orders/${id}`;
  return null;
}

function statementLabel(row: WalletLedgerEntry, transferPeer?: WalletLedgerEntry): string {
  if (row.entryType === 'transfer' && transferPeer) {
    const from = row.direction === 'out' ? row.wallet : transferPeer.wallet;
    const to = row.direction === 'in' ? row.wallet : transferPeer.wallet;
    return `Transfer · ${walletLabel(String(from))} → ${walletLabel(String(to))}`;
  }
  return entryTypeLabel(row.entryType);
}

import type { CashCustody, WalletCode, WalletLedgerEntry } from '@/types';

const WALLET_CHIP: Record<string, { bg: string; darkBg: string; color: string; darkColor: string }> = {
  cash:  { bg: 'rgba(42,157,143,0.12)',  darkBg: 'rgba(42,157,143,0.22)',  color: '#1a7a6e', darkColor: '#4fd1c5' },
  bank:  { bg: 'rgba(29,53,87,0.1)',     darkBg: 'rgba(69,123,157,0.25)',  color: '#1D3557', darkColor: '#90caf9' },
  esewa: { bg: 'rgba(233,196,106,0.18)', darkBg: 'rgba(233,196,106,0.22)', color: '#92400e', darkColor: '#fbbf24' },
};

const TYPE_CHIP: Record<string, { bg: string; darkBg: string; color: string; darkColor: string }> = {
  sale:            { bg: 'rgba(42,157,143,0.1)',   darkBg: 'rgba(42,157,143,0.2)',   color: '#1a7a6e', darkColor: '#4fd1c5' },
  expense:         { bg: 'rgba(230,57,70,0.1)',    darkBg: 'rgba(230,57,70,0.2)',    color: '#b91c1c', darkColor: '#f87171' },
  po_payment:      { bg: 'rgba(29,53,87,0.1)',     darkBg: 'rgba(69,123,157,0.2)',   color: '#1D3557', darkColor: '#90caf9' },
  purchase_return: { bg: 'rgba(233,196,106,0.15)', darkBg: 'rgba(233,196,106,0.2)',  color: '#92400e', darkColor: '#fbbf24' },
  transfer:        { bg: 'rgba(139,92,246,0.1)',   darkBg: 'rgba(139,92,246,0.2)',   color: '#6d28d9', darkColor: '#c4b5fd' },
  adjustment:      { bg: 'rgba(249,115,22,0.1)',   darkBg: 'rgba(249,115,22,0.2)',   color: '#c2410c', darkColor: '#fb923c' },
  custody:         { bg: 'rgba(180,83,9,0.1)',     darkBg: 'rgba(180,83,9,0.2)',     color: '#92400e', darkColor: '#fbbf24' },
  opening:         { bg: 'rgba(100,116,139,0.1)',  darkBg: 'rgba(100,116,139,0.2)',  color: '#475569', darkColor: '#94a3b8' },
  void_reversal:   { bg: 'rgba(239,68,68,0.1)',    darkBg: 'rgba(239,68,68,0.2)',    color: '#dc2626', darkColor: '#fca5a5' },
};

function todayIsoStr() {
  return new Date().toISOString().slice(0, 10);
}

type ReconType = 'cash' | 'bank';

export function ReconciliationPage() {
  const [type, setType] = useState<ReconType | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const formatDate = useFormatDate();
  const user = useAuthStore((s) => s.user);
  const canAdjust = isAdminOrManager(user?.role);
  const [custodyExpanded, setCustodyExpanded] = useState(false);
  const [walletExpanded, setWalletExpanded] = useState(false);

  // Wallet statement state
  const [walletFilter, setWalletFilter] = useState<'' | WalletCode>('');
  const [entryTypeFilter, setEntryTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(todayIsoStr);
  const [dateTo, setDateTo] = useState(todayIsoStr);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);

  const ledgerParams = useMemo(() => ({
    wallet: walletFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    entryType: entryTypeFilter || undefined,
    limit: 200,
  }), [walletFilter, dateFrom, dateTo, entryTypeFilter]);

  const { data: ledger = [], isLoading: ledgerLoading } = useWalletLedger(ledgerParams, canAdjust);

  const transferPeers = useMemo(() => {
    const map = new Map<string, WalletLedgerEntry>();
    for (const row of ledger) {
      if (!row.transferId || row.entryType !== 'transfer') continue;
      const peer = ledger.find((o) => o.id !== row.id && o.transferId === row.transferId && o.entryType === 'transfer');
      if (peer) map.set(row.id, peer);
    }
    return map;
  }, [ledger]);

  const displayLedger = useMemo(() => {
    const seen = new Set<string>();
    const rows: WalletLedgerEntry[] = [];
    for (const row of ledger) {
      if (row.entryType === 'transfer' && row.transferId) {
        if (seen.has(row.transferId)) continue;
        seen.add(row.transferId);
      }
      rows.push(row);
    }
    return rows;
  }, [ledger]);

  const ledgerColumns = useMemo<Column<WalletLedgerEntry>[]>(() => [
    {
      id: 'wallet', label: 'Wallet',
      render: (row) => {
        const isTransfer = row.entryType === 'transfer' && row.transferId;
        if (isTransfer) {
          const peer = transferPeers.get(row.id);
          if (peer) {
            const from = row.direction === 'out' ? row.wallet : peer.wallet;
            const to   = row.direction === 'in'  ? row.wallet : peer.wallet;
            const fk = WALLET_CHIP[String(from)] ?? WALLET_CHIP.cash;
            const tk = WALLET_CHIP[String(to)]   ?? WALLET_CHIP.bank;
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip size="small" label={walletLabel(String(from))} sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: isDark ? fk.darkBg : fk.bg, color: isDark ? fk.darkColor : fk.color, border: 'none' }} />
                <Typography variant="caption" color="text.disabled">→</Typography>
                <Chip size="small" label={walletLabel(String(to))}   sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: isDark ? tk.darkBg : tk.bg, color: isDark ? tk.darkColor : tk.color, border: 'none' }} />
              </Box>
            );
          }
        }
        const wk = WALLET_CHIP[String(row.wallet)] ?? { bg: 'rgba(100,116,139,0.1)', darkBg: 'rgba(100,116,139,0.2)', color: '#475569', darkColor: '#94a3b8' };
        return <Chip size="small" label={walletLabel(String(row.wallet))} sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: isDark ? wk.darkBg : wk.bg, color: isDark ? wk.darkColor : wk.color, border: 'none' }} />;
      },
    },
    {
      id: 'entryType', label: 'Type',
      render: (row) => {
        const label = statementLabel(row, transferPeers.get(row.id));
        const baseType = row.entryType === 'transfer' ? 'transfer' : row.entryType;
        const tk = TYPE_CHIP[baseType] ?? { bg: 'rgba(100,116,139,0.1)', darkBg: 'rgba(100,116,139,0.2)', color: '#475569', darkColor: '#94a3b8' };
        return <Chip size="small" label={label} sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: isDark ? tk.darkBg : tk.bg, color: isDark ? tk.darkColor : tk.color, border: 'none', maxWidth: 220 }} />;
      },
    },
    {
      id: 'direction', label: 'Dir',
      render: (row) => {
        if (row.entryType === 'transfer' && row.transferId)
          return <Typography component="span" color="text.disabled" variant="body2">—</Typography>;
        const isIn = row.direction === 'in';
        return (
          <Chip
            size="small"
            label={isIn ? 'IN' : 'OUT'}
            sx={{
              fontWeight: 700, fontSize: '0.68rem', minWidth: 40, border: 'none',
              bgcolor: isIn
                ? isDark ? 'rgba(42,157,143,0.22)' : 'rgba(42,157,143,0.12)'
                : isDark ? 'rgba(230,57,70,0.22)'  : 'rgba(230,57,70,0.1)',
              color: isIn ? (isDark ? '#4fd1c5' : '#1a7a6e') : (isDark ? '#f87171' : '#b91c1c'),
            }}
          />
        );
      },
    },
    {
      id: 'amount', label: 'Amount', align: 'right' as const,
      render: (row) => {
        const isTransfer = row.entryType === 'transfer';
        const isIn = row.direction === 'in';
        const color = isTransfer ? (isDark ? 'rgba(255,255,255,0.85)' : '#1a1a2e') : isIn ? (isDark ? '#4fd1c5' : '#1a7a6e') : (isDark ? '#f87171' : '#b91c1c');
        return (
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end',
            px: 1, py: 0.25, borderRadius: 1,
            bgcolor: isTransfer
              ? isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
              : isIn
                ? isDark ? 'rgba(42,157,143,0.12)' : 'rgba(42,157,143,0.08)'
                : isDark ? 'rgba(230,57,70,0.12)'  : 'rgba(230,57,70,0.07)',
          }}>
            <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.82rem', color }}>
              {isTransfer ? formatCurrency(row.amount) : formatSignedCurrency(row.amount, row.direction)}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: 'remarks', label: 'Remarks',
      render: (row) => {
        const path = referencePath(row);
        if (path) return <RouterLink to={path} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>{row.remarks || 'View'}</RouterLink>;
        return <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{row.remarks || '—'}</Typography>;
      },
    },
  ], [transferPeers, isDark]);

  const pagedLedger = useMemo(() => {
    const start = ledgerPage * ledgerPageSize;
    return displayLedger.slice(start, start + ledgerPageSize);
  }, [displayLedger, ledgerPage, ledgerPageSize]);

  // Adjust state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWallet, setAdjustWallet] = useState<WalletCode>('cash');
  const [adjustDirection, setAdjustDirection] = useState<'in' | 'out'>('in');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDate, setAdjustDate] = useState(todayIsoStr);
  const [adjustRemarks, setAdjustRemarks] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // Take cash state
  const [takeOpen, setTakeOpen] = useState(false);
  const [takeAmount, setTakeAmount] = useState('');
  const [takeHolderId, setTakeHolderId] = useState('');
  const [takeDate, setTakeDate] = useState(todayIsoStr);
  const [takeRemarks, setTakeRemarks] = useState('');
  const [takeError, setTakeError] = useState('');

  // Resolve (return/deposit) state
  const [resolveOpen, setResolveOpen] = useState<CashCustody | null>(null);
  const [resolveMode, setResolveMode] = useState<'return' | 'deposit'>('return');
  const [resolveDate, setResolveDate] = useState(todayIsoStr);
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [depositWallet, setDepositWallet] = useState<'bank' | 'esewa'>('bank');
  const [resolveError, setResolveError] = useState('');

  const { data: assignableUsers = [] } = useAssignableUsers();
  const { data: openCustodies = [] } = useCashCustodies({ status: 'held' }, canAdjust);
  const { data: custodySummary } = useCashCustodySummary(canAdjust);
  const adjustMutation = useWalletAdjustment();
  const takeMutation = useTakeCashCustody();
  const returnMutation = useReturnCashCustody();
  const depositMutation = useDepositCashCustody();

  const resetAdjust = () => {
    setAdjustWallet('cash'); setAdjustDirection('in'); setAdjustAmount('');
    setAdjustDate(todayIsoStr()); setAdjustRemarks(''); setAdjustError('');
  };

  const handleAdjust = async () => {
    setAdjustError('');
    const amount = parseFloat(adjustAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setAdjustError('Enter a valid amount greater than zero.'); return; }
    if (!adjustRemarks.trim()) { setAdjustError('Remarks are required.'); return; }
    try {
      await adjustMutation.mutateAsync({ wallet: adjustWallet, amount, direction: adjustDirection, date: adjustDate, remarks: adjustRemarks.trim() });
      showSuccess('Adjustment recorded.');
      setAdjustOpen(false);
      resetAdjust();
    } catch (err) { setAdjustError(getErrorMessage(err)); }
  };

  const resetTake = () => {
    setTakeAmount(''); setTakeHolderId(''); setTakeDate(todayIsoStr()); setTakeRemarks(''); setTakeError('');
  };

  const handleTake = async () => {
    setTakeError('');
    const amount = parseFloat(takeAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setTakeError('Enter a valid amount greater than zero.'); return; }
    if (!takeHolderId) { setTakeError('Select who is holding the cash.'); return; }
    if (!takeRemarks.trim()) { setTakeError('Remarks are required.'); return; }
    try {
      await takeMutation.mutateAsync({ amount, heldByUserId: takeHolderId, takenDate: takeDate, remarks: takeRemarks.trim() });
      showSuccess('Cash taken into staff custody.');
      setTakeOpen(false);
      resetTake();
    } catch (err) { setTakeError(getErrorMessage(err)); }
  };

  const handleResolve = async () => {
    if (!resolveOpen) return;
    setResolveError('');
    try {
      if (resolveMode === 'return') {
        await returnMutation.mutateAsync({ id: resolveOpen.id, payload: { resolvedDate: resolveDate, remarks: resolveRemarks.trim() } });
        showSuccess('Cash returned to till.');
      } else {
        await depositMutation.mutateAsync({ id: resolveOpen.id, payload: { wallet: depositWallet, resolvedDate: resolveDate, remarks: resolveRemarks.trim() } });
        showSuccess(`Cash deposited to ${depositWallet}.`);
      }
      setResolveOpen(null);
      setResolveRemarks('');
    } catch (err) { setResolveError(getErrorMessage(err)); }
  };

  return (
    <Box>
      <PageHeader
        title="Reconciliation"
        subtitle="Daily reconciliation — select Cash Book or Bank & FonePay"
        breadcrumbs={[{ label: 'Reconciliation' }]}
        action={
          canAdjust ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<PersonIcon />}
                onClick={() => { resetTake(); setTakeOpen(true); }}
              >
                Take Cash
              </Button>
              <Button
                variant="contained"
                startIcon={<TuneIcon />}
                onClick={() => { resetAdjust(); setAdjustOpen(true); }}
              >
                Adjust
              </Button>
            </Box>
          ) : undefined
        }
      />

      {/* Cash with staff panel */}
      {canAdjust && (custodySummary?.byHolder?.length ?? 0) > 0 && (
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden', borderColor: isDark ? '#3a2a10' : '#f5c97a' }}>
          {/* Header */}
          <Box
            onClick={() => setCustodyExpanded((v) => !v)}
            sx={{
              px: 2, py: 1.25, cursor: 'pointer',
              background: isDark
                ? 'linear-gradient(90deg, #3a2a10 0%, #5a3e10 100%)'
                : 'linear-gradient(90deg, #b45309 0%, #d97706 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              userSelect: 'none',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon sx={{ color: '#fff', fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Cash with Staff
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`Total: ${formatCurrency(custodySummary?.totalHeld ?? 0)}`}
                size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}
              />
              <ExpandMoreIcon sx={{ color: '#fff', fontSize: 20, transition: 'transform 0.2s', transform: custodyExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </Box>
          </Box>

          {/* Cards */}
          <Collapse in={custodyExpanded}>
            <Box sx={{ p: 2 }}>
              <Grid container spacing={1.5}>
                {openCustodies.map((row) => (
                <Grid key={row.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2, height: '100%',
                      borderColor: isDark ? 'rgba(217,119,6,0.3)' : 'rgba(180,83,9,0.2)',
                      background: isDark ? 'rgba(58,42,16,0.4)' : 'rgba(255,251,235,0.8)',
                      display: 'flex', flexDirection: 'column', gap: 1.5,
                    }}
                  >
                    {/* Person row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: isDark ? '#b45309' : '#d97706', fontSize: '0.85rem', fontWeight: 700 }}>
                        {row.heldByName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>{row.heldByName}</Typography>
                        <Typography variant="caption" color="text.secondary">Taken {formatDate(row.takenDate)}</Typography>
                      </Box>
                      <Chip
                        label={formatCurrency(row.amount)}
                        size="small"
                        sx={{ fontWeight: 700, bgcolor: isDark ? 'rgba(217,119,6,0.25)' : 'rgba(180,83,9,0.12)', color: isDark ? '#fbbf24' : '#92400e' }}
                      />
                    </Box>

                    {/* Remarks */}
                    {row.remarks && (
                      <Typography variant="caption" color="text.secondary" sx={{
                        px: 1, py: 0.5, borderRadius: 0.75,
                        bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        display: 'block', fontStyle: 'italic',
                      }}>
                        {row.remarks}
                      </Typography>
                    )}

                    <Divider />

                    {/* Actions */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small" variant="outlined" fullWidth
                        sx={{ borderColor: isDark ? 'rgba(217,119,6,0.5)' : 'rgba(180,83,9,0.4)', color: isDark ? '#fbbf24' : '#92400e' }}
                        onClick={() => { setResolveOpen(row); setResolveMode('return'); setResolveDate(todayIsoStr()); setResolveRemarks(''); setResolveError(''); }}
                      >
                        Return
                      </Button>
                      <Button
                        size="small" variant="contained" fullWidth
                        sx={{ bgcolor: isDark ? '#b45309' : '#d97706', '&:hover': { bgcolor: isDark ? '#92400e' : '#b45309' } }}
                        onClick={() => { setResolveOpen(row); setResolveMode('deposit'); setResolveDate(todayIsoStr()); setResolveRemarks(''); setDepositWallet('bank'); setResolveError(''); }}
                      >
                        Deposit
                      </Button>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
          </Collapse>
        </Paper>
      )}

      {/* Wallet Statement panel */}
      {canAdjust && (
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden', borderColor: isDark ? '#1a3a5c' : '#90caf9' }}>
          {/* Header */}
          <Box
            onClick={() => setWalletExpanded((v) => !v)}
            sx={{
              px: 2, py: 1.25, cursor: 'pointer',
              background: isDark
                ? 'linear-gradient(90deg, #1D3557 0%, #2A3F5F 100%)'
                : 'linear-gradient(90deg, #1D3557 0%, #457B9D 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              userSelect: 'none',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon sx={{ color: '#fff', fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Wallet Statement
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`${displayLedger.length} entries`}
                size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}
              />
              <ExpandMoreIcon sx={{ color: '#fff', fontSize: 20, transition: 'transform 0.2s', transform: walletExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </Box>
          </Box>

          <Collapse in={walletExpanded}>
            <Box sx={{ p: 2 }}>
              {/* Filters */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Wallet</InputLabel>
                  <Select label="Wallet" value={walletFilter} onChange={(e) => { setWalletFilter(e.target.value as '' | WalletCode); setLedgerPage(0); }}>
                    <MenuItem value="">All</MenuItem>
                    {PAYMENT_METHODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Entry type</InputLabel>
                  <Select label="Entry type" value={entryTypeFilter} onChange={(e) => { setEntryTypeFilter(e.target.value); setLedgerPage(0); }}>
                    <MenuItem value="">All</MenuItem>
                    {['sale', 'expense', 'po_payment', 'purchase_return', 'transfer', 'adjustment', 'custody'].map((t) => (
                      <MenuItem key={t} value={t}>{entryTypeLabel(t)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <NepaliAwareDatePicker label="From" value={dateFrom} onChange={(v) => { setDateFrom(v); setLedgerPage(0); }} size="small" />
                <NepaliAwareDatePicker label="To" value={dateTo} onChange={(v) => { setDateTo(v); setLedgerPage(0); }} size="small" />
              </Box>
              <DataTable
                columns={ledgerColumns}
                rows={pagedLedger}
                loading={ledgerLoading}
                page={ledgerPage}
                pageSize={ledgerPageSize}
                total={displayLedger.length}
                onPageChange={setLedgerPage}
                onPageSizeChange={(size) => { setLedgerPageSize(size); setLedgerPage(0); }}
                emptyMessage="No ledger entries in this range."
                getRowId={(row) => row.id}
              />
            </Box>
          </Collapse>
        </Paper>
      )}

      {/* Type selector */}
      <Paper
        variant="outlined"
        sx={{
          mb: 3, p: 2,
          background: isDark
            ? 'linear-gradient(135deg, #1A2332 0%, #1D3557 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #EEF4FB 100%)',
          borderColor: isDark ? '#2A3F5F' : '#C5D8EE',
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Select Reconciliation Type
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant={type === 'cash' ? 'contained' : 'outlined'}
            startIcon={<LocalAtmIcon />}
            onClick={() => setType('cash')}
            size="large"
            sx={
              type === 'cash'
                ? { background: 'linear-gradient(90deg, #2A9D8F 0%, #1a7a6e 100%)', color: '#fff', fontWeight: 700, px: 3, '&:hover': { background: 'linear-gradient(90deg, #1a7a6e 0%, #115e55 100%)' } }
                : { borderColor: isDark ? '#2A9D8F' : '#2A9D8F', color: isDark ? '#2A9D8F' : '#1a7a6e', fontWeight: 600, px: 3 }
            }
          >
            Cash Reconciliation
          </Button>
          <Button
            variant={type === 'bank' ? 'contained' : 'outlined'}
            startIcon={<AccountBalanceIcon />}
            onClick={() => setType('bank')}
            size="large"
            sx={
              type === 'bank'
                ? { background: 'linear-gradient(90deg, #1D3557 0%, #457B9D 100%)', color: '#fff', fontWeight: 700, px: 3, '&:hover': { background: 'linear-gradient(90deg, #457B9D 0%, #1D3557 100%)' } }
                : { borderColor: isDark ? '#457B9D' : '#1D3557', color: isDark ? '#90CAF9' : '#1D3557', fontWeight: 600, px: 3 }
            }
          >
            Bank & FonePay Reconciliation
          </Button>
        </Box>
      </Paper>

      {type === null && (
        <Paper
          variant="outlined"
          sx={{
            p: 4, textAlign: 'center',
            borderColor: isDark ? '#2A3F5F' : '#C5D8EE',
            background: isDark ? 'rgba(29,53,87,0.15)' : 'rgba(29,53,87,0.03)',
          }}
        >
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Choose a reconciliation type above to get started
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use <strong>Cash Reconciliation</strong> to reconcile your daily cash book (opening → closing cash count).<br />
            Use <strong>Bank & FonePay Reconciliation</strong> to reconcile bank and FonePay closing balances.
          </Typography>
        </Paper>
      )}

      {type === 'cash' && <CashReconciliationPanel />}
      {type === 'bank' && <BankReconciliationPanel />}

      {/* Adjust dialog */}
      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Adjust wallet balance</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {adjustError && <Alert severity="error">{adjustError}</Alert>}
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Wallet</InputLabel>
            <Select label="Wallet" value={adjustWallet} onChange={(e) => setAdjustWallet(e.target.value as WalletCode)}>
              {PAYMENT_METHODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Direction</InputLabel>
            <Select label="Direction" value={adjustDirection} onChange={(e) => setAdjustDirection(e.target.value as 'in' | 'out')}>
              <MenuItem value="in">In</MenuItem>
              <MenuItem value="out">Out</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Amount" type="number" size="small" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
          <NepaliAwareDatePicker label="Date" value={adjustDate} onChange={setAdjustDate} size="small" />
          <TextField label="Remarks" size="small" value={adjustRemarks} onChange={(e) => setAdjustRemarks(e.target.value)} multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleAdjust()} loading={adjustMutation.isPending}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Take Cash dialog */}
      <Dialog open={takeOpen} onClose={() => setTakeOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Take cash (staff custody)</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {takeError && <Alert severity="error">{takeError}</Alert>}
          <TextField label="Amount" type="number" size="small" sx={{ mt: 1 }} value={takeAmount} onChange={(e) => setTakeAmount(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
          <FormControl fullWidth size="small">
            <InputLabel>Held by</InputLabel>
            <Select label="Held by" value={takeHolderId} onChange={(e) => setTakeHolderId(e.target.value)}>
              {assignableUsers.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
            </Select>
          </FormControl>
          <NepaliAwareDatePicker label="Date" value={takeDate} onChange={setTakeDate} size="small" />
          <TextField label="Remarks" size="small" value={takeRemarks} onChange={(e) => setTakeRemarks(e.target.value)} multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTakeOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleTake()} loading={takeMutation.isPending}>Take cash</Button>
        </DialogActions>
      </Dialog>

      {/* Return / Deposit dialog */}
      <Dialog open={!!resolveOpen} onClose={() => setResolveOpen(null)} fullWidth maxWidth="sm">
        <DialogTitle>{resolveMode === 'return' ? 'Return cash to till' : 'Deposit cash from custody'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {resolveError && <Alert severity="error">{resolveError}</Alert>}
          {resolveOpen && <Typography variant="body2" sx={{ mt: 1 }}>{resolveOpen.heldByName} · {formatCurrency(resolveOpen.amount)}</Typography>}
          {resolveMode === 'deposit' && (
            <FormControl fullWidth size="small">
              <InputLabel>Deposit to</InputLabel>
              <Select label="Deposit to" value={depositWallet} onChange={(e) => setDepositWallet(e.target.value as 'bank' | 'esewa')}>
                <MenuItem value="bank">Bank</MenuItem>
                <MenuItem value="esewa">eSewa</MenuItem>
              </Select>
            </FormControl>
          )}
          <NepaliAwareDatePicker label="Date" value={resolveDate} onChange={setResolveDate} size="small" />
          <TextField label="Remarks" size="small" value={resolveRemarks} onChange={(e) => setResolveRemarks(e.target.value)} multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveOpen(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleResolve()} loading={returnMutation.isPending || depositMutation.isPending}>
            {resolveMode === 'return' ? 'Return' : 'Deposit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
