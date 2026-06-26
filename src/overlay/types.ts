/** How an element is styled — drives which file/mechanism the agent should edit. */
export type Mechanism =
  | 'tailwind'
  | 'css-modules'
  | 'styled-components'
  | 'inline'
  | 'plain-css'
  | 'unknown'

export interface SourceLocation {
  file: string
  line: number
  column: number
}

export type SourceInfo =
  | (SourceLocation & { confidence: 'build-attr' | 'fiber' })
  | { confidence: 'none' }

/** Everything we know about *which* element was tweaked, so the agent can find it cold. */
export interface ElementIdentity {
  componentName: string | null
  source: SourceInfo
  selector: string
  dataTestId: string | null
  id: string | null
  tagName: string
  role: string | null
  textSnippet: string
  classList: string[]
  /** How many elements on the page share this element's JSX origin (repeated instances). */
  instanceCount: number
}

export interface StylingInfo {
  primaryMechanism: Mechanism
  evidence: string[]
  /** Class names on the element that likely carry the styles being changed. */
  sourceClassNames: string[]
}

export interface ValueInfo {
  /** Normalised value as reported by getComputedStyle, e.g. "16px" or "rgb(31, 41, 55)". */
  computed: string
  /** Best-effort utility/token suggestion, e.g. "pt-6" or "text-[#1f2937]". */
  token?: string | null
  /** Project design-system custom property this value maps to, e.g. "--fs-headline-l". */
  designToken?: string | null
}

export interface ChangeEntry {
  /** CSS longhand property, e.g. "padding-top". */
  property: string
  before: ValueInfo
  after: ValueInfo
  /** Active breakpoint name when the change was made, e.g. "lg" or "base". */
  breakpoint: string
  /** min-width px of that breakpoint (0 for base). */
  breakpointPx: number
  /** Pseudo-state context if any, e.g. ":hover" — reserved, null for MVP. */
  state: string | null
  /** Exact inline value to apply for the live preview when it differs from
   *  `after.computed` — e.g. "var(--text-headline)" for a design token (so a
   *  responsive token keeps adapting), while `after.computed` shows its value. */
  live?: string
}

export interface EditRecord {
  id: string
  identity: ElementIdentity
  styling: StylingInfo
  changes: ChangeEntry[]
  /** Edit target: 'element' (this node) or a class name (apply to all .class). */
  target: string
  /** Markup/CSS smells detected on this element (dead/redundant/contradictory code)
   *  for the agent to question instead of blindly applying. Filled at copy time. */
  smells?: string[]
}

export interface BreakpointSystem {
  name: string
  /** Cascade direction: 'min' = mobile-first (min-width, value applies to this
   *  breakpoint and WIDER); 'max' = desktop-first (max-width, applies NARROWER). */
  dir: 'min' | 'max'
  /** Ordered ascending list of named breakpoints (excluding base). `minWidth` is
   *  the threshold px — a min-width for dir:'min', a max-width for dir:'max'. */
  breakpoints: { name: string; minWidth: number }[]
}
