import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getSavedScrollPosition, restoreScroll, saveScrollPosition } from '@/utils/scrollRestoration';

/**
 * Hook to manage scroll preservation and restoration for a layout's scroll container or window.
 */
export function useScrollRestoration(containerRef?: React.RefObject<HTMLElement | null>) {
  const location = useLocation();
  const prevLocationRef = useRef<{ key: string; pathWithSearch: string }>({
    key: location.key,
    pathWithSearch: `${location.pathname}${location.search}`,
  });
  const cancelRestoreRef = useRef<(() => void) | null>(null);

  // Helper to get the target element (ref if provided, or window)
  const getTarget = (): HTMLElement | Window | null => {
    if (containerRef) {
      return containerRef.current;
    }
    return typeof window !== 'undefined' ? window : null;
  };

  const getScrollTop = (target: HTMLElement | Window | null): number => {
    if (!target) return 0;
    return target === window ? window.scrollY : (target as HTMLElement).scrollTop;
  };

  // Save scroll position when location changes or before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const target = getTarget();
      if (!target) return;
      const top = getScrollTop(target);
      saveScrollPosition(
        prevLocationRef.current.key,
        prevLocationRef.current.pathWithSearch,
        top,
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [containerRef]);

  // Handle location changes
  useEffect(() => {
    const target = getTarget();
    if (!target) return;

    // Save scroll position of previous location
    const prevKey = prevLocationRef.current.key;
    const prevPathWithSearch = prevLocationRef.current.pathWithSearch;
    const currentPathWithSearch = `${location.pathname}${location.search}`;

    if (prevKey !== location.key || prevPathWithSearch !== currentPathWithSearch) {
      const top = getScrollTop(target);
      saveScrollPosition(prevKey, prevPathWithSearch, top);
    }

    prevLocationRef.current = {
      key: location.key,
      pathWithSearch: currentPathWithSearch,
    };

    // Cancel any ongoing restoration
    if (cancelRestoreRef.current) {
      cancelRestoreRef.current();
      cancelRestoreRef.current = null;
    }

    // Check for saved position for the new location
    const savedTop = getSavedScrollPosition(location.key, currentPathWithSearch);

    if (savedTop != null && savedTop > 0) {
      cancelRestoreRef.current = restoreScroll(target, savedTop);
    } else {
      // New visit: scroll to top
      if (target === window) {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      } else {
        (target as HTMLElement).scrollTop = 0;
      }
    }

    return () => {
      if (cancelRestoreRef.current) {
        cancelRestoreRef.current();
        cancelRestoreRef.current = null;
      }
    };
  }, [location.key, location.pathname, location.search]);
}

