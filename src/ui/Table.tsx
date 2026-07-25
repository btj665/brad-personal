import { evaluate } from '../engine/hand'
import { ratio } from '../engine/rules'
import type { Game } from '../engine/table'
import { PlayingCard } from './Card'
import { SeatView, totalLabel } from './Seat'

/** The seats sit on a circle centred on the dealer, so the middle chair is the
 *  furthest away and the ends ride up towards the shoe. This is the arc. */
const SEAT_LIFT = [58, 18, 0, 18, 58]

function DealerHand({ game }: { game: Game }) {
  const { dealer } = game
  const shown = dealer.holeRevealed ? dealer.cards : dealer.cards.slice(0, 1)
  const hidden = dealer.holeRevealed ? 0 : dealer.cards.length - 1
  const value = evaluate(shown)

  return (
    <div className="dealer">
      <div className="dealer-label">Dealer</div>
      <div className="cards">
        {shown.map((card, i) => (
          <span key={card.uid} className="card-slot" style={{ marginLeft: i === 0 ? 0 : '-26px' }}>
            <PlayingCard card={card} tilt={(i - (dealer.cards.length - 1) / 2) * 3} />
          </span>
        ))}
        {hidden > 0 && (
          <span className="card-slot" style={{ marginLeft: '-26px' }}>
            <PlayingCard down tilt={2} />
          </span>
        )}
      </div>
      {dealer.cards.length > 0 && (
        <div className="dealer-total">
          {dealer.holeRevealed
            ? totalLabel(dealer.cards, dealer.cards.length === 2 && value.total === 21)
            : `Showing ${value.soft ? `soft ${value.total}` : value.total}`}
        </div>
      )}
    </div>
  )
}

/** The house rules, silk-screened on the felt, exactly as they are in a casino —
 *  and read from the live RuleSet, so they never lie. */
function FeltLegend({ game }: { game: Game }) {
  const r = game.rules
  const bj = ratio(r.blackjackPayout)
  const pays =
    bj === 1.5 ? '3 TO 2' : bj === 1.2 ? '6 TO 5' : `${r.blackjackPayout[0]} TO ${r.blackjackPayout[1]}`

  return (
    <div className="legend">
      <div className="legend-line legend-major">BLACKJACK PAYS {pays}</div>
      <div className="legend-line">
        DEALER MUST {r.dealerHitsSoft17 ? 'HIT' : 'STAND ON'} SOFT 17
      </div>
      <div className="legend-line legend-small">
        {r.decks} DECK{r.decks === 1 ? '' : 'S'} · INSURANCE PAYS{' '}
        {r.insurance ? `${r.insurancePayout[0]} TO ${r.insurancePayout[1]}` : 'NOTHING'} ·{' '}
        {r.minBet}–{r.maxBet.toLocaleString()}
      </div>
    </div>
  )
}

function Shoe({ game }: { game: Game }) {
  const left = Math.max(0, 1 - game.shoe.progress)
  const cut = 1 - game.rules.penetration

  return (
    <div className="shoe" title={`${game.shoe.cardsRemaining} cards behind the cut card`}>
      <div className="shoe-box">
        <div className="shoe-fill" style={{ height: `${left * 100}%` }} />
        {/* Where the dealer buried the cut card. */}
        <div className="shoe-cut" style={{ bottom: `${cut * 100}%` }} />
      </div>
      <div className="shoe-label">
        {game.rules.csm ? 'CSM' : 'SHOE'}
        <span className="shoe-count">{game.shoe.cardsRemaining}</span>
      </div>
    </div>
  )
}

export function TableView({ game, showCount }: { game: Game; showCount: boolean }) {
  const turn = game.phase === 'playing' ? game.turn : null

  return (
    <div className="table">
      <div className="felt">
        <div className="table-top">
          <Shoe game={game} />
          <DealerHand game={game} />
          <div className="table-corner">
            {showCount && (
              <div className="count">
                <div className="count-row">
                  <span>Running</span>
                  <b>{game.counter.running > 0 ? `+${game.counter.running}` : game.counter.running}</b>
                </div>
                <div className="count-row">
                  <span>True</span>
                  <b>{game.trueCount.toFixed(1)}</b>
                </div>
              </div>
            )}
          </div>
        </div>

        <FeltLegend game={game} />

        <div className="seats">
          {game.seats.map((seat, i) => (
            <div key={i} className="seat-slot" style={{ transform: `translateY(-${SEAT_LIFT[i]}px)` }}>
              <SeatView
                seat={seat}
                isHuman={i === game.humanSeat}
                activeHand={turn && turn.seat === i ? turn.hand : null}
                rules={game.rules}
                tell={seat.bot ? `Plays ${seat.bot.style}` : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
