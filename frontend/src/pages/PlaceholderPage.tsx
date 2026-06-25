import { Typography, Box } from '@mui/material';
import { PageHeader } from '@/components/common/PageHeader';

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
}

export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <Box>
      <PageHeader title={title} subtitle={subtitle} />
      <Typography color="text.secondary">
        This module is scaffolded and ready for implementation.
      </Typography>
    </Box>
  );
}
