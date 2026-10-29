import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { saveLastListUrl } from '@/utils/navigation';

export type ParamType = 'string' | 'number' | 'boolean' | 'page' | 'enum' | 'custom';

export interface FieldDefinition<T> {
  defaultValue: T;
  type?: ParamType;
  validValues?: readonly any[];
  urlKey?: string;
  parse?: (raw: string | null) => T;
  serialize?: (val: T) => string | null | undefined;
}

export type SchemaMap<T> = {
  [K in keyof T]: FieldDefinition<T[K]>;
};

export interface UseListStateOptions<T> {
  schema: SchemaMap<T>;
  /**
   * Keys that trigger a page reset to 0 when changed.
   * If omitted, defaults to all keys except 'page', 'pageSize', 'sortBy', 'sortOrder'.
   */
  resetPageOnChange?: (keyof T)[];
  /**
   * Optional route prefix (e.g. '/products') to persist the last list URL in sessionStorage.
   */
  routePrefix?: string;
}

export interface UseListStateReturn<T> {
  filters: T;
  setFilter: <K extends keyof T>(key: K, value: T[K]) => void;
  setFilters: (updates: Partial<T> | ((prev: T) => Partial<T>)) => void;
  resetFilters: (keepKeys?: (keyof T)[]) => void;
  clampPage: (total: number | undefined) => void;
}

// ── Field Helpers ────────────────────────────────────────────────────────────

export function stringParam(defaultValue = '', urlKey?: string): FieldDefinition<string> {
  return { defaultValue, type: 'string', urlKey };
}

export function numberParam(defaultValue = 0, urlKey?: string): FieldDefinition<number> {
  return { defaultValue, type: 'number', urlKey };
}

/**
 * 0-indexed in component state, 1-indexed in URL (e.g. ?page=2 corresponds to state 1).
 * Page 0 is omitted from the URL to keep URLs clean.
 */
export function pageParam(defaultValue = 0, urlKey = 'page'): FieldDefinition<number> {
  return {
    defaultValue,
    type: 'page',
    urlKey,
    parse: (raw) => {
      if (!raw) return defaultValue;
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) || parsed < 1 ? defaultValue : parsed - 1;
    },
    serialize: (val) => {
      if (val <= defaultValue) return null;
      return String(val + 1);
    },
  };
}

export function pageSizeParam(defaultValue = 25, urlKey = 'pageSize'): FieldDefinition<number> {
  return {
    defaultValue,
    type: 'number',
    urlKey,
    parse: (raw) => {
      if (!raw) return defaultValue;
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) || parsed < 1 ? defaultValue : parsed;
    },
    serialize: (val) => {
      if (val === defaultValue) return null;
      return String(val);
    },
  };
}

export function booleanParam(defaultValue = false, urlKey?: string): FieldDefinition<boolean> {
  return {
    defaultValue,
    type: 'boolean',
    urlKey,
    parse: (raw) => {
      if (raw == null) return defaultValue;
      return raw === 'true' || raw === '1';
    },
    serialize: (val) => (val ? 'true' : null),
  };
}

