import {
  type ActiveBreakpoint,
  activeBreakpoint,
  currentBreakpoint,
  detectBreakpoints,
  effectiveBreakpoint,
} from './breakpoint.js'
import type { BreakpointSystem } from './types.js'
import {
  applyOverride,
  buildChange,
  removeOverride,
  snapshot,
  toHexInput,
} from './capture.js'
import {
  ALL_CSS,
  ICONS,
  SECTIONS,
  UNIT_LABELS,
  type Control,
  type DimControl,
} from './fields.js'
import {
  type DesignSystem,
  type DesignToken,
  type TokenCategory,
  detectDesignSystem,
  nearestToken,
} from './designtokens.js'
import { type CssMeta, cssMeta, cssRegistry } from './cssRegistry.js'
import { detectMechanism } from './mechanism.js'
import { collapseChanges, renderPrompt, renderSpec } from './prompt.js'
import { getIdentity } from './source.js'
import { rgbToHex } from './tokens.js'
import type { ChangeEntry, EditRecord, ElementIdentity } from './types.js'
import { CSS } from './ui.css.js'

interface ElState {
  record: EditRecord
  original: Record<string, string>
  applied: Set<string>
  /** Chosen display unit per dimension control (line-height, letter-spacing). */
  dimUnit: Record<string, string>
}

interface ElContext {
  hasText: boolean
  flexGrid: boolean
}

/** One undo/redo frame: every element's full edit state + the selection. */
interface HistorySnap {
  selected: HTMLElement | null
  entries: { el: HTMLElement; record: EditRecord; original: Record<string, string>; dimUnit: Record<string, string> }[]
}

let counter = 0
const round2 = (n: number) => Math.round(n * 100) / 100
/** CSS properties that inherit — for these, a rule on an ancestor counts as "from
 *  the file" (white), so the readout/controls don't mislabel inherited text styles. */
const INHERITED_PROPS = new Set([
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-align', 'font-family',
])

class Uivisor {
  private host!: HTMLDivElement
  private root!: ShadowRoot
  private enabled = false
  private selected: HTMLElement | null = null
  private states = new Map<HTMLElement, ElState>()
  private expanded = new Set<string>()
  /** Section titles collapsed in the accordion (per session). */
  private collapsedSecs = new Set<string>()
  /** Controls manually revealed via "+" (hideWhenAuto controls that are auto). */
  private revealedCtls = new Set<string>()
  /** "All CSS" search query + which property categories are expanded. */
  private cssSearch = ''
  private expandedCats = new Set<string>()
  /** Undo / redo stacks of full edit-state snapshots. */
  private undoStack: HistorySnap[] = []
  private redoStack: HistorySnap[] = []
  /** Cached live computed-style for the selected element (invalidated each render). */
  private _cs: CSSStyleDeclaration | null = null
  private _csEl: HTMLElement | null = null
  /** Per-render memo of authored longhands per element (for the styles readout). */
  private _matched: Map<Element, Set<string>> | null = null
  /** Cached project breakpoint system (detected from CSS), refreshed until found. */
  private _bp: BreakpointSystem | null = null
  /** Cached project design system (detected from CSS variables), refreshed until found. */
  private _ds: DesignSystem | null = null
  /** Memoised Tailwind-utility probes: candidate class → resolved class or null. */
  private utilCache = new Map<string, string | null>()

  /** Project breakpoints — re-detect until the stylesheets yield a real set. */
  private bpSystem(): BreakpointSystem {
    if (!this._bp || this._bp.name !== 'detected') this._bp = detectBreakpoints()
    return this._bp
  }

  /** Project design tokens — re-detect until the CSS variables resolve. */
  private designSystem(): DesignSystem {
    if (!this._ds || this._ds.source === 'none') this._ds = detectDesignSystem()
    return this._ds
  }

  /** Which token category (if any) a CSS property picks tokens from. */
  private dsCategoryFor(css: string): TokenCategory | null {
    if (css === 'font-size') return 'font-size'
    if (css === 'color' || css === 'background-color') return 'color'
    return null
  }

  /** Does a Tailwind utility for this token actually exist in the project CSS?
   *  Probe a hidden element in the page document and compare the resolved value. */
  private dsUtility(css: string, token: DesignToken): string | null {
    const prefix = css === 'background-color' ? 'bg' : 'text' // color & font-size → text
    const cls = `${prefix}-${token.name}`
    if (this.utilCache.has(cls)) return this.utilCache.get(cls) ?? null
    let res: string | null = null
    try {
      const probe = document.createElement('span')
      probe.className = cls
      probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden'
      document.body.appendChild(probe)
      const got = getComputedStyle(probe).getPropertyValue(css).trim()
      probe.remove()
      if (token.category === 'color') {
        const a = (rgbToHex(got) || got).toLowerCase()
        const b = (rgbToHex(token.value) || token.value).toLowerCase()
        if (a && a === b) res = cls
      } else if (token.px != null && Math.abs(parseFloat(got) - token.px) < 0.5) {
        res = cls
      }
    } catch {
      /* noop */
    }
    this.utilCache.set(cls, res)
    return res
  }

  private hoverBox!: HTMLElement
  private selBox!: HTMLElement
  private tag!: HTMLElement
  private fab!: HTMLElement
  private panel!: HTMLElement
  private bpBadge!: HTMLElement
  private toast!: HTMLElement

  // responsive (virtual screen) mode
  private responsive = false
  private frameWrap!: HTMLElement
  private frame!: HTMLIFrameElement
  private frameWidth = 768

  mount(): void {
    this.host = document.createElement('div')
    this.host.id = 'uivisor-root'
    this.host.setAttribute('data-uiv-ignore', '')
    this.root = this.host.attachShadow({ mode: 'open' })
    document.documentElement.appendChild(this.host)

    this.root.innerHTML = `
      <style>${CSS}</style>
      <div class="uiv-framewrap">
        <div class="uiv-framebar"><div class="uiv-framechips uiv-chips"></div><span class="uiv-framew">768px</span><span class="uiv-framex" title="Turn uivisor off (Alt+U)">✕</span></div>
        <div class="uiv-framestage">
          <div class="uiv-framehost">
            <iframe class="uiv-frame" data-uiv-frame="1"></iframe>
            <div class="uiv-framehandle" title="Drag to resize"></div>
          </div>
        </div>
      </div>
      <div class="uiv-box hover"></div>
      <div class="uiv-box sel"></div>
      <div class="uiv-tag"></div>
      <div class="uiv-fab" title="Toggle uivisor (Alt+U)">◎</div>
      <div class="uiv-info"></div>
      <div class="uiv-toast"></div>
      <div class="uiv-panel">
        <div class="uiv-head">
          <b>uivisor</b>
          <span class="uiv-bp">base</span>
          <span class="uiv-x" title="Close">✕</span>
        </div>
        <div class="uiv-body"></div>
        <div class="uiv-foot">
          <button class="uiv-btn primary copy-prompt">Copy prompt for agent</button>
          <button class="uiv-btn copy-json">Copy JSON</button>
          <button class="uiv-btn ghost reset" title="Revert tweaks on selected element">Reset</button>
          <button class="uiv-btn ghost clear" title="Clear all">Clear</button>
        </div>
      </div>
    `

    this.hoverBox = this.q('.uiv-box.hover')
    this.selBox = this.q('.uiv-box.sel')
    this.tag = this.q('.uiv-tag')
    this.fab = this.q('.uiv-fab')
    this.panel = this.q('.uiv-panel')
    this.bpBadge = this.q('.uiv-bp')
    this.toast = this.q('.uiv-toast')

    this.frameWrap = this.q('.uiv-framewrap')
    this.frame = this.q<HTMLIFrameElement>('.uiv-frame')

    this.fab.addEventListener('click', () => this.toggle())
    this.q('.uiv-x').addEventListener('click', () => this.toggle(false))
    this.q('.uiv-framex').addEventListener('click', () => this.toggle(false)) // ✕ turns uivisor off
    this.q('.copy-prompt').addEventListener('click', () => this.copyPrompt())
    this.q('.copy-json').addEventListener('click', () => this.copyJSON())
    this.q('.reset').addEventListener('click', () => this.resetSelected())
    this.q('.clear').addEventListener('click', () => this.clearAll())
    this.bindFrameHandle()

    this.attachPicker(document)
    document.addEventListener('keydown', this.onKey, true)
    window.addEventListener('scroll', this.reposition, true)
    window.addEventListener('resize', this.onResize, true)

    this.renderBody()
    this.updateBp()
    // Report status after the app has had a chance to render (so source attrs exist).
    window.setTimeout(() => this.reportStatus(), 1500)
  }

