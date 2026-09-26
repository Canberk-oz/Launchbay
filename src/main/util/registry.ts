import { psString, psStringArray, runPowerShellJson } from './powershell'

export type RegistryValue = string | number | null

export interface RegistryQuery {
  /** e.g. `HKCU\Software\Valve\Steam` or `HKEY_LOCAL_MACHINE\SOFTWARE\...` */
  key: string
  names: string[]
}

const HIVES: Record<string, string> = {
  HKCU: 'HKEY_CURRENT_USER',
  HKLM: 'HKEY_LOCAL_MACHINE',
  HKCR: 'HKEY_CLASSES_ROOT',
  HKU: 'HKEY_USERS'
}

function providerPath(key: string): string {
  const [hive, ...rest] = key.replace(/\//g, '\\').split('\\')
  const full = HIVES[hive.toUpperCase()] ?? hive
  return `Registry::${[full, ...rest].join('\\')}`
}

/**
 * Reads several registry values in a single PowerShell invocation. Missing
 * keys and values come back as null rather than throwing.
 */
export async function readRegistry(queries: RegistryQuery[]): Promise<Record<string, RegistryValue>[]> {
  const entries = queries
    .map((q) => `@{ Key = ${psString(providerPath(q.key))}; Names = ${psStringArray(q.names)} }`)
    .join(',\n  ')
  const script = `
$queries = @(
  ${entries}
)
$result = foreach ($q in $queries) {
  $o = [ordered]@{}
  $item = Get-ItemProperty -LiteralPath $q.Key -ErrorAction SilentlyContinue
  foreach ($n in $q.Names) {
    if ($item -and ($item.PSObject.Properties.Name -contains $n)) { $o[$n] = $item.$n } else { $o[$n] = $null }
  }
  [pscustomobject]$o
}
[Console]::Out.Write((ConvertTo-Json -InputObject @($result) -Compress -Depth 3))
`
  const parsed = await runPowerShellJson<Record<string, RegistryValue>[] | Record<string, RegistryValue>>(script, {
    timeoutMs: 15_000
  })
  return Array.isArray(parsed) ? parsed : [parsed]
}
