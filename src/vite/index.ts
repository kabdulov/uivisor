import { transformSync } from '@babel/core'
import type { Plugin } from 'vite'
import uivisorBabel from '../babel/index.js'

export interface UivisorOptions {
  /** Files to annotate with source locations. Default: /\.[jt]sx$/ */
  include?: RegExp
  /** Custom data attribute name. Default: "data-uiv-src" */
  attr?: string
  /** Force-enable outside dev (not recommended). Default: dev only. */
  force?: boolean
}

/**
 * Vite plugin (dev-only):
 *  1. Injects `data-uiv-src="file:line:col"` onto host JSX elements via Babel
 *     (runs `enforce: 'pre'`, before @vitejs/plugin-react).
 *  2. Injects the uivisor overlay into the page.
 *
 * Usage:
 *   import react from '@vitejs/plugin-react'
 *   import uivisor from 'uivisor/vite'
 *   export default defineConfig({ plugins: [react(), uivisor()] })
 */
let warned = false
function warnOrder(): void {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    '\n[uivisor] Source locations are disabled because another plugin transformed JSX first.\n' +
      '[uivisor] Place uivisor() BEFORE react() in your Vite `plugins` array:\n' +
      '[uivisor]   plugins: [uivisor(), react()]\n',
  )
}

const VIRTUAL = 'virtual:uivisor-overlay'
const RESOLVED = '\0' + VIRTUAL

export default function uivisor(options: UivisorOptions = {}): Plugin {
  const include = options.include ?? /\.[jt]sx$/
  const attr = options.attr ?? 'data-uiv-src'
  let enabled = false

  return {
    name: 'uivisor',
    enforce: 'pre',
    apply: options.force ? undefined : 'serve',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED
      return null
    },
    load(id) {
      if (id === RESOLVED) return `import "uivisor/overlay";`
      return null
    },
    configResolved(config) {
      enabled = options.force === true || config.command === 'serve'
    },
    transform(code, id) {
      if (!enabled) return null
      const file = id.split('?')[0]
      if (file.includes('/node_modules/')) return null
      if (!include.test(file)) return null
      if (!code.includes('<')) return null // cheap skip for files without JSX

      // If another framework plugin (e.g. @vitejs/plugin-react's refresh pass,
      // which is also `enforce: 'pre'`) already transformed this module, our
      // line numbers would be wrong. Detect it, warn once, and skip rather than
      // emit misleading source locations.
      if (/@react-refresh|_jsxDEV|jsxDEV\(/.test(code.slice(0, 400))) {
        warnOrder()
        return null
      }

      try {
        const result = transformSync(code, {
          filename: file,
          cwd: process.cwd(),
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          parserOpts: {
            plugins: ['jsx', 'typescript'],
            sourceType: 'module',
          },
          generatorOpts: { retainLines: true },
          plugins: [[uivisorBabel, { attr }]],
        })
        if (!result?.code) return null
        return { code: result.code, map: result.map }
      } catch {
        // If our annotation pass fails on an exotic file, skip it silently —
        // never break the user's dev server over a source tag.
        return null
      }
    },
    transformIndexHtml() {
      if (!enabled) return
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `/@id/${RESOLVED.replace('\0', '__x00__')}` },
          injectTo: 'body',
        },
      ]
    },
  }
}
