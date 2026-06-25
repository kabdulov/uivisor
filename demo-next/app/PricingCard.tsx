interface PricingCardProps {
  name: string
  price: string
  featured?: boolean
}

export function PricingCard({ name, price, featured }: PricingCardProps) {
  return (
    <div
      style={{
        border: featured ? '1px solid #6366f1' : '1px solid #e4e4e7',
        borderRadius: 12,
        padding: 24,
        background: '#fff',
      }}
    >
      <h3 style={{ margin: 0, fontSize: 18, color: '#18181b' }}>{name}</h3>
      <p style={{ marginTop: 8, color: '#71717a' }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: '#18181b' }}>{price}</span> / mo
      </p>
      <button
        data-testid={`buy-${name.toLowerCase()}`}
        style={{
          marginTop: 16,
          width: '100%',
          padding: '8px 16px',
          borderRadius: 6,
          border: 'none',
          background: featured ? '#4f46e5' : '#f4f4f5',
          color: featured ? '#fff' : '#18181b',
          fontWeight: 600,
        }}
      >
        Get started
      </button>
    </div>
  )
}
