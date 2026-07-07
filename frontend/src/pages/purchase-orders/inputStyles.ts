export const noNumberSpinnerSx = {
  MozAppearance: 'textfield',
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
} as const;

export const excelCellSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 0,
    fontSize: '0.8125rem',
    backgroundColor: 'background.paper',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: 'divider' },
    '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: 1 },
  },
  '& .MuiInputBase-input': { py: 0.75, px: 1 },
  '& .MuiSelect-select': { py: 0.75, px: 1 },
} as const;
