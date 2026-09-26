// Parser for Valve's text KeyValues format (.vdf / .acf).
//
// Steam writes quoted keys and values with backslash escapes, nested blocks in
// braces, and occasionally `// comments` or `[$WIN32]`-style conditionals.
// Older files sometimes leave backslashes in paths unescaped, so an unknown
// escape sequence is kept literally instead of being dropped.

export type VdfValue = string | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

const ESCAPES: Record<string, string> = { '\\': '\\', '"': '"', n: '\n', t: '\t', r: '\r' }

export function parseVdf(input: string): VdfObject {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const root: VdfObject = {}
  const stack: VdfObject[] = [root]
  let pendingKey: string | null = null
  let i = 0
  const n = text.length

  const skipTrivia = (): void => {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++
      } else if (c === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++
      } else {
        break
      }
    }
  }

  const readQuoted = (): string => {
    i++ // opening quote
    let out = ''
    while (i < n) {
      const c = text[i]
      if (c === '\\' && i + 1 < n) {
        const mapped = ESCAPES[text[i + 1]]
        if (mapped !== undefined) {
          out += mapped
          i += 2
          continue
        }
        out += c
        i++
        continue
      }
      if (c === '"') {
        i++
        return out
      }
      out += c
      i++
    }
    return out // unterminated string: take what we have
  }

  const readBare = (): string => {
    const start = i
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '{' || c === '}' || c === '"') break
      i++
    }
    return text.slice(start, i)
  }

  while (true) {
    skipTrivia()
    if (i >= n) break
    const c = text[i]

    if (c === '{') {
      i++
      const obj: VdfObject = {}
      const parent = stack[stack.length - 1]
      parent[pendingKey ?? ''] = obj
      stack.push(obj)
      pendingKey = null
      continue
    }
    if (c === '}') {
      i++
      if (stack.length > 1) stack.pop()
      pendingKey = null
      continue
    }

    const token = c === '"' ? readQuoted() : readBare()
    if (token.startsWith('[$') && token.endsWith(']') && c !== '"') {
      continue // platform conditional, e.g. [$WIN32]
    }
    if (pendingKey === null) {
      pendingKey = token
    } else {
      stack[stack.length - 1][pendingKey] = token
      pendingKey = null
    }
  }

  return root
}

/** Case-insensitive child lookup; Steam is inconsistent about key casing. */
export function vdfGet(obj: VdfValue | undefined, key: string): VdfValue | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  if (key in obj) return obj[key]
  const lower = key.toLowerCase()
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k]
  }
  return undefined
}

/** Follows a path of keys case-insensitively. */
export function vdfPath(obj: VdfValue | undefined, ...keys: string[]): VdfValue | undefined {
  let cur: VdfValue | undefined = obj
  for (const key of keys) {
    cur = vdfGet(cur, key)
    if (cur === undefined) return undefined
  }
  return cur
}

export function vdfString(obj: VdfValue | undefined, key: string): string | undefined {
  const v = vdfGet(obj, key)
  return typeof v === 'string' ? v : undefined
}

export function vdfObject(obj: VdfValue | undefined, key: string): VdfObject | undefined {
  const v = vdfGet(obj, key)
  return v && typeof v === 'object' ? v : undefined
}
