import { SHORTHAND_SETS } from './fields.js'
import { suggestUtility } from './tokens.js'
import type { ChangeEntry, EditRecord } from './types.js'

/**
 * Collapse full side-sets edited to the same value into a single shorthand
 * change (4× padding-* at 24px → one `padding` change → `p-6`), per breakpoint.
 */
export function collapseChanges(changes: ChangeEntry[]): ChangeEntry[] {
  const byBp = groupByBreakpoint(changes)
  const out: ChangeEntry[] = []
  for (const bp of Object.keys(byBp)) {
    const group = byBp[bp]
    const used = new Set<ChangeEntry>()
    for (const set of SHORTHAND_SETS) {
      const parts = set.parts.map((p) => group.find((c) => c.property === p))
      if (parts.every((p): p is ChangeEntry => !!p)) {
        const after = parts[0]!.after.computed
        if (parts.every((p) => p!.after.computed === after)) {
          parts.forEach((p) => used.add(p!))
          const beforeAllEqual = parts.every((p) => p!.before.computed === parts[0]!.before.computed)
          out.push({
            property: set.shorthand,
            before: { computed: beforeAllEqual ? parts[0]!.before.computed : 'mixed' },
            after: { computed: after, token: suggestUtility(set.shorthand, after) },
            breakpoint: parts[0]!.breakpoint,
            breakpointPx: parts[0]!.breakpointPx,
            state: null,
          })
        }
      }
    }
    for (const c of group) if (!used.has(c)) out.push(c)
  }
  return out
}

function groupByBreakpoint(changes: ChangeEntry[]): Record<string, ChangeEntry[]> {
  const out: Record<string, ChangeEntry[]> = {}
  for (const c of changes) (out[c.breakpoint] ??= []).push(c)
  return out
}

function locationLabel(r: EditRecord): string {
  const s = r.identity.source
  if (s.confidence !== 'none') return `${s.file}:${s.line}:${s.column}`
  if (r.identity.componentName) return `component <${r.identity.componentName}>`
  return r.identity.selector
}

function variant(breakpoint: string, token: string): string {
  return breakpoint === 'base' ? token : `${breakpoint}:${token}`
}

