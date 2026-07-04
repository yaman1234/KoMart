import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME, UOM_OPTIONS } from '@/constants';
import { uomService } from '@/services';
import type { Uom } from '@/types';

export function useUoms(includeInactive = false) {
  return useQuery({
    queryKey: [...QUERY_KEYS.uoms, includeInactive],
    queryFn: () => uomService.getAll(includeInactive),
    staleTime: STALE_TIME.static,
  });
}

export function useCreateUom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; label: string; description?: string }) =>
      uomService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.uoms });
    },
  });
}

export function useUpdateUom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      code?: string;
      label?: string;
      description?: string;
      isActive?: boolean;
    }) => uomService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.uoms });
    },
  });
}

export function useDeleteUom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => uomService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.uoms });
    },
  });
}

export type UomOption = { value: string; label: string };

/** Active UOM options for dropdowns; falls back to static list while loading. */
export function useUomOptions(includeInactive = false): UomOption[] {
  const { data } = useUoms(includeInactive);
  return useMemo(() => {
    const fromApi = (data ?? [])
      .filter((u: Uom) => u.isActive)
      .map((u: Uom) => ({ value: u.code, label: u.label }));
    return fromApi.length > 0 ? fromApi : [...UOM_OPTIONS];
  }, [data]);
}

export function useUomLabelMap(): Map<string, string> {
  const options = useUomOptions();
  return useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
}
