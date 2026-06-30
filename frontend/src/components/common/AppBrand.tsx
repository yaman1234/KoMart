import { Box, Typography } from '@mui/material';
import { APP_LOGO, APP_NAME } from '@/constants';

interface AppBrandProps {
  /** Logo diameter in px */
  logoSize?: number;
  /** Show "KoMart" text beside/below the logo */
  showName?: boolean;
  /** Stack logo and name vertically (login) or horizontally (sidebar) */
  direction?: 'row' | 'column';
  /** Optional subtitle under the name */
  subtitle?: string;
}

export function AppBrand({
  logoSize = 40,
  showName = true,
  direction = 'row',
  subtitle,
}: AppBrandProps) {
  const isColumn = direction === 'column';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isColumn ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: isColumn ? 'center' : 'flex-start',
        gap: isColumn ? 1.5 : 1,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          width: logoSize,
          height: logoSize,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}
      >
        <Box
          component="img"
          src={APP_LOGO}
          alt={`${APP_NAME} logo`}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </Box>
      {showName && (
        <Box sx={{ minWidth: 0, textAlign: isColumn ? 'center' : 'left' }}>
          <Typography
            variant={isColumn ? 'h5' : 'h6'}
            sx={{ fontWeight: 700, lineHeight: 1.2 }}
            noWrap={!isColumn}
          >
            {APP_NAME}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
