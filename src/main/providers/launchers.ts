import { app, shell } from 'electron'
import { spawn } from 'node:child_process'

/**
 * Opens a launcher URL such as steam://run/400. Checks for a registered
 * handler first, because Windows would otherwise show an "open with" prompt
 * instead of reporting the failure.
 */
export async function openProtocolUrl(url: string, launcherName: string): Promise<void> {
  const scheme = url.slice(0, url.indexOf(':'))
  if (!scheme || !app.getApplicationNameForProtocol(`${scheme}://`)) {
    throw new Error(`${launcherName} isn't installed on this PC, or it no longer handles ${scheme}:// links.`)
  }
  await shell.openExternal(url, { activate: true })
}

/** Starts a packaged app by its shell:AppsFolder\<AUMID> path through Explorer. */
export function openShellAppsFolder(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    // Explorer exits with code 1 even on success, so only spawn failure counts.
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
