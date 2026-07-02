import { Box, Chip, Tooltip } from '@mui/material';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';

const compactChipSx = {
  height: 18,
  fontSize: '0.6rem',
  maxWidth: '100%',
} as const;

interface ProductMetaChipsProps {
  category?: string;
  tags?: string[];
  discountLabel?: string | null;
  showCategory?: boolean;
  maxTags?: number;
}

export function ProductMetaChips({
  category,
  tags = [],
  discountLabel,
  showCategory = true,
  maxTags = 3,
}: ProductMetaChipsProps) {
  const visibleTags = tags.slice(0, maxTags);
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
  const hasContent = (showCategory && category) || visibleTags.length > 0 || discountLabel;

  if (!hasContent) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {showCategory && category && (
        <Chip
          label={category}
          size="small"
          variant="outlined"
          sx={compactChipSx}
        />
      )}
      {visibleTags.map((tag) => (
        <Chip
          key={tag}
          label={tag}
          size="small"
          color="info"
          variant="outlined"
          sx={compactChipSx}
        />
      ))}
      {hiddenTagCount > 0 && (
        <Chip
          label={`+${hiddenTagCount}`}
          size="small"
          variant="outlined"
          sx={compactChipSx}
        />
      )}
      {discountLabel && (
        <Tooltip title={discountLabel}>
          <Chip
            icon={<LocalOfferIcon sx={{ fontSize: '0.75rem !important' }} />}
            label={discountLabel}
            size="small"
            color="success"
            sx={{ ...compactChipSx, fontWeight: 700 }}
          />
        </Tooltip>
      )}
    </Box>
  );
}
