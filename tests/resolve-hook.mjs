// Lets plain Node run the TypeScript sources: resolves extensionless relative
// imports to .ts files and maps the @shared/* alias, mirroring the Vite config.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

function withExtension(target) {
  for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      try {
        if (path.extname(candidate)) return candidate
      } catch {}
    }
  }
  return target
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@shared/')) {
    const target = withExtension(path.join(root, 'src', 'shared', specifier.slice('@shared/'.length)))
    return next(pathToFileURL(target).href, context)
  }
  const parent = context.parentURL
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && parent?.startsWith('file:') && !path.extname(specifier)) {
    const target = withExtension(path.resolve(path.dirname(fileURLToPath(parent)), specifier))
    return next(pathToFileURL(target).href, context)
  }
  return next(specifier, context)
}
