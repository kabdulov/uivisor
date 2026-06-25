/**
 * Design-system detection. Scans the project's CSS custom properties (`:root`
 * `--*` variables) at runtime and groups them into named design tokens, so the
 * inspector can offer "headline-l / primary / radius-md" instead of raw px/hex,
 * and the prompt can tell the agent to apply the project's OWN token.
 *
 * Grounded in real projects: Tailwind v4 `@theme` (`--color-*`, `--radius-*`,
 * `--shadow-*`) and custom `:root` token files (`--fs-headline-l`, `--text-*`
 * colors, `--space-*`). Classification combines the variable NAME with its
 * VALUE TYPE — `--text-primary:#fff` is a color, `--text-lg:1.1rem` is a font
 * size — so ambiguous prefixes resolve correctly.
 */

export type TokenCategory =
  | 'color'
  | 'font-size'
  | 'radius'
  | 'shadow'
  | 'spacing'
  | 'line-height'
  | 'letter-spacing'
  | 'font-family'

export interface DesignToken {
  /** Full custom-property name, e.g. "--fs-headline-l". */
  cssVar: string
  /** Display/handle name with the category prefix stripped, e.g. "headline-l". */
  name: string
  category: TokenCategory
  /** Resolved CSS value, e.g. "24px", "#4baa1f". */
  value: string
  /** Numeric px value for scalar categories (font-size/radius/spacing), else null. */
  px: number | null
}

