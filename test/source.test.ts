import { describe, expect, it } from 'vitest'
import {
  buildSelector,
  getIdentity,
  parseSourceAttr,
  readBuildSource,
} from '../src/overlay/source.js'

describe('parseSourceAttr', () => {
  it('parses relpath:line:col', () => {
    expect(parseSourceAttr('src/components/Card.tsx:42:7')).toEqual({
      file: 'src/components/Card.tsx',
      line: 42,
      column: 7,
    })
  })
  it('handles windows-ish / nested paths', () => {
    expect(parseSourceAttr('a/b/c.tsx:1:1')?.file).toBe('a/b/c.tsx')
  })
  it('returns null for junk', () => {
    expect(parseSourceAttr('nope')).toBeNull()
    expect(parseSourceAttr(undefined)).toBeNull()
  })
})

describe('readBuildSource', () => {
  it('reads the nearest data-uiv-src ancestor', () => {
    document.body.innerHTML = `
      <section data-uiv-src="src/Page.tsx:10:3">
        <button id="cta">Go</button>
      </section>`
    const btn = document.getElementById('cta')!
    expect(readBuildSource(btn)).toEqual({ file: 'src/Page.tsx', line: 10, column: 3 })
  })
})

describe('buildSelector & getIdentity', () => {
  it('anchors on id / data-testid when present', () => {
    document.body.innerHTML = `<main><button data-testid="buy">Buy</button></main>`
    const btn = document.querySelector('button')!
    expect(buildSelector(btn)).toContain('[data-testid="buy"]')
  })

  it('builds a full identity bundle with source confidence', () => {
    document.body.innerHTML = `
      <div data-uiv-src="src/App.tsx:5:1">
        <button data-testid="cta" class="px-4">Get started</button>
      </div>`
    const btn = document.querySelector('button')!
    const id = getIdentity(btn)
    expect(id.tagName).toBe('button')
    expect(id.textSnippet).toBe('Get started')
    expect(id.dataTestId).toBe('cta')
    expect(id.source.confidence).toBe('build-attr')
    expect(id.classList).toContain('px-4')
  })

  it('reports no source when unmapped', () => {
    document.body.innerHTML = `<span>hi</span>`
    const id = getIdentity(document.querySelector('span')!)
    expect(id.source.confidence).toBe('none')
  })
})
