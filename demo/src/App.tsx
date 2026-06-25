import { PricingCard } from './components/PricingCard'

export function App() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          Pricing
        </p>
        <h1 className="mt-2 text-4xl font-bold text-zinc-900">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-500">
          Turn on uivisor (Alt+U or the ◎ button), click any element, tweak its
          spacing or colors, and copy a precise prompt for your agent.
        </p>
      </header>

      <section className="mt-12 grid gap-6 md:grid-cols-3">
        <PricingCard
          name="Starter"
          price="$0"
          features={['1 project', 'Community support', 'Basic analytics']}
        />
        <PricingCard
          name="Pro"
          price="$19"
          featured
          features={['Unlimited projects', 'Priority support', 'Advanced analytics']}
        />
        <PricingCard
          name="Team"
          price="$49"
          features={['Everything in Pro', 'SSO & roles', 'Audit log']}
        />
      </section>
    </main>
  )
}
