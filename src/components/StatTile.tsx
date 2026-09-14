export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-400 mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  )
}
