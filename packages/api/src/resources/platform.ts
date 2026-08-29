import type { Transport } from '../http.js'
import type { HealthReady, HealthStatus, PlatformInfo } from '../types.js'

/**
 * Infrastructure metadata and probes. A storefront rarely calls these at runtime; they are here
 * for deployment checks and version reporting.
 */
export interface PlatformNamespace {
  info(): Promise<PlatformInfo>
  health: {
    /** Process liveness. */
    live(): Promise<HealthStatus>
    /** Deployment readiness. A failing dependency answers `503 deployment_not_ready`. */
    ready(): Promise<HealthReady>
  }
}

export function createPlatformNamespace(transport: Transport): PlatformNamespace {
  return {
    info: () => transport.data<PlatformInfo>({ method: 'GET', path: '/platform' }),
    health: {
      live: () => transport.data<HealthStatus>({ method: 'GET', path: '/health/live' }),
      ready: () => transport.data<HealthReady>({ method: 'GET', path: '/health/ready' }),
    },
  }
}
