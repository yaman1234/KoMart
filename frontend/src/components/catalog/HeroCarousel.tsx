import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import { APP_NAME, CURRENCY_SYMBOL } from '@/constants';
import type { CatalogOffer, CatalogStoreInfo } from '@/types';

const OFFER_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function formatOfferValue(offer: CatalogOffer): string {
  if (offer.ruleType.includes('percent')) return `${offer.value}% OFF`;
  return `${CURRENCY_SYMBOL} ${offer.value} OFF`;
}

function formatOfferSubtitle(offer: CatalogOffer): string {
  if (offer.ruleType.startsWith('category_') && offer.category) {
    return `on ${offer.category}`;
  }
  if (offer.ruleType.startsWith('cart_')) return 'on your cart';
  return '';
}

interface SlideData {
  type: 'welcome' | 'offer' | 'store';
  offer?: CatalogOffer;
  storeInfo?: CatalogStoreInfo;
  gradient: string;
}

function buildSlides(
  offers: CatalogOffer[],
  storeInfo?: CatalogStoreInfo,
): SlideData[] {
  const slides: SlideData[] = [
    {
      type: 'welcome',
      gradient: 'linear-gradient(135deg, #E63946 0%, #FF8A94 100%)',
    },
  ];

  offers.forEach((offer, i) => {
    slides.push({
      type: 'offer',
      offer,
      gradient: OFFER_GRADIENTS[i % OFFER_GRADIENTS.length],
    });
  });

  if (storeInfo) {
    slides.push({
      type: 'store',
      storeInfo,
      gradient: 'linear-gradient(135deg, #1D3557 0%, #457B9D 100%)',
    });
  }

  return slides;
}

function WelcomeSlide() {
  return (
    <Box sx={{ textAlign: 'center', px: 3 }}>
      <Box
        component="img"
        src="/koMart_logo.png"
        alt="KoMart"
        sx={{ height: { xs: 56, md: 72 }, mb: 1.5 }}
      />
      <Typography variant="h3" sx={{ fontWeight: 900, color: 'white', mb: 0.5, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
        Welcome to {APP_NAME}
      </Typography>
      <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 400, fontSize: { xs: '0.95rem', md: '1.15rem' } }}>
        Korean &amp; Asian Snacks — Browse our collection
      </Typography>
    </Box>
  );
}

function OfferSlide({ offer }: { offer: CatalogOffer }) {
  const subtitle = formatOfferSubtitle(offer);
  return (
    <Box sx={{ textAlign: 'center', px: 3 }}>
      <LocalOfferIcon sx={{ fontSize: { xs: 40, md: 52 }, color: 'white', mb: 1 }} />
      <Typography variant="h3" sx={{ fontWeight: 900, color: 'white', mb: 0.5, fontSize: { xs: '2rem', md: '3rem' }, letterSpacing: 1 }}>
        {formatOfferValue(offer)}
      </Typography>
      <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.95)', fontWeight: 600, mb: 0.5, fontSize: { xs: '1rem', md: '1.25rem' } }}>
        {offer.name}
      </Typography>
      {subtitle && (
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: { xs: '0.9rem', md: '1rem' } }}>
          {subtitle}
        </Typography>
      )}
      {offer.code && (
        <Box sx={{
          display: 'inline-block',
          mt: 1.5,
          px: 2.5,
          py: 0.75,
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(4px)',
          border: '1px dashed rgba(255,255,255,0.5)',
        }}>
          <Typography variant="body2" sx={{ color: 'white', fontWeight: 700, letterSpacing: 2 }}>
            CODE: {offer.code}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function StoreInfoSlide({ info }: { info: CatalogStoreInfo }) {
  const items = [
    { icon: <LocationOnIcon />, text: info.address },
    { icon: <PhoneIcon />, text: info.phone },
    { icon: <EmailIcon />, text: info.email },
  ].filter((item) => item.text);

  return (
    <Box sx={{ textAlign: 'center', px: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, color: 'white', mb: 2, fontSize: { xs: '1.5rem', md: '2rem' } }}>
        Visit Us
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'center' }}>
        {items.map((item, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ color: 'rgba(255,255,255,0.8)', display: 'flex' }}>{item.icon}</Box>
            <Typography variant="body1" sx={{ color: 'white', fontWeight: 500 }}>
              {item.text}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

interface HeroCarouselProps {
  offers?: CatalogOffer[];
  storeInfo?: CatalogStoreInfo;
}

export function HeroCarousel({ offers = [], storeInfo }: HeroCarouselProps) {
  const slides = buildSlides(offers, storeInfo);
  const count = slides.length;

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  const goTo = useCallback((idx: number) => {
    setActive(((idx % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => goTo(active + 1), 5000);
    timerRef.current = id;
    return () => clearInterval(id);
  }, [active, paused, count, goTo]);

  if (count === 0) return null;

  return (
    <Box
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      sx={{
        position: 'relative',
        borderRadius: 3,
        overflow: 'hidden',
        mb: 3,
      }}
    >
      {/* Slides */}
      <Box sx={{ position: 'relative', height: { xs: 220, md: 300 } }}>
        {slides.map((slide, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: slide.gradient,
              opacity: i === active ? 1 : 0,
              transition: 'opacity 0.6s ease-in-out',
              pointerEvents: i === active ? 'auto' : 'none',
            }}
          >
            {slide.type === 'welcome' && <WelcomeSlide />}
            {slide.type === 'offer' && slide.offer && <OfferSlide offer={slide.offer} />}
            {slide.type === 'store' && slide.storeInfo && <StoreInfoSlide info={slide.storeInfo} />}
          </Box>
        ))}
      </Box>

      {/* Arrow buttons */}
      {count > 1 && (
        <>
          <IconButton
            onClick={() => goTo(active - 1)}
            aria-label="Previous slide"
            sx={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'rgba(0,0,0,0.3)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
            }}
            size="small"
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            onClick={() => goTo(active + 1)}
            aria-label="Next slide"
            sx={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'rgba(0,0,0,0.3)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
            }}
            size="small"
          >
            <ChevronRightIcon />
          </IconButton>
        </>
      )}

      {/* Dots */}
      {count > 1 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 0.75,
          }}
        >
          {slides.map((_, i) => (
            <Box
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => goTo(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(i); } }}
              sx={{
                width: i === active ? 24 : 8,
                height: 8,
                borderRadius: 4,
                bgcolor: i === active ? 'white' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:focus-visible': { outline: '2px solid white', outlineOffset: 2 },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
