import type { CartTokenStorage, MawjodClient } from '@mawjod/api'
import { useNuxtApp, useRuntimeConfig, useState } from '#imports'
import { type Ref, shallowRef } from 'vue'

import type { MawjodPublicRuntimeConfig, StoreAvailabilityState } from './types'

/** `useState` keys. Stable and namespaced, so a theme can `clearNuxtState` them by name. */
export const STATE_KEYS = {
  locale: 'mawjod:locale',
  storeAvailability: 'mawjod:store-availability',
  cart: 'mawjod:cart',
  cartQuote: 'mawjod:cart-quote',
  customer: 'mawjod:customer',
} as const

/** Injected by the plugin. Not part of the public surface — reach for `useMawjodApi()` instead. */
interface MawjodNuxtApp {
  $mawjod?: MawjodClient
  $mawjodCartTokenStorage?: CartTokenStorage
  _mawjodRefs?: Map<string, Ref<unknown>>
}

export function useMawjodNuxtApp(): MawjodNuxtApp {
  return useNuxtApp() as unknown as MawjodNuxtApp
}

export function useMawjodPublicConfig(): MawjodPublicRuntimeConfig {
  const publicConfig = useRuntimeConfig().public as Record<string, unknown>
  const config = publicConfig['mawjod'] as Partial<MawjodPublicRuntimeConfig> | undefined

  return { apiBase: config?.apiBase ?? '', locale: config?.locale ?? '' }
}

/**
 * A ref shared across one Nuxt app instance — one SSR request, or one browser page — and never
 * written to the SSR payload.
 *
 * `useState` is the right home for anything that must survive hydration, but it has to serialize.
 * Errors, in-flight flags and `Idempotency-Key` pairs must not leak from one visitor's request into
 * another's, and a module-scope `ref()` would do exactly that on the server. This gives them a
 * lifetime that matches the app instance instead.
 */
export function useMawjodRef<T>(key: string, init: () => T): Ref<T> {
  const nuxtApp = useMawjodNuxtApp()
  const store = (nuxtApp._mawjodRefs ??= new Map<string, Ref<unknown>>())
  const existing = store.get(key)

  if (existing !== undefined) {
    return existing as Ref<T>
  }

  const created = shallowRef(init())

  store.set(key, created as Ref<unknown>)

  return created
}

/** The `pending` / `error` pair every mutation-style composable exposes. */
export interface MawjodTask {
  pending: Ref<boolean>
  error: Ref<unknown>
}

export function useMawjodTask(key: string): MawjodTask {
  return {
    pending: useMawjodRef<boolean>(`${key}:pending`, () => false),
    error: useMawjodRef<unknown>(`${key}:error`, () => null),
  }
}

/** Runs `fn`, tracking it on `task`. The error is recorded *and* rethrown — nothing is swallowed. */
export async function runTask<T>(task: MawjodTask, fn: () => Promise<T>): Promise<T> {
  task.pending.value = true
  task.error.value = null

  try {
    return await fn()
  } catch (error) {
    task.error.value = error
    throw error
  } finally {
    task.pending.value = false
  }
}

export function useMawjodLocaleState(): Ref<string | null> {
  const config = useMawjodPublicConfig()

  return useState<string | null>(STATE_KEYS.locale, () => config.locale || null)
}

export function useStoreAvailabilityState(): Ref<StoreAvailabilityState> {
  return useState<StoreAvailabilityState>(STATE_KEYS.storeAvailability, () => ({
    available: true,
    detail: null,
    requestId: null,
  }))
}

/**
 * A deterministic key fragment for a query object, so two lists on one page do not collide in the
 * `useAsyncData` cache and the same list keeps its key across navigations.
 */
export function queryKey(value: unknown): string {
  if (value === undefined || value === null) {
    return 'default'
  }

  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
      return inner
    }

    const record = inner as Record<string, unknown>

    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = record[key]

        return sorted
      }, {})
  })
}
