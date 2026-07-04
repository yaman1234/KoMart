import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
<<<<<<< HEAD
import dayjs from 'dayjs';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { expenseService, reportsService } from '@/services';
=======
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { expenseService } from '@/services';
>>>>>>> dev
import type { Expense, ExpenseWritePayload, ListQueryParams } from '@/types';

const expenseStatsKey = [...QUERY_KEYS.expenses, 'stats'] as const;

function invalidateExpenseQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
  void queryClient.invalidateQueries({ queryKey: expenseStatsKey });
}

/** Summary cards on the expenses page — uses /reports/expense-summary instead of bulk list fetch. */
export function useExpensePageStats() {
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');

  const allTime = useQuery({
    queryKey: [...expenseStatsKey, 'all'],
    queryFn: () => reportsService.getExpenseSummary({ startDate: '2000-01-01', endDate: today }),
    staleTime: STALE_TIME.standard,
  });
  const thisMonth = useQuery({
    queryKey: [...expenseStatsKey, 'month', monthStart],
    queryFn: () => reportsService.getExpenseSummary({ startDate: monthStart, endDate: today }),
    staleTime: STALE_TIME.standard,
  });

  return {
    totalAll: allTime.data?.totalExpenses ?? 0,
    setupTotal: allTime.data?.setupInvestment ?? 0,
    thisMonthTotal: thisMonth.data?.totalExpenses ?? 0,
    isLoading: allTime.isLoading || thisMonth.isLoading,
  };
}

export function useExpenses(params?: ListQueryParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.expenses, params],
    queryFn: () => expenseService.getAll(params),
  });
}

export function useExpenseStats() {
  return useQuery({
    queryKey: QUERY_KEYS.expenseStats,
    queryFn: () => expenseService.getStats(),
    staleTime: STALE_TIME.standard,
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
<<<<<<< HEAD
      invalidateExpenseQueries(queryClient);
=======
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenseStats });
>>>>>>> dev
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseWritePayload> }) =>
      expenseService.update(id, data),
    onSuccess: (_, { id }) => {
<<<<<<< HEAD
      invalidateExpenseQueries(queryClient);
=======
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenseStats });
>>>>>>> dev
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expense(id) });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseService.delete(id),
    onSuccess: () => {
<<<<<<< HEAD
      invalidateExpenseQueries(queryClient);
=======
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenseStats });
>>>>>>> dev
    },
  });
}

export type { Expense };
