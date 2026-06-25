import * as path from 'node:path'
import { createRequire } from 'node:module'

interface WebpackContext {
  dev: boolean
  isServer: boolean
}

// Next config is intentionally loose-typed to avoid a hard dependency on `next`.
// `webpack` is widened to `| null | undefined` so a real `NextConfig` from `next`
// (whose `webpack?` is nullable) assigns to this param without a cast.
type NextConfig = {
  webpack?: ((config: any, ctx: WebpackContext) => any) | null
  turbopack?: any
  [key: string]: unknown
}

export interface UivisorNextOptions {
  /** data attribute name for source locations. Default: "data-uiv-src" */
  attr?: string
  /**
   * Register the source-location loader for Turbopack (`turbopack.rules`) so
   * `data-uiv-src` is injected under plain `next dev` too. Default: true.
   * Set false to disable if it ever conflicts with your setup (the overlay still
   * works via <UivisorOverlay/>; use `next dev --webpack` for source attrs then).
   */
  turbopack?: boolean
}

const isProd = () => process.env.NODE_ENV === 'production'
const isTurbopack = () => !!process.env.TURBOPACK || !!process.env.TURBOPACK_DEV

/**
 * Next major version, for picking the right Turbopack config key. 0 if unknown.
 *
 * Resolves the CONSUMER's installed `next` at runtime from their project cwd
 * (where `next dev` runs). The require is built dynamically via createRequire so
 * the bundler cannot statically inline `next/package.json` at uivisor build time —
 * a literal `require('next/package.json')` gets baked to whatever `next` was
 * present when uivisor was built, which silently picked the wrong config key.
 */
function nextMajor(): number {
  try {
    const req = createRequire(path.join(process.cwd(), 'package.json'))
    return parseInt(req('next/package.json').version, 10) || 0
  } catch {
    return 0
  }
}

let hintShown = false
function turbopackHint(canSourceMap: boolean): void {
  if (hintShown || !isTurbopack() || isProd()) return
  hintShown = true
  // eslint-disable-next-line no-console
  console.log(
    '\n[uivisor] Turbopack detected.\n' +
      '  • Overlay: render <UivisorOverlay/> from "uivisor/next/overlay" in your root layout.\n' +
      (canSourceMap
        ? '  • Source locations: ON via turbopack.rules.\n'
        : '  • Exact file:line: use `next dev --webpack` (or remove `{ turbopack: false }`).\n'),
  )
}

/**
 * Wrap your Next.js config to enable uivisor in dev.
 *
 *   // next.config.ts / .mjs
 *   import { withUivisor } from 'uivisor/next'
 *   export default withUivisor({ ...yourConfig })
 *
 *   // next.config.js (CommonJS)
 *   const { withUivisor } = require('uivisor/next')
 *   module.exports = withUivisor({ ...yourConfig })
 *
 * Then render <UivisorOverlay/> (from "uivisor/next/overlay") in your root layout.
 *
 * - webpack (`next dev --webpack`): injects `data-uiv-src` + the overlay automatically.
 * - Turbopack (`next dev`): the overlay works via <UivisorOverlay/>; source locations
 *   need either `--webpack` or `{ turbopack: true }` (experimental).
 * Dev-only — nothing is added to production builds.
 */
export function withUivisor(
  nextConfig: NextConfig = {},
  options: UivisorNextOptions = {},
): NextConfig {
  const attr = options.attr || 'data-uiv-src'
  const loaderPath = path.join(__dirname, 'loader.cjs')
  const overlayPath = path.join(__dirname, '..', 'overlay', 'index.js')
  // On by default, but only actually added when this run IS Turbopack (so a
  // `--webpack` run doesn't get a stray turbopack config, and vice-versa).
  const useTurbopack = options.turbopack !== false && isTurbopack() && !isProd()

  turbopackHint(useTurbopack)

  const out: NextConfig = { ...nextConfig }

  // Only attach our webpack() under webpack — otherwise Next warns "Webpack is
  // configured while Turbopack is not". Preserve the user's own webpack fn either way.
  if (!isTurbopack()) {
    out.webpack = (config: any, ctx: WebpackContext) => {
      if (typeof nextConfig.webpack === 'function') {
        config = nextConfig.webpack(config, ctx)
      }
      if (!ctx.dev) return config

      // 1. Source-location loader — runs before next-swc-loader on both server &
      //    client compiles, so SSR markup and client hydration carry identical attrs.
      config.module = config.module || {}
      config.module.rules = config.module.rules || []
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: 'pre',
        use: [{ loader: loaderPath, options: { attr } }],
      })

      // 2. Inject the overlay into the client entry (dev only) as a convenience —
      //    <UivisorOverlay/> also works and is required under Turbopack.
      if (!ctx.isServer) {
        const prevEntry = config.entry
        config.entry = async () => {
          const entries = typeof prevEntry === 'function' ? await prevEntry() : prevEntry
          for (const key of ['main-app', 'main.js', 'main']) {
            const e = entries[key]
            if (!e) continue
            if (Array.isArray(e)) {
              if (!e.includes(overlayPath)) e.unshift(overlayPath)
            } else if (e && Array.isArray(e.import)) {
              if (!e.import.includes(overlayPath)) e.import.unshift(overlayPath)
            }
          }
          return entries
        }
      }

      return config
    }
  }

  // 3. Turbopack source-location loader (experimental, opt-in).
  if (useTurbopack) {
    const ld = [{ loader: 'uivisor/next/loader', options: { attr } }]
    // `as` keeps our annotated output in Turbopack's TS/JSX pipeline (SWC) —
    // without it Turbopack parses the .tsx output as plain JS and fails.
    const rules = {
      '*.tsx': { loaders: ld, as: '*.tsx' },
      '*.jsx': { loaders: ld, as: '*.jsx' },
    }
    const major = nextMajor()
    if (major === 0 || major >= 15) {
      // Next 15.3+ / 16: top-level `turbopack`.
      out.turbopack = {
        ...(nextConfig.turbopack as object),
        rules: { ...((nextConfig.turbopack as any)?.rules ?? {}), ...rules },
      }
    } else {
      // Next 13–14: `experimental.turbo`.
      const exp = (nextConfig as any).experimental ?? {}
      out.experimental = {
        ...exp,
        turbo: { ...(exp.turbo ?? {}), rules: { ...(exp.turbo?.rules ?? {}), ...rules } },
      }
    }
  }

  return out
}

export default withUivisor
