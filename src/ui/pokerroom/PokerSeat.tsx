import type { Seat } from '../../pokerroom/types'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'
import { POKER_CHIPS } from './PokerTable'

/** A card fanned in a hand gets a slight tilt so a pair doesn't read like a
 *  spreadsheet — mirrored around the middle of the hand. */
function tiltOf(i: number, count: number): number {
  if (count <= 1) return 0
  return (i - (count - 1) / 2) * 5
}

export function PokerSeat({
  seat,
  isHuman,
  onClock,
  isButton,
  blind,
  isWinner,
  bestCards,
}: {
  seat: Seat
  isHuman: boolean
  onClock: boolean
  isButton: boolean
  blind: 'SB' | 'BB' | null
  isWinner: boolean
  bestCards: Set<number>
}) {
  const inHand = seat.cards.length > 0 || seat.committed > 0
  const dim = seat.folded || seat.sittingOut
  // A bot's cards stay face down until it turns them over at showdown.
  const reveal = isHuman || !!seat.showdown

  const cls = [
    'pk-seat',
    isHuman ? 'pk-seat-human' : '',
    onClock ? 'pk-seat-active' : '',
    dim ? 'pk-seat-dim' : '',
    isWinner ? 'pk-seat-winner' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <div className="pk-seat-cards">
        {seat.cards.length === 0 ? (
          <span className="pk-noshow">{seat.sittingOut ? 'Sitting out' : ''}</span>
        ) : (
          seat.cards.map((held, i) => {
            // Face up for the human, at showdown, or a stud up-card.
            const faceUp = held.faceUp || reveal
            const inBest = bestCards.has(held.card.uid)
            return (
              <span key={held.card.uid} className={inBest ? 'pk-card-win' : undefined}>
                <PlayingCard
                  card={held.card}
                  down={!faceUp}
                  tilt={tiltOf(i, seat.cards.length)}
                  dim={dim}
                />
              </span>
            )
          })
        )}
      </div>

      <div className="pk-seat-plate">
        <span className="pk-seat-name">
          {seat.name}
          {isHuman && <span className="seat-you"> (you)</span>}
        </span>
        <span className="pk-seat-stack">
          {seat.allIn ? 'ALL IN' : seat.folded ? 'Folded' : seat.stack.toLocaleString()}
        </span>
      </div>

      {seat.showdown && reveal && inHand && !seat.folded && (
        <span className="pk-seat-rank">{seat.showdown.name}</span>
      )}

      {(isButton || blind) && (
        <div className="pk-markers">
          {isButton && <span className="pk-btn-disc" title="Dealer button">D</span>}
          {blind && <span className="pk-blind-disc">{blind}</span>}
        </div>
      )}

      {seat.streetCommitted > 0 && (
        <div className="pk-seat-bet">
          <ChipStack amount={seat.streetCommitted} denominations={POKER_CHIPS} />
        </div>
      )}
    </div>
  )
}
