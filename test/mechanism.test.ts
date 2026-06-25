import { describe, expect, it } from 'vitest'
import { detectMechanism } from '../src/overlay/mechanism.js'

function el(className = '', style = ''): HTMLElement {
  const d = document.createElement('div')
  if (className) d.className = className
  if (style) d.setAttribute('style', style)
  return d
}

describe('detectMechanism', () => {
  it('detects tailwind utilities (incl. responsive variants)', () => {
    const r = detectMechanism(el('px-4 py-4 text-gray-500 lg:py-6 rounded-md'), 0)
    expect(r.primaryMechanism).toBe('tailwind')
    expect(r.sourceClassNames).toContain('px-4')
    expect(r.sourceClassNames).toContain('lg:py-6')
  })

  it('detects css modules by hashed class shape', () => {
    const r = detectMechanism(el('Button_button__x7Yz2'), 0)
    expect(r.primaryMechanism).toBe('css-modules')
  })

  it('detects styled-components / emotion classes', () => {
    const r = detectMechanism(el('sc-bdfBwQ css-1q2w3e'), 0)
    expect(r.primaryMechanism).toBe('styled-components')
  })

  it('detects authored inline styling', () => {
    const r = detectMechanism(el('', 'padding: 10px'), 'padding: 10px'.length)
    expect(r.primaryMechanism).toBe('inline')
  })

  it('falls back to plain-css for ordinary classes', () => {
    const r = detectMechanism(el('hero cta-button'), 0)
    expect(r.primaryMechanism).toBe('plain-css')
    expect(r.sourceClassNames).toContain('cta-button')
  })
})
