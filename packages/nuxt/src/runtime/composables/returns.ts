import type {
  AddEvidenceInput,
  CancelReturnInput,
  CreateReturnInput,
  Paginated,
  Return,
  ReturnEvidence,
  ReturnsQuery,
} from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type ComputedRef, type MaybeRefOrGetter, type Ref, toValue } from 'vue'

import { queryKey, runTask, useMawjodTask } from '../internal'
import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

export interface UseReturnsReturn {
  returns: ComputedRef<Return[]>
  page: Ref<Paginated<Return> | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  mutating: Ref<boolean>
  mutationError: Ref<unknown>
  get: (returnId: string) => Promise<Return>
  create: (input: CreateReturnInput) => Promise<Return>
  cancel: (returnId: string, input: CancelReturnInput) => Promise<Return>
  addEvidence: (returnId: string, input: AddEvidenceInput) => Promise<ReturnEvidence>
  getEvidence: (returnId: string, evidenceId: string) => Promise<ReturnEvidence>
}

/** `/customer/returns`. Same list-filter contract as orders, keyed on `requested_at`. */
export function useReturns(
  query?: MaybeRefOrGetter<ReturnsQuery | undefined>,
  options: MawjodAsyncOptions = {},
): UseReturnsReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:returns:mutate')
  const resolved = computed(() => toValue(query))
  const asyncData = useAsyncData<Paginated<Return>>(
    `mawjod:returns:${queryKey(resolved.value)}`,
    () => api.returns.list(resolved.value),
    { watch: [resolved], ...options },
  )

  return {
    returns: computed(() => asyncData.data.value?.data ?? []),
    page: asyncData.data,
    pending: asyncData.pending,
    error: asyncData.error,
    refresh: () => asyncData.refresh(),
    mutating: task.pending,
    mutationError: task.error,
    get: (returnId) => runTask(task, () => api.returns.get(returnId)),
    create: (input) => runTask(task, () => api.returns.create(input)),
    cancel: (returnId, input) => runTask(task, () => api.returns.cancel(returnId, input)),
    addEvidence: (returnId, input) => runTask(task, () => api.returns.addEvidence(returnId, input)),
    getEvidence: (returnId, evidenceId) =>
      runTask(task, () => api.returns.getEvidence(returnId, evidenceId)),
  }
}
