import type { ReactNode } from 'react'
import { UivisorOverlay } from 'uivisor/next/overlay'

export const metadata = {
  title: 'uivisor · Next demo',
  description: 'Verifying file:line source mapping on Next.js',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f4f4f5' }}>
        {children}
        <UivisorOverlay />
      </body>
    </html>
  )
}
