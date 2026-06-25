import { defineConfig } from 'tsup'

export default defineConfig([
  // Browser overlay + Vite plugin + Babel plugin → ESM.
  {
    entry: {
      'vite/index': 'src/vite/index.ts',
      'babel/index': 'src/babel/index.ts',
      'overlay/index': 'src/overlay/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: false,
    target: 'node18',
    platform: 'neutral',
    external: ['vite', '@babel/core'],
  },
  // Next.js <UivisorOverlay/> client component → ESM with the "use client" directive.
  {
    entry: { 'next/overlay': 'src/next/overlay.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    target: 'es2020',
    platform: 'neutral',
    external: ['react', 'uivisor/overlay'],
    banner: { js: '"use client";' },
  },
  // Next.js config wrapper → dual ESM + CJS (next.config.ts/.mjs/.js).
  {
    entry: { 'next/index': 'src/next/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    shims: true,
    target: 'node18',
    platform: 'node',
    external: ['@babel/core'],
  },
  // Next.js webpack/turbopack loader → CommonJS, with `module.exports = fn`.
  {
    entry: { 'next/loader': 'src/next/loader.ts' },
    format: ['cjs'],
    dts: false,
    clean: false,
    target: 'node18',
    platform: 'node',
    external: ['@babel/core'],
    footer: {
      js: 'if (module.exports && module.exports.default) module.exports = module.exports.default;',
    },
  },
])
