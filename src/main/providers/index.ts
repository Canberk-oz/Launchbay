import type { Platform } from '@shared/types'
import { epicProvider } from './epic'
import { steamProvider } from './steam'
import { xboxProvider } from './xbox'
import type { GameProvider } from './types'

/** Every registered storefront. Add new providers here. */
export const providers: readonly GameProvider[] = [steamProvider, epicProvider, xboxProvider]

export function providerFor(platform: Platform): GameProvider {
  const provider = providers.find((p) => p.platform === platform)
  if (!provider) throw new Error(`No provider registered for ${platform}`)
  return provider
}
