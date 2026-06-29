import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { expenseService } from '@/services';
import type { Expense, ExpenseWritePayload, ListQueryParams } from '@/types';

export function useExpenses(params?: ListQueryParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.expenses, params],
    queryFn: () => expenseService.getAll(params),
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.expense(id),
    queryFn: () => expenseService.getById(id),
    enabled: !!id,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ExpenseWritePayload) => expenseService.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseWritePayload> }) =>
      expenseService.update(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expense(id) });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseService.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
    },
  });
}

export type { Expense };
