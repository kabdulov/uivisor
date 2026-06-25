import { describe, expect, it } from 'vitest'
import { collapseChanges, renderPrompt, renderSpec } from '../src/overlay/prompt.js'
import type { ChangeEntry, EditRecord } from '../src/overlay/types.js'

function side(property: string, after: string): ChangeEntry {
  return {
    property,
    before: { computed: '8px' },
    after: { computed: after },
    breakpoint: 'base',
    breakpointPx: 0,
    state: null,
  }
}

const record: EditRecord = {
  id: 'e1',
  identity: {
    componentName: 'PricingCard',
    source: { file: 'src/components/PricingCard.tsx', line: 42, column: 7, confidence: 'build-attr' },
    selector: 'main > section:nth-of-type(2) > button',
    dataTestId: 'pricing-cta',
    id: null,
    tagName: 'button',
    role: null,
    textSnippet: 'Get started',
    classList: ['px-4', 'py-4', 'text-gray-500'],
    instanceCount: 1,
  },
  styling: {
    primaryMechanism: 'tailwind',
    evidence: ['utility classes: px-4 py-4 text-gray-500'],
    sourceClassNames: ['px-4', 'py-4', 'text-gray-500'],
  },
  target: 'element',
  changes: [
    {
      property: 'padding-top',
      before: { computed: '16px', token: 'pt-4' },
      after: { computed: '24px', token: 'pt-6' },
      breakpoint: 'lg',
      breakpointPx: 1024,
      state: null,
    },
    {
      property: 'color',
      before: { computed: 'rgb(107, 114, 128)', token: 'text-[#6b7280]' },
      after: { computed: 'rgb(31, 41, 55)', token: 'text-[#1f2937]' },
      breakpoint: 'lg',
      breakpointPx: 1024,
      state: null,
    },
  ],
}

describe('renderPrompt', () => {
  const out = renderPrompt([record])

  it('pins the source location', () => {
    expect(out).toContain('src/components/PricingCard.tsx:42:7')
  })
  it('scopes suggestions to the breakpoint variant', () => {
    expect(out).toContain('lg:pt-6')
    expect(out).toContain('lg breakpoint (≥1024px)')
  })
  it('names the styling mechanism and identity anchors', () => {
    expect(out).toContain('Styling: tailwind')
    expect(out).toContain('data-testid="pricing-cta"')
  })
  it('includes the anti-pattern rules', () => {
    expect(out).toContain('Do NOT add inline styles')
  })
  it('skips records with no changes', () => {
    const empty = { ...record, changes: [] }
    expect(renderPrompt([empty])).toContain('0 changes across 0 elements')
  })
})

describe('renderPrompt — class target', () => {
  const classRecord = { ...record, target: 'pricing-cta' }
  const out = renderPrompt([classRecord])

  it('frames the edit around the class, not the node', () => {
    expect(out).toContain('.pricing-cta')
    expect(out).toContain('TARGET: the `.pricing-cta` style shared by ALL elements')
    expect(out).toContain('NOT via the positional selector')
  })
  it('still gives the source location to find it', () => {
    expect(out).toContain('occurrence at src/components/PricingCard.tsx:42:7')
  })
})

describe('renderPrompt — siblings (all instances) target', () => {
  const out = renderPrompt([
    { ...record, target: 'all', identity: { ...record.identity, instanceCount: 3 } },
  ])

  it('asks to apply to all sibling instances, not a positional selector', () => {
    expect(out).toContain('×3 (all like this)')
    expect(out).toContain('rendered 3×')
    expect(out).toContain('do NOT pin it to a single positional nth-child')
  })
})

describe('renderPrompt — "only this one" warns about shared source', () => {
  const out = renderPrompt([
    { ...record, target: 'element', identity: { ...record.identity, instanceCount: 3 } },
  ])
  it('warns editing the source would change all instances', () => {
    expect(out).toContain('THIS instance only')
    expect(out).toContain('would change all 3')
  })
})

describe('renderPrompt — new class target', () => {
  const out = renderPrompt([{ ...record, target: 'new:hero-cta' }])

  it('asks to create a new class without touching existing ones', () => {
    expect(out).toContain('new class .hero-cta')
    expect(out).toContain('create a NEW class `.hero-cta`')
    expect(out).toContain('do NOT pile more utilities onto them')
  })
})

describe('collapseChanges', () => {
  it('collapses 4 equal padding sides into one `padding` → p-N', () => {
    const changes = [
      side('padding-top', '24px'),
      side('padding-right', '24px'),
      side('padding-bottom', '24px'),
      side('padding-left', '24px'),
    ]
    const out = collapseChanges(changes)
    expect(out).toHaveLength(1)
    expect(out[0].property).toBe('padding')
    expect(out[0].after.token).toBe('p-6')
  })

  it('does NOT collapse when sides differ', () => {
    const changes = [side('padding-top', '24px'), side('padding-left', '12px')]
    const out = collapseChanges(changes)
    expect(out).toHaveLength(2)
    expect(out.map((c) => c.property).sort()).toEqual(['padding-left', 'padding-top'])
  })

  it('collapses radius corners into border-radius → rounded-*', () => {
    const changes = [
      side('border-top-left-radius', '16px'),
      side('border-top-right-radius', '16px'),
      side('border-bottom-right-radius', '16px'),
      side('border-bottom-left-radius', '16px'),
    ]
    const out = collapseChanges(changes)
    expect(out[0].property).toBe('border-radius')
    expect(out[0].after.token).toBe('rounded-2xl')
  })
})

describe('renderSpec', () => {
  it('emits a structured spec with viewport + records', () => {
    const spec = renderSpec([record], {
      url: 'http://localhost:5173/pricing',
      width: 1440,
      height: 900,
      dpr: 2,
      now: '2026-06-25T00:00:00.000Z',
    })
    expect(spec.specVersion).toBe('1.0')
    expect(spec.viewport.width).toBe(1440)
    expect(spec.records).toHaveLength(1)
    expect(spec.records[0].changes).toHaveLength(2)
  })
})
