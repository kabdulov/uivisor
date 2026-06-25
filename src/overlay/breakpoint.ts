import type { BreakpointSystem } from './types.js'

/** Tailwind v3/v4 default breakpoints (mobile-first min-widths). */
export const TAILWIND: BreakpointSystem = {
  name: 'tailwind',
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

/**
 * Pure: given a viewport width, return the active (largest matching) breakpoint.
 * Below the smallest breakpoint returns "base" / 0 (mobile-first unprefixed utilities).
 */
export function activeBreakpoint(
  width: number,
  system: BreakpointSystem = TAILWIND,
): ActiveBreakpoint {
  let active: ActiveBreakpoint = { name: 'base', minWidth: 0 }
  for (const bp of system.breakpoints) {
    if (width >= bp.minWidth) active = { name: bp.name, minWidth: bp.minWidth }
  }
  return active
}

/** Runtime: active breakpoint for the current window. */
export function currentBreakpoint(system: BreakpointSystem = TAILWIND): ActiveBreakpoint {
  const width =
    typeof window !== 'undefined' ? window.innerWidth : 0
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
 * `@media (min-width: …)` rules. Returns whatever the project really uses (Tailwind
 * config, Bootstrap, custom CSS) instead of hard-coded defaults. Falls back to the
 * Tailwind defaults when nothing is found (e.g. stylesheets not yet loaded).
 */
export function detectBreakpoints(): BreakpointSystem {
  if (typeof document === 'undefined') return TAILWIND
  const widths = new Set<number>()

  const visit = (rules: CSSRuleList | undefined): void => {
    if (!rules) return
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as CSSRule & { media?: MediaList; cssRules?: CSSRuleList }
      if (rule.type === 4 /* CSSRule.MEDIA_RULE */ && rule.media) {
        const m = /min-width:\s*(\d*\.?\d+)(px|rem|em)/i.exec(rule.media.mediaText)
        if (m) {
          const val = parseFloat(m[1])
          const px = m[2].toLowerCase() === 'px' ? val : val * 16
          if (px >= 240 && px <= 4096) widths.add(Math.round(px))
        }
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

  const sorted = [...widths].sort((a, b) => a - b)
  if (!sorted.length) return TAILWIND
  return {
    name: 'detected',
    breakpoints: sorted.map((w) => ({ name: nameForWidth(w), minWidth: w })),
  }
}
