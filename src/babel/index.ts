import * as path from 'node:path'
import type { PluginObj, types as BabelTypes } from '@babel/core'

interface BabelAPI {
  types: typeof BabelTypes
}

interface PluginState {
  filename?: string
  cwd?: string
  opts: { attr?: string }
}

/**
 * Babel plugin: tag every intrinsic (host) JSX element with
 * `data-uiv-src="relative/path.tsx:line:col"` so the overlay can resolve a
 * clicked DOM node back to its exact source location. Dev-only; React-19 safe
 * (does not rely on the removed fiber `_debugSource`).
 */
export default function uivisorBabel({ types: t }: BabelAPI): PluginObj<PluginState> {
  return {
    name: 'uivisor-source',
    visitor: {
      JSXOpeningElement(nodePath, state) {
        const node = nodePath.node
        const name = node.name
        if (!t.isJSXIdentifier(name)) return
        // Only intrinsic elements (lowercase) become real DOM nodes with attrs.
        if (!/^[a-z]/.test(name.name)) return
        if (!node.loc) return

        const attrName = state.opts.attr || 'data-uiv-src'
        const already = node.attributes.some(
          (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name) &&
            a.name.name === attrName,
        )
        if (already) return

        const filename = state.filename || 'unknown'
        const cwd = state.cwd || process.cwd()
        const rel = filename === 'unknown' ? filename : path.relative(cwd, filename)
        const value = `${rel}:${node.loc.start.line}:${node.loc.start.column + 1}`

        node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(attrName), t.stringLiteral(value)),
        )
      },
    },
  }
}
