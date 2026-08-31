import type { StoreInfo, StoreSettings } from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type ComputedRef, type Ref } from 'vue'

import { useStoreAvailabilityState } from '../internal'
import type { MawjodAsyncOptions, StoreAvailabilityState } from '../types'
import { useMawjodApi } from './client'

/** `GET /store`. Store identity: id, status, the localized name, and the default locale. */
export function useStoreInfo(options: MawjodAsyncOptions = {}) {
  const api = useMawjodApi()

  return useAsyncData<StoreInfo>('mawjod:store', () => api.store.get(), options)
}

/** `GET /store/settings`. The storefront's operational switches. */
export function useStoreSettings(options: MawjodAsyncOptions = {}) {
  const api = useMawjodApi()

  return useAsyncData<StoreSettings>('mawjod:store:settings', () => api.store.settings(), options)
}

export interface UseStoreAvailabilityReturn {
  /** The raw state, shared across the app and carried through the SSR payload. */
  state: Ref<StoreAvailabilityState>
  /** `false` once any call has failed with `store_unavailable`. */
  available: ComputedRef<boolean>
  unavailable: ComputedRef<boolean>
  /** The problem document's `detail`, when the API sent one. */
  detail: ComputedRef<string | null>
  /** The request id to quote when reporting the outage. */
  requestId: ComputedRef<string | null>
  /** Mark the store available again. Call it before retrying. */
  reset: () => void
}

/**
 * One "shop paused" screen for the whole theme.
 *
 * `store_unavailable` (503) is possible on every endpoint: the request was refused before it
 * reached the handler and there is nothing to retry. The plugin wires the client's `onError` to
 * this flag, so any call anywhere flips it.
 */
export function useStoreAvailability(): UseStoreAvailabilityReturn {
  const state = useStoreAvailabilityState()

  return {
    state,
    available: computed(() => state.value.available),
    unavailable: computed(() => !state.value.available),
    detail: computed(() => state.value.detail),
    requestId: computed(() => state.value.requestId),
    reset: () => {
      state.value = { available: true, detail: null, requestId: null }
    },
  }
}
