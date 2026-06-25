import {
  type ActiveBreakpoint,
  activeBreakpoint,
  currentBreakpoint,
  detectBreakpoints,
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

class Uivisor {
  private host!: HTMLDivElement
  private root!: ShadowRoot
  private enabled = false
  private selected: HTMLElement | null = null
  private states = new Map<HTMLElement, ElState>()
  private expanded = new Set<string>()
  /** Section titles collapsed in the accordion (per session). */
  private collapsedSecs = new Set<string>()
  /** Undo / redo stacks of full edit-state snapshots. */
  private undoStack: HistorySnap[] = []
  private redoStack: HistorySnap[] = []
  /** Cached live computed-style for the selected element (invalidated on reselect). */
  private _cs: CSSStyleDeclaration | null = null
  private _csEl: HTMLElement | null = null
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
        <div class="uiv-framebar"><span class="uiv-framew">768px</span><span class="uiv-framex" title="Exit responsive">✕ exit</span></div>
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
    this.q('.uiv-framex').addEventListener('click', () => this.toggleResponsive(false))
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
      if (this.responsive) this.toggleResponsive(false)
    } else {
      this.scheduleBpRefresh()
    }
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
    this.q('.uiv-framew').textContent = `${this.frameWidth}px · ${bp}`
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
        // The frame's breakpoint changed → refresh chips/hint. Existing edits keep
        // their own breakpoint tags; only NEW edits scope to the current width.
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
      if (this.enabled && this.selected) this.renderBody()
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
        original: snapshot(el, ALL_CSS),
        applied: new Set(),
        dimUnit: {},
      })
    }
    this.reposition()
    this.renderBody()
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
    // User override wins; otherwise the element's *current* computed value so the
    // controls track the active breakpoint (snapshot is only a last-resort fallback).
    return el.style.getPropertyValue(css) || this.computedVal(css) || st.original[css] || ''
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
    return cssList.some((c) => st.record.changes.some((ch) => ch.property === c))
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
    const el = this.selected
    const st = this.st()
    if (!el || !st) return
    const sibs = this.siblingsOf(el)
    const targets = this.targetEls()
    const props = new Set(st.record.changes.map((c) => c.property))
    for (const css of props) {
      for (const e of sibs) removeOverride(e, css)
      const c = st.record.changes.find((ch) => ch.property === css)
      if (c) for (const e of targets) applyOverride(e, css, c.after.computed)
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

  /** Apply a design-system token to a property: set its resolved value live and
   *  annotate the recorded change so the prompt asks the agent for the token. */
  private applyToken(css: string, token: DesignToken): void {
    this.pushHistory()
    this.liveSet([css], token.value)
    this.recordProps([css]) // builds + records the change (renders once)
    const st = this.st()
    if (!st) return
    const scope = this.activeScope()
    const ch = st.record.changes.find((c) => c.property === css && c.breakpoint === scope.name)
    if (ch) {
      ch.after.designToken = token.cssVar
      // Prefer a real Tailwind utility when the project exposes one; else var() form.
      ch.after.token =
        st.record.styling.primaryMechanism === 'tailwind' ? this.dsUtility(css, token) : null
    }
    this.renderBody()
  }

  private revertProps(cssList: string[]): void {
    const el = this.selected
    const st = this.st()
    if (!el || !st) return
    const sibs = this.siblingsOf(el)
    for (const css of cssList) {
      for (const e of sibs) removeOverride(e, css)
      st.applied.delete(css)
      st.record.changes = st.record.changes.filter((c) => c.property !== css)
    }
    this.reposition()
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
    const body = this.q('.uiv-body')
    if (!this.selected) {
      body.innerHTML = `
        ${this.breakpointBarHtml()}
        <div class="uiv-empty">Click any element ${this.responsive ? 'in the frame' : 'on the page'} to select it.</div>
        <div class="uiv-hint">Alt+U toggles · Esc deselects · ⌘/Ctrl+Z undo, ⇧ to redo. Tweaks stay in the browser — nothing is written to your code.</div>
        ${this.journalHtml()}
      `
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
      ${this.currentStylesHtml()}
      ${this.breakpointBarHtml()}
      ${this.targetHtml(st)}
      ${this.controlsHtml(this.context(this.selected))}
      ${this.journalHtml()}
    `
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

  /** Read-only readout of the element's actual current styles — so you don't guess. */
  private currentStylesHtml(): string {
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
    const box = (prefix: string) => {
      const t = g(`${prefix}-top`)
      const r = g(`${prefix}-right`)
      const b = g(`${prefix}-bottom`)
      const l = g(`${prefix}-left`)
      if (t === r && r === b && b === l) return t
      if (t === b && r === l) return `${t} ${r}`
      return `${t} ${r} ${b} ${l}`
    }
    // A readout row is "edited" (→ green) if any backing property was changed in uivisor.
    const changedSet = new Set(this.st()?.record.changes.map((c) => c.property) ?? [])
    const changed = (props: string[]) => props.some((p) => changedSet.has(p))
    const px4 = (pre: string) => [`${pre}-top`, `${pre}-right`, `${pre}-bottom`, `${pre}-left`]

    const rows: { k: string; v: string; edited: boolean }[] = []
    const add = (k: string, v: string, props: string[] = []) => {
      if (v) rows.push({ k, v, edited: changed(props) })
    }
    add('display', g('display'))
    add('size', `${Math.round(parseFloat(g('width')) || 0)} × ${Math.round(parseFloat(g('height')) || 0)}`)
    const pad = box('padding')
    if (pad && pad !== '0px') add('padding', pad, px4('padding'))
    const mar = box('margin')
    if (mar && mar !== '0px') add('margin', mar, px4('margin'))
    if (/flex|grid/.test(g('display'))) {
      const gap = g('gap')
      if (gap && gap !== 'normal' && gap !== '0px') add('gap', gap, ['gap'])
    }
    add('font', `${g('font-size')} · ${g('font-weight')} · lh ${g('line-height')}`, [
      'font-size',
      'font-weight',
      'line-height',
    ])
    const ls = g('letter-spacing')
    if (ls && ls !== 'normal') add('tracking', ls, ['letter-spacing'])
    add('color', swatch(g('color')), ['color'])
    const bg = g('background-color')
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')
      add('background', swatch(bg), ['background-color'])
    const bw = g('border-top-width')
    if (bw && parseFloat(bw) > 0)
      add('border', `${bw} ${g('border-top-style')} ${hex(g('border-top-color'))}`, px4('border').map((p) => `${p}-width`))
    const br = g('border-radius')
    if (br && br !== '0px')
      add('radius', br, [
        'border-radius',
        'border-top-left-radius',
        'border-top-right-radius',
        'border-bottom-right-radius',
        'border-bottom-left-radius',
      ])
    if (g('box-shadow') !== 'none' && g('box-shadow')) add('shadow', 'yes')
    const op = g('opacity')
    if (op && parseFloat(op) < 1) add('opacity', op)

    const collapsed = this.collapsedSecs.has('Current styles')
    const items = collapsed
      ? ''
      : rows
          .map((r) => `<div class="uiv-rrow"><span class="uiv-rk">${r.k}</span><span class="uiv-rv${r.edited ? ' changed' : ''}">${r.v}</span></div>`)
          .join('')
    return `<div class="uiv-sec">${this.accordionTitle('Current styles')}<div class="uiv-readout">${items}</div></div>`
  }

  /** Breakpoint scope switcher: shows the PROJECT's breakpoints + the live window one. */
  private breakpointBarHtml(): string {
    const sys = this.bpSystem()
    const bps = sys.breakpoints
    const names = ['base', ...bps.map((b) => b.name)]
    // Active breakpoint: the frame's in responsive mode, else the real window's range.
    const frameBp = this.responsive ? activeBreakpoint(this.frameWidth, sys).name : null
    const winBp = currentBreakpoint(sys).name
    const liveW = typeof window !== 'undefined' ? window.innerWidth : 0
    const liveChip = `<button class="uiv-chip${!this.responsive ? ' on' : ''}" data-bp="live" title="Follow your real browser window">Live</button>`
    const chips = names
      .map((n) => {
        const active = this.responsive ? n === frameBp : n === winBp // Live → highlight the window's range
        const px = n === 'base' ? 0 : bps.find((b) => b.name === n)!.minWidth
        return `<button class="uiv-chip${active ? ' on' : ''}" data-bp="${n}" title="Preview at ≥${px}px">${n}</button>`
      })
      .join('')
    const detected = sys.name === 'detected' ? '' : ' (defaults)'
    const hint = this.responsive
      ? `Virtual screen at <b>${this.frameWidth}px</b> (${frameBp}). Edits scoped to <b>${frameBp}:</b>. Drag the frame edge to fine-tune.`
      : `Live — your window is <b>${liveW}px</b> = <b>${winBp}</b> range, edits scoped to <b>${winBp}:</b>. Click another size to shrink the screen to it.`
    return `<div class="uiv-sec"><div class="uiv-sectitle">Screen / breakpoint${detected}</div><div class="uiv-chips">${liveChip}${chips}</div><div class="uiv-bphint">${hint}</div></div>`
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
    return SECTIONS.map((sec) => {
      const controls = sec.controls.filter((c) => this.relevant(c, ctx))
      if (!controls.length) return ''
      const rows = this.collapsedSecs.has(sec.title)
        ? ''
        : controls.map((c) => this.controlRow(c)).join('')
      return `<div class="uiv-sec">${this.accordionTitle(sec.title)}${rows}</div>`
    }).join('')
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
      `<div class="uiv-ctl"><span class="clabel">${c.label}</span><div class="cfield">` +
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
        `<div class="uiv-ctl">` +
        `<span class="clabel">${c.label}</span>` +
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
      return (
        `<div class="uiv-ctl"><span class="clabel">${c.label}</span>` +
        `<div class="cfield">${this.numField(c.css, v == null ? '' : String(round2(v)), c.icon, this.isChanged([c.css]), false, '—')}</div>` +
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
        `<div class="uiv-ctl"><span class="clabel">${c.label}</span>` +
        `<div class="cfield"><select class="uiv-sel${this.isChanged([c.css]) ? ' changed' : ''}" data-css="${c.css}">${opts}</select></div>` +
        `<span></span></div>`
      )
    }

    // color
    const val = toHexInput(this.liveVal(c.css))
    return (
      `<div class="uiv-ctl"><span class="clabel">${c.label}</span>` +
      `<div class="cfield"><input type="color" class="uiv-color${this.isChanged([c.css]) ? ' changed' : ''}" data-css="${c.css}" value="${val}"></div>` +
      `<span></span></div>` +
      this.tokenRowHtml(c.css, 'Token')
    )
  }

  private bindControls(): void {
    const root = this.root
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
    root.querySelectorAll('.uiv-chip').forEach((node) => {
      const btn = node as HTMLElement
      const bp = btn.getAttribute('data-bp')!
      btn.addEventListener('click', () => {
        if (bp === 'live') {
          // back to the real window (no virtual screen)
          if (this.responsive) this.toggleResponsive(false)
          else this.renderBody()
          return
        }
        // Clicking a breakpoint resizes the virtual screen to it (entering
        // responsive mode if needed). NEW edits scope to this breakpoint; edits
        // already recorded at other breakpoints keep their own tags.
        const w =
          bp === 'base'
            ? 390
            : (this.bpSystem().breakpoints.find((b) => b.name === bp)?.minWidth ?? 768)
        this.frameWidth = w
        if (!this.responsive) {
          this.toggleResponsive(true) // applies frameWidth + renders
        } else {
          this.setFrameWidth(w)
          this.renderBody()
        }
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
        const tok = c.after.token ? ` <span class="tok">${escapeHtml(c.after.token)}</span>` : ''
        return `<div class="uiv-jchg">${bp}${c.property}: ${c.before.computed} → ${c.after.computed}${tok}</div>`
      })
      .join('')
    return `<div class="uiv-jitem"><div class="jhead"><span class="jel">&lt;${id.tagName}&gt;</span><span class="jloc">${escapeHtml(loc)}</span></div>${chgs}</div>`
  }

  // ---- actions ----
  private records(): EditRecord[] {
    return [...this.states.values()].map((s) => s.record).filter((r) => r.changes.length > 0)
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
      const targets = st.record.target === 'all' ? this.siblingsOf(ent.el) : [ent.el]
      for (const c of st.record.changes) {
        for (const e of targets) applyOverride(e, c.property, c.after.computed)
        st.applied.add(c.property)
      }
    }
    this.selected = snap.selected && this.states.has(snap.selected) ? snap.selected : null
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
  return s.replace(/"/g, '&quot;')
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
