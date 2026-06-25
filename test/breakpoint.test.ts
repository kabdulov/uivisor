import { describe, expect, it } from 'vitest'
import { activeBreakpoint } from '../src/overlay/breakpoint.js'

describe('activeBreakpoint (tailwind defaults)', () => {
  it('returns base below sm', () => {
    expect(activeBreakpoint(0)).toEqual({ name: 'base', minWidth: 0 })
    expect(activeBreakpoint(639)).toEqual({ name: 'base', minWidth: 0 })
  })
  it('picks the largest matching breakpoint', () => {
    expect(activeBreakpoint(640).name).toBe('sm')
    expect(activeBreakpoint(800).name).toBe('md')
    expect(activeBreakpoint(1024).name).toBe('lg')
    expect(activeBreakpoint(1280).name).toBe('xl')
    expect(activeBreakpoint(1920)).toEqual({ name: '2xl', minWidth: 1536 })
  })
})
