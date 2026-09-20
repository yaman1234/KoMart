import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockCountService } from '@/services';
import { showApiError, showSuccess } from '@/utils/toast';
import { QUERY_KEYS } from '@/constants';
import { useAuthStore } from '@/store';
import type { StockCountItem } from '@/types';

export function StockCountCountPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [search, setSearch] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [qty, setQty] = useState('');
  const qtyRef = useRef<HTMLInputElement>(null);

  const { data: sc, isLoading } = useQuery({
    queryKey: QUERY_KEYS.stockCount(id!),
    queryFn: () => stockCountService.getById(id!),
    enabled: !!id,
  });

  const countMutation = useMutation({
    mutationFn: ({ productId, physicalQty }: { productId: string; physicalQty: number }) =>
      stockCountService.countItem(id!, productId, physicalQty),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.stockCount(id!) });
    },
    onError: (err) => showApiError(err, 'Failed to save count.'),
  });

  const isBlind = sc?.countMode === 'blind';
  const canCount = sc?.status === 'counting' || sc?.status === 'recount_required';

  const filteredItems = useMemo((): StockCountItem[] => {
    if (!sc) return [];
    const q = search.trim().toLowerCase();
    if (!q) return sc.items;
    return sc.items.filter(
      (i) =>
        i.productName.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q),
    );
  }, [sc, search]);

  const currentItem: StockCountItem | undefined = filteredItems[currentIndex];

  const handleSave = useCallback(() => {
    if (!currentItem || qty === '') return;
    const physicalQty = Math.max(0, parseInt(qty, 10));
    if (isNaN(physicalQty)) return;
    countMutation.mutate(
      { productId: currentItem.productId, physicalQty },
      {
        onSuccess: () => {
          showSuccess(`Saved: ${currentItem.productName}`);
          setQty('');
          if (currentIndex < filteredItems.length - 1) {
            setCurrentIndex((i) => i + 1);
          }
          setTimeout(() => qtyRef.current?.focus(), 100);
        },
      },
    );
  }, [currentItem, qty, countMutation, currentIndex, filteredItems.length]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentIndex(0);
    setQty('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredItems.length > 0) {
      setCurrentIndex(0);
      setQty('');
      setTimeout(() => qtyRef.current?.focus(), 100);
    }
  };

  if (isLoading || !sc) return <LinearProgress />;

  if (!canCount) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          This count is not in counting state.{' '}
          <Button onClick={() => navigate(`/stock-count/${id}`)}>Go back</Button>
        </Alert>
      </Box>
    );
  }

  const totalCounted = sc.items.filter((i) => i.physicalQty !== null).length;
  const progress = sc.totalProducts > 0 ? (totalCounted / sc.totalProducts) * 100 : 0;

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate(`/stock-count/${id}`)}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{sc.countNumber}</Typography>
          <Typography variant="caption" color="text.secondary">
            {totalCounted} / {sc.totalProducts} products counted
          </Typography>
        </Box>
        <Chip
          label={`${progress.toFixed(0)}%`}
          color={progress === 100 ? 'success' : 'primary'}
          size="small"
        />
      </Box>

      <LinearProgress variant="determinate" value={progress} sx={{ mb: 2, height: 6, borderRadius: 3 }} />

      <TextField
        fullWidth
        placeholder="Search product name, SKU, or scan barcode..."
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        size="small"
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <QrCodeScannerIcon color="action" />
              </InputAdornment>
            ),
          },
        }}
        autoFocus
      />

      {filteredItems.length > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <IconButton
            size="small"
            disabled={currentIndex === 0}
            onClick={() => { setCurrentIndex((i) => i - 1); setQty(''); }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, textAlign: 'center' }}>
            {currentIndex + 1} of {filteredItems.length} results
          </Typography>
          <IconButton
            size="small"
            disabled={currentIndex === filteredItems.length - 1}
            onClick={() => { setCurrentIndex((i) => i + 1); setQty(''); }}
          >
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {currentItem ? (
        <Paper sx={{ p: 3, mb: 2 }} elevation={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{currentItem.productName}</Typography>
              <Typography variant="body2" color="text.secondary">
                SKU: {currentItem.sku}
                {currentItem.barcode ? ` · Barcode: ${currentItem.barcode}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unit: {currentItem.uom} · Category: {currentItem.category}
              </Typography>
            </Box>
            {currentItem.physicalQty !== null && <CheckCircleIcon color="success" />}
          </Box>

          {(!isBlind || isManager) && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                System Qty: <strong>{currentItem.snapshotQty}</strong>
                {currentItem.physicalQty !== null && (
                  <>
                    {' · Variance: '}
                    <strong
                      style={{
                        color: (currentItem.varianceQty ?? 0) < 0
                          ? 'red'
                          : (currentItem.varianceQty ?? 0) > 0
                          ? 'orange'
                          : 'green',
                      }}
                    >
                      {(currentItem.varianceQty ?? 0) > 0 ? '+' : ''}{currentItem.varianceQty ?? 0}
                    </strong>
                  </>
                )}
              </Typography>
            </Box>
          )}

          {currentItem.physicalQty !== null && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Last count: <strong>{currentItem.physicalQty}</strong> by {currentItem.countedBy}
            </Typography>
          )}

          <TextField
            label="Physical Quantity"
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            fullWidth
            inputRef={qtyRef}
            slotProps={{ htmlInput: { min: 0, style: { fontSize: '1.5rem', textAlign: 'center' } } }}
            sx={{ mb: 2 }}
            placeholder={currentItem.physicalQty !== null ? String(currentItem.physicalQty) : '0'}
          />

          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSave}
            loading={countMutation.isPending}
            disabled={qty === '' || countMutation.isPending}
          >
            Save & Next
          </Button>
        </Paper>
      ) : (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {search ? 'No products match your search.' : 'No products in this count.'}
          </Typography>
        </Paper>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip label={`${totalCounted} counted`} size="small" color="success" variant="outlined" />
        <Chip label={`${sc.totalProducts - totalCounted} remaining`} size="small" variant="outlined" />
        {sc.shortCount > 0 && <Chip label={`${sc.shortCount} short`} size="small" color="error" variant="outlined" />}
        {sc.excessCount > 0 && <Chip label={`${sc.excessCount} excess`} size="small" color="warning" variant="outlined" />}
      </Box>
    </Box>
  );
}
