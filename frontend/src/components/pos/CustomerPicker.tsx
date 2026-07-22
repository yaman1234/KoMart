import { memo, useState } from 'react';
import {
  Box,
  TextField,
  Chip,
  Autocomplete,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { customerService } from '@/services';
import { useCustomer } from '@/hooks/useCustomers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Customer } from '@/types';

const WALK_IN: Customer = {
  id: '__walkin__',
  name: 'Walk-In Customer',
  phone: '',
  email: '',
  loyaltyPoints: 0,
  membershipTier: 'bronze',
  totalSpent: 0,
  createdAt: '',
};

const MIN_NAME_SEARCH_LEN = 2;
const MIN_PHONE_SEARCH_LEN = 3;

/** Phone-like input: digits plus common formatting chars */
function isPhoneLikeQuery(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  return /^[\d+\-\s().]+$/.test(trimmed);
}

function minSearchLength(q: string): number {
  if (!q.trim()) return 0;
  return isPhoneLikeQuery(q) ? MIN_PHONE_SEARCH_LEN : MIN_NAME_SEARCH_LEN;
}

function mergeOptions(customers: Customer[], selected: Customer | null): Customer[] {
  if (!selected || selected.id === '__walkin__') return customers;
  if (customers.some((c) => c.id === selected.id)) return customers;
  return [selected, ...customers];
}

interface CustomerPickerProps {
  customerId: string | null;
  onCustomerChange: (id: string | null) => void;
  onAddCustomer: () => void;
}

export const CustomerPicker = memo(function CustomerPicker({
  customerId,
  onCustomerChange,
  onAddCustomer,
}: CustomerPickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(inputValue.trim(), 350);
  const requiredLen = minSearchLength(debouncedSearch);
  const canQuery = open && (debouncedSearch.length === 0 || debouncedSearch.length >= requiredLen);

  const { data: customers = [], isFetching } = useQuery({
    queryKey: [...QUERY_KEYS.customers, 'lookup', debouncedSearch],
    queryFn: () => customerService.lookup(debouncedSearch, 15),
    enabled: canQuery,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const { data: selectedDetail } = useCustomer(customerId ?? '');

  const selectedCustomer = !customerId
    ? WALK_IN
    : (selectedDetail ?? customers.find((c) => c.id === customerId) ?? WALK_IN);

  const options = [
    WALK_IN,
    ...mergeOptions(customers, selectedCustomer.id === '__walkin__' ? null : selectedCustomer),
  ];

  return (
    <Box sx={{ mb: 0.5, flexShrink: 0 }}>
      <Typography
        variant="caption"
        component="label"
        sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.25, lineHeight: 1.2, fontSize: '0.7rem' }}
      >
        Customer
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
        <Autocomplete
          sx={{ flex: 1, minWidth: 0 }}
          size="small"
          options={options}
          loading={isFetching}
          filterOptions={(x) => x}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => {
            setOpen(false);
            setInputValue('');
          }}
          getOptionLabel={(c) =>
            c.id === '__walkin__' ? 'Walk-In Customer' : `${c.name} (${c.phone})`
          }
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={selectedCustomer}
          onInputChange={(_, value, reason) => {
            if (reason === 'input' || reason === 'clear') setInputValue(value);
          }}
          onChange={(_, v) => onCustomerChange(v?.id === '__walkin__' ? null : (v?.id ?? null))}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search name or phone"
              sx={{
                '& .MuiInputBase-root': { py: 0.15 },
                '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8125rem' },
              }}
            />
          )}
          noOptionsText={
            debouncedSearch.length > 0 && debouncedSearch.length < requiredLen
              ? isPhoneLikeQuery(debouncedSearch)
                ? `Enter ${MIN_PHONE_SEARCH_LEN}+ digits of phone number`
                : `Type ${requiredLen - debouncedSearch.length} more character(s)`
              : debouncedSearch
                ? 'No customers found'
                : 'Recent customers'
          }
        />
        <Tooltip title="Add new customer">
          <IconButton onClick={onAddCustomer} size="small" sx={{ flexShrink: 0 }}>
            <PersonAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {selectedCustomer.id !== '__walkin__' && (
        <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
          <Chip
            label={`${selectedCustomer.loyaltyPoints} pts`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
          <Chip
            label={selectedCustomer.membershipTier}
            size="small"
            color="secondary"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        </Box>
      )}
    </Box>
  );
});
