/**
 * The CSS property registry behind the "All CSS" inspector. Merges the verified
 * metadata (cssData.ts, generated + adversarially checked) with a RUNTIME
 * enumeration of every property `getComputedStyle` reports — so the panel reaches
 * literally every property the browser supports, and each gets a sensible input
 * type (colour picker / number+unit / select / text) and grouping.
 */
import { CSS_PROPERTY_DATA } from './cssData.js'

export type CssInputType =
  | 'color'
  | 'length'
  | 'number'
  | 'integer'
  | 'percentage'
  | 'time'
  | 'angle'
  | 'enum'
  | 'url'
  | 'image'
  | 'string'
  | 'shorthand'

export type BoxGroup = 'padding' | 'margin' | 'inset' | 'radius' | 'border-width' | 'border-color' | 'border-style'

export interface CssMeta {
  property: string
  category: string
  type: CssInputType
  keywords?: string[]
  units?: string[]
  box?: BoxGroup
  inherited?: boolean
  shorthand?: boolean
  /** A commonly-used property (shown by default; rest hidden behind "show all"). */
  common?: boolean
}

/** The Framer/Webflow-style everyday set — what a designer actually reaches for.
 *  Everything else stays reachable via "show all" / search, just not in your face. */
const COMMON = new Set<string>([
  // Layout
  'display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear', 'z-index',
  'box-sizing', 'visibility', 'overflow', 'overflow-x', 'overflow-y', 'opacity',
  // Flexbox
  'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
  'align-self', 'justify-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'order',
  'gap', 'row-gap', 'column-gap',
  // Grid
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-auto-columns',
  'grid-auto-rows', 'grid-column', 'grid-row', 'grid-area', 'justify-items', 'place-items',
  // Spacing
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  // Sizing
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'aspect-ratio', 'object-fit', 'object-position',
  // Border
  'border', 'border-width', 'border-style', 'border-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset',
  // Background
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat', 'background-attachment', 'background-clip',
  // Typography
  'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration',
  'text-decoration-line', 'text-decoration-color', 'text-transform', 'text-indent',
  'text-overflow', 'white-space', 'text-shadow', 'direction', 'vertical-align',
  // Effects
  'box-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode', 'clip-path', 'cursor', 'mask',
  // Transform
  'transform', 'transform-origin', 'transform-style', 'perspective', 'backface-visibility',
  'translate', 'rotate', 'scale',
  // Animation
  'transition', 'transition-property', 'transition-duration', 'transition-timing-function',
  'transition-delay', 'animation', 'animation-name', 'animation-duration',
  'animation-timing-function', 'animation-delay', 'animation-iteration-count',
  'animation-direction', 'animation-fill-mode', 'will-change',
  // Misc
  'content', 'list-style', 'list-style-type', 'list-style-position', 'user-select',
  'pointer-events', 'scroll-behavior', 'resize', 'caret-color', 'accent-color', 'appearance',
])

export interface CssRegistry {
  byProp: Map<string, CssMeta>
  categories: { name: string; props: string[] }[]
}

/** Display order for the categories. Anything new lands after these. */
const CATEGORY_ORDER = [
  'Layout',
  'Flexbox',
  'Grid',
  'Spacing',
  'Sizing',
  'Border',
  'Background',
  'Typography',
  'Effects',
  'Transform',
  'Animation',
  'Misc',
]

const DEFAULT_UNITS = ['px', '%', 'em', 'rem', 'vh', 'vw', 'ch']

