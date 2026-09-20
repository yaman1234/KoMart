import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
  Paper,
  Alert,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { stockCountService, categoryService } from '@/services';
import { showApiError } from '@/utils/toast';
import type { StockCountType, StockCountMode } from '@/types';
import dayjs from 'dayjs';

export function StockCountFormPage() {
  const navigate = useNavigate();
  const [countType, setCountType] = useState<StockCountType>('full');
  const [countMode, setCountMode] = useState<StockCountMode>('blind');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [notes, setNotes] = useState('');
  const [countDate, setCountDate] = useState(dayjs().format('YYYY-MM-DD'));

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryService.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      stockCountService.create({
        countType,
        countMode,
        categoryFilter: countType === 'category' ? categoryFilter : '',
        notes,
        countDate,
      }),
    onSuccess: (sc) => navigate(`/stock-count/${sc.id}`),
    onError: (err) => showApiError(err, 'Failed to create stock count.'),
  });

  return (
    <Box>
      <PageHeader
        title="New Stock Count"
        subtitle="Configure and start a new physical inventory count."
      />

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            select
            label="Count Type"
            value={countType}
            onChange={(e) => setCountType(e.target.value as StockCountType)}
            fullWidth
          >
            <MenuItem value="full">Full Stock Count — all active products</MenuItem>
            <MenuItem value="category">Category — count one category</MenuItem>
            <MenuItem value="selected">Selected Products</MenuItem>
          </TextField>

          {countType === 'category' && (
            <TextField
              select
              label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              fullWidth
              required
            >
              {(categories ?? []).map((c) => (
                <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            select
            label="Counting Mode"
            value={countMode}
            onChange={(e) => setCountMode(e.target.value as StockCountMode)}
            fullWidth
            helperText={
              countMode === 'blind'
                ? 'Recommended: counters cannot see system quantities.'
                : 'Counters can see system quantities and live variance.'
            }
          >
            <MenuItem value="blind">Blind Count (Recommended)</MenuItem>
            <MenuItem value="assisted">Assisted Count</MenuItem>
          </TextField>

          <TextField
            label="Count Date"
            type="date"
            value={countDate}
            onChange={(e) => setCountDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
            placeholder="Optional notes about this count..."
          />

          {countMode === 'blind' && (
            <Alert severity="info">
              In Blind Count mode, counters will not see system quantities until the count is submitted.
              This prevents bias and ensures accurate physical counting.
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            When you start the count, the system will snapshot current stock quantities for all
            selected products. These snapshots are frozen — sales during counting will not affect
            the variance calculation.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => navigate('/stock-count')}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={countType === 'category' && !categoryFilter}
            >
              Start Count
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
