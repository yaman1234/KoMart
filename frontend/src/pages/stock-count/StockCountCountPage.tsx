import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  TextField,
  Typography,
  Alert,
  Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
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
  const remaining = sc.totalProducts - totalCounted;
  const progress = sc.totalProducts > 0 ? (totalCounted / sc.totalProducts) * 100 : 0;
  const varianceQty = currentItem?.varianceQty ?? 0;
  const varianceColor = varianceQty < 0 ? '#ef4444' : varianceQty > 0 ? '#f97316' : '#22c55e';

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', p: { xs: 1.5, sm: 2.5 } }}>

      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate(`/stock-count/${id}`)} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {sc.countNumber}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {totalCounted} of {sc.totalProducts} counted
          </Typography>
        </Box>
        <Chip
          label={`${progress.toFixed(0)}%`}
          size="small"
          sx={{
            fontWeight: 700,
            background: progress === 100
              ? 'linear-gradient(135deg,#22c55e,#16a34a)'
              : 'linear-gradient(135deg,#6366f1,#4f46e5)',
            color: '#fff',
          }}
        />
      </Box>

      {/* ── Progress bar ── */}
      <Box sx={{ mb: 2.5 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              background: progress === 100
                ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                : 'linear-gradient(90deg,#6366f1,#818cf8)',
            },
          }}
        />
      </Box>

      {/* ── Search ── */}
      <TextField
        fullWidth
        placeholder="Search name, SKU, or scan barcode…"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        size="small"
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            bgcolor: 'background.paper',
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#6366f1',
              borderWidth: 2,
            },
          },
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <QrCodeScannerIcon fontSize="small" sx={{ color: '#6366f1' }} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <Chip
                  label={`${filteredItems.length} found`}
                  size="small"
                  sx={{
                    fontSize: '0.65rem',
                    height: 20,
                    background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                />
              </InputAdornment>
            ) : undefined,
          },
        }}
        autoFocus
      />

      {/* ── Pagination ── */}
      {filteredItems.length > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <IconButton
            size="small"
            disabled={currentIndex === 0}
            onClick={() => { setCurrentIndex((i) => i - 1); setQty(''); }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'center' }}>
            {currentIndex + 1} / {filteredItems.length} results
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

      {/* ── Product card ── */}
      {currentItem ? (
        <Paper
          elevation={0}
          sx={{
            mb: 2,
            border: '1px solid',
            borderColor: currentItem.physicalQty !== null ? 'success.light' : 'divider',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {/* Product header */}
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0, pr: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {currentItem.productName}
                </Typography>
                {currentItem.physicalQty !== null && (
                  <CheckCircleIcon color="success" sx={{ fontSize: 18, flexShrink: 0 }} />
                )}
              </Box>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                <Chip label={`SKU: ${currentItem.sku}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                <Chip label={`Category: ${currentItem.category}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                <Chip label={`Unit: ${currentItem.uom}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
              </Stack>
              {currentItem.barcode && (
                <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                  Barcode: {currentItem.barcode}
                </Typography>
              )}
            </Box>
            {currentItem.imageUrl && (
              <Box
                component="img"
                src={currentItem.imageUrl}
                alt={currentItem.productName}
                onClick={() => setLightboxOpen(true)}
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: 1.5,
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'zoom-in',
                  transition: 'transform 0.15s',
                  '&:hover': { transform: 'scale(1.04)' },
                }}
              />
            )}
          </Box>

          {/* System qty / variance strip */}
          {(!isBlind || isManager) && (
            <>
              <Divider />
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  display: 'flex',
                  gap: 3,
                  bgcolor: 'action.hover',
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">System Qty</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {currentItem.snapshotQty}
                  </Typography>
                </Box>
                {currentItem.physicalQty !== null && (
                  <>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Counted</Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {currentItem.physicalQty}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Variance</Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: varianceColor }}>
                        {varianceQty > 0 ? '+' : ''}{varianceQty}
                      </Typography>
                    </Box>
                  </>
                )}
                {currentItem.physicalQty !== null && currentItem.countedBy && (
                  <Box sx={{ ml: 'auto' }}>
                    <Typography variant="caption" color="text.secondary">By</Typography>
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                      {currentItem.countedBy}
                    </Typography>
                  </Box>
                )}
              </Box>
            </>
          )}

          {/* Qty input + save */}
          <Box sx={{ p: 2, pt: 1.5 }}>
            <TextField
              label="Physical Quantity"
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              fullWidth
              inputRef={qtyRef}
              slotProps={{ htmlInput: { min: 0, style: { fontSize: '1.75rem', textAlign: 'center', fontWeight: 700 } } }}
              sx={{ mb: 1.5 }}
              placeholder={currentItem.physicalQty !== null ? String(currentItem.physicalQty) : '0'}
            />
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleSave}
              loading={countMutation.isPending}
              disabled={qty === '' || countMutation.isPending}
              startIcon={<SaveIcon />}
              sx={{
                fontWeight: 700,
                py: 1.25,
                background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                '&:hover': { background: 'linear-gradient(135deg,#4f46e5,#4338ca)' },
              }}
            >
              Save & Next
            </Button>
          </Box>
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
          <Typography color="text.secondary">
            {search ? 'No products match your search.' : 'No products in this count.'}
          </Typography>
        </Paper>
      )}

      {/* ── Summary chips ── */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={`${totalCounted} counted`}
          size="small"
          color="success"
          variant={totalCounted > 0 ? 'filled' : 'outlined'}
        />
        <Chip
          label={`${remaining} remaining`}
          size="small"
          variant="outlined"
        />
        {sc.shortCount > 0 && (
          <Chip label={`${sc.shortCount} short`} size="small" color="error" variant="filled" />
        )}
        {sc.excessCount > 0 && (
          <Chip label={`${sc.excessCount} excess`} size="small" color="warning" variant="filled" />
        )}
      </Stack>

      {/* ── Lightbox ── */}
      <Dialog
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { bgcolor: 'transparent', boxShadow: 'none' } } }}
      >
        <Box
          component="img"
          src={currentItem?.imageUrl}
          alt={currentItem?.productName}
          onClick={() => setLightboxOpen(false)}
          sx={{ width: '100%', display: 'block', borderRadius: 2, cursor: 'zoom-out' }}
        />
      </Dialog>
    </Box>
  );
}
