import type { PokerGame } from '../../pokerroom/engine'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'
import { PokerSeat } from './PokerSeat'

/** Table chips, biggest first — what the dealer cuts a pot or a bet into. */
export const POKER_CHIPS = [1000, 500, 100, 25, 5, 1]

/** A seat's spot on the felt, as a point on an ellipse. The human sits at the
 *  bottom centre and everyone else fans out clockwise from there, so the layout
 *  reads the same however many seats and wherever the human is dealt in. */
function seatPoint(index: number, humanSeat: number, n: number): { x: number; y: number } {
  const slot = (index - humanSeat + n) % n
  const angle = (90 + slot * (360 / n)) * (Math.PI / 180)
  return { x: 50 + 42 * Math.cos(angle), y: 50 + 40 * Math.sin(angle) }
}

/** The next seat clockwise from `from` that's dealt into the hand — the same walk
 *  the engine uses to seat the button and the blinds. */
function nextOccupied(game: PokerGame, from: number): number {
  const seats = game.seats
  for (let k = 1; k <= seats.length; k++) {
    const i = (from + k) % seats.length
    if (!seats[i].sittingOut && (seats[i].stack > 0 || seats[i].committed > 0)) return i
  }
  return from
}

export function PokerTable({
  game,
  winners,
  awardNet,
}: {
  game: PokerGame
  winners: Set<number>
  awardNet: number
}) {
  const n = game.seats.length
  const sb = game.button >= 0 ? nextOccupied(game, game.button) : -1
  const bb = sb >= 0 ? nextOccupied(game, sb) : -1
  const clock = game.onClock
  // Draw and stud have no shared cards, so the centre shows no board — only the
  // pot sits there.
  const hasBoard = game.variant.deal.some((d) => d.kind === 'community')

  // The five cards that win the pot, so a winner's best hand can be ringed once
  // the award lands. Driven by `winners`, which fills as the award beats stream.
  const bestCards = new Set<number>()
  if (winners.size > 0) {
    for (const w of winners) {
      const show = game.seats[w]?.showdown
      if (show) for (const c of show.best) bestCards.add(c.uid)
    }
  }

  return (
    <div className="pk-table">
      <div className="felt pk-felt">
        <div className="pk-oval">
          {/* The centre: the board, then the pot beneath it. */}
          <div className="pk-center">
            <div className="pk-board" aria-label="community cards">
              {game.board.length === 0
                ? hasBoard
                  ? [0, 1, 2, 3, 4].map((i) => <span key={i} className="pk-board-slot" />)
                  : null
                : game.board.map((c, i) => (
                    <span
                      key={c.uid}
                      className={`pk-board-card${bestCards.has(c.uid) ? ' pk-card-win' : ''}`}
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      <PlayingCard card={c} />
                    </span>
                  ))}
            </div>
            {game.pot > 0 && winners.size === 0 && (
              <div className="pk-pot">
                <ChipStack amount={game.pot} denominations={POKER_CHIPS} />
                <span className="pk-pot-label">Pot {game.pot.toLocaleString()}</span>
              </div>
            )}
            {awardNet > 0 && (
              <div className="pk-award" key={`award-${game.hand}`}>
                +{awardNet.toLocaleString()}
              </div>
            )}
          </div>

          {game.seats.map((seat) => {
            const { x, y } = seatPoint(seat.index, game.humanSeat, n)
            return (
              <div
                key={seat.index}
                className="pk-seat-anchor"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <PokerSeat
                  seat={seat}
                  isHuman={seat.index === game.humanSeat}
                  onClock={!game.over && clock === seat.index}
                  isButton={seat.index === game.button}
                  blind={seat.index === sb ? 'SB' : seat.index === bb ? 'BB' : null}
                  isWinner={winners.has(seat.index)}
                  bestCards={bestCards}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