export type DesignSystem = {
  tokens: DesignToken[]
  byCategory: Partial<Record<TokenCategory, DesignToken[]>>
  /** Where the tokens came from, for the panel indicator. */
  source: 'css-vars' | 'none'
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i
const LEN_RE = /^-?\d*\.?\d+(px|rem|em)$/i
// A shadow value: at least one length plus a color/blur chain (e.g. "0 3px 6px rgba(...)").
const SHADOW_RE = /\d+px.*(rgba?\(|hsla?\(|#[0-9a-f]{3,8})/i
const FONT_STACK_RE = /(sans-serif|serif|monospace|system-ui|,)/i

const isColor = (v: string) => COLOR_RE.test(v.trim())
const isLen = (v: string) => LEN_RE.test(v.trim())

/** Resolve a length to px. rem → ×rootPx, em → ×rootPx (best-effort), px → as-is. */
export function lenToPx(value: string, rootPx = 16): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)$/i.exec(value.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  const unit = m[2].toLowerCase()
  if (unit === 'px') return n
  return n * rootPx // rem and em both resolved against the root size (approximation)
}

/** Known category prefixes, longest first, for stripping to a display name. */
const PREFIXES: { re: RegExp; cat: TokenCategory }[] = [
  { re: /^--font-size-/, cat: 'font-size' },
  { re: /^--fs-/, cat: 'font-size' },
  { re: /^--text-/, cat: 'font-size' }, // only when value is a length (handled below)
  { re: /^--leading-/, cat: 'line-height' },
  { re: /^--line-height-/, cat: 'line-height' },
  { re: /^--tracking-/, cat: 'letter-spacing' },
  { re: /^--letter-spacing-/, cat: 'letter-spacing' },
  { re: /^--radius-/, cat: 'radius' },
  { re: /^--rounded-/, cat: 'radius' },
  { re: /^--shadow-/, cat: 'shadow' },
  { re: /^--space-/, cat: 'spacing' },
  { re: /^--spacing-/, cat: 'spacing' },
  { re: /^--gap-/, cat: 'spacing' },
  { re: /^--airy-/, cat: 'spacing' },
  { re: /^--color-/, cat: 'color' },
  { re: /^--bg-/, cat: 'color' },
  { re: /^--border-/, cat: 'color' },
  { re: /^--font-/, cat: 'font-family' },
]

const FONTSIZE_HINT = /(^|[-_])(fs|font-size|text|headline|title|body|label|display|caption|heading)([-_]|$)/i
const SPACING_HINT = /(^|[-_])(space|spacing|gap|airy|inset)([-_]|$)/i

/**
 * Classify one custom property into a token category, using value type first
 * (decisive) then the name. Returns null when it isn't a recognisable token.
 */
export function classifyVar(name: string, value: string): TokenCategory | null {
  const v = value.trim()
  const n = name.toLowerCase()
  if (!v) return null

  // Shadow: a length+color chain, or an explicit name.
  if (n.includes('shadow') || SHADOW_RE.test(v)) return 'shadow'
  // Colors are decided by VALUE — covers --text-primary, --bg-*, --success, etc.
  if (isColor(v)) return 'color'
  // Font family: a font stack value, or a --font-* name that isn't a length.
  if (FONT_STACK_RE.test(v) && !isLen(v)) {
    if (n.includes('family') || /^--font(-|$)/.test(n) || FONT_STACK_RE.test(v)) return 'font-family'
  }

  if (isLen(v)) {
    if (n.includes('radius') || n.includes('rounded')) return 'radius'
    if (n.includes('leading') || n.includes('line-height')) return 'line-height'
    if (n.includes('tracking') || n.includes('letter')) return 'letter-spacing'
    if (FONTSIZE_HINT.test(n)) return 'font-size'
    if (SPACING_HINT.test(n)) return 'spacing'
    return null // a length with no naming hint — don't guess
  }

  return null
}

/** Strip a known leading prefix to a short display name (else drop the `--`).
 *  Category-independent: `--text-muted` (color) and `--text-lg` (font-size) both
 *  strip `--text-`. PREFIXES is ordered longest-first so `--font-size-` wins over
 *  `--font-`. The `category` arg is kept for call-site clarity but unused here. */
export function tokenName(cssVar: string, _category?: TokenCategory): string {
  for (const p of PREFIXES) {
    if (p.re.test(cssVar)) return cssVar.replace(p.re, '')
  }
  return cssVar.replace(/^--/, '')
}

/** Build a DesignSystem from a map of custom-property name → resolved value. */
export function buildDesignSystem(vars: Record<string, string>, rootPx = 16): DesignSystem {
  const tokens: DesignToken[] = []
  for (const [cssVar, value] of Object.entries(vars)) {
    const category = classifyVar(cssVar, value)
    if (!category) continue
    const scalar = category === 'font-size' || category === 'radius' || category === 'spacing'
    tokens.push({
      cssVar,
      name: tokenName(cssVar, category),
      category,
      value: value.trim(),
      px: scalar ? lenToPx(value, rootPx) : null,
    })
  }
  const byCategory: Partial<Record<TokenCategory, DesignToken[]>> = {}
  for (const t of tokens) (byCategory[t.category] ||= []).push(t)
  // sort scalar categories by px, others by name
  for (const cat of Object.keys(byCategory) as TokenCategory[]) {
    byCategory[cat]!.sort((a, b) =>
      a.px != null && b.px != null ? a.px - b.px : a.name.localeCompare(b.name),
    )
  }
  return { tokens, byCategory, source: tokens.length ? 'css-vars' : 'none' }
}

/**
 * Nearest token in a category to a target value. For scalar categories matches by
 * px (with an exactness flag); for colors/shadows matches the literal value.
 */
export function nearestToken(
  ds: DesignSystem,
  category: TokenCategory,
  target: { px?: number | null; value?: string },
): { token: DesignToken; exact: boolean } | null {
  const list = ds.byCategory[category]
  if (!list || !list.length) return null

  if (target.value != null) {
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
    const hit = list.find((t) => norm(t.value) === norm(target.value!))
    if (hit) return { token: hit, exact: true }
  }
  if (target.px != null && list.some((t) => t.px != null)) {
    let best = list[0]
    let bestD = Infinity
    for (const t of list) {
      if (t.px == null) continue
      const d = Math.abs(t.px - target.px)
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    return { token: best, exact: bestD < 0.5 }
  }
  return null
}

const SCALAR_VAR_SELECTOR = /(^|[\s,>])(:root|html|\[data-theme)/i

/**
 * Detect the project's design tokens by scanning loaded stylesheets for custom
 * properties declared on :root / html / [data-theme] rules, then resolving each
 * to its active value (handles theming + var() references). Browser-only.
 */
export function detectDesignSystem(): DesignSystem {
  if (typeof document === 'undefined') return { tokens: [], byCategory: {}, source: 'none' }
  const names = new Set<string>()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet
    }
    for (const rule of Array.from(rules)) collectVarNames(rule, names)
  }
  const root = document.documentElement
  const cs = getComputedStyle(root)
  const rootPx = parseFloat(cs.fontSize) || 16
  const vars: Record<string, string> = {}
  for (const name of names) {
    const resolved = cs.getPropertyValue(name).trim()
    if (resolved) vars[name] = resolved
  }
  return buildDesignSystem(vars, rootPx)
}

function collectVarNames(rule: CSSRule, out: Set<string>): void {
  const style = (rule as CSSStyleRule).style
  const selector = (rule as CSSStyleRule).selectorText
  if (style && selector && SCALAR_VAR_SELECTOR.test(selector)) {
    for (let i = 0; i < style.length; i++) {
      const prop = style[i]
      if (prop.startsWith('--')) out.add(prop)
    }
  }
  // recurse into @media / @supports groups
  const inner = (rule as CSSGroupingRule).cssRules
  if (inner) for (const r of Array.from(inner)) collectVarNames(r, out)
}
