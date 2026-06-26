/** Control model for the inspector panel (Figma-like, context-aware sections). */

/** A control is only shown when its requirement matches the selected element. */
export type Requirement = 'text' | 'flexgrid'

export interface Side {
  css: string
  label: string
}

/** A box control collapses to one "all sides" input, expands to per-side inputs. */
export interface BoxControl {
  kind: 'box'
  key: string
  label: string
  icon: string
  sides: Side[]
  requires?: Requirement
}

export interface LenControl {
  kind: 'len'
  css: string
  label: string
  icon: string
  requires?: Requirement
  /** Hide the control when the value is browser-computed/auto (not authored or
   *  edited) — shown behind a "+" so an auto width/height doesn't look like it's set. */
  hideWhenAuto?: boolean
}

/** A dimension control: number + unit selector (px / % / em / unitless). */
export interface DimControl {
  kind: 'dim'
  css: string
  label: string
  icon: string
  units: string[]
  defaultUnit: string
  requires?: Requirement
}

export interface SelectControl {
  kind: 'select'
  css: string
  label: string
  options: string[]
  requires?: Requirement
}

export interface ColorControl {
  kind: 'color'
  css: string
  label: string
  requires?: Requirement
}

export type Control = BoxControl | LenControl | DimControl | SelectControl | ColorControl

export interface Section {
  title: string
  controls: Control[]
}

export const UNIT_LABELS: Record<string, string> = {
  '': '×',
  px: 'px',
  '%': '%',
  em: 'em',
  rem: 'rem',
}

