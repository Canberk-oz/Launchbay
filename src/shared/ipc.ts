// IPC channel names. Invoke channels are renderer → main request/response;
// event channels are main → renderer pushes.

export const IPC = {
  // invoke
  getInitialState: 'app:get-initial-state',
  refreshLibrary: 'library:refresh',
  setFavorite: 'game:set-favorite',
  setHidden: 'game:set-hidden',
  launchGame: 'game:launch',
  getTrailer: 'game:get-trailer',
  showContextMenu: 'game:show-context-menu',
  getGameDetails: 'game:get-details',
  updateSettings: 'settings:update',
  setHotkey: 'hotkey:set',
  suspendHotkey: 'hotkey:suspend',
  hideWindow: 'window:hide',
  getMediaCacheInfo: 'media:get-cache-info',
  clearTrailerCache: 'media:clear-trailers',

  // events
  libraryPatch: 'library:patch',
  scanStatus: 'library:scan-status',
  settingsChanged: 'settings:changed',
  hotkeyStatus: 'hotkey:status',
  windowVisibility: 'window:visibility',
  contextAction: 'game:context-action',
  openSettings: 'app:open-settings',
  notice: 'app:notice'
} as const
