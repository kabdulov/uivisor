import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'
import uivisorBabel from '../src/babel/index.js'

function run(code: string, filename = 'src/Demo.tsx'): string {
  const res = transformSync(code, {
    filename,
    cwd: '/project',
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx', 'typescript'], sourceType: 'module' },
    plugins: [uivisorBabel],
  })
  return res!.code!
}

describe('uivisor babel plugin', () => {
  it('tags host elements with data-uiv-src (file:line:col)', () => {
    const out = run(`export const A = () => <button>Hi</button>`, '/project/src/Btn.tsx')
    expect(out).toMatch(/data-uiv-src="src\/Btn\.tsx:1:\d+"/)
  })

  it('does NOT tag component (uppercase) elements', () => {
    const out = run(`const A = () => <Card><span>x</span></Card>`)
    // <span> tagged, <Card> not
    expect(out).toMatch(/<span data-uiv-src=/)
    expect(out).not.toMatch(/<Card data-uiv-src=/)
  })

  it('is idempotent', () => {
    const once = run(`const A = () => <i>x</i>`)
    const twice = run(once)
    const count = (twice.match(/data-uiv-src/g) || []).length
    expect(count).toBe(1)
  })
})
