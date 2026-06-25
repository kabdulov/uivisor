import { useEffect } from 'react'

/**
 * Dev-only overlay mount for Next.js. Render once near the end of your root
 * layout's <body>. Works under BOTH Turbopack and webpack (no bundler magic) —
 * it just dynamically imports the overlay on the client in development.
 *
 *   // app/layout.tsx
 *   import { UivisorOverlay } from 'uivisor/next/overlay'
 *   ...
 *   <body>{children}<UivisorOverlay /></body>
 */
export function UivisorOverlay(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // @ts-ignore side-effect import only; the package self-reference may have no
      // types during this package's own build, and none are needed at runtime.
      void import('uivisor/overlay')
    }
  }, [])
  return null
}

export default UivisorOverlay