/** Category for a property not present in the curated data — by name prefix. */
function categoryFor(p: string): string {
  if (/^grid/.test(p)) return 'Grid'
  if (/^(flex|justify|align|order|place)/.test(p)) return 'Flexbox'
  if (/^(margin|padding|gap|row-gap|column-gap)/.test(p)) return 'Spacing'
  if (/^(width|height|min-|max-|aspect-ratio|inline-size|block-size|object-)/.test(p)) return 'Sizing'
  if (/^(border|outline)/.test(p)) return 'Border'
  if (/^background/.test(p)) return 'Background'
  if (/^(font|text|color$|line-height|letter|word|white-space|writing|direction|vertical-align|tab-size|hyphens|quotes|list-style)/.test(p))
    return 'Typography'
  if (/^(transition|animation|will-change)/.test(p)) return 'Animation'
  if (/^(transform|translate|rotate|scale|perspective|backface)/.test(p)) return 'Transform'
  if (/^(opacity|box-shadow|filter|backdrop|mix-blend|clip-path|mask|cursor)/.test(p)) return 'Effects'
  if (/^(display|position|top|right|bottom|left|inset|float|clear|visibility|z-index|box-sizing|overflow|isolation|contain)/.test(p))
    return 'Layout'
  return 'Misc'
}

/** Best-effort input type for an unknown property, from its value AND its name —
 *  a keyword computed value (e.g. width:auto) must not freeze a numeric/colour
 *  property into a plain text box. */
function typeForValue(p: string, v: string): CssInputType {
  const s = (v || '').trim()
  // value-driven (most reliable when the value is concrete)
  if (/color/.test(p) || /^(rgb|rgba|hsl|hsla|#|currentcolor|transparent)\b/i.test(s)) return 'color'
  if (/^-?\d*\.?\d+(px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|q)$/i.test(s)) return 'length'
  if (/^-?\d*\.?\d+(s|ms)$/i.test(s)) return 'time'
  if (/^-?\d*\.?\d+(deg|rad|grad|turn)$/i.test(s)) return 'angle'
  if (/^(url\(|linear-gradient|radial-gradient|conic-gradient)/i.test(s)) return 'image'
  // name-driven fallback (for keyword/auto values)
  if (/(^|-)color$/.test(p)) return 'color'
  if (/(width|height|size|^inset|margin|padding|gap|^top$|^left$|^right$|^bottom$|spacing|indent|offset|radius|translate|^scroll-padding|^scroll-margin)/.test(p))
    return 'length'
  if (/^-?\d+$/.test(s)) return 'integer'
  if (/^-?\d*\.?\d+$/.test(s)) return 'number'
  return 'string'
}

let _registry: CssRegistry | null = null

/** Build (and cache) the merged registry. Browser-only; falls back to the curated
 *  data when `getComputedStyle` isn't available. */
export function cssRegistry(): CssRegistry {
  if (_registry) return _registry
  const byProp = new Map<string, CssMeta>()
  for (const m of CSS_PROPERTY_DATA) {
    byProp.set(m.property, {
      ...m,
      units: m.units && m.units.length ? m.units : m.type === 'length' ? DEFAULT_UNITS : undefined,
      common: COMMON.has(m.property),
    })
  }
  try {
    if (typeof document !== 'undefined') {
      const cs = getComputedStyle(document.documentElement)
      for (let i = 0; i < cs.length; i++) {
        const p = cs[i]
        if (!p || p.startsWith('--') || byProp.has(p)) continue
        const type = typeForValue(p, cs.getPropertyValue(p))
        byProp.set(p, { property: p, category: categoryFor(p), type, units: type === 'length' ? DEFAULT_UNITS : undefined })
      }
    }
  } catch {
    /* noop */
  }
  const groups = new Map<string, string[]>()
  for (const [prop, m] of byProp) {
    const cat = m.category || 'Misc'
    const arr = groups.get(cat) ?? []
    arr.push(prop)
    groups.set(cat, arr)
  }
  const orderedNames = [
    ...CATEGORY_ORDER.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ]
  const categories = orderedNames.map((name) => ({ name, props: groups.get(name)!.slice().sort() }))
  _registry = { byProp, categories }
  return _registry
}

/** Lookup metadata for a property (registry must be built first). */
export function cssMeta(property: string): CssMeta | undefined {
  return cssRegistry().byProp.get(property)
}
