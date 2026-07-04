import { useState, useEffect, useRef } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
  debounceMs?: number;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  fullWidth = true,
  debounceMs = 300,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(newValue), debounceMs);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <TextField
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      fullWidth={fullWidth}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
