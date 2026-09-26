import '@fontsource-variable/archivo/wdth.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/library.css'
import './styles/overlays.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import type { LibraryPatch } from '@shared/types'
import { applyPatch, hydrate, useStore } from './store'

async function start(): Promise<void> {
  // Library patches are subscribed to before the initial state is requested
  // and held until it arrives, so none is lost in between; applyPatch skips
  // the ones the initial state already includes.
  const early: LibraryPatch[] = []
  window.launchbay.onLibraryPatch((patch) => (useStore.getState().ready ? applyPatch(patch) : early.push(patch)))

  // Load the cached library and settings before the first paint so the view
  // mode, tile size and covers never flash from defaults.
  const initial = await window.launchbay.getInitialState()
  hydrate(initial)
  early.forEach(applyPatch)
  // Unpackaged builds expose the store for DevTools and performance tests.
  if (!initial.isPackaged) Object.assign(window, { __launchbayStore: useStore })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void start()
