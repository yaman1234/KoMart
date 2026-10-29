const SCROLL_STORAGE_KEY = 'komart_scroll_positions';

const memoryScrollMap = new Map<string, number>();

function getStorageMap(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStorageMap(map: Record<string, number>) {
  try {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore error
  }
}

export function saveScrollPosition(key: string, pathWithSearch: string, top: number) {
  if (top < 0) return;
  memoryScrollMap.set(key, top);
  memoryScrollMap.set(pathWithSearch, top);

  const stored = getStorageMap();
  stored[key] = top;
  stored[pathWithSearch] = top;
  saveStorageMap(stored);
}

export function getSavedScrollPosition(key: string, pathWithSearch: string): number | null {
  if (memoryScrollMap.has(key)) return memoryScrollMap.get(key)!;
  if (memoryScrollMap.has(pathWithSearch)) return memoryScrollMap.get(pathWithSearch)!;

  const stored = getStorageMap();
  if (typeof stored[key] === 'number') return stored[key];
  if (typeof stored[pathWithSearch] === 'number') return stored[pathWithSearch];

  return null;
}

/**
 * Attempts to restore scroll position to the target element (or window).
 * If the element has not yet grown to the target height, retries for a brief duration.
 * Automatically cancels if the user manually scrolls.
 */
export function restoreScroll(
  element: HTMLElement | Window | null,
  targetTop: number,
  onComplete?: () => void,
): () => void {
  if (!element || targetTop <= 0) {
    onComplete?.();
    return () => {};
  }

  let cancelled = false;
  let attempts = 0;
  const maxAttempts = 20; // 20 * 50ms = 1000ms max

  const isWindow = element === window;
  const getScrollTop = () => (isWindow ? window.scrollY : (element as HTMLElement).scrollTop);
  const setScrollTop = (val: number) => {
    if (isWindow) {
      window.scrollTo({ top: val, behavior: 'instant' as ScrollBehavior });
    } else {
      (element as HTMLElement).scrollTop = val;
    }
  };

  const handleUserScroll = () => {
    // If the scroll position is significantly different and not programmatic, cancel
    const current = getScrollTop();
    if (Math.abs(current - targetTop) > 10 && attempts > 1) {
      cancelled = true;
    }
  };

  element.addEventListener('scroll', handleUserScroll, { passive: true });

  const tryRestore = () => {
    if (cancelled) {
      element.removeEventListener('scroll', handleUserScroll);
      return;
    }

    setScrollTop(targetTop);
    const current = getScrollTop();

    // If successfully restored (or close enough due to zoom/subpixel)
    if (Math.abs(current - targetTop) <= 2) {
      element.removeEventListener('scroll', handleUserScroll);
      onComplete?.();
      return;
    }

    attempts++;
    if (attempts >= maxAttempts) {
      element.removeEventListener('scroll', handleUserScroll);
      onComplete?.();
      return;
    }

    setTimeout(tryRestore, 50);
  };

  // Immediate attempt
  tryRestore();

  return () => {
    cancelled = true;
    element.removeEventListener('scroll', handleUserScroll);
  };
}

