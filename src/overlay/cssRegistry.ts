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
}

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

/** Best-effort input type for an unknown property, from its current value. */
function typeForValue(p: string, v: string): CssInputType {
  const s = (v || '').trim()
  if (/color/.test(p) || /^(rgb|rgba|hsl|hsla|#|currentcolor|transparent)\b/i.test(s)) return 'color'
  if (/^-?\d*\.?\d+(px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|q)$/i.test(s)) return 'length'
  if (/^-?\d*\.?\d+(s|ms)$/i.test(s)) return 'time'
  if (/^-?\d*\.?\d+(deg|rad|grad|turn)$/i.test(s)) return 'angle'
  if (/^-?\d+$/.test(s)) return 'integer'
  if (/^-?\d*\.?\d+$/.test(s)) return 'number'
  if (/^(url\(|linear-gradient|radial-gradient|conic-gradient)/i.test(s)) return 'image'
  return 'string'
}

let _registry: CssRegistry | null = null

/** Build (and cache) the merged registry. Browser-only; falls back to the curated
 *  data when `getComputedStyle` isn't available. */
export function cssRegistry(): CssRegistry {
  if (_registry) return _registry
  const byProp = new Map<string, CssMeta>()
  for (const m of CSS_PROPERTY_DATA) {
    byProp.set(m.property, { ...m, units: m.units && m.units.length ? m.units : m.type === 'length' ? DEFAULT_UNITS : undefined })
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
