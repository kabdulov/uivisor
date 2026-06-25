/**
 * Best-effort reverse mapping from concrete CSS values back to Tailwind utility
 * tokens, so the generated prompt can say "pt-6" instead of "padding-top: 24px".
 * Always falls back to an arbitrary-value class (e.g. "pt-[15px]") so the agent
 * is never blocked. The raw computed value is always also included in the prompt.
 */

const SPACING_PREFIX: Record<string, string> = {
  padding: 'p',
  'padding-top': 'pt',
  'padding-right': 'pr',
  'padding-bottom': 'pb',
  'padding-left': 'pl',
  margin: 'm',
  'margin-top': 'mt',
  'margin-right': 'mr',
  'margin-bottom': 'mb',
  'margin-left': 'ml',
  gap: 'gap',
  'row-gap': 'gap-y',
  'column-gap': 'gap-x',
}

const BORDER_WIDTH: Record<number, string> = {
  0: 'border-0',
  1: 'border',
  2: 'border-2',
  4: 'border-4',
  8: 'border-8',
}

// Tailwind spacing scale numbers (token = px / 4).
const SPACING_SCALE = new Set([
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24,
  28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
])

const FONT_WEIGHT: Record<string, string> = {
  '100': 'font-thin',
  '200': 'font-extralight',
  '300': 'font-light',
  '400': 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
}

const FONT_SIZE: Record<number, string> = {
  12: 'text-xs',
  14: 'text-sm',
  16: 'text-base',
  18: 'text-lg',
  20: 'text-xl',
  24: 'text-2xl',
  30: 'text-3xl',
  36: 'text-4xl',
  48: 'text-5xl',
  60: 'text-6xl',
}

const RADIUS: Record<number, string> = {
  0: 'rounded-none',
  2: 'rounded-sm',
  4: 'rounded',
  6: 'rounded-md',
  8: 'rounded-lg',
  12: 'rounded-xl',
  16: 'rounded-2xl',
  24: 'rounded-3xl',
  9999: 'rounded-full',
}

function px(value: string): number | null {
  const m = /^(-?\d*\.?\d+)px$/.exec(value.trim())
  return m ? parseFloat(m[1]) : null
}

export function rgbToHex(value: string): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value)
  if (!m) return null
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
}

/** Return a bare Tailwind utility (no responsive prefix) for a property + value, or null. */
export function suggestUtility(property: string, value: string): string | null {
  // Spacing (padding / margin / gap)
  const spPrefix = SPACING_PREFIX[property]
  if (spPrefix) {
    const n = px(value)
    if (n == null) return null
    const scale = n / 4
    if (SPACING_SCALE.has(scale)) {
      const tok = Number.isInteger(scale) ? String(scale) : String(scale)
      return `${spPrefix}-${tok}`
    }
    return `${spPrefix}-[${n}px]`
  }

  if (property === 'font-weight') {
    return FONT_WEIGHT[value.trim()] ?? `font-[${value.trim()}]`
  }

  if (property === 'font-size') {
    const n = px(value)
    if (n == null) return null
    return FONT_SIZE[n] ?? `text-[${n}px]`
  }

  if (property.endsWith('radius')) {
    const n = px(value)
    if (n == null) return null
    if (property === 'border-radius') return RADIUS[n] ?? `rounded-[${n}px]`
    const cp = {
      'border-top-left-radius': 'rounded-tl',
      'border-top-right-radius': 'rounded-tr',
      'border-bottom-right-radius': 'rounded-br',
      'border-bottom-left-radius': 'rounded-bl',
    }[property]
    return cp ? `${cp}-[${n}px]` : `rounded-[${n}px]`
  }

  if (property.startsWith('border') && property.endsWith('width')) {
    const n = px(value)
    if (n == null) return null
    if (property === 'border-width') return BORDER_WIDTH[n] ?? `border-[${n}px]`
    const sp = {
      'border-top-width': 'border-t',
      'border-right-width': 'border-r',
      'border-bottom-width': 'border-b',
      'border-left-width': 'border-l',
    }[property]
    if (!sp) return null
    if (n === 1) return sp
    if ([0, 2, 4, 8].includes(n)) return `${sp}-${n}`
    return `${sp}-[${n}px]`
  }

  if (property === 'line-height') {
    const t = value.trim()
    const unitless = /^(\d*\.?\d+)$/.exec(t)
    if (unitless) {
      const named: Record<string, string> = {
        '1': 'leading-none',
        '1.25': 'leading-tight',
        '1.375': 'leading-snug',
        '1.5': 'leading-normal',
        '1.625': 'leading-relaxed',
        '2': 'leading-loose',
      }
      return named[String(parseFloat(unitless[1]))] ?? `leading-[${t}]`
    }
    const n = px(t)
    if (n != null) return `leading-[${n}px]`
    return `leading-[${t}]` // e.g. 150%
  }

  if (property === 'letter-spacing') {
    const t = value.trim()
    if (t === 'normal' || t === '0' || t === '0px' || t === '0em') return 'tracking-normal'
    const em = /^(-?\d*\.?\d+)em$/.exec(t)
    if (em) {
      const named: Record<string, string> = {
        '-0.05': 'tracking-tighter',
        '-0.025': 'tracking-tight',
        '0.025': 'tracking-wide',
        '0.05': 'tracking-wider',
        '0.1': 'tracking-widest',
      }
      return named[String(parseFloat(em[1]))] ?? `tracking-[${t}]`
    }
    return `tracking-[${t}]`
  }

  if (property === 'color' || property === 'background-color') {
    const hex = rgbToHex(value) ?? (value.startsWith('#') ? value : null)
    if (!hex) return null
    return property === 'color' ? `text-[${hex}]` : `bg-[${hex}]`
  }

  // Layout — display & flexbox alignment map to fixed Tailwind utilities.
  const LAYOUT: Record<string, Record<string, string>> = {
    display: {
      block: 'block', 'inline-block': 'inline-block', inline: 'inline',
      flex: 'flex', 'inline-flex': 'inline-flex', grid: 'grid',
      'inline-grid': 'inline-grid', none: 'hidden',
    },
    'flex-direction': {
      row: 'flex-row', 'row-reverse': 'flex-row-reverse',
      column: 'flex-col', 'column-reverse': 'flex-col-reverse',
    },
    'flex-wrap': { nowrap: 'flex-nowrap', wrap: 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse' },
    'justify-content': {
      normal: 'justify-normal', 'flex-start': 'justify-start', center: 'justify-center',
      'flex-end': 'justify-end', 'space-between': 'justify-between',
      'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
    },
    'align-items': {
      normal: 'items-normal', stretch: 'items-stretch', 'flex-start': 'items-start',
      center: 'items-center', 'flex-end': 'items-end', baseline: 'items-baseline',
    },
  }
  if (LAYOUT[property]) return LAYOUT[property][value.trim()] ?? null

  // Sizing — width / height / min / max. Tailwind's spacing scale is value/4.
  const SIZE_PREFIX: Record<string, string> = {
    width: 'w', height: 'h', 'min-width': 'min-w', 'max-width': 'max-w',
    'min-height': 'min-h', 'max-height': 'max-h',
  }
  if (SIZE_PREFIX[property]) {
    const pre = SIZE_PREFIX[property]
    const t = value.trim()
    if (t === 'auto') return `${pre}-auto`
    if (t === '100%') return `${pre}-full`
    const n = px(t)
    if (n == null) return `${pre}-[${t}]`
    const scale = n / 4
    if (Number.isInteger(scale) && scale >= 0 && scale <= 96) return `${pre}-${scale}`
    return `${pre}-[${n}px]`
  }

  return null
}
