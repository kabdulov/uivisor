import type { ActiveBreakpoint } from './breakpoint.js'
import { rgbToHex, suggestUtility } from './tokens.js'
import type { ChangeEntry, ValueInfo } from './types.js'

/** Snapshot resolved values for a set of CSS longhands (defaults to ALL_CSS). */
export function snapshot(el: Element, props: string[]): Record<string, string> {
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const p of props) out[p] = cs.getPropertyValue(p).trim()
  return out
}

/** Apply an ephemeral inline override (never written to source). */
export function applyOverride(el: HTMLElement, css: string, value: string): void {
  el.style.setProperty(css, value, 'important')
}

export function removeOverride(el: HTMLElement, css: string): void {
  el.style.removeProperty(css)
}

/** For a color input we need a hex; computed colors come back as rgb()/rgba(). */
export function toHexInput(computed: string): string {
  if (/^#[0-9a-f]{6}$/i.test(computed.trim())) return computed.trim()
  return rgbToHex(computed) ?? '#000000'
}

function valueInfo(property: string, computed: string): ValueInfo {
  return { computed, token: suggestUtility(property, computed) }
}

/**
 * Build a change entry for a property given the element's *original* computed
 * value and the newly applied value, tagged with the active breakpoint.
 */
export function buildChange(
  property: string,
  originalComputed: string,
  appliedValue: string,
  bp: ActiveBreakpoint,
): ChangeEntry {
  return {
    property,
    before: valueInfo(property, originalComputed),
    after: valueInfo(property, appliedValue),
    breakpoint: bp.name,
    breakpointPx: bp.minWidth,
    state: null,
  }
}
