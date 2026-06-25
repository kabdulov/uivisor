import { describe, it, expect } from 'vitest'
import {
  classifyVar,
  buildDesignSystem,
  nearestToken,
  tokenName,
  lenToPx,
} from '../src/overlay/designtokens.js'

describe('classifyVar — real project token shapes', () => {
  it('classifies colors by VALUE regardless of name prefix', () => {
    expect(classifyVar('--color-primary', '#4baa1f')).toBe('color') // storefront
    expect(classifyVar('--text-primary', '#FFFFFF')).toBe('color') // web (text-* is a COLOR here)
    expect(classifyVar('--bg-surface', '#0A0A0A')).toBe('color')
    expect(classifyVar('--border-mid', '#27272A')).toBe('color')
    expect(classifyVar('--success', '#16A34A')).toBe('color')
    expect(classifyVar('--danger-bg', 'rgb(43,13,13)')).toBe('color')
  })

  it('classifies font-size by length value + name hint', () => {
    expect(classifyVar('--fs-headline-l', '24px')).toBe('font-size') // web
    expect(classifyVar('--fs-title-m', '14px')).toBe('font-size')
    expect(classifyVar('--text-lg', '1.125rem')).toBe('font-size') // tailwind-v4 default (length → not color)
  })

  it('classifies radius / shadow / spacing', () => {
    expect(classifyVar('--radius-md', '16px')).toBe('radius')
    expect(classifyVar('--radius-full', '9999px')).toBe('radius')
    expect(classifyVar('--shadow-md', '0 3px 6px rgba(0,0,0,.45)')).toBe('shadow')
    expect(classifyVar('--space-lg', '12px')).toBe('spacing')
    expect(classifyVar('--airy-xl', '48px')).toBe('spacing') // web's "airy" spacing scale
  })

  it('classifies font families from the stack value', () => {
    expect(classifyVar('--font-sans', "'Inter Tight','Inter',system-ui,sans-serif")).toBe('font-family')
    expect(classifyVar('--font-display', 'var(--font-inter-tight), system-ui, sans-serif')).toBe('font-family')
  })

  it('returns null for lengths with no naming hint (avoid guessing)', () => {
    expect(classifyVar('--z-modal', '1000')).toBeNull()
    expect(classifyVar('--duration', '200ms')).toBeNull()
    expect(classifyVar('--some-unitless', '1.5')).toBeNull()
  })
})

describe('tokenName — strip category prefix to a handle', () => {
  it('strips the matching prefix', () => {
    expect(tokenName('--fs-headline-l', 'font-size')).toBe('headline-l')
    expect(tokenName('--color-primary', 'color')).toBe('primary')
    expect(tokenName('--text-muted', 'color')).toBe('muted')
    expect(tokenName('--radius-md', 'radius')).toBe('md')
    expect(tokenName('--space-lg', 'spacing')).toBe('lg')
  })
})

describe('lenToPx', () => {
  it('resolves px/rem/em', () => {
    expect(lenToPx('24px')).toBe(24)
    expect(lenToPx('1.125rem', 16)).toBeCloseTo(18)
    expect(lenToPx('2rem', 16)).toBe(32)
    expect(lenToPx('normal')).toBeNull()
  })
})

describe('buildDesignSystem — web tokens.css subset', () => {
  const vars = {
    '--fs-headline-l': '24px',
    '--fs-title-l': '16px',
    '--fs-title-m': '14px',
    '--fs-body-l': '12px',
    '--text-primary': '#FFFFFF',
    '--text-muted': '#A1A1AA',
    '--radius-sm': '8px',
    '--radius-md': '16px',
    '--radius-lg': '24px',
    '--space-md': '8px',
    '--shadow-md': '0 3px 6px rgba(0,0,0,.45)',
    '--font-sans': "'Inter Tight','Inter',system-ui,sans-serif",
    '--z-modal': '1000', // ignored
  }
  const ds = buildDesignSystem(vars)

  it('groups tokens by category and sorts scalars by px', () => {
    expect(ds.source).toBe('css-vars')
    expect(ds.byCategory['font-size']!.map((t) => t.name)).toEqual([
      'body-l',
      'title-m',
      'title-l',
      'headline-l',
    ]) // 12,14,16,24 ascending
    expect(ds.byCategory.color!.map((t) => t.name).sort()).toEqual(['muted', 'primary'])
    expect(ds.byCategory.radius!.map((t) => t.px)).toEqual([8, 16, 24])
    expect(ds.byCategory['font-size']!.length).toBe(4)
  })

  it('ignores non-token vars', () => {
    expect(ds.tokens.find((t) => t.cssVar === '--z-modal')).toBeUndefined()
  })

  it('nearestToken matches font-size by px with exactness', () => {
    const exact = nearestToken(ds, 'font-size', { px: 24 })
    expect(exact!.token.name).toBe('headline-l')
    expect(exact!.exact).toBe(true)
    const near = nearestToken(ds, 'font-size', { px: 15 })
    expect(near!.token.name).toBe('title-m') // 14 is closest to 15
    expect(near!.exact).toBe(false)
  })

  it('nearestToken matches color by literal value', () => {
    const hit = nearestToken(ds, 'color', { value: '#a1a1aa' })
    expect(hit!.token.name).toBe('muted')
    expect(hit!.exact).toBe(true)
  })
})
