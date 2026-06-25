import { describe, expect, it } from 'vitest'
import { rgbToHex, suggestUtility } from '../src/overlay/tokens.js'

describe('suggestUtility — spacing', () => {
  it('maps exact tailwind spacing', () => {
    expect(suggestUtility('padding-top', '24px')).toBe('pt-6')
    expect(suggestUtility('padding-left', '16px')).toBe('pl-4')
    expect(suggestUtility('margin-bottom', '2px')).toBe('mb-0.5')
    expect(suggestUtility('gap', '32px')).toBe('gap-8')
  })
  it('falls back to arbitrary values off-scale', () => {
    expect(suggestUtility('padding-top', '15px')).toBe('pt-[15px]')
    expect(suggestUtility('margin-right', '13px')).toBe('mr-[13px]')
  })
})

describe('suggestUtility — typography & box', () => {
  it('maps font-weight names', () => {
    expect(suggestUtility('font-weight', '600')).toBe('font-semibold')
    expect(suggestUtility('font-weight', '400')).toBe('font-normal')
  })
  it('maps font-size & radius with fallback', () => {
    expect(suggestUtility('font-size', '16px')).toBe('text-base')
    expect(suggestUtility('font-size', '17px')).toBe('text-[17px]')
    expect(suggestUtility('border-radius', '8px')).toBe('rounded-lg')
    expect(suggestUtility('border-radius', '5px')).toBe('rounded-[5px]')
  })
  it('maps colors to arbitrary hex utilities', () => {
    expect(suggestUtility('color', 'rgb(31, 41, 55)')).toBe('text-[#1f2937]')
    expect(suggestUtility('background-color', 'rgb(255, 255, 255)')).toBe('bg-[#ffffff]')
  })
})

describe('suggestUtility — line-height & letter-spacing units', () => {
  it('maps unitless line-height to named leading, else arbitrary', () => {
    expect(suggestUtility('line-height', '1.5')).toBe('leading-normal')
    expect(suggestUtility('line-height', '1')).toBe('leading-none')
    expect(suggestUtility('line-height', '1.7')).toBe('leading-[1.7]')
  })
  it('keeps px and % line-height as arbitrary tokens', () => {
    expect(suggestUtility('line-height', '24px')).toBe('leading-[24px]')
    expect(suggestUtility('line-height', '150%')).toBe('leading-[150%]')
  })
  it('maps em letter-spacing to tracking, supports negatives', () => {
    expect(suggestUtility('letter-spacing', '-0.025em')).toBe('tracking-tight')
    expect(suggestUtility('letter-spacing', '0.1em')).toBe('tracking-widest')
    expect(suggestUtility('letter-spacing', 'normal')).toBe('tracking-normal')
    expect(suggestUtility('letter-spacing', '-0.03em')).toBe('tracking-[-0.03em]')
  })
})

describe('suggestUtility — border width', () => {
  it('maps border widths', () => {
    expect(suggestUtility('border-width', '1px')).toBe('border')
    expect(suggestUtility('border-width', '2px')).toBe('border-2')
    expect(suggestUtility('border-top-width', '4px')).toBe('border-t-4')
  })
})

describe('rgbToHex', () => {
  it('converts rgb and rgba', () => {
    expect(rgbToHex('rgb(107, 114, 128)')).toBe('#6b7280')
    expect(rgbToHex('rgba(0, 0, 0, 0.5)')).toBe('#000000')
  })
  it('returns null for non-rgb', () => {
    expect(rgbToHex('transparent')).toBeNull()
  })
})
