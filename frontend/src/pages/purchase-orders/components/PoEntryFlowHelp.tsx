import { useState } from 'react';
import { Box, IconButton, Link, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { PO_ENTRY_FLOW_STEPS } from '@/pages/purchase-orders/poTerminology';

function FlowTooltipContent() {
  return (
    <Box sx={{ maxWidth: 300 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: 'inherit', fontSize: '0.75rem' }}>
        How purchase orders work
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2, '& li': { mb: 0.25 } }}>
        {PO_ENTRY_FLOW_STEPS.map((step) => (
          <Typography
            key={step}
            component="li"
            variant="caption"
            sx={{ display: 'list-item', color: 'inherit', fontSize: '0.7rem', lineHeight: 1.35 }}
          >
            {step}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

/** Compact link + info icon; click to show PO flow steps. */
export function PoEntryFlowHelp() {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.125, lineHeight: 1 }}>
      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={() => setOpen((v) => !v)}
        sx={{
          cursor: 'pointer',
          border: 0,
          background: 'none',
          p: 0,
          fontSize: '0.75rem',
          lineHeight: 1.2,
          color: 'text.secondary',
        }}
      >
        How purchase orders work
      </Link>
      <Tooltip
        open={open}
        onClose={() => setOpen(false)}
        disableHoverListener
        disableFocusListener
        disableTouchListener
        title={<FlowTooltipContent />}
        placement="bottom-start"
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: 'background.paper',
              color: 'text.primary',
              border: 1,
              borderColor: 'divider',
              boxShadow: 1,
              maxWidth: 320,
              p: 1,
            },
          },
        }}
      >
        <IconButton
          size="small"
          aria-label="How purchase orders work"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          sx={{ p: 0.125 }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 14 }} color="action" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
