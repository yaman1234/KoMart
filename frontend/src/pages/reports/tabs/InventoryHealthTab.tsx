import { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Chip,
  Skeleton,
  LinearProgress,
  Button,
  Stack,
} from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import PauseCircleFilledIcon from '@mui/icons-material/PauseCircleFilled';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/utils';
import { useInventoryHealth } from '@/hooks/useReports';

export function InventoryHealthTab() {
  const navigate = useNavigate();

  const [stockFilter, setStockFilter] = useState<'both' | 'low' | 'out'>('both');
  const [expiryDays, setExpiryDays] = useState(30);
  const [deadDays, setDeadDays] = useState(30);

  const [reorderPage, setReorderPage] = useState(0);
  const [reorderRowsPerPage, setReorderRowsPerPage] = useState(10);

  const { data, isLoading } = useInventoryHealth(true, stockFilter, expiryDays, deadDays);

  const reorderCandidates = useMemo(() => {
    return data?.reorderCandidates || data?.reorder_candidates || [];
  }, [data]);

  const valuationByCategory = useMemo(() => {
    return data?.valuationByCategory || data?.valuation_by_category || [];
  }, [data]);

  const nearExpiryBatches = useMemo(() => {
    return data?.nearExpiryBatches || data?.near_expiry_batches || [];
  }, [data]);

  const deadStockItems = useMemo(() => {
    return data?.deadStockItems || data?.dead_stock_items || [];
  }, [data]);

  if (isLoading || !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={360} sx={{ borderRadius: 3 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={360} sx={{ borderRadius: 3 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  const totalSkus = data.totalSkus ?? data.total_skus ?? 0;
  const totalInventoryValue = data.totalInventoryValue ?? data.total_inventory_value ?? 0;
  const outOfStockCount = data.outOfStockCount ?? data.out_of_stock_count ?? 0;
  const lowStockCount = data.lowStockCount ?? data.low_stock_count ?? 0;

  const paginatedReorder = reorderCandidates.slice(
    reorderPage * reorderRowsPerPage,
    reorderPage * reorderRowsPerPage + reorderRowsPerPage,
  );

  const totalReorderCost = reorderCandidates.reduce(
    (sum, r) => sum + (r.estimatedReorderCost ?? r.estimated_reorder_cost ?? 0),
    0,
  );
  const totalDeadStockValue = deadStockItems.reduce(
    (sum, d) => sum + (d.stockValue ?? d.stock_value ?? 0),
    0,
  );
  const totalNearExpiryValue = nearExpiryBatches.reduce(
    (sum, b) => sum + (b.stockValueAtRisk ?? b.stock_value_at_risk ?? 0),
    0,
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. INVENTORY CAPITAL & ASSET VALUATION BANNER */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <InventoryIcon sx={{ color: '#0284C7', fontSize: 28 }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Inventory Capital & Asset Valuation
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Exact balance sheet valuation derived from on-hand FEFO batch acquisition costs
              </Typography>
            </Box>
          </Box>

          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Active Catalog SKUs</Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {totalSkus.toLocaleString()} SKUs
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Total Batch Valuation</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0284C7', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalInventoryValue)}
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Paper>

      {/* 2. REORDER ACTION CENTER (FAST FILTERING LOW / OUT OF STOCK) */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon sx={{ color: '#F43F5E' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Actionable Reorder Center
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {outOfStockCount} Out of stock · {lowStockCount} Low stock · Total Replenishment Est: {formatCurrency(totalReorderCost)}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              select
              size="small"
              value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value as any); setReorderPage(0); }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="both">Both Low & Out of Stock</MenuItem>
              <MenuItem value="out">Out of Stock Only</MenuItem>
              <MenuItem value="low">Low Stock Only</MenuItem>
            </TextField>
          </Box>
        </Box>

        <TableContainer sx={{ maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Product & SKU</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Current Stock</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Threshold</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Cost Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Units Needed</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Est. Reorder Cost</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Quick Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedReorder.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    All products are healthy! No items below low stock threshold.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedReorder.map((r) => {
                  const rId = r.productId || r.product_id || '';
                  const rStock = r.stock ?? 0;
                  const rThreshold = r.lowStockThreshold ?? r.low_stock_threshold ?? 0;
                  const rCost = r.costPrice ?? r.cost_price ?? 0;
                  const rNeeded = r.unitsNeeded ?? r.units_needed ?? 0;
                  const rEstCost = r.estimatedReorderCost ?? r.estimated_reorder_cost ?? 0;

                  return (
                    <TableRow key={rId || r.name} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.sku}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={r.category || 'Other'} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: rStock === 0 ? '#F43F5E' : '#EAB308' }}>
                        {rStock.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {rThreshold}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={r.status === 'out' ? 'Out of Stock' : 'Low Stock'}
                          size="small"
                          color={r.status === 'out' ? 'error' : 'warning'}
                          sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(rCost)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        +{rNeeded}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#0284C7' }}>
                        {formatCurrency(rEstCost)}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ShoppingCartCheckoutIcon />}
                          onClick={() => navigate('/purchases')}
                          sx={{ fontSize: '0.75rem', py: 0.25 }}
                        >
                          Draft PO
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={reorderCandidates.length}
          page={reorderPage}
          onPageChange={(_, p) => setReorderPage(p)}
          rowsPerPage={reorderRowsPerPage}
          onRowsPerPageChange={(e) => {
            setReorderRowsPerPage(parseInt(e.target.value, 10));
            setReorderPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Paper>

      {/* 3. CATEGORY BATCH VALUATION BREAKDOWN */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          Category Asset Valuation (FEFO Reconciled)
        </Typography>

        <TableContainer sx={{ maxHeight: 280 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Catalog SKUs</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total Units</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Batch Valuation</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 150 }}>Valuation Share</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {valuationByCategory.map((cat) => {
                const skuCount = cat.skuCount ?? cat.sku_count ?? 0;
                const totalUnits = cat.totalUnits ?? cat.total_units ?? 0;
                const batchVal = cat.batchValuation ?? cat.batch_valuation ?? 0;
                const valShare = cat.valuationSharePct ?? cat.valuation_share_pct ?? 0;

                return (
                  <TableRow key={cat.category} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{cat.category}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{skuCount}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{totalUnits.toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#0284C7' }}>
                      {formatCurrency(batchVal)}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, Math.max(0, valShare))}
                          sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'rgba(2, 132, 199, 0.1)' }}
                        />
                        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', width: 40, textAlign: 'right' }}>
                          {Number(valShare).toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 4. EXPIRY RISK & DEAD STOCK DUAL SECTION */}
      <Grid container spacing={3}>
        {/* Near-Expiry Batches Radar */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeFilledIcon sx={{ color: '#F59E0B' }} />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Near-Expiry Radar</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {nearExpiryBatches.length} batches expiring · Risk: {formatCurrency(totalNearExpiryValue)}
                  </Typography>
                </Box>
              </Box>

              <TextField
                select
                size="small"
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value={15}>&lt; 15 Days</MenuItem>
                <MenuItem value={30}>&lt; 30 Days</MenuItem>
                <MenuItem value={60}>&lt; 60 Days</MenuItem>
                <MenuItem value={90}>&lt; 90 Days</MenuItem>
              </TextField>
            </Box>

            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Product & Batch</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Units</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Value at Risk</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Expires In</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {nearExpiryBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No batches expiring within {expiryDays} days.
                      </TableCell>
                    </TableRow>
                  ) : (
                    nearExpiryBatches.map((b, idx) => {
                      const pName = b.productName || b.product_name || 'Product';
                      const bNum = b.batchNumber || b.batch_number || '';
                      const expDate = b.expiryDate || b.expiry_date || '';
                      const bQty = b.quantity ?? 0;
                      const atRisk = b.stockValueAtRisk ?? b.stock_value_at_risk ?? 0;
                      const daysUntil = b.daysUntilExpiry ?? b.days_until_expiry ?? 0;

                      return (
                        <TableRow key={idx} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{pName}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Batch {bNum} · Exp: {expDate}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {bQty}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#F59E0B' }}>
                            {formatCurrency(atRisk)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={daysUntil <= 0 ? 'Expired' : `${daysUntil}d`}
                              size="small"
                              color={daysUntil <= 7 ? 'error' : 'warning'}
                              sx={{ fontWeight: 700 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Dead Stock & Locked Capital */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PauseCircleFilledIcon sx={{ color: '#6B7280' }} />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Dead Stock & Capital Lockup</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {deadStockItems.length} items without sales · Tied: {formatCurrency(totalDeadStockValue)}
                  </Typography>
                </Box>
              </Box>

              <TextField
                select
                size="small"
                value={deadDays}
                onChange={(e) => setDeadDays(Number(e.target.value))}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value={30}>&gt; 30 Days</MenuItem>
                <MenuItem value={60}>&gt; 60 Days</MenuItem>
                <MenuItem value={90}>&gt; 90 Days</MenuItem>
              </TextField>
            </Box>

            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>On-Hand</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Capital Tied Up</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>No Sale Days</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deadStockItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No dead stock items detected! All inventory has moved recently.
                      </TableCell>
                    </TableRow>
                  ) : (
                    deadStockItems.map((d) => {
                      const pId = d.productId || d.product_id || '';
                      const pName = d.productName || d.product_name || 'Product';
                      const dStock = d.stock ?? 0;
                      const tiedVal = d.stockValue ?? d.stock_value ?? 0;
                      const noSaleDays = d.daysWithoutSale ?? d.days_without_sale ?? 0;

                      return (
                        <TableRow key={pId || pName} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{pName}</Typography>
                            <Typography variant="caption" color="text.secondary">{d.category}</Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {dStock}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#4B5563' }}>
                            {formatCurrency(tiedVal)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={`${noSaleDays}d`}
                              size="small"
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
