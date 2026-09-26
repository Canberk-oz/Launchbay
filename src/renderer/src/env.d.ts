/// <reference types="vite/client" />
import type { LaunchbayApi } from '@shared/api'

declare global {
  interface Window {
    launchbay: LaunchbayApi
  }
}

export {}