/** Render a copy-paste prompt for an AI coding agent. */
export function renderPrompt(records: EditRecord[]): string {
  const active = records.filter((r) => r.changes.length > 0)
  const total = active.reduce((n, r) => n + collapseChanges(r.changes).length, 0)
  const lines: string[] = []

  lines.push(
    `# uivisor — apply these UI tweaks (${total} change${total !== 1 ? 's' : ''} across ${active.length} element${active.length !== 1 ? 's' : ''})`,
  )
  lines.push('')
  lines.push(
    'These are visual tweaks I made in the running app. Apply them to the source. Do not change anything else.',
  )
  lines.push('')

  let anyClassTarget = false
  let anyNewClass = false
  active.forEach((r, i) => {
    const id = r.identity
    const newClass = r.target?.startsWith('new:') ? r.target.slice(4) : null
    const allTarget = !newClass && r.target === 'all'
    const classTarget =
      !newClass && !allTarget && r.target && r.target !== 'element' ? r.target : null
    if (classTarget) anyClassTarget = true
    if (newClass) anyNewClass = true

    const label = newClass
      ? `<${id.tagName}> → new class .${newClass}`
      : allTarget
        ? `<${id.tagName}> ×${id.instanceCount} (all like this)`
        : classTarget
          ? `<${id.tagName}> .${classTarget}`
          : `<${id.tagName}>` + (id.textSnippet ? ` "${id.textSnippet}"` : '')
    lines.push(`## ${i + 1}. ${label} — ${locationLabel(r)}`)

    const where = (): string => {
      const w: string[] = []
      if (id.componentName) w.push(`component <${id.componentName}>`)
      w.push(`occurrence at ${locationLabel(r)}`)
      if (id.textSnippet) w.push(`text "${id.textSnippet}"`)
      return w.join(', ')
    }

    if (allTarget) {
      lines.push(
        `- TARGET: this element is rendered ${id.instanceCount}× — it and its ${id.instanceCount - 1} sibling(s) are the same component/markup. Apply the change to ALL of them at once by editing the shared source/component (or adding one shared class) — do NOT pin it to a single positional nth-child. You decide whether editing the component or adding a shared class is cleaner.`,
      )
      lines.push(`- Find them via: ${where()} (the source above is rendered ${id.instanceCount}×)`)
    } else if (newClass) {
      lines.push(
        `- TARGET: create a NEW class \`.${newClass}\` with the styles below and add it to this element. Keep the existing classes as-is — do NOT pile more utilities onto them. (Tailwind: define it via \`@layer components { .${newClass} { @apply … } }\` or a CSS rule; reuse \`.${newClass}\` on similar elements.)`,
      )
      lines.push(`- Add it on: ${where()}`)
    } else if (classTarget) {
      lines.push(
        `- TARGET: the \`.${classTarget}\` style shared by ALL elements with this class. Edit that shared definition (the Tailwind utility, CSS-module/CSS rule, or styled-component) — NOT just this one node, and NOT via the positional selector.`,
      )
      lines.push(`- Find it via: ${where()}`)
    } else {
      if (id.instanceCount > 1) {
        lines.push(
          `- TARGET: THIS instance only. It's rendered ${id.instanceCount}× from the same source, so editing the shared source would change all ${id.instanceCount}. Scope the change to just this one (a prop/condition or a distinguishing class).`,
        )
      }
      const anchors: string[] = []
      if (id.componentName) anchors.push(`component <${id.componentName}>`)
      if (id.dataTestId) anchors.push(`data-testid="${id.dataTestId}"`)
      if (id.id) anchors.push(`#${id.id}`)
      if (id.selector) anchors.push(`selector \`${id.selector}\``)
      if (anchors.length) lines.push(`- Identify by: ${anchors.join(', ')}`)
    }

    const styleLine =
      `- Styling: ${r.styling.primaryMechanism}` +
      (r.styling.sourceClassNames.length
        ? ` (current classes: \`${r.styling.sourceClassNames.join(' ')}\`)`
        : '')
    lines.push(styleLine)

    const byBp = groupByBreakpoint(collapseChanges(r.changes))
    for (const bp of Object.keys(byBp)) {
      const scope =
        bp === 'base'
          ? 'all sizes (base)'
          : `${bp} breakpoint (≥${byBp[bp][0].breakpointPx}px)`
      lines.push(`- At ${scope}:`)
      for (const c of byBp[bp]) {
        const suggestion = c.after.token
          ? `  → \`${variant(bp, c.after.token)}\``
          : ''
        lines.push(
          `    - ${c.property}: ${c.before.computed} → ${c.after.computed}${suggestion}`,
        )
      }
    }
    lines.push('')
  })

  lines.push('### Rules')
  lines.push(
    '- Edit the EXISTING className/styles of each element. Do NOT add inline styles and do NOT duplicate the component.',
  )
  lines.push(
    '- Scope every change to its breakpoint with a responsive variant (e.g. `lg:`) so other screen sizes stay unchanged.',
  )
  lines.push(
    '- For non-Tailwind styling, edit the matching CSS-module / styled-component / CSS rule instead of the suggested utility, keeping the same breakpoint scope.',
  )
  lines.push('- Confirm each element by its source location, text and data-testid before editing.')
  if (anyClassTarget) {
    lines.push(
      '- For class-targeted edits, change the shared style once so every element using that class updates — do not hardcode it onto a single positional node.',
    )
  }
  if (anyNewClass) {
    lines.push(
      '- When creating a new class, leave the current classes untouched and add the new class alongside them; pick the styling mechanism the project already uses.',
    )
  }

  return lines.join('\n')
}

export interface EditSpec {
  specVersion: string
  capturedAt: string
  url: string
  viewport: { width: number; height: number; dpr: number }
  records: EditRecord[]
}

/** Render the structured JSON edit-spec (machine-readable companion to the prompt). */
export function renderSpec(
  records: EditRecord[],
  meta: { url: string; width: number; height: number; dpr: number; now: string },
): EditSpec {
  return {
    specVersion: '1.0',
    capturedAt: meta.now,
    url: meta.url,
    viewport: { width: meta.width, height: meta.height, dpr: meta.dpr },
    records: records.filter((r) => r.changes.length > 0),
  }
}
