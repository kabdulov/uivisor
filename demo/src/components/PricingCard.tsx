interface PricingCardProps {
  name: string
  price: string
  features: string[]
  featured?: boolean
}

export function PricingCard({ name, price, features, featured }: PricingCardProps) {
  return (
    <div
      className={`rounded-xl border p-6 ${
        featured ? 'border-indigo-500 bg-white shadow-lg' : 'border-zinc-200 bg-white'
      }`}
    >
      <h3 className="text-lg font-semibold text-zinc-900">{name}</h3>
      <p className="mt-2 text-zinc-500">
        <span className="text-3xl font-bold text-zinc-900">{price}</span> / mo
      </p>
      <ul className="mt-4 space-y-2">
        {features.map((f) => (
          <li key={f} className="text-sm text-zinc-600">
            ✓ {f}
          </li>
        ))}
      </ul>
      <button
        data-testid={`buy-${name.toLowerCase()}`}
        className={`mt-6 w-full rounded-md px-4 py-2 text-sm font-semibold ${
          featured ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-900'
        }`}
      >
        Get started
      </button>
    </div>
  )
}
