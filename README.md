<div align="center">

<img src="./uivisor.jpg" alt="uivisor" width="100%" />

<h3>Point at any element in your running app, tweak it by hand, and copy a precise,<br/>breakpoint-aware prompt for your AI agent — without ever touching your code.</h3>

<p>
  <img alt="dev only" src="https://img.shields.io/badge/dev--only-never%20ships%20to%20prod-22c55e?style=flat-square" />
  <img alt="stack" src="https://img.shields.io/badge/React%20·%20Next.js%20·%20Vite-4f46e5?style=flat-square" />
  <img alt="prompt only" src="https://img.shields.io/badge/prompt--only-no%20code%20mutation-06b6d4?style=flat-square" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-3f3f46?style=flat-square" />
</p>

</div>

---

## The problem

You spot a small UI nit in your running app — this padding's too tight, that heading wants a heavier
weight, those cards need more radius at `lg`. Two bad options:

1. **Dig into the code** yourself for a one-line change, or
2. **Burn agent tokens** describing it in prose — *"on the pricing page, the middle card's button…"* — and hope the agent finds the right element.

**uivisor** is a third option. Turn it on, **click the element, nudge it with your mouse**, and it hands you a
copy-paste instruction that pins the **exact file & line**, the **styling mechanism**, the **breakpoint**, and
**what to change** — so your agent makes the edit in one shot. uivisor itself **never writes to your source**;
your tweaks are throwaway inline overrides in the browser.

## What you get

Click a button, bump its padding and color, hit **Copy prompt for agent**, and you get:

