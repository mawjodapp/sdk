import type { Address, AddressInput, Customer, UpdateProfileInput } from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, useMawjodTask } from '../internal'
import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

export interface UseCustomerProfileReturn {
  profile: Ref<Customer | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  updating: Ref<boolean>
  updateError: Ref<unknown>
  update: (input: UpdateProfileInput) => Promise<Customer>
}

/** `GET|PATCH /customer/profile`. The update writes its response back into `profile`. */
export function useCustomerProfile(options: MawjodAsyncOptions = {}): UseCustomerProfileReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:customer:profile:update')
  const asyncData = useAsyncData<Customer>(
    'mawjod:customer:profile',
    () => api.customer.profile.get(),
    options,
  )

  return {
    profile: asyncData.data,
    pending: asyncData.pending,
    error: asyncData.error,
    refresh: () => asyncData.refresh(),
    updating: task.pending,
    updateError: task.error,
    update: async (input) => {
      const next = await runTask(task, () => api.customer.profile.update(input))

      asyncData.data.value = next

      return next
    },
  }
}

export interface UseAddressesReturn {
  addresses: ComputedRef<Address[]>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  mutating: Ref<boolean>
  mutationError: Ref<unknown>
  create: (input: AddressInput) => Promise<Address>
  update: (addressId: string, input: AddressInput) => Promise<Address>
  remove: (addressId: string) => Promise<void>
}

/**
 * `/customer/addresses`.
 *
 * Every mutation refetches the list rather than patching it locally: the server decides which
 * address is default, and a create or update can move that flag off another row.
 */
export function useAddresses(options: MawjodAsyncOptions = {}): UseAddressesReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:customer:addresses:mutate')
  const asyncData = useAsyncData<Address[]>(
    'mawjod:customer:addresses',
    () => api.customer.addresses.list(),
    options,
  )

  return {
    addresses: computed(() => asyncData.data.value ?? []),
    pending: asyncData.pending,
    error: asyncData.error,
    refresh: () => asyncData.refresh(),
    mutating: task.pending,
    mutationError: task.error,
    create: async (input) => {
      const created = await runTask(task, () => api.customer.addresses.create(input))

      await asyncData.refresh()

      return created
    },
    update: async (addressId, input) => {
      const updated = await runTask(task, () => api.customer.addresses.update(addressId, input))

      await asyncData.refresh()

      return updated
    },
    remove: async (addressId) => {
      await runTask(task, () => api.customer.addresses.remove(addressId))
      await asyncData.refresh()
    },
  }
}
