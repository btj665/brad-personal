import { isRed, SUIT_PIP } from '../engine/cards'
import type { Card, Rank } from '../engine/types'

// A real playing card: 2.5 x 3.5 inches, so a 5:7 box.
const W = 100
const H = 140

// Pip columns and the rows they sit on, as fractions of the face.
const L = 0.3
const C = 0.5
const R = 0.7

type Pip = [x: number, y: number]

/** The standard pip layouts. Anything on the bottom half of the card is printed
 *  upside down, exactly as it is on a real deck. */
const PIPS: Partial<Record<Rank, Pip[]>> = {
  '2': [[C, 0.16], [C, 0.84]],
  '3': [[C, 0.16], [C, 0.5], [C, 0.84]],
  '4': [[L, 0.16], [R, 0.16], [L, 0.84], [R, 0.84]],
  '5': [[L, 0.16], [R, 0.16], [C, 0.5], [L, 0.84], [R, 0.84]],
  '6': [[L, 0.16], [R, 0.16], [L, 0.5], [R, 0.5], [L, 0.84], [R, 0.84]],
  '7': [[L, 0.16], [R, 0.16], [C, 0.33], [L, 0.5], [R, 0.5], [L, 0.84], [R, 0.84]],
  '8': [
    [L, 0.16], [R, 0.16], [C, 0.33], [L, 0.5], [R, 0.5], [C, 0.67], [L, 0.84], [R, 0.84],
  ],
  '9': [
    [L, 0.16], [R, 0.16], [L, 0.38], [R, 0.38], [C, 0.5],
    [L, 0.62], [R, 0.62], [L, 0.84], [R, 0.84],
  ],
  '10': [
    [L, 0.16], [R, 0.16], [C, 0.27], [L, 0.38], [R, 0.38],
    [L, 0.62], [R, 0.62], [C, 0.73], [L, 0.84], [R, 0.84],
  ],
}

interface Props {
  card?: Card
  /** Face down — the dealer's hole card, or the deck in the shoe. */
  down?: boolean
  /** Slight rotation, so a fanned hand doesn't look like a spreadsheet. */
  tilt?: number
  dim?: boolean
}

export function PlayingCard({ card, down, tilt = 0, dim }: Props) {
  const cls = ['card', down ? 'card-down' : '', dim ? 'card-dim' : ''].filter(Boolean).join(' ')

  if (down || !card) {
    return (
      <svg className={cls} viewBox={`0 0 ${W} ${H}`} style={{ rotate: `${tilt}deg` }}>
        <CardBack />
      </svg>
    )
  }

  const red = isRed(card)
  const pip = SUIT_PIP[card.suit]
  const ink = red ? 'var(--card-red)' : 'var(--card-black)'
  const pips = PIPS[card.rank]

  return (
    <svg
      className={cls}
      viewBox={`0 0 ${W} ${H}`}
      style={{ rotate: `${tilt}deg` }}
      role="img"
      aria-label={`${card.rank} of ${SUIT_NAME[card.suit]}`}
    >
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="8" className="card-face" />
      <rect x="3.5" y="3.5" width={W - 7} height={H - 7} rx="6" className="card-edge" />

      <Corner rank={card.rank} pip={pip} ink={ink} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <Corner rank={card.rank} pip={pip} ink={ink} />
      </g>

      {pips && (
        <g fill={ink}>
          {pips.map(([x, y], i) => (
            <text
              key={i}
              x={x * W}
              y={y * H}
              className="pip"
              transform={y > 0.5 ? `rotate(180 ${x * W} ${y * H})` : undefined}
            >
              {pip}
            </text>
          ))}
        </g>
      )}

      {card.rank === 'A' && (
        <text x={W / 2} y={H / 2} className="pip pip-ace" fill={ink}>
          {pip}
        </text>
      )}

      {(card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') && (
        <CourtCard rank={card.rank} pip={pip} ink={ink} />
      )}
    </svg>
  )
}

function Corner({ rank, pip, ink }: { rank: Rank; pip: string; ink: string }) {
  return (
    <g fill={ink}>
      <text x="11" y="24" className="corner-rank">
        {rank}
      </text>
      <text x="11" y="38" className="corner-pip">
        {pip}
      </text>
    </g>
  )
}

/** The court cards aren't drawn figures — they're a monogram in a ruled panel,
 *  the way a modern casino deck prints them. Cleaner than a bad king. */
function CourtCard({ rank, pip, ink }: { rank: Rank; pip: string; ink: string }) {
  return (
    <g>
      <rect x="26" y="34" width="48" height="72" rx="3" className="court-panel" stroke={ink} />
      <line x1="26" y1="70" x2="74" y2="70" stroke={ink} className="court-rule" />
      <text x={W / 2} y="62" className="court-letter" fill={ink}>
        {rank}
      </text>
      <text x={W / 2} y="98" className="court-pip" fill={ink}>
        {pip}
      </text>
    </g>
  )
}

function CardBack() {
  return (
    <g>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="8" className="card-face" />
      <rect x="5" y="5" width={W - 10} height={H - 10} rx="5" className="back-field" />
      <rect x="9" y="9" width={W - 18} height={H - 18} rx="3" className="back-inner" />
      <text x={W / 2} y={H / 2 + 7} className="back-mark">
        ♠
      </text>
    </g>
  )
}

const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const