```md
# uivisor — apply these UI tweaks (2 changes across 1 element)

## 1. <button> "Get started" — src/components/PricingCard.tsx:26:7
- Identify by: component <PricingCard>, data-testid="buy-pro", selector `button[data-testid="buy-pro"]`
- Styling: tailwind (current classes: `mt-6 w-full rounded-md px-4 py-2 bg-indigo-600 text-white`)
- At lg breakpoint (≥1024px):
    - padding: 16px → 24px  → `lg:p-6`
    - background-color: rgb(79,70,229) → #16a34a  → `lg:bg-[#16a34a]`

### Rules
- Edit the EXISTING className/styles. Do NOT add inline styles or duplicate the component.
- Scope each change to its breakpoint with a responsive variant (e.g. `lg:`).
- Confirm the element by its source location, text and data-testid before editing.
```

Paste that into Claude Code / Cursor / whatever — done. No more *"page 55, that thing"*.

---

## Quick start

> uivisor runs **only in dev** (`apply: 'serve'` / gated to `next dev`). It is **physically absent from your
> production build.**

It isn't on npm yet, so for a real project link it locally (rebuild + restart picks up changes — no reinstall):

```bash
# in the uivisor folder
npm install && npm run build

# in YOUR project
npm i -D file:/absolute/path/to/uivisor
```

### Vite + React

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import uivisor from 'uivisor/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [uivisor(), react()], //  ⚠️  uivisor() BEFORE react()
})
```

### Next.js (App Router, Next 13–16)

**1. Wrap your config.** Works with `next.config.ts` / `.mjs` (ESM) or `.js` (CJS):

```ts
// next.config.ts
import { withUivisor } from 'uivisor/next'

const nextConfig = { reactStrictMode: true }

export default withUivisor(nextConfig)
```
```js
// next.config.js (CommonJS)
const { withUivisor } = require('uivisor/next')
module.exports = withUivisor({ reactStrictMode: true })
```

**2. Mount the overlay** once in your root layout (works under both bundlers):

```tsx
// app/layout.tsx
import { UivisorOverlay } from 'uivisor/next/overlay'

export default function RootLayout({ children }) {
  return <html><body>{children}<UivisorOverlay /></body></html>
}
```

**3. Run it.** Then press **`Alt`+`U`** (or click **◎**).

| Command | Overlay | Exact `file:line` |
|---|---|---|
| `next dev --webpack` | ✅ | ✅ (recommended) |
| `next dev` (**Turbopack**, default in Next 15/16) | ✅ | ⚠️ off — falls back to component + selector + text |

> **Turbopack ignores `webpack()` config**, so `data-uiv-src` source attributes aren't injected under plain
> `next dev`. uivisor detects this and prints a clear console hint. For exact `file:line`, either run
> `next dev --webpack` (add a `"dev:uivisor": "next dev --webpack"` script), or opt into the **experimental**
> Turbopack loader: `withUivisor(config, { turbopack: true })`. Everything is **dev-only** — nothing reaches
> production builds.

#### Keeping it updated while we iterate

Linked with `file:` → after any change to uivisor, just `npm run build` in the uivisor folder and **restart your
dev server**. No reinstall. (For Next, clear `.next/` if HMR doesn't pick it up.)

---

## Using the panel

1. **`Alt`+`U`** toggles uivisor · **Esc** deselects.
2. **Click any element.** A Figma-like inspector fills with its spacing / border / typography / fill —
   only the controls that are relevant (Typography shows on text elements, Gap on flex/grid containers).
3. **Tweak:**
   - **Combined-by-default** — Padding / Margin / Radius show one "all sides" input; click **▦** to split into
     individual sides/corners.
   - **Drag-to-scrub** — drag the icon on the left of any number field (cursor → ↔) to change it live.
   - **Units** — line-height & letter-spacing have a px / % / em / × selector and always show the current number.
4. **Screen / breakpoint** — click `md` / `lg` / … and the app loads in a **virtual screen at that width**
   (real CSS media queries reflow); drag the frame edge to fine-tune. Only your project's **real breakpoints**
   are shown. Edits are scoped to the chosen breakpoint (`lg:p-6`). `Live` = your real window.
5. **Apply changes to** — pick the edit target:
   - **All N like this** — when the element is a repeated sibling (same component/source, e.g. 3 cards), the
     change previews on *all* of them and the prompt tells the agent to edit the shared component/source.
   - **Only this one** · an existing **`.class`** · or **a new class you name** (agent creates it, leaves the rest).
6. **Copy prompt for agent** (or **Copy JSON** for the machine-readable spec).

Nothing is written to disk — tweaks live in the browser and vanish on reload.

---

## For your AI agent

uivisor's output is a **self-contained instruction**, designed to be acted on without extra context. When you
receive a uivisor prompt:

- **Go to the `file:line:col`** it names — that's the authoritative anchor (injected in dev, React-19 safe).
- **Edit the existing styling mechanism** it identifies (`tailwind` / `css-modules` / `styled-components` /
  `inline` / `plain-css`) — not inline styles, and don't duplicate the component.
- **Respect the breakpoint scope** — emit the responsive variant (`lg:…`), don't make it global.
- **Respect the target** — `All N like this` means edit the shared component/class so every instance updates;
  `new class` means create it and leave existing classes untouched; a positional `nth-of-type` selector is a
  last-resort locator, never the thing to hard-code against.

---

## How it works

- **Source mapping** — a tiny dev-only Babel pass tags host JSX with `data-uiv-src="file:line:col"`
  (Vite plugin runs it `enforce: 'pre'`; Next runs it as a webpack pre-loader, keeping SWC).
- **Identity, layered** — file:line → component name (from the file) → `data-testid` / id / stable selector / text.
- **Mechanism + tokens** — detects how the element is styled and reverse-maps px to Tailwind tokens
  (`24px → p-6`, `leading-normal`, `tracking-tight`), with arbitrary-value fallback.
- **Breakpoints** — detected from the `@media` rules in your CSS, so the bar shows *your* breakpoints.
- **Responsive preview** — the app is loaded in a resizable iframe so real media queries reflow; the inspector
  operates inside it.

## Limitations

- **Dev builds only** — production strips source info and mangles classes.
- **React-first** — the DOM/CSS/breakpoint core is framework-agnostic; only source mapping is React-specific today.
- **Tailwind-tuned tokens** — non-Tailwind stacks get raw px + selector guidance (the prompt says which
  CSS-module / styled rule to edit).

## Develop

```bash
npm install
npm run build        # tsup → dist/{vite,babel,overlay,next}
npm test             # vitest (pure logic + babel transform)
npm run demo         # Vite + React playground on :5180
# demo-next/         # Next.js (app router) playground on :5181
```

<div align="center"><sub>MIT · dev-only · prompt-only</sub></div>
