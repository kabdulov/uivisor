import { PricingCard } from './PricingCard'

export default function Page() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ textAlign: 'center', fontSize: 36, color: '#18181b' }}>uivisor on Next.js</h1>
      <p style={{ textAlign: 'center', color: '#71717a' }}>
        Alt+U, click an element — the prompt should carry app/PricingCard.tsx:line:col.
      </p>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 48 }}>
        <PricingCard name="Starter" price="$0" />
        <PricingCard name="Pro" price="$19" featured />
        <PricingCard name="Team" price="$49" />
      </section>
    </main>
  )
}
