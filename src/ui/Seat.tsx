import { evaluate, isBlackjack } from '../engine/hand'
import type { Card, Hand, Outcome, RuleSet, Seat } from '../engine/types'
import { PlayingCard } from './Card'
import { ChipStack } from './Chips'

const OUTCOME_LABEL: Record<Outcome, string> = {
  blackjack: 'Blackjack',
  charlie: 'Charlie',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
  surrender: 'Surrender',
}

/** How a dealer reads a total out loud: "soft 17", "16", "bust 23". */
export function totalLabel(cards: readonly Card[], natural = false): string {
  if (natural) return 'Blackjack'
  const { total, soft, busted } = evaluate(cards)
  if (busted) return `Bust ${total}`
  if (soft && total !== 21) return `Soft ${total}`
  return String(total)
}

export function handLabel(hand: Hand): string {
  return totalLabel(hand.cards, isBlackjack(hand))
}

function HandView({
  hand,
  active,
  rules,
}: {
  hand: Hand
  active: boolean
  rules: RuleSet
}) {
  const { busted } = evaluate(hand.cards)
  const settled = hand.outcome !== undefined
  const won = hand.outcome === 'win' || hand.outcome === 'blackjack' || hand.outcome === 'charlie'

  return (
    <div className={`hand${active ? ' hand-active' : ''}${busted ? ' hand-busted' : ''}`}>
      <div className="cards">
        {hand.cards.map((card, i) => (
          <span key={card.uid} className="card-slot" style={{ marginLeft: i === 0 ? 0 : '-26px' }}>
            <PlayingCard card={card} tilt={(i - (hand.cards.length - 1) / 2) * 3} dim={busted} />
          </span>
        ))}
      </div>

      <div className="hand-foot">
        <span className={`total${busted ? ' total-bust' : ''}`}>{handLabel(hand)}</span>
        {hand.doubled && <span className="tag">Doubled</span>}
        {hand.surrendered && <span className="tag">Surrendered</span>}
      </div>

      <ChipStack amount={hand.surrendered ? hand.bet / 2 : hand.bet} denominations={rules.chips} />

      {settled && (
        <div className={`outcome outcome-${won ? 'win' : hand.outcome === 'push' ? 'push' : 'lose'}`}>
          {OUTCOME_LABEL[hand.outcome!]}
          {won && hand.returned ? (
            <span className="outcome-amount">+{hand.returned - hand.bet}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function SeatView({
  seat,
  isHuman,
  activeHand,
  rules,
  tell,
}: {
  seat: Seat
  isHuman: boolean
  /** Index of the hand on the clock, or null if it isn't this seat's turn. */
  activeHand: number | null
  rules: RuleSet
  tell?: string
}) {
  const empty = seat.name === ''

  if (empty) {
    return (
      <div className="seat seat-empty">
        <div className="seat-circle" />
        <div className="seat-plate seat-plate-empty">Open</div>
      </div>
    )
  }

  return (
    <div className={`seat${isHuman ? ' seat-human' : ''}${activeHand !== null ? ' seat-turn' : ''}`}>
      <div className="hands">
        {seat.hands.length === 0 ? (
          <div className="seat-circle">
            {seat.sittingOut && <span className="sitting-out">Sitting out</span>}
          </div>
        ) : (
          seat.hands.map((hand, i) => (
            <HandView key={hand.id} hand={hand} active={activeHand === i} rules={rules} />
          ))
        )}
      </div>

      {seat.insurance > 0 && <div className="insurance-marker">Insured {seat.insurance}</div>}
      {seat.tookEvenMoney && <div className="insurance-marker">Even money</div>}

      <div className="seat-plate" title={tell}>
        <span className="seat-name">
          {seat.name}
          {isHuman && <span className="seat-you"> (you)</span>}
        </span>
        <span className="seat-bank">{seat.bankroll.toLocaleString()}</span>
      </div>
    </div>
  )
}