  /** Tell the dev, in the console, whether uivisor is alive and source-mapped. */
  private reportStatus(): void {
    try {
      const n = document.querySelectorAll('[data-uiv-src]').length
      if (n > 0) {
        // eslint-disable-next-line no-console
        console.info(
          `%cuivisor%c active — Alt+U (or ◎) · ${n} source-mapped elements`,
          'color:#818cf8;font-weight:700',
          'color:inherit',
        )
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[uivisor] active, but NO source attributes were found — exact file:line is OFF.\n' +
            '• Next + Turbopack: run `next dev --webpack`, or enable the uivisor Turbopack loader.\n' +
            '• Vite: make sure uivisor() is listed BEFORE react() in your plugins.\n' +
            'Tweaking still works (it falls back to component name + selector + text).',
        )
      }
    } catch {
      /* noop */
    }
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T
  }

  private isOurs(e: Event): boolean {
    return e.composedPath().includes(this.host)
  }

  // ---- enable / disable ----
  toggle(force?: boolean): void {
    this.enabled = force ?? !this.enabled
    this.fab.classList.toggle('on', this.enabled)
    this.panel.classList.toggle('show', this.enabled)
    if (!this.enabled) {
      this.hoverBox.style.display = 'none'
      this.tag.style.display = 'none'
      this.renderInfo() // hide the floating styles block
      if (this.responsive) this.toggleResponsive(false)
    } else {
      this.scheduleBpRefresh()
      // No "Live" mode: always work in the virtual screen, sized to the current
      // window's breakpoint by default. The frame loads once here, so there's no
      // mid-session real→frame switch that used to drop the selection.
      if (!this.responsive) {
        this.frameWidth = this.defaultFrameWidth()
        this.toggleResponsive(true)
      }
    }
  }

  /** Frame width on enable: the real window width (≈ the current breakpoint). */
  private defaultFrameWidth(): number {
    return typeof window !== 'undefined' ? window.innerWidth : 1280
  }

  /** Frame width for the "all"/base chip: a phone-ish width in the base range. */
  private baseFrameWidth(): number {
    const bps = this.bpSystem().breakpoints
    const firstBp = bps.length ? bps[0].minWidth : 640
    return this.bpSystem().dir === 'min' ? Math.min(390, firstBp - 1) : 390
  }

  /** Stylesheets (esp. JIT/CDN Tailwind) load async — re-detect breakpoints a few
   *  times after enabling and re-render only if the set actually changed. */
  private scheduleBpRefresh(): void {
    const key = (s: BreakpointSystem) => s.name + ':' + s.breakpoints.map((b) => b.minWidth).join(',')
    const refresh = () => {
      if (!this.enabled) return
      const prev = this._bp
      this._bp = null
      const next = this.bpSystem()
      const prevDsN = this._ds?.tokens.length ?? -1
      this._ds = null
      const nextDs = this.designSystem()
      if (!prev || key(prev) !== key(next) || prevDsN !== nextDs.tokens.length) this.renderBody()
    }
    for (const d of [250, 900, 2200]) window.setTimeout(refresh, d)
  }

  // ---- responsive (virtual screen) mode ----
  /** The document the inspector currently targets: the iframe in responsive mode. */
  private doc(): Document {
    if (this.responsive && this.frame.contentDocument) return this.frame.contentDocument
    return document
  }

  /** Offset of the iframe within the top viewport (for positioning highlight boxes). */
  private frameOffset(): { x: number; y: number } {
    if (this.responsive) {
      const r = this.frame.getBoundingClientRect()
      return { x: r.left, y: r.top }
    }
    return { x: 0, y: 0 }
  }

  private attachPicker(d: Document): void {
    d.addEventListener('mousemove', this.onMove, true)
    d.addEventListener('click', this.onClick, true)
    d.addEventListener('keydown', this.onKey, true)
  }

  private detachPicker(d: Document): void {
    d.removeEventListener('mousemove', this.onMove, true)
    d.removeEventListener('click', this.onClick, true)
    d.removeEventListener('keydown', this.onKey, true)
  }

  toggleResponsive(force?: boolean): void {
    const next = force ?? !this.responsive
    if (next === this.responsive) return

    // Remember what was selected so we can re-select the same element after the
    // document switch (the element lives in a different doc / fresh iframe load).
    const prevId = this.selected ? this.st()?.record.identity ?? null : null
    this.detachPicker(this.doc())
    this.selected = null

    if (next) {
      this.responsive = true
      this.frameWrap.classList.add('show')
      this.setFrameWidth(this.frameWidth)
      this.frame.onload = () => {
        const fd = this.frame.contentDocument
        if (fd) {
          this.attachPicker(fd)
          this.reselect(prevId, fd)
        }
        this.reposition()
      }
      // (re)load the app inside the frame
      this.frame.src = location.href
    } else {
      this.responsive = false
      this.frameWrap.classList.remove('show')
      this.frame.onload = null
      this.frame.src = 'about:blank'
      this.attachPicker(document)
      this.reselect(prevId, document)
    }
    this.reposition()
    this.updateBp()
    this.renderBody()
  }

  /** Find and re-select the element matching a prior identity in the given doc. */
  private reselect(id: ElementIdentity | null, doc: Document): void {
    if (!id) return
    let el: Element | null = null
    if (id.dataTestId) el = doc.querySelector(`[data-testid="${cssAttrEscape(id.dataTestId)}"]`)
    if (!el && id.source.confidence !== 'none') {
      const raw = `${id.source.file}:${id.source.line}:${id.source.column}`
      el =
        [...doc.querySelectorAll('[data-uiv-src]')].find(
          (e) =>
            e.getAttribute('data-uiv-src') === raw &&
            (!id.textSnippet || (e.textContent || '').includes(id.textSnippet)),
        ) ||
        [...doc.querySelectorAll('[data-uiv-src]')].find((e) => e.getAttribute('data-uiv-src') === raw) ||
        null
    }
    if (!el && id.selector) {
      try {
        el = doc.querySelector(id.selector)
      } catch {
        /* invalid selector */
      }
    }
    if (el) this.select(el as HTMLElement)
  }

  private setFrameWidth(w: number): void {
    this.frameWidth = Math.max(280, Math.min(2400, Math.round(w)))
    const host = this.q('.uiv-framehost')
    host.style.width = `${this.frameWidth}px`
    const bp = activeBreakpoint(this.frameWidth, this.bpSystem()).name
    this.q('.uiv-framew').textContent = `${this.frameWidth}px · ${this.bpLabel(bp)}`
    this.updateBp()
    this.reposition()
  }

  private bindFrameHandle(): void {
    const handle = this.q('.uiv-framehandle')
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = this.frameWidth
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      const move = (ev: PointerEvent) => this.setFrameWidth(startW + (ev.clientX - startX) * 2)
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        // The frame's breakpoint changed → re-project edits onto it + refresh hint.
        // Existing edits keep their own breakpoint tags; new edits scope to this width.
        this.reapplyScope()
        this.renderBody()
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
  }

  // ---- pointer handling ----
  private onMove = (e: MouseEvent): void => {
    if (!this.enabled || this.isOurs(e)) {
      this.hoverBox.style.display = 'none'
      this.tag.style.display = 'none'
      return
    }
    const el = e.target as HTMLElement | null
    const d = this.doc()
    if (!el || el === d.documentElement || el === d.body) return
    const r = el.getBoundingClientRect()
    const o = this.frameOffset()
    this.place(this.hoverBox, r)
    this.hoverBox.style.display = 'block'
    this.tag.textContent = `${el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}`
    this.tag.style.left = `${r.left + o.x}px`
    this.tag.style.top = `${Math.max(0, r.top + o.y - 20)}px`
    this.tag.style.display = 'block'
  }

  private onClick = (e: MouseEvent): void => {
    if (!this.enabled || this.isOurs(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    this.select(e.target as HTMLElement)
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.altKey && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault()
      this.toggle()
      return
    }
    if (!this.enabled) return
    // Undo / redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      e.shiftKey ? this.redo() : this.undo()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault()
      this.redo()
      return
    }
    if (e.key === 'Escape') {
      if (this.selected) this.select(null)
      else this.toggle(false)
    }
  }

  private lastWinBp = ''
  private onResize = (): void => {
    this.updateBp()
    this.reposition()
    const winBp = currentBreakpoint(this.bpSystem()).name
    if (winBp !== this.lastWinBp) {
      this.lastWinBp = winBp
      if (this.enabled && this.selected) {
        this.reapplyScope() // window crossed a breakpoint → re-project edits
        this.renderBody()
      }
    }
  }

  private reposition = (): void => {
    if (this.selected) {
      this.place(this.selBox, this.selected.getBoundingClientRect())
      this.selBox.style.display = 'block'
    } else {
      this.selBox.style.display = 'none'
    }
  }

  private place(box: HTMLElement, r: DOMRect): void {
    const o = this.frameOffset()
    box.style.left = `${r.left + o.x}px`
    box.style.top = `${r.top + o.y}px`
    box.style.width = `${r.width}px`
    box.style.height = `${r.height}px`
  }

  // ---- selection ----
  private select(el: HTMLElement | null): void {
    this.selected = el
    if (el && !this.states.has(el)) {
      const authoredInlineLen = (el.getAttribute('style') || '').length
      const identity = getIdentity(el)
      const record: EditRecord = {
        id: `e${++counter}`,
        identity,
        styling: detectMechanism(el, authoredInlineLen),
        changes: [],
        // Repeated instances default to "all" — editing the shared source/component
        // updates every sibling, which is what people usually want.
        target: identity.instanceCount > 1 ? 'all' : 'element',
      }
      this.states.set(el, {
        record,
        // Snapshot every registry property (not just the curated set) so a generic
        // edit's "before" value is known — the All-CSS inspector edits anything.
        original: snapshot(el, this.snapshotProps()),
        applied: new Set(),
        dimUnit: {},
      })
    }
    // Project this element's existing edits onto the active breakpoint.
    if (el) this.reapplyScope()
    this.reposition()
    this.renderBody()
  }

  /** Properties to snapshot on selection: the curated set ∪ the whole registry. */
  private _snapProps: string[] | null = null
  private snapshotProps(): string[] {
    if (!this._snapProps) this._snapProps = [...new Set([...ALL_CSS, ...cssRegistry().byProp.keys()])]
    return this._snapProps
  }

  // ---- value helpers ----
  private st(): ElState | null {
    return this.selected ? this.states.get(this.selected) ?? null : null
  }

  /** Live computed value of the selected element — reflects the CURRENT breakpoint
   *  (the virtual screen's width / real window), unlike the at-selection snapshot. */
  private computedVal(css: string): string {
    const el = this.selected
    if (!el) return ''
    if (this._csEl !== el || !this._cs) {
      try {
        this._cs = getComputedStyle(el)
        this._csEl = el
      } catch {
        return ''
      }
    }
    return this._cs.getPropertyValue(css).trim()
  }

  private liveVal(css: string): string {
    const el = this.selected
    const st = this.st()
    if (!el || !st) return ''
    // The change that wins the cascade at this width — set here OR inherited from a
    // neighbour (padding 20 at md shows 20 at md AND lg/xl until overridden).
    const ch = this.effectiveChange(css)
    if (ch) {
      const v = ch.live ?? ch.after.computed
      return v.includes('var(') ? this.computedVal(css) || v : v
    }
    // Otherwise: the element's current computed value (tracks the breakpoint); the
    // at-selection snapshot is only a last-resort fallback.
    const inline = el.style.getPropertyValue(css)
    if (inline && !inline.includes('var(')) return inline
    return this.computedVal(css) || st.original[css] || ''
  }

  private liveNum(css: string): number | null {
    const v = this.liveVal(css).trim()
    const m = /^(-?\d*\.?\d+)px$/.exec(v)
    if (m) return parseFloat(m[1])
    if (v === '') return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }

  private numInfo(cssList: string[]): { value: string; mixed: boolean } {
    const nums = cssList.map((c) => this.liveNum(c))
    if (nums.length === 1) return { value: nums[0] == null ? '' : String(round2(nums[0])), mixed: false }
    const first = nums[0]
    const allEqual = nums.every((n) => n != null && n === first)
    return allEqual ? { value: String(round2(first as number)), mixed: false } : { value: '', mixed: true }
  }

  private isChanged(cssList: string[]): boolean {
    const st = this.st()
    if (!st) return false
    // Green only when edited AT THE ACTIVE breakpoint (per-breakpoint editing).
    const scope = this.activeScope()
    return cssList.some((c) =>
      st.record.changes.some((ch) => ch.property === c && ch.breakpoint === scope.name),
    )
  }

  private selectCurrent(css: string): string {
    let v = this.liveVal(css).trim()
    if (v === 'normal') v = '400'
    if (v === 'bold') v = '700'
    return v
  }

  // ---- apply / record / revert ----
  /** All elements that share the selected element's JSX origin (or tag+class). */
  private siblingsOf(el: HTMLElement): HTMLElement[] {
    try {
      const doc = el.ownerDocument
      const raw = el.closest('[data-uiv-src]')?.getAttribute('data-uiv-src')
      if (raw) {
        const m = [...doc.querySelectorAll('[data-uiv-src]')].filter(
          (e) => e.getAttribute('data-uiv-src') === raw,
        )
        if (m.length) return m as HTMLElement[]
      }
      if (el.classList.length) {
        const sig = (e: Element) => `${e.tagName}|${[...e.classList].sort().join(' ')}`
        const mine = sig(el)
        const m = [...doc.querySelectorAll(el.tagName)].filter((e) => sig(e) === mine)
        if (m.length) return m as HTMLElement[]
      }
    } catch {
      /* noop */
    }
    return [el]
  }

  /** Elements the current edit applies to: all siblings when target is "all". */
  private targetEls(): HTMLElement[] {
    const el = this.selected
    if (!el) return []
    return this.st()?.record.target === 'all' ? this.siblingsOf(el) : [el]
  }

  private liveSet(cssList: string[], value: string): void {
    if (!this.selected) return
    for (const el of this.targetEls()) {
      for (const css of cssList) applyOverride(el, css, value)
    }
    this.reposition()
  }

  /** Re-apply recorded overrides after the target (all ↔ one) changes. */
  private reapplyForTarget(): void {
    this.reapplyScope()
  }

  /**
   * Project the live preview for the ACTIVE breakpoint: strip every override we
   * applied, then re-apply ONLY the changes recorded for the current scope. This
   * is what makes per-breakpoint edits behave — set padding 20 at xl, 10 at md,
   * and each breakpoint shows (and previews) its own value instead of one global
   * inline override leaking across all of them.
   */
  private reapplyScope(): void {
    const width = this.activeWidth()
    const sys = this.bpSystem()
    for (const [el, st] of this.states) {
      const sibs = this.siblingsOf(el)
      const targets = st.record.target === 'all' ? sibs : [el]
      for (const css of st.applied) for (const e of sibs) removeOverride(e, css)
      st.applied = new Set()
      // Per property, apply the change that wins the cascade at this width (the
      // edit on this breakpoint OR inherited from a neighbour per min/max-width).
      const byProp = new Map<string, ChangeEntry[]>()
      for (const c of st.record.changes) {
        const arr = byProp.get(c.property) ?? []
        arr.push(c)
        byProp.set(c.property, arr)
      }
      for (const [prop, changes] of byProp) {
        const eff = effectiveBreakpoint(changes.map((c) => c.breakpoint), width, sys)
        if (!eff) continue
        const c = changes.find((x) => x.breakpoint === eff)!
        for (const e of targets) applyOverride(e, prop, c.live ?? c.after.computed)
        st.applied.add(prop)
      }
    }
    this.reposition()
  }

  /** The breakpoint recorded edits are scoped to: manual override, else window. */
  /** The breakpoint edits are scoped to: the virtual screen's width when in
   *  responsive mode, otherwise the real window. */
  private activeScope(): ActiveBreakpoint {
    const sys = this.bpSystem()
    if (this.responsive) return activeBreakpoint(this.frameWidth, sys)
    return currentBreakpoint(sys)
  }

  /** The width the inspector is scoped to (virtual screen, else real window). */
  private activeWidth(): number {
    if (this.responsive) return this.frameWidth
    return typeof window !== 'undefined' ? window.innerWidth : 0
  }

  /** The recorded change that wins the breakpoint cascade for `css` at the active
   *  width — i.e. the value effective here, set on this breakpoint or inherited. */
  private effectiveChange(css: string): ChangeEntry | null {
    const st = this.st()
    if (!st) return null
    const changes = st.record.changes.filter((c) => c.property === css)
    if (!changes.length) return null
    const eff = effectiveBreakpoint(
      changes.map((c) => c.breakpoint),
      this.activeWidth(),
      this.bpSystem(),
    )
    return eff ? changes.find((c) => c.breakpoint === eff) ?? null : null
  }

  /** If `css`'s effective value is INHERITED from another breakpoint, its name. */
  private inheritedFrom(props: string[]): string | null {
    const scope = this.activeScope()
    for (const p of props) {
      const e = this.effectiveChange(p)
      if (e && e.breakpoint !== scope.name) return e.breakpoint
    }
    return null
  }

  private recordProps(cssList: string[]): void {
    const el = this.selected
    const st = this.st()
    if (!el || !st) return
    const scope = this.activeScope()
    for (const css of cssList) {
      const applied = el.style.getPropertyValue(css)
      if (!applied) continue
      st.applied.add(css)
      this.setChange(st.record, buildChange(css, st.original[css], applied, scope))
    }
    this.renderBody()
  }

  /** Apply a design-system token to a property. The LIVE override is `var(--token)`
   *  so a responsive token keeps adapting as you move across breakpoints; the
   *  recorded value shows the token's value, tagged so the prompt asks for the token. */
  private applyToken(css: string, token: DesignToken): void {
    this.pushHistory()
    const live = `var(${token.cssVar})`
    this.liveSet([css], live)
    const st = this.st()
    if (!st) return
    const scope = this.activeScope()
    st.applied.add(css)
    const change = buildChange(css, st.original[css], token.value, scope)
    change.live = live // re-applied on undo/redo & target switch (keeps the var)
    change.after.designToken = token.cssVar
    // Prefer a real Tailwind utility when the project exposes one; else var() form.
    change.after.token =
      st.record.styling.primaryMechanism === 'tailwind' ? this.dsUtility(css, token) : null
    this.setChange(st.record, change)
    this.renderBody()
  }

  private revertProps(cssList: string[]): void {
    const el = this.selected
    const st = this.st()
    if (!el || !st) return
    // Clear only the edit at the ACTIVE breakpoint (others keep their own); then
    // re-project the live overrides for the cascade + target. (Was: deleted the
    // property at ALL breakpoints and ignored target — wrong for per-bp editing.)
    const scope = this.activeScope()
    for (const css of cssList) {
      st.record.changes = st.record.changes.filter(
        (c) => !(c.property === css && c.breakpoint === scope.name),
      )
    }
    this.reapplyScope()
    this.renderBody()
  }

  private commitNumeric(cssList: string[], raw: string): void {
    if (raw.trim() === '') {
      this.revertProps(cssList)
      return
    }
    const n = parseFloat(raw)
    if (!Number.isFinite(n)) return
    this.liveSet(cssList, `${n}px`)
    this.recordProps(cssList)
  }

  private commitValue(cssList: string[], value: string, allowEmpty = false): void {
    if (allowEmpty && value.trim() === '') {
      this.revertProps(cssList)
      return
    }
    this.liveSet(cssList, value)
    this.recordProps(cssList)
  }

  private onDimInput(css: string, box: HTMLElement): void {
    const st = this.st()
    if (!st) return
    const input = box.querySelector('input') as HTMLInputElement
    const unit = (box.querySelector('.uiv-unit') as HTMLSelectElement).value
    st.dimUnit[css] = unit
    const num = input.value.trim()
    if (num === '') {
      this.revertProps([css])
      return
    }
    this.liveSet([css], unit === '' ? num : `${num}${unit}`)
    this.recordProps([css])
  }

  /** Switching the unit only changes how the value is shown — it converts, it
   *  does not re-apply or clear the number. */
  private onUnitChange(css: string, box: HTMLElement): void {
    const st = this.st()
    if (!st) return
    st.dimUnit[css] = (box.querySelector('.uiv-unit') as HTMLSelectElement).value
    this.renderBody()
  }

  private setChange(record: EditRecord, entry: ChangeEntry): void {
    record.changes = record.changes.filter(
      (c) => !(c.property === entry.property && c.breakpoint === entry.breakpoint),
    )
    if (entry.before.computed !== entry.after.computed) record.changes.push(entry)
  }

  // ---- rendering ----
  private renderBody(): void {
    // Fresh reads each render: drop the computed-style cache and matched-rule memo
    // so every control reflects the CURRENT breakpoint (no stale margin/size/etc.).
    this._cs = null
    this._csEl = null
    this._matched = null
    const body = this.q('.uiv-body')
    if (!this.selected) {
      body.innerHTML = `
        ${this.breakpointBarHtml()}
        <div class="uiv-empty">Click any element ${this.responsive ? 'in the frame' : 'on the page'} to select it.</div>
        <div class="uiv-hint">Alt+U toggles · Esc deselects · ⌘/Ctrl+Z undo, ⇧ to redo. Tweaks stay in the browser — nothing is written to your code.</div>
        ${this.journalHtml()}
      `
      if (this.responsive) this.renderFrameBar()
      this.renderInfo()
      this.bindControls()
      return
    }
    const st = this.states.get(this.selected)!
    const id = st.record.identity
    const src =
      id.source.confidence !== 'none'
        ? `${id.source.file}:${id.source.line}:${id.source.column}`
        : id.componentName
          ? `&lt;${id.componentName}&gt; (no source map)`
          : id.selector

    body.innerHTML = `
      <div class="uiv-sec uiv-meta">
        <div><span class="uiv-el">&lt;${id.tagName}&gt;</span> ${
          id.textSnippet ? `"${escapeHtml(id.textSnippet)}"` : ''
        }</div>
        <div class="uiv-src">${escapeHtml(src)}</div>
        <span class="uiv-mech">${st.record.styling.primaryMechanism}</span>
      </div>
      ${this.dsIndicatorHtml()}
      ${this.breakpointBarHtml()}
      ${this.targetHtml(st)}
      ${this.controlsHtml(this.context(this.selected))}
      ${this.allCssHtml()}
      ${this.journalHtml()}
    `
    if (this.responsive) this.renderFrameBar()
    this.renderInfo()
    this.bindControls()
  }

  /** Small indicator: how many design tokens were detected (or a hint if none). */
  private dsIndicatorHtml(): string {
    const ds = this.designSystem()
    if (ds.source === 'none') return ''
    const cats = (Object.keys(ds.byCategory) as TokenCategory[])
      .map((c) => `${ds.byCategory[c]!.length} ${c}`)
      .join(' · ')
    return `<div class="uiv-dsbar" title="${escapeAttr(cats)}">◆ Design system · ${ds.tokens.length} tokens detected</div>`
  }

  /** Longhand properties an authoring rule (or non-uivisor inline) sets on `el`.
   *  Reimplements getMatchedCSSRules over same-origin sheets (incl. matching
   *  @media), so we can tell "set in the project's CSS" from "browser default". */
  private matchedProps(el: Element): Set<string> {
    const cache = (this._matched ||= new Map())
    const cached = cache.get(el)
    if (cached) return cached
    const out = new Set<string>()
    const he = el as HTMLElement
    // author inline — but NOT uivisor's own ephemeral overrides on the selection
    const applied = el === this.selected ? (this.st()?.applied ?? new Set<string>()) : new Set<string>()
    if (he.style) for (let i = 0; i < he.style.length; i++) {
      const p = he.style[i]
      if (!applied.has(p)) out.add(p)
    }
    const win = el.ownerDocument.defaultView || window
    const walk = (rules: CSSRuleList): void => {
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i] as unknown as {
          selectorText?: string
          style?: CSSStyleDeclaration
          media?: MediaList
          cssRules?: CSSRuleList
        }
        if (r.selectorText && r.style) {
          let m = false
          try {
            m = el.matches(r.selectorText)
          } catch {
            m = false
          }
          if (m) for (let j = 0; j < r.style.length; j++) out.add(r.style[j])
        } else if (r.media && r.cssRules) {
          let ok = true
          try {
            ok = win.matchMedia(r.media.mediaText).matches
          } catch {
            ok = true
          }
          if (ok) walk(r.cssRules)
        } else if (r.cssRules) {
          walk(r.cssRules)
        }
      }
    }
    const sheets = el.ownerDocument.styleSheets
    for (let i = 0; i < sheets.length; i++) {
      try {
        walk(sheets[i].cssRules)
      } catch {
        /* cross-origin sheet — skip */
      }
    }
    cache.set(el, out)
    return out
  }

  /** Editing state of a property set: edited (set at this breakpoint) · inherit
   *  (cascaded from another breakpoint) · file (authored in CSS) · auto
   *  (browser-computed / default, not set anywhere). */
  private controlState(props: string[]): 'edited' | 'inherit' | 'file' | 'auto' {
    if (this.isChanged(props)) return 'edited'
    if (this.inheritedFrom(props)) return 'inherit'
    const inherit = props.some((p) => INHERITED_PROPS.has(p))
    return this.isAuthored(props, inherit) ? 'file' : 'auto'
  }

  private controlStateClass(props: string[]): string {
    return ` st-${this.controlState(props)}`
  }

  /** A control's label, with an "inherited from {bp}" badge when the value cascaded. */
  private ctlLabel(label: string, props: string[]): string {
    const from = this.inheritedFrom(props)
    const badge = from
      ? ` <span class="uiv-inh" title="inherited from ${escapeAttr(this.bpLabel(from))} — not set at this breakpoint">⤣${escapeHtml(this.bpLabel(from))}</span>`
      : ''
    return `<span class="clabel">${label}${badge}</span>`
  }

  /** Is any of `props` authored in the project CSS? For inherited properties we
   *  also walk ancestors (a body/parent font rule still counts as "from the file"). */
  private isAuthored(props: string[], inherit: boolean): boolean {
    let node: Element | null = this.selected
    while (node) {
      const set = this.matchedProps(node)
      if (props.some((p) => set.has(p))) return true
      node = inherit ? node.parentElement : null
    }
    return false
  }

  /**
   * Comprehensive read-only readout of the element's ACTUAL current styles
   * (context-aware: flex/grid/position rows only when relevant). Rendered into the
   * floating info block at the corner, not the panel. Returns the `<div.uiv-rrow>` rows.
   */
  private styleRows(): string {
    const el = this.selected
    if (!el) return ''
    let cs: CSSStyleDeclaration
    try {
      cs = getComputedStyle(el)
    } catch {
      return ''
    }
    const g = (p: string) => cs.getPropertyValue(p).trim()
    const hex = (v: string) => rgbToHex(v) || v
    const swatch = (v: string) => {
      const h = hex(v)
      return /^#|rgb/.test(h) ? `<span class="uiv-sw" style="background:${h}"></span>${h}` : h
    }
    const sides = (parts: string[]) => {
      const [t, r, b, l] = parts.map(g)
      if (t === r && r === b && b === l) return t
      if (t === b && r === l) return `${t} ${r}`
      return `${t} ${r} ${b} ${l}`
    }
    const px4 = (pre: string, suf = '') => [`${pre}-top${suf}`, `${pre}-right${suf}`, `${pre}-bottom${suf}`, `${pre}-left${suf}`]
    const clip = (s: string, n = 30) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

    // Read-only readout: just the real values (no colour coding here — the
    // file/edited/auto colours live on the editable controls below).
    const rows: { k: string; v: string }[] = []
    const add = (k: string, v: string, _props: string[] = [], _inherit = false) => {
      if (v !== '' && v != null) rows.push({ k, v })
    }

    const disp = g('display')
    add('display', disp, ['display'])

    const pos = g('position')
    if (pos && pos !== 'static') {
      add('position', pos, ['position'])
      const inset = ['top', 'right', 'bottom', 'left'].filter((s) => g(s) !== 'auto').map((s) => `${s[0]} ${g(s)}`).join('  ')
      if (inset) add('inset', inset, ['top', 'right', 'bottom', 'left'])
    }

    add('width', `${Math.round(parseFloat(g('width')) || 0)}px`, ['width'])
    add('height', `${Math.round(parseFloat(g('height')) || 0)}px`, ['height'])
    const maxw = g('max-width')
    if (maxw && maxw !== 'none') add('max-w', maxw, ['max-width'])
    const minh = g('min-height')
    if (minh && minh !== '0px' && minh !== 'auto') add('min-h', minh, ['min-height'])

    // flex / grid CONTAINER
    if (/flex|grid/.test(disp)) {
      if (disp.includes('flex')) add('direction', g('flex-direction'), ['flex-direction'])
      add('justify', g('justify-content'), ['justify-content'])
      add('align', g('align-items'), ['align-items'])
      if (disp.includes('flex')) {
        const w = g('flex-wrap')
        if (w && w !== 'nowrap') add('wrap', w, ['flex-wrap'])
      }
      if (disp.includes('grid')) {
        const c = g('grid-template-columns')
        if (c && c !== 'none') add('grid-cols', clip(c), ['grid-template-columns'])
      }
      const gap = g('gap')
      if (gap && gap !== 'normal') add('gap', gap, ['gap', 'row-gap', 'column-gap'])
    }

    // flex / grid ITEM (parent is a flex/grid container)
    let parentDisp = ''
    try {
      if (el.parentElement) parentDisp = getComputedStyle(el.parentElement).display
    } catch {
      /* noop */
    }
    if (/flex|grid/.test(parentDisp)) {
      add('flex', `${g('flex-grow')} ${g('flex-shrink')} ${g('flex-basis')}`, ['flex-grow', 'flex-shrink', 'flex-basis'])
      const as = g('align-self')
      if (as && as !== 'auto' && as !== 'normal') add('self', as, ['align-self'])
    }

    const pad = sides(px4('padding'))
    if (pad && pad !== '0px') add('padding', pad, px4('padding'))
    const mar = sides(px4('margin'))
    if (mar && mar !== '0px') add('margin', mar, px4('margin'))

    const bw = g('border-top-width')
    if (bw && parseFloat(bw) > 0)
      add('border', `${bw} ${g('border-top-style')} ${swatch(g('border-top-color'))}`, px4('border', '-width'))
    const br = sides([
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ])
    if (br && br !== '0px')
      add('radius', br, [
        'border-radius',
        'border-top-left-radius',
        'border-top-right-radius',
        'border-bottom-right-radius',
        'border-bottom-left-radius',
      ])

    // typography (only when the element renders its own text) — inherited props
    if (this.context(el).hasText) {
      add('font-size', g('font-size'), ['font-size'], true)
      add('weight', g('font-weight'), ['font-weight'], true)
      add('line', g('line-height'), ['line-height'], true)
      const ls = g('letter-spacing')
      if (ls && ls !== 'normal') add('tracking', ls, ['letter-spacing'], true)
      add('color', swatch(g('color')), ['color'], true)
      const ta = g('text-align')
      if (ta && ta !== 'start' && ta !== 'left') add('text-align', ta, ['text-align'], true)
    }

    const bg = g('background-color')
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') add('background', swatch(bg), ['background-color'])
    const bgi = g('background-image')
    if (bgi && bgi !== 'none') add('bg-image', clip(bgi, 26), ['background-image'])

    const sh = g('box-shadow')
    if (sh && sh !== 'none') add('shadow', clip(sh, 26), ['box-shadow'])
    const op = g('opacity')
    if (op && parseFloat(op) < 1) add('opacity', op, ['opacity'])
    const ov = g('overflow')
    if (ov && ov !== 'visible') add('overflow', ov, ['overflow', 'overflow-x', 'overflow-y'])
    const z = g('z-index')
    if (z && z !== 'auto') add('z-index', z, ['z-index'])
    const tr = g('transform')
    if (tr && tr !== 'none') add('transform', clip(tr, 22), ['transform'])

    return rows
      .map((r) => `<div class="uiv-rrow"><span class="uiv-rk">${r.k}</span><span class="uiv-rv">${r.v}</span></div>`)
      .join('')
  }

  /** Floating read-only "all styles" block, docked at the bottom-right corner so it
   *  doesn't take space in the panel. Shown only while an element is selected. */
  private renderInfo(): void {
    const info = this.q('.uiv-info')
    if (!this.enabled || !this.selected) {
      info.classList.remove('show')
      info.innerHTML = ''
      return
    }
    info.innerHTML =
      `<div class="uiv-info-h">all styles <span class="uiv-info-sub">computed</span></div>` +
      `<div class="uiv-readout">${this.styleRows()}</div>`
    info.classList.add('show')
  }

  /** Display label for a breakpoint name — the unprefixed "base" scope reads "all"
   *  (applies to every size by default); internal key stays "base". */
  private bpLabel(name: string): string {
    return name === 'base' ? 'all' : name
  }

  /** A device icon for a breakpoint chip, by its threshold (size proxy). */
  private bpIcon(name: string): string {
    if (name === 'live') return ICONS.live
    if (name === 'base') return ICONS.all
    const px = this.bpSystem().breakpoints.find((b) => b.name === name)?.minWidth ?? 0
    if (px < 768) return ICONS.phone
    if (px < 1024) return ICONS.tablet
    return ICONS.desktop
  }

  /** Breakpoint chips with icons. Order: "all" (base, the default) → Live → each
   *  project breakpoint. Reused by the panel (Live) and the over-frame bar. */
  private breakpointChipsHtml(): string {
    const sys = this.bpSystem()
    const frameBp = this.responsive ? activeBreakpoint(this.frameWidth, sys).name : null
    const winBp = currentBreakpoint(sys).name
    const isActive = (n: string) => (this.responsive ? n === frameBp : n === winBp)
    const chip = (n: string, on: boolean, title: string) =>
      `<button class="uiv-chip${on ? ' on' : ''}" data-bp="${n}" title="${escapeAttr(title)}">${this.bpIcon(n)}<span>${this.bpLabel(n)}</span></button>`
    const all = chip('base', isActive('base'), 'No breakpoint — applies to every size by default')
    const rest = sys.breakpoints
      .map((b) => chip(b.name, isActive(b.name), sys.dir === 'min' ? `≥ ${b.minWidth}px` : `≤ ${b.minWidth}px`))
      .join('')
    return all + rest
  }

  /** Panel breakpoint bar — shown only in Live mode (in responsive mode the bar
   *  lives over the virtual screen instead). */
  private breakpointBarHtml(): string {
    if (this.responsive) return ''
    const sys = this.bpSystem()
    const winBp = currentBreakpoint(sys).name
    const liveW = typeof window !== 'undefined' ? window.innerWidth : 0
    const detected = sys.name === 'detected' ? '' : ' (defaults)'
    const cascade =
      sys.dir === 'min'
        ? `Mobile-first: an edit applies to this breakpoint and <b>wider</b>.`
        : `Desktop-first: an edit applies to this breakpoint and <b>narrower</b>.`
    const hint = `Live — window <b>${liveW}px</b> = <b>${this.bpLabel(winBp)}</b>. ${cascade} Click a size to shrink the screen.`
    return `<div class="uiv-sec"><div class="uiv-sectitle">Screen / breakpoint${detected}</div><div class="uiv-chips">${this.breakpointChipsHtml()}</div><div class="uiv-bphint">${hint}</div></div>`
  }

  /** Populate the bar over the virtual screen (responsive mode) with the chips. */
  private renderFrameBar(): void {
    const host = this.root.querySelector('.uiv-framechips')
    if (host) host.innerHTML = this.breakpointChipsHtml()
  }

  /** "Apply changes to": this element, an existing shared class, or a NEW class. */
  private targetHtml(st: ElState): string {
    const target = st.record.target
    const classes = st.record.identity.classList
    const isNew = target.startsWith('new:')
    const newName = isNew ? target.slice(4) : ''
    const n = st.record.identity.instanceCount
    const chip = (val: string, label: string, on: boolean) =>
      `<button class="uiv-clschip${on ? ' on' : ''}" data-target="${escapeAttr(val)}">${escapeHtml(label)}</button>`
    const allChip = n > 1 ? chip('all', `All ${n} like this`, target === 'all') : ''
    const elChip = chip('element', n > 1 ? 'Only this one' : 'This element', target === 'element')
    const classChips = classes.map((c) => chip(c, `.${c}`, target === c)).join('')
    const newInput = `<input class="uiv-newclass${isNew ? ' on' : ''}" placeholder="+ new class" value="${escapeAttr(newName)}" title="Create a new class instead of touching the existing ones">`
    return `<div class="uiv-sec"><div class="uiv-sectitle">Apply changes to</div><div class="uiv-chips">${allChip}${elChip}${classChips}${newInput}</div></div>`
  }

  /** Decide which controls are relevant to the selected element. */
  private context(el: HTMLElement): ElContext {
    const hasText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0,
    )
    let flexGrid = false
    try {
      flexGrid = /flex|grid/.test(getComputedStyle(el).display)
    } catch {
      /* noop */
    }
    return { hasText, flexGrid }
  }

  private relevant(c: Control, ctx: ElContext): boolean {
    const req = (c as { requires?: 'text' | 'flexgrid' }).requires
    if (req === 'text') return ctx.hasText
    if (req === 'flexgrid') return ctx.flexGrid
    return true
  }

  private controlsHtml(ctx: ElContext): string {
    const legend =
      `<div class="uiv-leg"><span class="uiv-lg">file</span>` +
      `<span class="uiv-lg edit">edited</span><span class="uiv-lg inh">inherited</span>` +
      `<span class="uiv-lg auto">auto</span></div>`
    const secs = SECTIONS.map((sec) => {
      const controls = sec.controls.filter((c) => this.relevant(c, ctx))
      if (!controls.length) return ''
      if (this.collapsedSecs.has(sec.title)) return `<div class="uiv-sec">${this.accordionTitle(sec.title)}</div>`
      const rows: string[] = []
      const adds: string[] = []
      for (const c of controls) {
        const css = (c as { css?: string }).css
        // hideWhenAuto: an unset/auto-computed control is offered as "+" instead of
        // showing a misleading browser-computed value.
        if (
          c.kind === 'len' &&
          (c as { hideWhenAuto?: boolean }).hideWhenAuto &&
          css &&
          !this.revealedCtls.has(css) &&
          this.controlState([css]) === 'auto'
        ) {
          adds.push(`<button class="uiv-addctl" data-css="${css}">+ ${escapeHtml(c.label)}</button>`)
        } else {
          rows.push(this.controlRow(c))
        }
      }
      const addRow = adds.length ? `<div class="uiv-adds">${adds.join('')}</div>` : ''
      return `<div class="uiv-sec">${this.accordionTitle(sec.title)}${rows.join('')}${addRow}</div>`
    }).join('')
    return legend + secs
  }

  /** A collapsible section header. Clicking it hides/shows the section's controls. */
  private accordionTitle(title: string): string {
    const collapsed = this.collapsedSecs.has(title)
    return (
      `<button class="uiv-sectitle uiv-acc${collapsed ? ' collapsed' : ''}" data-sec="${escapeAttr(title)}">` +
      `<span class="uiv-chev">${ICONS.chevron}</span>${title}` +
      `</button>`
    )
  }

  private numField(
    cssAttr: string,
    value: string,
    handle: string,
    changed: boolean,
    isSide: boolean,
    placeholder: string,
  ): string {
    return (
      `<div class="uiv-num${changed ? ' changed' : ''}" data-css="${cssAttr}">` +
      `<span class="uiv-scrub${isSide ? ' txt' : ''}" title="Drag to change">${handle}</span>` +
      `<input type="number" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}">` +
      `</div>`
    )
  }

  private fontSizePx(): number {
    const el = this.selected
    if (!el) return 16
    try {
      return parseFloat(getComputedStyle(el).fontSize) || 16
    } catch {
      return 16
    }
  }

  /** Measure the used px height of `line-height: normal` for the element's font. */
  private measureNormalLineHeight(): number | null {
    const el = this.selected
    if (!el) return null
    try {
      const cs = getComputedStyle(el)
      const probe = document.createElement('div')
      probe.textContent = 'Mg'
      probe.style.cssText =
        'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;margin:0;padding:0;border:0;line-height:normal'
      probe.style.fontFamily = cs.fontFamily
      probe.style.fontSize = cs.fontSize
      probe.style.fontWeight = cs.fontWeight
      probe.style.fontStyle = cs.fontStyle
      document.body.appendChild(probe)
      const h = probe.getBoundingClientRect().height
      probe.remove()
      return h || null
    } catch {
      return null
    }
  }

  /** Resolve a dim property's current value to px. */
  private currentPx(css: string): number | null {
    const v = this.liveVal(css).trim()
    if (v === '' || v === 'normal' || v === 'auto') {
      if (css === 'letter-spacing') return 0
      if (css === 'line-height') return this.measureNormalLineHeight()
      return null
    }
    const fs = this.fontSizePx()
    let m: RegExpExecArray | null
    if ((m = /^(-?\d*\.?\d+)px$/.exec(v))) return parseFloat(m[1])
    if ((m = /^(-?\d*\.?\d+)em$/.exec(v))) return parseFloat(m[1]) * fs
    if ((m = /^(-?\d*\.?\d+)rem$/.exec(v))) return parseFloat(m[1]) * 16
    if ((m = /^(-?\d*\.?\d+)%$/.exec(v))) return (parseFloat(m[1]) / 100) * fs
    if ((m = /^(-?\d*\.?\d+)$/.exec(v)) && css === 'line-height') return parseFloat(m[1]) * fs
    return null
  }

  private pxToUnit(px: number, unit: string): number {
    const fs = this.fontSizePx()
    if (unit === 'em' || unit === '') return px / fs
    if (unit === '%') return (px / fs) * 100
    return px // px
  }

  private dimDisplay(c: DimControl): { num: string; unit: string; placeholder: string } {
    const st = this.st()!
    const computed = this.liveVal(c.css)
    const unit = st.dimUnit[c.css] ?? c.defaultUnit
    const px = this.currentPx(c.css)
    if (px == null) return { num: '', unit, placeholder: computed || 'normal' }
    return { num: String(round2(this.pxToUnit(px, unit))), unit, placeholder: computed || '—' }
  }

  private dimField(c: DimControl): string {
    const d = this.dimDisplay(c)
    const changed = this.isChanged([c.css])
    const units = c.units
      .map((u) => `<option value="${u}"${u === d.unit ? ' selected' : ''}>${UNIT_LABELS[u] ?? u}</option>`)
      .join('')
    return (
      `<div class="uiv-ctl${this.controlStateClass([c.css])}">${this.ctlLabel(c.label, [c.css])}<div class="cfield">` +
      `<div class="uiv-num uiv-dim${changed ? ' changed' : ''}" data-css="${c.css}">` +
      `<span class="uiv-scrub" title="Drag to change">${c.icon}</span>` +
      `<input type="number" step="any" value="${escapeAttr(d.num)}" placeholder="${escapeAttr(d.placeholder)}">` +
      `<select class="uiv-unit" title="Unit">${units}</select>` +
      `</div></div><span></span></div>`
    )
  }

  /** A design-token picker row for a property, shown only when the project exposes
   *  tokens for that category. Picking a token applies its value + tags the prompt. */
  private tokenRowHtml(css: string, label: string): string {
    const cat = this.dsCategoryFor(css)
    if (!cat) return ''
    const ds = this.designSystem()
    const list = ds.byCategory[cat]
    if (!list || !list.length) return ''
    const target =
      cat === 'font-size' ? { px: this.currentPx(css) ?? undefined } : { value: this.computedVal(css) }
    const near = nearestToken(ds, cat, target)
    const edited = this.st()?.record.changes.some(
      (c) => c.property === css && c.after.designToken,
    )

    // Colours render as swatch cards (you see the actual colour); other categories
    // use a labelled <select>.
    if (cat === 'color') {
      const swatches = list
        .map((t) => {
          const on = near?.exact && near.token.cssVar === t.cssVar
          return (
            `<button class="uiv-swatch${on ? ' on' : ''}" data-css="${css}" data-var="${escapeAttr(t.cssVar)}" ` +
            `title="${escapeAttr(`${t.name} · ${t.value}`)}" style="background:${escapeAttr(t.value)}"></button>`
          )
        })
        .join('')
      return (
        `<div class="uiv-ctl"><span class="clabel uiv-tlabel">${label}</span>` +
        `<div class="cfield uiv-swatches">${swatches}</div><span></span></div>`
      )
    }

    const head = `<option value="">${near && !near.exact ? `≈ ${escapeHtml(near.token.name)} · pick token` : '— pick token —'}</option>`
    const opts = list
      .map(
        (t) =>
          `<option value="${escapeAttr(t.cssVar)}"${near?.exact && near.token.cssVar === t.cssVar ? ' selected' : ''}>${escapeHtml(`${t.name} · ${t.value}`)}</option>`,
      )
      .join('')
    return (
      `<div class="uiv-ctl"><span class="clabel uiv-tlabel">${label}</span>` +
      `<div class="cfield"><select class="uiv-sel uiv-tokensel${edited ? ' changed' : ''}" data-css="${css}">${head}${opts}</select></div>` +
      `<span></span></div>`
    )
  }

  private controlRow(c: Control): string {
    if (c.kind === 'box') {
      const cssList = c.sides.map((s) => s.css)
      const info = this.numInfo(cssList)
      const changed = this.isChanged(cssList)
      const open = this.expanded.has(c.key)
      let html =
        `<div class="uiv-ctl${this.controlStateClass(cssList)}">` +
        this.ctlLabel(c.label, cssList) +
        `<div class="cfield">${this.numField(cssList.join(','), info.mixed ? '' : info.value, c.icon, changed, false, info.mixed ? 'Mixed' : '—')}</div>` +
        `<button class="uiv-expand${open ? ' on' : ''}" data-key="${c.key}" title="Edit each side individually">${open ? ICONS.collapse : ICONS.expand}</button>` +
        `</div>`
      if (open) {
        html +=
          `<div class="uiv-sides">` +
          c.sides
            .map((s) => {
              const v = this.liveNum(s.css)
              return this.numField(
                s.css,
                v == null ? '' : String(round2(v)),
                s.label,
                this.isChanged([s.css]),
                true,
                '—',
              )
            })
            .join('') +
          `</div>`
      }
      return html
    }

    if (c.kind === 'len') {
      const v = this.liveNum(c.css)
      // A revealed but still-auto control (e.g. an added Width/Height) shows EMPTY
      // with the computed value as a faint placeholder — it isn't a set value.
      const auto = c.hideWhenAuto && this.controlState([c.css]) === 'auto'
      const value = auto || v == null ? '' : String(round2(v))
      const placeholder = auto && v != null ? `${round2(v)} (auto)` : '—'
      return (
        `<div class="uiv-ctl${this.controlStateClass([c.css])}">${this.ctlLabel(c.label, [c.css])}` +
        `<div class="cfield">${this.numField(c.css, value, c.icon, this.isChanged([c.css]), false, placeholder)}</div>` +
        `<span></span></div>` +
        this.tokenRowHtml(c.css, 'Token')
      )
    }

    if (c.kind === 'dim') {
      return this.dimField(c)
    }

    if (c.kind === 'select') {
      const cur = this.selectCurrent(c.css)
      // Show the element's actual current value even if it's not in our preset list.
      const optList = cur && !c.options.includes(cur) ? [cur, ...c.options] : c.options
      const opts = optList
        .map((o) => `<option value="${o}"${o === cur ? ' selected' : ''}>${o}</option>`)
        .join('')
      return (
        `<div class="uiv-ctl${this.controlStateClass([c.css])}">${this.ctlLabel(c.label, [c.css])}` +
        `<div class="cfield"><select class="uiv-sel${this.isChanged([c.css]) ? ' changed' : ''}" data-css="${c.css}">${opts}</select></div>` +
        `<span></span></div>`
      )
    }

    // color
    const val = toHexInput(this.liveVal(c.css))
    return (
      `<div class="uiv-ctl${this.controlStateClass([c.css])}">${this.ctlLabel(c.label, [c.css])}` +
      `<div class="cfield"><input type="color" class="uiv-color${this.isChanged([c.css]) ? ' changed' : ''}" data-css="${c.css}" value="${val}"></div>` +
      `<span></span></div>` +
      this.tokenRowHtml(c.css, 'Token')
    )
  }

  // ---- "All CSS" comprehensive inspector (registry-driven, same engine) ----
  /** Search box + categorised accordions covering EVERY CSS property. Additive —
   *  the curated quick controls above are untouched. */
  private allCssHtml(): string {
    const reg = cssRegistry()
    const q = this.cssSearch.trim().toLowerCase()
    const search =
      `<div class="uiv-sec"><div class="uiv-sectitle">All CSS · ${reg.byProp.size} properties</div>` +
      `<input class="uiv-csssearch" placeholder="Search any CSS property…" value="${escapeAttr(this.cssSearch)}" spellcheck="false"></div>`
    if (q) {
      const hits: CssMeta[] = []
      for (const [prop, m] of reg.byProp) if (prop.includes(q)) hits.push(m)
      hits.sort((a, b) => a.property.localeCompare(b.property))
      const rows = hits.slice(0, 60).map((m) => this.genericRow(m)).join('')
      const more = hits.length > 60 ? `<div class="uiv-bphint">+${hits.length - 60} more — refine the search</div>` : ''
      return (
        search +
        `<div class="uiv-sec"><div class="uiv-sectitle">Results (${hits.length})</div>` +
        (rows || '<div class="uiv-empty">No property matches.</div>') +
        more +
        `</div>`
      )
    }
    const cats = reg.categories
      .map((c) => {
        const open = this.expandedCats.has(c.name)
        const head =
          `<button class="uiv-sectitle uiv-catacc${open ? '' : ' collapsed'}" data-cat="${escapeAttr(c.name)}">` +
          `<span class="uiv-chev">${ICONS.chevron}</span>${c.name} <span class="uiv-catn">${c.props.length}</span></button>`
        const body = open ? c.props.map((p) => this.genericRow(reg.byProp.get(p)!)).join('') : ''
        return `<div class="uiv-sec">${head}${body}</div>`
      })
      .join('')
    return search + cats
  }

  private genericRow(m: CssMeta): string {
    const prop = m.property
    return (
      `<div class="uiv-ctl uiv-gctl${this.controlStateClass([prop])}">` +
      `<span class="clabel uiv-gplabel" title="${escapeAttr(prop)}">${escapeHtml(prop)}</span>` +
      `<div class="cfield">${this.genericField(m)}</div></div>`
    )
  }

  /** Smart input for one property, by its registry type. Commits via the engine. */
  private genericField(m: CssMeta): string {
    const prop = m.property
    const cur = this.liveVal(prop)
    const da = `data-gprop="${escapeAttr(prop)}"`
    if (m.type === 'enum' && m.keywords && m.keywords.length) {
      const c = cur.trim()
      const list = c && !m.keywords.includes(c) ? [c, ...m.keywords] : m.keywords
      const opts = list.map((k) => `<option value="${escapeAttr(k)}"${k === c ? ' selected' : ''}>${escapeHtml(k)}</option>`).join('')
      return `<select class="uiv-gsel" ${da}>${opts}</select>`
    }
    if (m.type === 'color') {
      return (
        `<div class="uiv-gcolorwrap"><input type="color" class="uiv-gcolor" ${da} value="${toHexInput(cur)}">` +
        `<input type="text" class="uiv-gtext uiv-gtextc" ${da} value="${escapeAttr(cur)}" placeholder="—" spellcheck="false"></div>`
      )
    }
    // Shorthands / grid templates: don't pre-fill the COMPUTED value (it's resolved,
    // e.g. "100px 200px" not "1fr 1fr", and would freeze authored CSS as !important).
    // Show empty + the computed as a faint placeholder until you actually type — unless
    // you've already edited it (then show your value).
    const complex = (m.type === 'shorthand' || m.shorthand || /^grid-template/.test(prop)) && !this.isChanged([prop])
    const val = complex ? '' : cur
    const ph = complex && cur ? escapeAttr(cur) : '—'
    const numeric =
      m.type === 'length' || m.type === 'number' || m.type === 'integer' || m.type === 'percentage' || m.type === 'time' || m.type === 'angle'
    if (numeric) {
      return (
        `<div class="uiv-gnum"><span class="uiv-scrub uiv-gscrub" ${da} title="Drag to change">${ICONS.size}</span>` +
        `<input type="text" class="uiv-gtext" ${da} value="${escapeAttr(val)}" placeholder="${ph}" spellcheck="false"></div>`
      )
    }
    return `<input type="text" class="uiv-gtext uiv-gtextonly" ${da} value="${escapeAttr(val)}" placeholder="${ph}" spellcheck="false">`
  }

  /** Bind the "All CSS" search, category toggles and generic inputs. */
  private bindGeneric(): void {
    const root = this.root
    const search = root.querySelector('.uiv-csssearch') as HTMLInputElement | null
    if (search) {
      search.addEventListener('input', () => {
        const pos = search.selectionStart ?? search.value.length
        this.cssSearch = search.value
        this.renderBody()
        const s2 = this.root.querySelector('.uiv-csssearch') as HTMLInputElement | null
        if (s2) {
          s2.focus()
          s2.setSelectionRange(pos, pos) // keep the caret where the user is typing
        }
      })
    }
    root.querySelectorAll('.uiv-catacc').forEach((node) => {
      const btn = node as HTMLElement
      const cat = btn.getAttribute('data-cat')!
      btn.addEventListener('click', () => {
        if (this.expandedCats.has(cat)) this.expandedCats.delete(cat)
        else this.expandedCats.add(cat)
        this.renderBody()
      })
    })
    const commit = (prop: string, value: string) => {
      this.pushHistory()
      this.commitValue([prop], value, true)
    }
    root.querySelectorAll('.uiv-gsel').forEach((node) => {
      const sel = node as HTMLSelectElement
      sel.addEventListener('change', () => commit(sel.getAttribute('data-gprop')!, sel.value))
    })
    root.querySelectorAll('.uiv-gcolor').forEach((node) => {
      const inp = node as HTMLInputElement
      const prop = inp.getAttribute('data-gprop')!
      inp.addEventListener('change', () => {
        // The picker shows #000000 for transparent/currentcolor/gradient values; a
        // no-op close must not paint black. Only commit a genuine change. (For those
        // values, use the text field — it commits any raw value.)
        if (inp.value.toLowerCase() === toHexInput(this.liveVal(prop)).toLowerCase()) return
        commit(prop, inp.value)
      })
    })
    root.querySelectorAll('.uiv-gtext').forEach((node) => {
      const inp = node as HTMLInputElement
      inp.addEventListener('change', () => commit(inp.getAttribute('data-gprop')!, inp.value))
      inp.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') inp.blur()
      })
    })
    root.querySelectorAll('.uiv-gscrub').forEach((node) => {
      const handle = node as HTMLElement
      const prop = handle.getAttribute('data-gprop')!
      const input = handle.parentElement!.querySelector('input') as HTMLInputElement
      this.bindGenericScrub(handle, input, prop)
    })
  }

  /** Default unit for a numeric property when the current value carries none —
   *  from the registry type, so a unitless number never gets a bogus "px". */
  private defaultUnit(prop: string): string {
    const t = cssMeta(prop)?.type
    if (t === 'number' || t === 'integer') return ''
    if (t === 'time') return 's'
    if (t === 'angle') return 'deg'
    if (t === 'percentage') return '%'
    return 'px' // length & fallback
  }

  private bindGenericScrub(handle: HTMLElement, input: HTMLInputElement, prop: string): void {
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const m = /^(-?\d*\.?\d+)(\D*)$/.exec(input.value.trim())
      const start = m ? parseFloat(m[1]) : 0
      // Keep the value's own unit; only fall back to the registry default when there
      // is none (so a unitless 0.5 stays unitless, not "1.5px").
      const unit = m && m[2] ? m[2] : this.defaultUnit(prop)
      const unitless = unit === ''
      const step = unitless ? (cssMeta(prop)?.type === 'integer' ? 1 : 0.01) : 1
      let pushed = false
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      const move = (ev: PointerEvent) => {
        if (!pushed) {
          this.pushHistory()
          pushed = true
        }
        let nv = start + Math.round(ev.clientX - startX) * step
        if (ev.shiftKey) nv = Math.round(nv / (10 * step)) * 10 * step
        nv = +nv.toFixed(unitless && step < 1 ? 2 : 0)
        input.value = `${nv}${unit}`
        this.liveSet([prop], input.value)
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        this.recordProps([prop])
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
  }

  private bindControls(): void {
    const root = this.root
    this.bindGeneric()
    root.querySelectorAll('.uiv-num:not(.uiv-dim)').forEach((node) => {
      const box = node as HTMLElement
      const cssList = (box.getAttribute('data-css') || '').split(',').filter(Boolean)
      const input = box.querySelector('input') as HTMLInputElement
      const handle = box.querySelector('.uiv-scrub') as HTMLElement
      input.addEventListener('change', () => {
        this.pushHistory()
        this.commitNumeric(cssList, input.value)
      })
      input.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') input.blur()
      })
      if (handle) this.bindScrub(handle, input, cssList)
    })
    root.querySelectorAll('.uiv-dim').forEach((node) => {
      const box = node as HTMLElement
      const css = box.getAttribute('data-css')!
      const input = box.querySelector('input') as HTMLInputElement
      const unitSel = box.querySelector('.uiv-unit') as HTMLSelectElement
      const handle = box.querySelector('.uiv-scrub') as HTMLElement
      input.addEventListener('change', () => {
        this.pushHistory()
        this.onDimInput(css, box)
      })
      input.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') input.blur()
      })
      unitSel.addEventListener('change', () => this.onUnitChange(css, box))
      if (handle) this.bindDimScrub(handle, input, unitSel, css, box)
    })
    root.querySelectorAll('.uiv-color').forEach((node) => {
      const input = node as HTMLInputElement
      const css = input.getAttribute('data-css')!
      input.addEventListener('change', () => {
        // Skip a no-op (picker shows #000000 for transparent/keyword colours).
        if (input.value.toLowerCase() === toHexInput(this.liveVal(css)).toLowerCase()) return
        this.pushHistory()
        this.commitValue([css], input.value)
      })
    })
    root.querySelectorAll('.uiv-sel:not(.uiv-tokensel)').forEach((node) => {
      const sel = node as HTMLSelectElement
      const css = sel.getAttribute('data-css')!
      sel.addEventListener('change', () => {
        this.pushHistory()
        this.commitValue([css], sel.value)
      })
    })
    root.querySelectorAll('.uiv-tokensel').forEach((node) => {
      const sel = node as HTMLSelectElement
      const css = sel.getAttribute('data-css')!
      sel.addEventListener('change', () => {
        if (!sel.value) return
        const token = this.designSystem().tokens.find((t) => t.cssVar === sel.value)
        if (token) this.applyToken(css, token)
      })
    })
    root.querySelectorAll('.uiv-swatch').forEach((node) => {
      const btn = node as HTMLElement
      const css = btn.getAttribute('data-css')!
      const cssVar = btn.getAttribute('data-var')!
      btn.addEventListener('click', () => {
        const token = this.designSystem().tokens.find((t) => t.cssVar === cssVar)
        if (token) this.applyToken(css, token)
      })
    })
    root.querySelectorAll('.uiv-expand').forEach((node) => {
      const btn = node as HTMLElement
      const key = btn.getAttribute('data-key')!
      btn.addEventListener('click', () => {
        if (this.expanded.has(key)) this.expanded.delete(key)
        else this.expanded.add(key)
        this.renderBody()
      })
    })
    root.querySelectorAll('.uiv-acc').forEach((node) => {
      const btn = node as HTMLElement
      const sec = btn.getAttribute('data-sec')!
      btn.addEventListener('click', () => {
        if (this.collapsedSecs.has(sec)) this.collapsedSecs.delete(sec)
        else this.collapsedSecs.add(sec)
        this.renderBody()
      })
    })
    root.querySelectorAll('.uiv-addctl').forEach((node) => {
      const btn = node as HTMLElement
      const css = btn.getAttribute('data-css')!
      btn.addEventListener('click', () => {
        this.revealedCtls.add(css) // reveal the hidden control so you can set it
        this.renderBody()
      })
    })
    root.querySelectorAll('.uiv-chip').forEach((node) => {
      const btn = node as HTMLElement
      const bp = btn.getAttribute('data-bp')!
      btn.addEventListener('click', () => {
        // Always in the virtual screen — a chip just resizes it (no reload, so the
        // selection is kept). Edits already at other breakpoints keep their tags.
        const w =
          bp === 'base'
            ? this.baseFrameWidth()
            : (this.bpSystem().breakpoints.find((b) => b.name === bp)?.minWidth ?? 768)
        this.setFrameWidth(w)
        this.reapplyScope() // project edits onto the newly active breakpoint
        this.renderBody()
      })
    })
    root.querySelectorAll('.uiv-clschip').forEach((node) => {
      const btn = node as HTMLElement
      const target = btn.getAttribute('data-target')!
      btn.addEventListener('click', () => {
        const st = this.st()
        if (st && st.record.target !== target) this.pushHistory()
        if (st) st.record.target = target
        this.reapplyForTarget()
        this.renderBody()
      })
    })
    root.querySelectorAll('.uiv-newclass').forEach((node) => {
      const input = node as HTMLInputElement
      input.addEventListener('change', () => {
        const st = this.st()
        if (!st) return
        const name = input.value.trim().replace(/^\./, '').replace(/\s+/g, '-')
        const next = name ? `new:${name}` : 'element'
        if (st.record.target !== next) this.pushHistory()
        st.record.target = next
        this.renderBody()
      })
      input.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') input.blur()
      })
    })
  }

  private bindScrub(handle: HTMLElement, input: HTMLInputElement, cssList: string[]): void {
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const start = parseFloat(input.value) || 0
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      let pushed = false
      const move = (ev: PointerEvent) => {
        if (!pushed) {
          this.pushHistory() // one undo step per drag
          pushed = true
        }
        const dx = ev.clientX - startX
        let nv = start + Math.round(dx)
        if (ev.shiftKey) nv = Math.round(nv / 10) * 10
        input.value = String(nv)
        this.liveSet(cssList, `${nv}px`)
      }
      const up = () => {
        try {
          handle.releasePointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        this.recordProps(cssList)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
  }

  private bindDimScrub(
    handle: HTMLElement,
    input: HTMLInputElement,
    unitSel: HTMLSelectElement,
    css: string,
    box: HTMLElement,
  ): void {
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const start = parseFloat(input.value) || 0
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      const stepFor = (u: string) => (u === '' ? 0.1 : u === 'em' ? 0.01 : 1)
      let pushed = false
      const move = (ev: PointerEvent) => {
        if (!pushed) {
          this.pushHistory() // one undo step per drag
          pushed = true
        }
        const u = unitSel.value
        const step = stepFor(u) * (ev.shiftKey ? 10 : 1)
        const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0
        const nv = +(start + (ev.clientX - startX) * step).toFixed(dec)
        input.value = String(nv)
        this.liveSet([css], u === '' ? String(nv) : `${nv}${u}`)
      }
      const up = () => {
        try {
          handle.releasePointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        this.onDimInput(css, box)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
  }

  private journalHtml(): string {
    const records = [...this.states.values()].map((s) => s.record).filter((r) => r.changes.length > 0)
    if (!records.length) return ''
    const count = records.reduce((n, r) => n + collapseChanges(r.changes).length, 0)
    const items = records.map((r) => this.journalItem(r)).join('')
    return `<div class="uiv-sec"><div class="uiv-sectitle">Recorded (${count})</div><div class="uiv-journal">${items}</div></div>`
  }

  private journalItem(r: EditRecord): string {
    const id = r.identity
    const loc =
      id.source.confidence !== 'none'
        ? `${id.source.file}:${id.source.line}`
        : id.componentName || ''
    const chgs = collapseChanges(r.changes)
      .map((c) => {
        const bp = c.breakpoint === 'base' ? '' : `<span class="bp">${c.breakpoint}:</span> `
        // Prefer the utility class; else show the design-token variable; else nothing.
        const tokLabel = c.after.token || (c.after.designToken ? `var(${c.after.designToken})` : '')
        const tok = tokLabel ? ` <span class="tok">${escapeHtml(tokLabel)}</span>` : ''
        return `<div class="uiv-jchg">${bp}${c.property}: ${c.before.computed} → ${c.after.computed}${tok}</div>`
      })
      .join('')
    return `<div class="uiv-jitem"><div class="jhead"><span class="jel">&lt;${id.tagName}&gt;</span><span class="jloc">${escapeHtml(loc)}</span></div>${chgs}</div>`
  }

  // ---- actions ----
  private records(): EditRecord[] {
    return [...this.states.entries()]
      .filter(([, s]) => s.record.changes.length > 0)
      .map(([el, s]) => ({ ...s.record, smells: this.detectSmells(el) }))
  }

  /**
   * Detect dead / redundant / contradictory CSS on an element so the prompt can ask
   * the agent to QUESTION it instead of blindly applying — e.g. flex-direction on a
   * non-flex element, offsets without positioning, a display:none node that may be
   * deletable. Only flags properties the project actually AUTHORED (matchedProps).
   */
  private detectSmells(el: HTMLElement): string[] {
    const out: string[] = []
    try {
      const cs = getComputedStyle(el)
      const authored = this.matchedProps(el)
      const disp = cs.display
      const flexGrid = /flex|grid/.test(disp)
      const parent = el.parentElement
      const parentFlexGrid = parent ? /flex|grid/.test(getComputedStyle(parent).display) : false
      const has = (p: string) => authored.has(p)

      if (disp === 'none')
        out.push(
          `It computes to \`display:none\` — it renders nothing here. If it isn't toggled visible elsewhere, prefer DELETING the element and its now-dead styles/classes over shipping a permanently hidden node.`,
        )
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0)
        out.push(`It's invisible (visibility/opacity 0) — question whether it's needed at all.`)

      if (!flexGrid)
        for (const p of ['flex-direction', 'justify-content', 'align-items', 'flex-wrap'])
          if (has(p))
            out.push(`\`${p}\` is set but \`display\` is \`${disp}\` (not flex/grid) → it has NO effect. Remove it, or the display is wrong — ask which.`)

      if (!parentFlexGrid)
        for (const p of ['flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order'])
          if (has(p))
            out.push(`\`${p}\` is set but the PARENT isn't flex/grid → no effect. Remove it or fix the parent.`)

      if (cs.position === 'static')
        for (const p of ['top', 'right', 'bottom', 'left', 'z-index'])
          if (has(p))
            out.push(`\`${p}\` is set but \`position\` is \`static\` → no effect. Add positioning or drop it.`)

      if (disp === 'inline')
        for (const p of ['width', 'height'])
          if (has(p)) out.push(`\`${p}\` on an \`inline\` element has no effect (needs inline-block/block).`)
    } catch {
      /* noop */
    }
    return [...new Set(out)].slice(0, 6)
  }

  private async copyPrompt(): Promise<void> {
    const recs = this.records()
    if (!recs.length) return this.showToast('No tweaks recorded yet')
    await this.copy(renderPrompt(recs))
    this.showToast('Prompt copied ✓')
  }

  private async copyJSON(): Promise<void> {
    const recs = this.records()
    if (!recs.length) return this.showToast('No tweaks recorded yet')
    const spec = renderSpec(recs, {
      url: location.href,
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
      now: new Date().toISOString(),
    })
    await this.copy(JSON.stringify(spec, null, 2))
    this.showToast('JSON copied ✓')
  }

  private resetSelected(): void {
    const el = this.selected
    if (!el) return
    const st = this.states.get(el)
    if (!st) return
    if (st.record.changes.length) this.pushHistory()
    const sibs = this.siblingsOf(el)
    for (const css of st.applied) for (const e of sibs) removeOverride(e, css)
    st.applied.clear()
    st.record.changes = []
    this.reposition()
    this.renderBody()
  }

  private clearAll(): void {
    if (this.states.size) this.pushHistory()
    for (const [el, st] of this.states) {
      const sibs = this.siblingsOf(el)
      for (const css of st.applied) for (const e of sibs) removeOverride(e, css)
    }
    this.states.clear()
    this.selected = null
    this.reposition()
    this.renderBody()
  }

  // ---- undo / redo ----
  /** Deep snapshot of all edit state (element refs kept; data JSON-cloned). */
  private cloneSnap(): HistorySnap {
    const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
    return {
      selected: this.selected,
      entries: [...this.states.entries()].map(([el, st]) => ({
        el,
        record: clone(st.record),
        original: { ...st.original },
        dimUnit: { ...st.dimUnit },
      })),
    }
  }

  /** Record the current state so the next mutation can be undone. */
  private pushHistory(): void {
    this.undoStack.push(this.cloneSnap())
    if (this.undoStack.length > 100) this.undoStack.shift()
    this.redoStack = []
  }

  /** Rebuild all edit state from a snapshot and re-apply its live overrides. */
  private applySnap(snap: HistorySnap): void {
    const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
    // strip every override we currently have applied (siblings included)
    for (const [el, st] of this.states) {
      const sibs = this.siblingsOf(el)
      for (const css of st.applied) for (const e of sibs) removeOverride(e, css)
    }
    this.states = new Map()
    for (const ent of snap.entries) {
      const st: ElState = { record: clone(ent.record), original: { ...ent.original }, applied: new Set(), dimUnit: { ...ent.dimUnit } }
      this.states.set(ent.el, st)
    }
    this.selected = snap.selected && this.states.has(snap.selected) ? snap.selected : null
    // Project live overrides for the active breakpoint only (per-breakpoint correct).
    this.reapplyScope()
    this.reposition()
    this.renderBody()
  }

  private undo(): void {
    if (!this.undoStack.length) return this.showToast('Nothing to undo')
    this.redoStack.push(this.cloneSnap())
    this.applySnap(this.undoStack.pop()!)
    this.showToast('Undo ↩')
  }

  private redo(): void {
    if (!this.redoStack.length) return this.showToast('Nothing to redo')
    this.undoStack.push(this.cloneSnap())
    this.applySnap(this.redoStack.pop()!)
    this.showToast('Redo ↪')
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      this.root.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
  }

  private updateBp(): void {
    if (this.responsive) {
      const bp = activeBreakpoint(this.frameWidth, this.bpSystem()).name
      this.bpBadge.textContent = `${bp} · ${this.frameWidth}px`
    } else {
      const bp = currentBreakpoint(this.bpSystem())
      this.bpBadge.textContent = `${bp.name} · ${window.innerWidth}px`
    }
  }

  private showToast(msg: string): void {
    this.toast.textContent = msg
    this.toast.classList.add('show')
    window.setTimeout(() => this.toast.classList.remove('show'), 1600)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
function cssAttrEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&')
}

let instance: Uivisor | null = null

export function start(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // Don't mount inside uivisor's own responsive iframe — the parent drives it.
  try {
    if (window.frameElement?.getAttribute('data-uiv-frame')) return
  } catch {
    /* cross-origin frameElement access — ignore */
  }
  if (instance || document.getElementById('uivisor-root')) return
  instance = new Uivisor()
  const boot = () => instance!.mount()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
}

// Auto-start when imported (the Vite plugin injects this only in dev).
start()
