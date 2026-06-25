import { describe, expect, it } from 'vitest'
import { activeBreakpoint, effectiveBreakpoint } from '../src/overlay/breakpoint.js'
import type { BreakpointSystem } from '../src/overlay/types.js'

const MIN: BreakpointSystem = {
  name: 'd',
  dir: 'min',
  breakpoints: [
    { name: 'sm', minWidth: 640 },
    { name: 'md', minWidth: 768 },
    { name: 'lg', minWidth: 1024 },
  ],
}
const MAX: BreakpointSystem = {
  name: 'd',
  dir: 'max',
  breakpoints: [
    { name: 'sm', minWidth: 640 },
    { name: 'md', minWidth: 1024 },
  ],
}

describe('effectiveBreakpoint — mobile-first (min-width), cascades UP', () => {
  it('an edit applies at its breakpoint and wider, until overridden', () => {
    const edited = ['base', 'md'] // padding set at base and md
    expect(effectiveBreakpoint(edited, 500, MIN)).toBe('base') // below md → base
    expect(effectiveBreakpoint(edited, 800, MIN)).toBe('md') // at md → md
    expect(effectiveBreakpoint(edited, 1100, MIN)).toBe('md') // lg has no edit → inherits md
    expect(effectiveBreakpoint(['lg'], 1100, MIN)).toBe('lg')
    expect(effectiveBreakpoint(['lg'], 800, MIN)).toBeNull() // md doesn't see an lg-only edit
  })
})

describe('effectiveBreakpoint — desktop-first (max-width), cascades DOWN', () => {
  it('an edit applies at its breakpoint and narrower', () => {
    const edited = ['base', 'md'] // base (widest) + max-md(1024)
    expect(effectiveBreakpoint(edited, 1400, MAX)).toBe('base') // above md-max → base
    expect(effectiveBreakpoint(edited, 900, MAX)).toBe('md') // ≤1024 → md
    expect(effectiveBreakpoint(edited, 600, MAX)).toBe('md') // sm has no edit → inherits md
    expect(effectiveBreakpoint(['sm'], 600, MAX)).toBe('sm') // ≤640 → sm wins
    expect(effectiveBreakpoint(['sm'], 900, MAX)).toBeNull() // 900 > 640 → sm doesn't reach
  })
})

describe('activeBreakpoint — max-width direction', () => {
  it('picks the smallest max ≥ width, else base', () => {
    expect(activeBreakpoint(1400, MAX).name).toBe('base')
    expect(activeBreakpoint(900, MAX).name).toBe('md')
    expect(activeBreakpoint(600, MAX).name).toBe('sm')
  })
})
