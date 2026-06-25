import type { BreakpointSystem } from './types.js'

/** Tailwind v3/v4 default breakpoints (mobile-first min-widths). */
export const TAILWIND: BreakpointSystem = {
  name: 'tailwind',
  dir: 'min',
  breakpoints: [
    { name: 'sm', minWidth: 640 },
    { name: 'md', minWidth: 768 },
    { name: 'lg', minWidth: 1024 },
    { name: 'xl', minWidth: 1280 },
    { name: '2xl', minWidth: 1536 },
  ],
}

export interface ActiveBreakpoint {
  name: string
  minWidth: number
}

/** Does a breakpoint with `threshold` (and the system's direction) apply at `width`?
 *  min-width: width ≥ threshold · max-width: width ≤ threshold. */
export function appliesAt(dir: 'min' | 'max', threshold: number, width: number): boolean {
  return dir === 'min' ? width >= threshold : width <= threshold
}

/** Cascade priority — higher wins when several breakpoints apply at a width.
 *  min-width: a LARGER min-width is more specific · max-width: a SMALLER max-width. */
function priority(dir: 'min' | 'max', threshold: number): number {
  return dir === 'min' ? threshold : -threshold
}

/** The implicit "base" stop (unprefixed / no media): applies everywhere, lowest
 *  priority. min-dir → threshold 0, max-dir → threshold +∞. */
function baseThreshold(dir: 'min' | 'max'): number {
  return dir === 'min' ? 0 : Infinity
}

/**
 * Pure: given a viewport width, return the active (most specific matching)
 * breakpoint. min-width: the largest min ≤ width. max-width: the smallest max ≥
 * width. Falls back to "base" when nothing more specific matches.
 */
export function activeBreakpoint(
  width: number,
  system: BreakpointSystem = TAILWIND,
): ActiveBreakpoint {
  let active: ActiveBreakpoint = { name: 'base', minWidth: baseThreshold(system.dir) }
  let best = priority(system.dir, active.minWidth)
  for (const bp of system.breakpoints) {
    if (!appliesAt(system.dir, bp.minWidth, width)) continue
    const p = priority(system.dir, bp.minWidth)
    if (p > best) {
      best = p
      active = { name: bp.name, minWidth: bp.minWidth }
    }
  }
  return active
}

/**
 * Pure: at viewport `width`, which of the breakpoints that carry an edit actually
 * WINS the cascade for a property — i.e. the breakpoint whose value is effective
 * here, whether set on this breakpoint or inherited from a neighbour. Returns null
 * when no edited breakpoint reaches this width.
 */
export function effectiveBreakpoint(
  editedNames: string[],
  width: number,
  system: BreakpointSystem = TAILWIND,
): string | null {
  const stops: Record<string, number> = { base: baseThreshold(system.dir) }
  for (const bp of system.breakpoints) stops[bp.name] = bp.minWidth
  let winner: string | null = null
  let best = -Infinity
  for (const name of editedNames) {
    const threshold = stops[name]
    if (threshold == null || !appliesAt(system.dir, threshold, width)) continue
    const p = priority(system.dir, threshold)
    if (winner === null || p > best) {
      best = p
      winner = name
    }
  }
  return winner
}

/** Runtime: active breakpoint for the current window. */
export function currentBreakpoint(system: BreakpointSystem = TAILWIND): ActiveBreakpoint {
  const width = typeof window !== 'undefined' ? window.innerWidth : 0
  return activeBreakpoint(width, system)
}

const KNOWN_NAMES: Record<number, string> = {
  640: 'sm',
  768: 'md',
  1024: 'lg',
  1280: 'xl',
  1536: '2xl',
}

function nameForWidth(px: number): string {
  return KNOWN_NAMES[px] ?? `${px}`
}

/**
 * Detect the project's ACTUAL breakpoints by scanning the loaded stylesheets for
 * `@media (min-width: …)` / `(max-width: …)` rules. Picks the dominant direction
 * (min-width = mobile-first, the Tailwind default; max-width = desktop-first).
 * Falls back to Tailwind defaults when nothing is found.
 */
export function detectBreakpoints(): BreakpointSystem {
  if (typeof document === 'undefined') return TAILWIND
  const mins = new Set<number>()
  const maxes = new Set<number>()

  const grab = (text: string, re: RegExp, into: Set<number>) => {
    const m = re.exec(text)
    if (m) {
      const val = parseFloat(m[1])
      const px = m[2].toLowerCase() === 'px' ? val : val * 16
      if (px >= 240 && px <= 4096) into.add(Math.round(px))
    }
  }

  const visit = (rules: CSSRuleList | undefined): void => {
    if (!rules) return
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as CSSRule & { media?: MediaList; cssRules?: CSSRuleList }
      if (rule.type === 4 /* MEDIA_RULE */ && rule.media) {
        grab(rule.media.mediaText, /min-width:\s*(\d*\.?\d+)(px|rem|em)/i, mins)
        grab(rule.media.mediaText, /max-width:\s*(\d*\.?\d+)(px|rem|em)/i, maxes)
        visit(rule.cssRules)
      } else if (rule.cssRules) {
        visit(rule.cssRules)
      }
    }
  }

  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      visit(document.styleSheets[i].cssRules)
    } catch {
      /* cross-origin stylesheet — skip */
    }
  }

  // Pick the dominant direction. Min-width (mobile-first) wins ties — it's the norm.
  const useMax = maxes.size > mins.size
  const widths = useMax ? maxes : mins
  const sorted = [...widths].sort((a, b) => a - b)
  if (!sorted.length) return TAILWIND
  return {
    name: 'detected',
    dir: useMax ? 'max' : 'min',
    breakpoints: sorted.map((w) => ({ name: nameForWidth(w), minWidth: w })),
  }
}
