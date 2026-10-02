import { useEffect, useState } from 'react'

import { basicStrategy } from '../engine/strategy/basic'
import type { Beat, Game } from '../engine/table'
import type { Action } from '../engine/types'
import { Chip } from './Chips'

const ACTION_LABEL: Record<Action, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
}

const ACTION_KEY: Record<Action, string> = {
  hit: 'H',
  stand: 'S',
  double: 'D',
  split: 'P',
  surrender: 'R',
}

export function Controls({
  game,
  pending,
  coach,
}: {
  game: Game
  pending: Beat | null
  coach: boolean
}) {
  const rules = game.rules
  const seat = game.human
  const [stake, setStake] = useState(rules.minBet)
  const [lastBet, setLastBet] = useState(rules.minBet)

  // A new table, or a new minimum, resets the chips in front of you.
  useEffect(() => {
    setStake(Math.min(Math.max(rules.minBet, 0), rules.maxBet))
  }, [rules.minBet, rules.maxBet])

  // --- keyboard, because nobody wants to aim at a button mid-shoe
  useEffect(() => {
    if (pending?.type !== 'awaitAction') return
    const onKey = (e: KeyboardEvent) => {
      const action = pending.actions.find((a) => ACTION_KEY[a] === e.key.toUpperCase())
      if (action) {
        e.preventDefault()
        game.act(action)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, pending])

  if (!pending) {
    return (
      <div className="controls controls-idle">
        <span className="dealing">Dealing…</span>
      </div>
    )
  }

  // ---------------------------------------------------------------- betting

  if (pending.type === 'awaitBet') {
    const canAfford = (n: number) => n <= seat.bankroll
    const valid = stake >= rules.minBet && stake <= rules.maxBet && canAfford(stake)

    const add = (n: number) => setStake((s) => Math.min(rules.maxBet, Math.min(s + n, seat.bankroll)))

    return (
      <div className="controls">
        <div className="bet-row">
          <div className="chip-tray">
            {rules.chips.map((value) => (
              <Chip
                key={value}
                value={value}
                onClick={() => add(value)}
                disabled={!canAfford(stake + value) || stake + value > rules.maxBet}
              />
            ))}
          </div>

          <div className="bet-readout">
            <span className="bet-label">Your bet</span>
            <span className="bet-amount">{stake.toLocaleString()}</span>
            <span className="bet-limits">
              Table {rules.minBet}–{rules.maxBet.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="button-row">
          <button className="btn btn-ghost" onClick={() => setStake(rules.minBet)}>
            Clear
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setStake(Math.min(lastBet, seat.bankroll, rules.maxBet))}
            disabled={lastBet > seat.bankroll}
          >
            Repeat {lastBet}
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              setLastBet(stake)
              game.placeBet(stake)
            }}
          >
            Deal
          </button>
          <button className="btn btn-ghost" onClick={() => game.sitOut()}>
            Sit out
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------- insurance

  if (pending.type === 'awaitInsurance') {
    const evenMoney = pending.evenMoney
    return (
      <div className="controls">
        <div className="prompt">
          {evenMoney ? (
            <>
              <b>Even money?</b> The dealer is showing an ace and you have a blackjack. Take{' '}
              {seat.baseBet} now, or hold out for {Math.round(seat.baseBet * 1.5)} and risk a push.
            </>
          ) : (
            <>
              <b>Insurance?</b> Half your bet ({seat.baseBet / 2}) against the dealer having a
              blackjack. It pays {rules.insurancePayout[0]}:{rules.insurancePayout[1]}.
            </>
          )}
        </div>
        {coach && (
          <div className="coach">
            {game.trueCount >= 3
              ? `Book: take it. At a true count of ${game.trueCount.toFixed(1)} there are enough tens left to make this bet pay.`
              : 'Book: decline. Insurance is a losing bet unless the shoe is rich in tens.'}
          </div>
        )}
        <div className="button-row">
          <button
            className="btn btn-primary"
            onClick={() => (evenMoney ? game.takeEvenMoney(true) : game.takeInsurance(true))}
          >
            {evenMoney ? 'Take even money' : 'Insure'}
          </button>
          <button
            className="btn"
            onClick={() => (evenMoney ? game.takeEvenMoney(false) : game.takeInsurance(false))}
          >
            No thanks
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------- early surrender

  if (pending.type === 'awaitEarlySurrender') {
    return (
      <div className="controls">
        <div className="prompt">
          <b>Surrender early?</b> Give up half your bet now — before the dealer looks at the hole
          card. If they have a blackjack, you still only lose half.
        </div>
        <div className="button-row">
          <button className="btn btn-primary" onClick={() => game.earlySurrenderDecision(true)}>
            Surrender
          </button>
          <button className="btn" onClick={() => game.earlySurrenderDecision(false)}>
            Play the hand
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- playing

  if (pending.type === 'awaitAction') {
    const hand = seat.hands[pending.hand]
    const up = game.upcard
    const book = up ? basicStrategy(hand, up, seat, rules) : null

    return (
      <div className="controls">
        {coach && book && (
          <div className="coach">
            Book says <b>{ACTION_LABEL[book]}</b>
            {seat.hands.length > 1 ? ` on hand ${pending.hand + 1}` : ''}.
          </div>
        )}
        <div className="button-row button-row-actions">
          {(['hit', 'stand', 'double', 'split', 'surrender'] as Action[]).map((action) => {
            const legal = pending.actions.includes(action)
            if (!legal) return null
            return (
              <button
                key={action}
                className={`btn btn-action${action === 'hit' || action === 'stand' ? ' btn-primary' : ''}`}
                onClick={() => game.act(action)}
              >
                {ACTION_LABEL[action]}
                <span className="key">{ACTION_KEY[action]}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="controls controls-idle">
      <span className="dealing">Dealing…</span>
    </div>
  )
}
