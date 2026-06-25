import { transformSync } from '@babel/core'
import uivisorBabel from '../babel/index.js'

interface LoaderContext {
  async(): (err: Error | null, code?: string, map?: unknown) => void
  resourcePath: string
  rootContext?: string
  getOptions?: () => { attr?: string }
}

/**
 * Next.js webpack loader (dev only): runs the uivisor Babel pass to inject
 * `data-uiv-src="file:line:col"` onto host JSX *before* next-swc-loader compiles
 * the module. Registered with `enforce: 'pre'` so it sees the original source and
 * keeps SWC for the actual compile (no Babel opt-out, unlike a .babelrc plugin).
 */
export default function uivisorNextLoader(
  this: LoaderContext,
  source: string,
  inMap: unknown,
): void {
  const callback = this.async()
  const resourcePath = this.resourcePath || ''

  if (!/\.[jt]sx$/.test(resourcePath) || !source.includes('<')) {
    callback(null, source, inMap)
    return
  }

  const attr = this.getOptions?.().attr || 'data-uiv-src'

  try {
    const result = transformSync(source, {
      filename: resourcePath,
      cwd: this.rootContext || process.cwd(),
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      parserOpts: { plugins: ['jsx', 'typescript'], sourceType: 'module' },
      generatorOpts: { retainLines: true },
      plugins: [[uivisorBabel, { attr }]],
    })
    if (!result?.code) {
      callback(null, source, inMap)
      return
    }
    callback(null, result.code, result.map ?? inMap)
  } catch {
    // Never break the dev build over a source tag.
    callback(null, source, inMap)
  }
}