export function enumParam<E extends string>(
  validValues: readonly E[],
  defaultValue: E,
  urlKey?: string,
): FieldDefinition<E> {
  return {
    defaultValue,
    type: 'enum',
    validValues,
    urlKey,
    parse: (raw) => {
      if (raw && validValues.includes(raw as E)) {
        return raw as E;
      }
      return defaultValue;
    },
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useListState<T extends Record<string, any>>({
  schema,
  resetPageOnChange,
  routePrefix,
}: UseListStateOptions<T>): UseListStateReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Keys that trigger page reset
  const pageResetKeys = useMemo(() => {
    if (resetPageOnChange) return resetPageOnChange;
    const allKeys = Object.keys(schema) as (keyof T)[];
    const exclude = new Set(['page', 'pageSize', 'sortBy', 'sortOrder']);
    return allKeys.filter((k) => !exclude.has(k as string));
  }, [resetPageOnChange, schema]);

  // Parse filters from URL search params
  const parseFiltersFromParams = useCallback(
    (params: URLSearchParams): T => {
      const result = {} as T;

      for (const key of Object.keys(schema) as (keyof T)[]) {
        const def = schema[key];
        const paramName = def.urlKey || (key as string);
        const raw = params.get(paramName);

        if (def.parse) {
          result[key] = def.parse(raw);
        } else if (def.type === 'page') {
          if (!raw) {
            result[key] = def.defaultValue;
          } else {
            const parsed = parseInt(raw, 10);
            result[key] = (isNaN(parsed) || parsed < 1 ? def.defaultValue : parsed - 1) as T[keyof T];
          }
        } else if (def.type === 'number') {
          if (raw == null || raw === '') {
            result[key] = def.defaultValue;
          } else {
            const parsed = Number(raw);
            result[key] = (isNaN(parsed) ? def.defaultValue : parsed) as T[keyof T];
          }
        } else if (def.type === 'boolean') {
          if (raw == null) {
            result[key] = def.defaultValue;
          } else {
            result[key] = (raw === 'true' || raw === '1') as T[keyof T];
          }
        } else if (def.type === 'enum' && def.validValues) {
          if (raw && def.validValues.includes(raw)) {
            result[key] = raw as T[keyof T];
          } else {
            result[key] = def.defaultValue;
          }
        } else {
          // default string type
          result[key] = (raw ?? def.defaultValue) as T[keyof T];
        }
      }

      return result;
    },
    [schema],
  );

  const filters = useMemo(() => {
    return parseFiltersFromParams(searchParams);
  }, [parseFiltersFromParams, searchParams]);

  // Keep a ref of current filters to prevent stale closures in async/debounced setters
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Persist current full URL for routePrefix
  useEffect(() => {
    if (routePrefix) {
      const fullUrl = `${location.pathname}${location.search}`;
      saveLastListUrl(routePrefix, fullUrl);
    }
  }, [routePrefix, location.pathname, location.search]);

  // Serialize and commit updates to searchParams
  const commitFilters = useCallback(
    (nextFilters: T) => {
      setSearchParams(
        (prevParams) => {
          const nextParams = new URLSearchParams(prevParams);

          for (const key of Object.keys(schema) as (keyof T)[]) {
            const def = schema[key];
            const paramName = def.urlKey || (key as string);
            const value = nextFilters[key];

            if (def.serialize) {
              const serialized = def.serialize(value);
              if (serialized == null || serialized === '') {
                nextParams.delete(paramName);
              } else {
                nextParams.set(paramName, serialized);
              }
            } else if (def.type === 'page') {
              if (typeof value === 'number' && value > 0) {
                nextParams.set(paramName, String(value + 1));
              } else {
                nextParams.delete(paramName);
              }
            } else if (def.type === 'boolean') {
              if (value === true) {
                nextParams.set(paramName, 'true');
              } else {
                nextParams.delete(paramName);
              }
            } else {
              if (value == null || value === '' || value === def.defaultValue) {
                nextParams.delete(paramName);
              } else {
                nextParams.set(paramName, String(value));
              }
            }
          }

          return nextParams;
        },
        { replace: true },
      );
    },
    [schema, setSearchParams],
  );

  const setFilters = useCallback(
    (updates: Partial<T> | ((prev: T) => Partial<T>)) => {
      const current = filtersRef.current;
      const resolvedUpdates = typeof updates === 'function' ? updates(current) : updates;

      let next = { ...current, ...resolvedUpdates };

      // Check if page needs to be reset
      if ('page' in schema && resolvedUpdates.page === undefined) {
        const shouldResetPage = Object.keys(resolvedUpdates).some((k) =>
          pageResetKeys.includes(k as keyof T),
        );
        if (shouldResetPage) {
          next = { ...next, page: (schema as any).page.defaultValue };
        }
      }

      commitFilters(next);
    },
    [commitFilters, pageResetKeys, schema],
  );

  const setFilter = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setFilters({ [key]: value } as unknown as Partial<T>);
    },
    [setFilters],
  );

  const resetFilters = useCallback(
    (keepKeys: (keyof T)[] = []) => {
      const next = {} as T;
      const keepSet = new Set(keepKeys);

      for (const key of Object.keys(schema) as (keyof T)[]) {
        if (keepSet.has(key)) {
          next[key] = filtersRef.current[key];
        } else {
          next[key] = schema[key].defaultValue;
        }
      }

      commitFilters(next);
    },
    [commitFilters, schema],
  );

  const clampPage = useCallback(
    (total: number | undefined) => {
      if (total == null || total <= 0 || !('page' in schema) || !('pageSize' in schema)) {
        return;
      }
      const currentPage = filtersRef.current.page as number;
      const pageSize = filtersRef.current.pageSize as number;
      const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);

      if (currentPage > maxPage) {
        setFilter('page' as keyof T, maxPage as any);
      }
    },
    [schema, setFilter],
  );

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    clampPage,
  };
}

