# `platform`

API metadata and health probes. Public, unauthenticated, and rarely called by a storefront at
runtime. They are here for deployment checks and version reporting.

```ts
mawjod.platform.info()
mawjod.platform.health.live()
mawjod.platform.health.ready()
```

## `platform.info()`

```ts
info(): Promise<PlatformInfo>
```

`GET /api/v1/platform`.

```ts
interface PlatformInfo {
  name: string
  api_version: string
}
```

Useful in a footer or a diagnostics page, so a bug report says which API version it came from.

## `platform.health.live()`

```ts
live(): Promise<HealthStatus>
```

`GET /api/v1/health/live`. Process liveness.

```ts
interface HealthStatus {
  status: string   // 'ok'
}
```

## `platform.health.ready()`

```ts
ready(): Promise<HealthReady>
```

`GET /api/v1/health/ready`. Deployment readiness: infrastructure plus the store context.

```ts
interface HealthReady {
  status: string
  checks: {
    postgresql: boolean
    valkey: boolean
    meilisearch: boolean
    store: boolean
  }
  details?: {
    store_id: string
    store_status: string
  }
}
```

`details` is only present once the store context resolves.

A failing dependency answers `503 deployment_not_ready`. The problem document carries the same
`checks` object, with a `false` entry for whatever is down, readable through `error.problem.checks`:

```ts
import { isMawjodApiError } from '@mawjod/api'

try {
  await mawjod.platform.health.ready()
} catch (error) {
  if (isMawjodApiError(error) && error.code === 'deployment_not_ready') {
    console.error(error.problem.checks) // { postgresql: true, valkey: false, … }
  }
}
```

## Do not use these as a store-open check

`health/ready` reports whether the deployment can serve. Whether the **shop** is open is a different
question, and the answer arrives as `503 store_unavailable` on whichever call the shopper made. Use
[`isStoreUnavailable`](/api/errors#type-guards) and one paused screen for that. See
[Errors → store_unavailable is possible everywhere](/guide/errors#store-unavailable-is-possible-everywhere).

Polling `health/ready` from a storefront adds load and answers a question the shopper did not ask.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `deployment_not_ready` | 503 | `health.ready` |
| `validation_failed` | 422 | all |
| `rate_limited` | 429 | all |

## In Nuxt

There is no composable for these. Reach for the raw client:

```ts
const api = useMawjodApi()
const { data } = await useAsyncData('platform', () => api.platform.info())
```
