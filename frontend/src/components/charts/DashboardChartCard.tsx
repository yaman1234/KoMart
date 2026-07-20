import { useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Tooltip,
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import PieChartIcon from '@mui/icons-material/PieChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import DownloadIcon from '@mui/icons-material/Download';
import { toPng } from 'html-to-image';
import { showError, showSuccess } from '@/utils/toast';

export type ChartViewMode = 'default' | 'pie';

interface DashboardChartCardProps {
  title: string;
  children: (mode: ChartViewMode, height: number) => ReactNode;
  loading?: boolean;
  height?: number;
  /** When false, pie toggle is hidden (e.g. dual-series time charts without categorical pie) */
  allowPie?: boolean;
  filename?: string;
}

export function DashboardChartCard({
  title,
  children,
  loading,
  height = 280,
  allowPie = true,
  filename = 'chart',
}: DashboardChartCardProps) {
  const [mode, setMode] = useState<ChartViewMode>('default');
  const [fullscreen, setFullscreen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const download = async () => {
    const node = fullscreen ? fullscreenRef.current : captureRef.current;
    if (!node) return;
    try {
      const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: '#fff' });
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
      showSuccess('Chart saved.');
    } catch {
      showError('Could not save chart.');
    }
  };

  const toolbar = (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      {allowPie && (
        <Tooltip title={mode === 'pie' ? 'Bar / line view' : 'Pie chart'}>
          <IconButton
            size="small"
            onClick={() => setMode((m) => (m === 'pie' ? 'default' : 'pie'))}
            color={mode === 'pie' ? 'primary' : 'default'}
          >
            {mode === 'pie' ? <BarChartIcon fontSize="small" /> : <PieChartIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Download PNG">
        <IconButton size="small" onClick={() => void download()}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
        <IconButton size="small" onClick={() => setFullscreen((v) => !v)}>
          {fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <>
      <Card sx={{ height: '100%' }}>
        <CardHeader
          title={title}
          action={toolbar}
          slotProps={{ title: { variant: 'h6', sx: { fontWeight: 600 } } }}
          sx={{ pb: 0 }}
        />
        <CardContent>
          {loading ? (
            <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 1 }} />
          ) : (
            <Box ref={captureRef} sx={{ width: '100%', height }}>
              {children(mode, height)}
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog open={fullscreen} onClose={() => setFullscreen(false)} fullScreen>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {title}
          {toolbar}
        </DialogTitle>
        <DialogContent>
          <Box ref={fullscreenRef} sx={{ width: '100%', height: 'calc(100vh - 120px)' }}>
            {!loading && children(mode, Math.max(window.innerHeight - 160, 400))}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
