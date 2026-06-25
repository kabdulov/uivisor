import type { ElementIdentity, SourceInfo, SourceLocation } from './types.js'

/** Parse the "relpath:line:col" value injected by the uivisor babel plugin. */
export function parseSourceAttr(raw: string | undefined | null): SourceLocation | null {
  if (!raw) return null
  const m = /^(.*):(\d+):(\d+)$/.exec(raw)
  if (!m) return null
  return { file: m[1], line: Number(m[2]), column: Number(m[3]) }
}

/** Tier 1: build-time data-uiv-src attribute (React-19 safe, column-precise). */
export function readBuildSource(el: Element): SourceLocation | null {
  const holder = el.closest('[data-uiv-src]') as HTMLElement | null
  if (!holder) return null
  return parseSourceAttr(holder.getAttribute('data-uiv-src'))
}

function getFiber(el: Element): any {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  )
  return key ? (el as any)[key] : null
}

// React/Next internal wrappers that aren't useful as a "component name" anchor.
const INTERNAL_COMPONENTS = new Set([
  'ScrollAndFocusHandler',
  'RenderFromTemplateContext',
  'ClientPageRoot',
  'ClientSegmentRoot',
  'StaticGenerationSearchParamsBailoutProvider',
  'ViewTransition',
  'ReactDevOverlay',
  'HotReload',
  'AppDevOverlay',
  'DevRootHTTPAccessFallbackBoundary',
  'PathnameContextProviderAdapter',
])

function isInternalName(name: string): boolean {
  // Next's client wrappers are *Router / *Boundary; underscore-prefixed are private.
  return (
    INTERNAL_COMPONENTS.has(name) ||
    /(?:Boundary|Router)$/.test(name) ||
    name.startsWith('_')
  )
}

function fiberName(t: any): string | null {
  if (typeof t === 'function') return t.displayName || t.name || null
  if (t && typeof t === 'object') {
    const inner = t.type || t.render // memo / forwardRef
    if (typeof inner === 'function') return t.displayName || inner.displayName || inner.name || null
    if (typeof t.displayName === 'string') return t.displayName
  }
  return null
}

/** Tier 2: nearest *user* component from the fiber tree, skipping framework internals. */
export function readComponentName(el: Element): string | null {
  let fiber = getFiber(el)
  let guard = 0
  while (fiber && guard++ < 80) {
    const name = fiberName(fiber.type)
    if (name && !isInternalName(name)) return name
    fiber = fiber.return
  }
  return null
}

/** Tier 3: a reasonably stable CSS selector path as a cross-check anchor. */
export function buildSelector(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth++ < 6) {
    let part = node.tagName.toLowerCase()
    if (node.id) {
      parts.unshift(`${part}#${cssEscape(node.id)}`)
      break
    }
    const testid = node.getAttribute('data-testid')
    if (testid) {
      parts.unshift(`${part}[data-testid="${testid}"]`)
      break
    }
    const parent: Element | null = node.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node!.tagName,
      )
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`
      }
    }
    parts.unshift(part)
    node = node.parentElement
  }
  return parts.join(' > ')
}

function cssEscape(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

/** Component name from a source file path (convention: file basename === component). */
function componentFromFile(file: string): string | null {
  const base = file.split(/[\\/]/).pop() || file
  const name = base.replace(/\.[jt]sx?$/, '')
  // page/layout/route files aren't component names worth showing.
  if (/^(page|layout|route|template|loading|error|not-found|index)$/.test(name)) return null
  return name
}

/**
 * Count how many elements on the page are "the same" as this one — i.e. repeated
 * instances / siblings. Primary signal: identical `data-uiv-src` (same JSX origin
 * rendered N times). Fallback: same tag + same class signature.
 */
export function countInstances(el: Element): number {
  try {
    const doc = el.ownerDocument
    const holder = el.closest('[data-uiv-src]')
    const raw = holder?.getAttribute('data-uiv-src')
    if (raw) {
      let n = 0
      doc.querySelectorAll('[data-uiv-src]').forEach((e) => {
        if (e.getAttribute('data-uiv-src') === raw) n++
      })
      if (n > 0) return n
    }
    const sig = (e: Element) => `${e.tagName}|${Array.from(e.classList).sort().join(' ')}`
    const mine = sig(el)
    if (!el.classList.length) return 1
    let n = 0
    doc.querySelectorAll(el.tagName).forEach((e) => {
      if (sig(e) === mine) n++
    })
    return Math.max(1, n)
  } catch {
    return 1
  }
}

export function getIdentity(el: HTMLElement): ElementIdentity {
  const build = readBuildSource(el)
  const source: SourceInfo = build
    ? { ...build, confidence: 'build-attr' }
    : { confidence: 'none' }
  return {
    // With an exact file:line, derive the name from the file (reliable, RSC-safe);
    // only walk the fiber tree when there is no build-time source.
    componentName: build ? componentFromFile(build.file) : readComponentName(el),
    source,
    selector: buildSelector(el),
    dataTestId: el.getAttribute('data-testid'),
    id: el.id || null,
    tagName: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    textSnippet: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    classList: Array.from(el.classList).filter((c) => c !== 'uiv-selected'),
    instanceCount: countInstances(el),
  }
}
