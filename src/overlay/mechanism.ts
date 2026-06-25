import type { Mechanism, StylingInfo } from './types.js'

// Matches the core of a Tailwind utility once any variant prefix is stripped.
const TW_UTILITY =
  /^-?(?:p|m|px|py|pt|pr|pb|pl|mx|my|mt|mr|mb|ml|gap|w|h|min-w|max-w|min-h|max-h|text|bg|border|rounded|flex|grid|gap-x|gap-y|items|justify|self|place|font|leading|tracking|space|inline|block|inline-block|hidden|table|absolute|relative|fixed|sticky|static|top|bottom|left|right|inset|z|shadow|opacity|transition|duration|ease|scale|rotate|translate|cursor|overflow|object|aspect|order|col|row|basis|grow|shrink|divide|ring|outline)(?:-|$)/

const TW_VARIANT =
  /^(?:sm|md|lg|xl|2xl|hover|focus|focus-visible|focus-within|active|visited|disabled|dark|group|group-hover|peer|first|last|odd|even|motion-safe|motion-reduce|print|rtl|ltr)::?|^(?:sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover):/

function stripVariants(cls: string): string {
  let c = cls
  // strip leading "md:", "hover:", "dark:lg:" chains
  while (true) {
    const next = c.replace(/^[a-z0-9-]+:/, '')
    if (next === c) break
    c = next
  }
  return c
}

const CSS_MODULE = /(?:^|_)[A-Za-z0-9-]+__[A-Za-z0-9_-]{4,}$|^[A-Za-z][\w-]*_[A-Za-z0-9]{4,}$/
const STYLED = /^sc-[A-Za-z0-9]+$|^css-[a-z0-9]+(?:-[A-Za-z0-9]+)?$|-emotion-/

/**
 * Classify how an element is styled. `authoredInlineLength` is the length of the
 * element's *authored* inline style (captured before uivisor applies any override).
 * Returns an ordered, evidence-bearing best guess (never throws).
 */
export function detectMechanism(
  el: Element,
  authoredInlineLength: number,
): StylingInfo {
  const classes = Array.from(el.classList)
  const evidence: string[] = []

  const twClasses = classes.filter((c) => {
    const bare = stripVariants(c)
    return TW_UTILITY.test(bare) || (TW_VARIANT.test(c) && TW_UTILITY.test(bare))
  })

  let hasTwVars = false
  try {
    const cs = getComputedStyle(el)
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].startsWith('--tw-')) {
        hasTwVars = true
        break
      }
    }
  } catch {
    /* getComputedStyle unavailable (non-DOM env) */
  }

  if (twClasses.length) {
    evidence.push(`utility classes: ${twClasses.join(' ')}`)
    return mk('tailwind', evidence, twClasses)
  }
  if (hasTwVars) {
    evidence.push('--tw-* custom properties present')
    return mk('tailwind', evidence, classes)
  }

  const moduleClasses = classes.filter((c) => CSS_MODULE.test(c))
  if (moduleClasses.length) {
    evidence.push(`hashed CSS-module classes: ${moduleClasses.join(' ')}`)
    return mk('css-modules', evidence, moduleClasses)
  }

  const styledClasses = classes.filter((c) => STYLED.test(c))
  const hasStyledTag =
    typeof document !== 'undefined' &&
    !!document.querySelector('style[data-styled], style[data-emotion]')
  if (styledClasses.length || hasStyledTag) {
    if (styledClasses.length)
      evidence.push(`styled/emotion classes: ${styledClasses.join(' ')}`)
    else evidence.push('styled-components/emotion <style> tag present')
    return mk('styled-components', evidence, styledClasses)
  }

  if (authoredInlineLength > 0) {
    evidence.push('authored inline style attribute')
    return mk('inline', evidence, [])
  }

  if (classes.length) {
    evidence.push(`plain CSS classes: ${classes.join(' ')}`)
    return mk('plain-css', evidence, classes)
  }

  evidence.push('no classes, no inline style — styled by tag/ancestor selector')
  return mk('unknown', evidence, [])
}

function mk(
  primaryMechanism: Mechanism,
  evidence: string[],
  sourceClassNames: string[],
): StylingInfo {
  return { primaryMechanism, evidence, sourceClassNames }
}
