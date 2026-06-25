import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { transactionService } from '@/services';
import type { ListQueryParams } from '@/types';

export function useTransactions(params?: ListQueryParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.transactions, params],
    queryFn: () => transactionService.getAll(params),
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.transaction(id),
    queryFn: () => transactionService.getById(id),
    enabled: !!id,
  });
}