const sv = (paths: string) =>
  `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

export const ICONS = {
  padding: sv('<rect x="2" y="2" width="12" height="12" rx="1.5"/><rect x="5" y="5" width="6" height="6" rx="1" opacity=".45"/>'),
  margin: sv('<rect x="4.5" y="4.5" width="7" height="7" rx="1"/><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" opacity=".45"/>'),
  radius: sv('<path d="M3 13.5 V7 a4 4 0 0 1 4 -4 h6.5"/>'),
  gap: sv('<rect x="2.5" y="3" width="3.5" height="10" rx="1"/><rect x="10" y="3" width="3.5" height="10" rx="1"/>'),
  border: sv('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke-dasharray="2.2 2"/>'),
  size: sv('<path d="M3.5 13 L8 3 L12.5 13 M5.4 9 H10.6"/>'),
  line: sv('<path d="M2.5 3 H13.5 M2.5 8 H13.5 M2.5 13 H13.5"/>'),
  tracking: sv('<path d="M5 4 V12 M11 4 V12"/><path d="M2.5 8 H4 M1.8 6.6 L0.8 8 L1.8 9.4"/><path d="M13.5 8 H12 M14.2 6.6 L15.2 8 L14.2 9.4"/>'),
  expand: sv('<rect x="2" y="2" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="2" width="4.5" height="4.5" rx="1"/><rect x="2" y="9.5" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1"/>'),
  collapse: sv('<rect x="3" y="3" width="10" height="10" rx="2"/>'),
  layout: sv('<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M6 2.5 V13.5 M6 6 H13.5"/>'),
  width: sv('<path d="M1.5 8 H14.5 M4 5 L1.5 8 L4 11 M12 5 L14.5 8 L12 11"/>'),
  height: sv('<path d="M8 1.5 V14.5 M5 4 L8 1.5 L11 4 M5 12 L8 14.5 L11 12"/>'),
  chevron: sv('<path d="M6 4 L10 8 L6 12"/>'),
  phone: sv('<rect x="5" y="1.8" width="6" height="12.4" rx="1.6"/><path d="M7 12.4h2"/>'),
  tablet: sv('<rect x="3.3" y="2.2" width="9.4" height="11.6" rx="1.6"/><path d="M7 11.7h2"/>'),
  desktop: sv('<rect x="1.8" y="2.8" width="12.4" height="8" rx="1"/><path d="M5.8 14h4.4 M8 10.8v3.2"/>'),
  live: sv('<circle cx="8" cy="8" r="2"/><path d="M4.6 4.6a4.8 4.8 0 0 0 0 6.8 M11.4 4.6a4.8 4.8 0 0 1 0 6.8"/>'),
  all: sv('<path d="M8 2.5v11 M3.2 5.2l9.6 5.6 M12.8 5.2l-9.6 5.6"/>'),
}

export const SECTIONS: Section[] = [
  {
    title: 'Layout',
    controls: [
      {
        kind: 'select',
        css: 'display',
        label: 'Display',
        options: ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none'],
      },
      {
        kind: 'select',
        css: 'flex-direction',
        label: 'Direction',
        options: ['row', 'row-reverse', 'column', 'column-reverse'],
        requires: 'flexgrid',
      },
      {
        kind: 'select',
        css: 'justify-content',
        label: 'Justify',
        options: ['normal', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
        requires: 'flexgrid',
      },
      {
        kind: 'select',
        css: 'align-items',
        label: 'Align',
        options: ['normal', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
        requires: 'flexgrid',
      },
      {
        kind: 'select',
        css: 'flex-wrap',
        label: 'Wrap',
        options: ['nowrap', 'wrap', 'wrap-reverse'],
        requires: 'flexgrid',
      },
    ],
  },
  {
    title: 'Size',
    controls: [
      { kind: 'len', css: 'width', label: 'Width', icon: ICONS.width, hideWhenAuto: true },
      { kind: 'len', css: 'height', label: 'Height', icon: ICONS.height, hideWhenAuto: true },
      { kind: 'len', css: 'max-width', label: 'Max W', icon: ICONS.width, hideWhenAuto: true },
      { kind: 'len', css: 'min-height', label: 'Min H', icon: ICONS.height, hideWhenAuto: true },
    ],
  },
  {
    title: 'Spacing',
    controls: [
      {
        kind: 'box',
        key: 'padding',
        label: 'Padding',
        icon: ICONS.padding,
        sides: [
          { css: 'padding-top', label: 'T' },
          { css: 'padding-right', label: 'R' },
          { css: 'padding-bottom', label: 'B' },
          { css: 'padding-left', label: 'L' },
        ],
      },
      {
        kind: 'box',
        key: 'margin',
        label: 'Margin',
        icon: ICONS.margin,
        sides: [
          { css: 'margin-top', label: 'T' },
          { css: 'margin-right', label: 'R' },
          { css: 'margin-bottom', label: 'B' },
          { css: 'margin-left', label: 'L' },
        ],
      },
      // Gap only matters on flex/grid containers.
      { kind: 'len', css: 'gap', label: 'Gap', icon: ICONS.gap, requires: 'flexgrid' },
    ],
  },
  {
    title: 'Border',
    controls: [
      {
        kind: 'box',
        key: 'radius',
        label: 'Radius',
        icon: ICONS.radius,
        sides: [
          { css: 'border-top-left-radius', label: 'TL' },
          { css: 'border-top-right-radius', label: 'TR' },
          { css: 'border-bottom-right-radius', label: 'BR' },
          { css: 'border-bottom-left-radius', label: 'BL' },
        ],
      },
      {
        kind: 'box',
        key: 'border',
        label: 'Border',
        icon: ICONS.border,
        sides: [
          { css: 'border-top-width', label: 'T' },
          { css: 'border-right-width', label: 'R' },
          { css: 'border-bottom-width', label: 'B' },
          { css: 'border-left-width', label: 'L' },
        ],
      },
    ],
  },
  {
    // Typography only shows when the element renders its own text.
    title: 'Typography',
    controls: [
      { kind: 'len', css: 'font-size', label: 'Size', icon: ICONS.size, requires: 'text' },
      {
        kind: 'select',
        css: 'font-weight',
        label: 'Weight',
        options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
        requires: 'text',
      },
      {
        kind: 'dim',
        css: 'line-height',
        label: 'Line',
        icon: ICONS.line,
        units: ['px', '%', ''],
        defaultUnit: 'px',
        requires: 'text',
      },
      {
        kind: 'dim',
        css: 'letter-spacing',
        label: 'Spacing',
        icon: ICONS.tracking,
        units: ['em', 'px'],
        defaultUnit: 'em',
        requires: 'text',
      },
      { kind: 'color', css: 'color', label: 'Text', requires: 'text' },
    ],
  },
  {
    title: 'Fill',
    controls: [{ kind: 'color', css: 'background-color', label: 'Background' }],
  },
]

/** Every CSS longhand we snapshot on selection. */
export const ALL_CSS: string[] = (() => {
  const set = new Set<string>()
  for (const s of SECTIONS)
    for (const c of s.controls) {
      if (c.kind === 'box') c.sides.forEach((side) => set.add(side.css))
      else set.add(c.css)
    }
  return [...set]
})()

/** Side-sets that collapse to a shorthand in the generated prompt/journal. */
export const SHORTHAND_SETS: { shorthand: string; parts: string[] }[] = [
  { shorthand: 'padding', parts: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { shorthand: 'margin', parts: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
  {
    shorthand: 'border-radius',
    parts: [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ],
  },
  {
    shorthand: 'border-width',
    parts: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  },
]
