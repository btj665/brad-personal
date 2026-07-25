// Casino cheque colours. These are the standard American denominations, which
// is why a $25 chip is green everywhere you have ever been.
const CHIP_COLOURS: Array<{ value: number; body: string; edge: string; ink: string }> = [
  { value: 5000, body: '#8d6cab', edge: '#fdf6ff', ink: '#fff' },
  { value: 1000, body: '#d8a326', edge: '#fff6dd', ink: '#3a2a00' },
  { value: 500, body: '#6b3fa0', edge: '#efe2ff', ink: '#fff' },
  { value: 100, body: '#17181c', edge: '#8c8f99', ink: '#fff' },
  { value: 25, body: '#1c7a45', edge: '#c9f2d9', ink: '#fff' },
  { value: 5, body: '#b8232f', edge: '#ffd7da', ink: '#fff' },
  { value: 1, body: '#e8e4dc', edge: '#ffffff', ink: '#2a2a2a' },
]

function paletteFor(value: number) {
  return CHIP_COLOURS.find((c) => c.value <= value) ?? CHIP_COLOURS[CHIP_COLOURS.length - 1]
}

export function Chip({
  value,
  size = 40,
  onClick,
  disabled,
  label,
}: {
  value: number
  size?: number
  onClick?: () => void
  disabled?: boolean
  label?: string
}) {
  const { body, edge, ink } = paletteFor(value)
  const chip = (
    <svg viewBox="0 0 100 100" width={size} height={size} className="chip">
      <circle cx="50" cy="50" r="48" fill={body} />
      {/* The six edge spots every casino chip has. */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x="44"
          y="1"
          width="12"
          height="14"
          rx="2"
          fill={edge}
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="37" fill="none" stroke={edge} strokeWidth="2" opacity="0.55" />
      <circle cx="50" cy="50" r="32" fill={body} stroke={edge} strokeWidth="1" opacity="0.9" />
      <text x="50" y="50" className="chip-value" fill={ink}>
        {value >= 1000 ? `${value / 1000}K` : value}
      </text>
    </svg>
  )

  if (!onClick) return chip
  return (
    <button
      type="button"
      className="chip-button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? `Bet ${value}`}
      title={label ?? `Bet ${value}`}
    >
      {chip}
    </button>
  )
}

/** Break an amount into real chips, biggest first — the way a dealer would cut
 *  it — and stack them in the betting circle. */
export function ChipStack({ amount, denominations }: { amount: number; denominations: number[] }) {
  if (amount <= 0) return null

  const chips: number[] = []
  let left = amount
  for (const d of [...denominations].sort((a, b) => b - a)) {
    while (left >= d && chips.length < 12) {
      chips.push(d)
      left -= d
    }
  }
  // Anything the table's chips can't express (an odd half from a split bet).
  if (left > 0 && chips.length < 12) chips.push(left)

  return (
    <div className="chip-stack" aria-label={`${amount} bet`}>
      {chips.map((value, i) => (
        <span key={i} className="chip-in-stack" style={{ bottom: `${i * 4}px`, zIndex: i }}>
          <Chip value={value} size={34} />
        </span>
      ))}
      <span className="chip-stack-total">{amount}</span>
    </div>
  )
}
