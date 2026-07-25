import { bestOf, CATEGORY_NAME } from '../../poker/eval'
import type { UthGame } from '../../uth/engine'
import type { UthSeat } from '../../uth/types'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'

function Board({ game }: { game: UthGame }) {
  const shown = game.shownBoard
  const revealed = game.dealer.revealed
  const full = revealed ? game.board : shown

  return (
    <div className="uth-board">
      <div className="uth-board-label">Community</div>
      <div className="cards">
        {[0, 1, 2, 3, 4].map((i) => {
          const card = full[i]
          const faceUp = i < shown.length || (revealed && i < game.board.length)
          if (!card && !faceUp) return <span key={i} className="card-ghost" />
          return (
            <span key={card?.uid ?? i} className="card-slot">
              {faceUp && card ? <PlayingCard card={card} /> : <PlayingCard down />}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function DealerHand({ game }: { game: UthGame }) {
  const d = game.dealer
  return (
    <div className="uth-dealer">
      <div className="uth-seat-label">Dealer</div>
      <div className="cards">
        {d.cards.length === 0 ? (
          <>
            <span className="card-ghost" />
            <span className="card-ghost" />
          </>
        ) : (
          d.cards.map((c, i) => (
            <span key={c.uid} className="card-slot">
              {d.revealed ? <PlayingCard card={c} /> : <PlayingCard down tilt={i === 0 ? -2 : 2} />}
            </span>
          ))
        )}
      </div>
      {d.revealed && d.score && (
        <div className={`uth-rank${d.qualifies ? '' : ' uth-rank-weak'}`}>
          {CATEGORY_NAME[d.score.category]}
          {d.qualifies ? '' : ' — does not open'}
        </div>
      )}
    </div>
  )
}

function BetLine({ label, amount, chips }: { label: string; amount: number; chips: number[] }) {
  return (
    <div className="uth-betline">
      <span className="uth-betline-label">{label}</span>
      {amount > 0 ? <ChipStack amount={amount} denominations={chips} /> : <span className="uth-betline-empty">—</span>}
    </div>
  )
}

function SeatView({
  seat,
  game,
  isHuman,
  active,
}: {
  seat: UthSeat
  game: UthGame
  isHuman: boolean
  active: boolean
}) {
  if (seat.name === '') {
    return (
      <div className="uth-seat uth-seat-empty">
        <div className="uth-seat-label">Open</div>
      </div>
    )
  }

  const h = seat.hand
  const chips = game.rules.chips
  const showCards = h && h.cards.length > 0
  const score = h && game.dealer.revealed ? bestOf([...h.cards, ...game.board], {}) : null

  return (
    <div className={`uth-seat${isHuman ? ' uth-seat-human' : ''}${active ? ' uth-seat-active' : ''}`}>
      <div className="cards">
        {showCards ? (
          h!.cards.map((c) => (
            <span key={c.uid} className="card-slot">
              <PlayingCard card={c} />
            </span>
          ))
        ) : (
          <>
            <span className="card-ghost" />
            <span className="card-ghost" />
          </>
        )}
      </div>

      {score && <div className="uth-rank">{CATEGORY_NAME[score.category]}</div>}

      {h && (
        <div className="uth-bets">
          <BetLine label="Ante" amount={h.ante} chips={chips} />
          <BetLine label="Blind" amount={h.blind} chips={chips} />
          <BetLine label="Play" amount={h.play} chips={chips} />
          {h.trips > 0 && <BetLine label="Trips" amount={h.trips} chips={chips} />}
        </div>
      )}

      {h?.folded && <div className="uth-folded">Folded</div>}
      {h?.result && h.payout && (
        <div className={`uth-result uth-result-${h.result}`}>
          {h.result.toUpperCase()}
          <span className="uth-net">
            {h.payout.net >= 0 ? '+' : ''}
            {h.payout.net}
          </span>
        </div>
      )}

      <div className="uth-plate">
        <span className="uth-name">
          {seat.name}
          {isHuman && <span className="seat-you"> (you)</span>}
        </span>
        <span className="uth-bank">{seat.bankroll.toLocaleString()}</span>
      </div>
    </div>
  )
}

export function UthTable({ game }: { game: UthGame }) {
  const pending = game.pending()
  const activeSeat =
    pending?.type === 'awaitDecision' || pending?.type === 'awaitBet' ? pending.seat : -1

  return (
    <div className="uth-table">
      <div className="felt uth-felt">
        <DealerHand game={game} />
        <Board game={game} />

        <div className="uth-seats">
          {game.seats.map((seat, i) => (
            <SeatView
              key={i}
              seat={seat}
              game={game}
              isHuman={i === game.humanSeat}
              active={i === activeSeat}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
