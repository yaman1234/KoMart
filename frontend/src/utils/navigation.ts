import type { NavigateFunction } from 'react-router-dom';

const LAST_LIST_URL_PREFIX = 'komart_last_list_url:';

/**
 * Saves the full URL (pathname + search) for a given route prefix.
 */
export function saveLastListUrl(routePrefix: string, fullUrl: string): void {
  try {
    sessionStorage.setItem(`${LAST_LIST_URL_PREFIX}${routePrefix}`, fullUrl);
  } catch {
    // SessionStorage may be restricted in some environments; ignore error
  }
}

/**
 * Retrieves the saved full URL for a given route prefix, or null if none saved.
 */
export function getLastListUrl(routePrefix: string): string | null {
  try {
    return sessionStorage.getItem(`${LAST_LIST_URL_PREFIX}${routePrefix}`);
  } catch {
    return null;
  }
}

/**
 * Clears the saved full URL for a route prefix.
 */
export function clearLastListUrl(routePrefix: string): void {
  try {
    sessionStorage.removeItem(`${LAST_LIST_URL_PREFIX}${routePrefix}`);
  } catch {
    // Ignore error
  }
}

/**
 * Navigates back in browser history if history exists in this session,
 * otherwise navigates to the fallback path.
 */
export function navigateBack(navigate: NavigateFunction, fallbackPath: string): void {
  // In React Router 7 / HTML5 history:
  // window.history.state?.idx is the history stack index in the current document.
  // If idx > 0, there is a previous entry within the app in this session.
  if (typeof window !== 'undefined' && window.history) {
    if (window.history.state && typeof window.history.state.idx === 'number') {
      if (window.history.state.idx > 0) {
        navigate(-1);
        return;
      }
    } else if (window.history.length > 1) {
      navigate(-1);
      return;
    }
  }

  // Fallback to the saved list URL if available, else the fallbackPath
  const savedUrl = getLastListUrl(fallbackPath);
  navigate(savedUrl || fallbackPath, { replace: true });
}

