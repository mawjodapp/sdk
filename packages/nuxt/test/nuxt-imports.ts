/**
 * A stand-in for Nuxt's virtual `#imports`, used only by this package's tests.
 *
 * `vitest.config.ts` at the repo root aliases `#imports` here, so the module's runtime files run
 * unmodified against a small, honest model of the four Nuxt primitives they use: an app instance,
 * a runtime config, keyed shared state, and the incoming request's headers.
 *
 * It models behaviour the tests actually depend on — `useState` returning the *same* ref for the
 * same key, `defineNuxtPlugin` returning a callable, `useRequestHeaders` narrowing to the keys it
 * was asked for — and nothing else.
 */
import { computed, ref, type Ref, shallowRef } from 'vue'

export interface MockNuxtApp {
  /** Present only while rendering on the server, exactly as in Nuxt. */
  ssrContext?: Record<string, unknown>
  [key: string]: unknown
}

export interface NuxtHarness {
  nuxtApp: MockNuxtApp
  runtimeConfig: { public: Record<string, unknown> }
  requestHeaders: Record<string, string>
  /** Every `useRequestHeaders(...)` call, so a test can assert it was *not* made on the client. */
  requestHeaderCalls: string[][]
  state: Map<string, Ref<unknown>>
}

export interface ResetOptions {
  /** `true` puts an `ssrContext` on the app, which is how the plugin detects the server. */
  ssr?: boolean
  runtimeConfig?: Record<string, unknown>
  requestHeaders?: Record<string, string>
}

let harness: NuxtHarness = build({})

function build(options: ResetOptions): NuxtHarness {
  return {
    nuxtApp: options.ssr === true ? { ssrContext: { event: {} } } : {},
    runtimeConfig: { public: options.runtimeConfig ?? {} },
    requestHeaders: options.requestHeaders ?? {},
    requestHeaderCalls: [],
    state: new Map(),
  }
}

/** Start a fresh Nuxt app. Call it in `beforeEach`. */
export function resetNuxt(options: ResetOptions = {}): NuxtHarness {
  harness = build(options)

  return harness
}

export function nuxtHarness(): NuxtHarness {
  return harness
}

/* -------------------------------------------------------------------------- */
/* The `#imports` surface the module uses                                      */
/* -------------------------------------------------------------------------- */

export function useNuxtApp(): MockNuxtApp {
  return harness.nuxtApp
}

export function useRuntimeConfig(): { public: Record<string, unknown> } {
  return harness.runtimeConfig
}

export function useState<T>(key: string, init?: () => T): Ref<T> {
  const existing = harness.state.get(key)

  if (existing !== undefined) {
    return existing as Ref<T>
  }

  const created = shallowRef(init?.()) as Ref<unknown>

  harness.state.set(key, created)

  return created as Ref<T>
}

export function useRequestHeaders(keys: string[] = []): Record<string, string> {
  harness.requestHeaderCalls.push([...keys])

  const picked: Record<string, string> = {}

  for (const key of keys) {
    const value = harness.requestHeaders[key]

    if (value !== undefined) {
      picked[key] = value
    }
  }

  return picked
}

export function defineNuxtPlugin<
  T extends { name?: string; setup: (nuxtApp: MockNuxtApp) => unknown },
>(plugin: T): T['setup'] {
  // Nuxt's object form returns the `setup` function with the plugin's metadata attached, moving
  // `name` to `_name` because a function's own `name` is not writable.
  const { setup, name, ...rest } = plugin

  return Object.assign(setup.bind(null), rest, { _name: name })
}

export function useAsyncData<T>(
  _key: string,
  handler: () => Promise<T>,
  options: { immediate?: boolean } = {},
): unknown {
  const data = shallowRef<T | null>(null)
  const pending = ref(false)
  const error = shallowRef<unknown>(null)

  const execute = async (): Promise<void> => {
    pending.value = true

    try {
      data.value = await handler()
      error.value = null
    } catch (thrown) {
      error.value = thrown
    } finally {
      pending.value = false
    }
  }

  const settled = options.immediate === false ? Promise.resolve() : execute()

  return Object.assign(settled, {
    data,
    pending,
    error,
    refresh: execute,
    execute,
    clear: () => {
      data.value = null
    },
    status: computed(() => {
      if (pending.value) {
        return 'pending'
      }

      return error.value === null ? 'success' : 'error'
    }),
  })
}
