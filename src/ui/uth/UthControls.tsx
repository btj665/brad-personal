import { useEffect, useState } from 'react'

import type { Beat, UthGame } from '../../uth/engine'
import { preflopRaise, flopRaise, riverRaise } from '../../uth/strategy'
import type { UthAction } from '../../uth/types'
import { Chip } from '../Chips'

export function UthControls({
  game,
  pending,
  coach,
}: {
  game: UthGame
  pending: Beat | null
  coach: boolean
}) {
  const rules = game.rules
  const seat = game.human
  const [ante, setAnte] = useState(rules.minBet)
  const [trips, setTrips] = useState(0)

  useEffect(() => {
    setAnte(Math.max(rules.minBet, Math.min(ante, rules.maxBet)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules.minBet, rules.maxBet])

  // Keyboard shortcuts for the decision streets.
  useEffect(() => {
    if (pending?.type !== 'awaitDecision') return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const map: Record<string, UthAction> = { c: 'check', b: bigBet(pending.actions), f: 'fold' }
      const action = map[k]
      if (action && pending.actions.includes(action)) {
        e.preventDefault()
        game.decide(action)
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
    const total = ante * 2 + trips
    const affordable = total <= seat.bankroll && ante >= rules.minBet && ante <= rules.maxBet

    return (
      <div className="controls">
        <div className="uth-bet-grid">
          <div className="uth-bet-field">
            <span className="bet-label">Ante + Blind (each equal)</span>
            <div className="uth-stepper">
              <button className="btn" onClick={() => setAnte((a) => Math.max(rules.minBet, a - rules.minBet))}>
                −
              </button>
              <b>{ante}</b>
              <button
                className="btn"
                onClick={() => setAnte((a) => Math.min(rules.maxBet, a + rules.minBet))}
              >
                +
              </button>
            </div>
            <span className="bet-limits">
              Puts up {ante * 2} ({ante} + {ante})
            </span>
          </div>

          <div className="uth-bet-field">
            <span className="bet-label">Trips (optional)</span>
            <div className="chip-tray">
              <Chip value={0} size={34} onClick={() => setTrips(0)} label="No trips" />
              {rules.chips.slice(0, 3).map((v) => (
                <Chip key={v} value={v} size={34} onClick={() => setTrips((t) => t + v)} />
              ))}
            </div>
            <span className="bet-limits">Trips: {trips}</span>
          </div>
        </div>

        <div className="button-row">
          <button className="btn btn-ghost" onClick={() => setTrips(0)}>
            Clear trips
          </button>
          <button className="btn btn-primary" disabled={!affordable} onClick={() => game.placeBet(ante, trips)}>
            Deal — {total} out
          </button>
          <button className="btn btn-ghost" onClick={() => game.sitOut()}>
            Sit out
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------- decisions

  if (pending.type === 'awaitDecision') {
    const hole = seat.hand!.cards
    const advice = coach ? adviceFor(game, pending) : null

    return (
      <div className="controls">
        <div className="uth-street">
          {pending.street === 'preflop' && 'Pre-flop — you may raise 4×, or check to see the flop.'}
          {pending.street === 'flop' && 'The flop — raise 2×, or check to the river.'}
          {pending.street === 'river' && 'The river — make the 1× play bet, or fold and give up the ante and blind.'}
        </div>

        {advice && (
          <div className="coach">
            Book says <b>{advice.label}</b>. {advice.why}
          </div>
        )}

        <div className="button-row button-row-actions">
          {pending.actions.map((action) => (
            <button
              key={action}
              className={`btn btn-action${action.startsWith('bet') ? ' btn-primary' : action === 'fold' ? ' btn-fold' : ''}`}
              onClick={() => game.decide(action)}
            >
              {ACTION_LABEL[action]}
              <span className="key">{ACTION_KEY[action]}</span>
            </button>
          ))}
        </div>
        {/* keep hole referenced so lint is happy about the coach path */}
        <span hidden>{hole.length}</span>
      </div>
    )
  }

  return (
    <div className="controls controls-idle">
      <span className="dealing">…</span>
    </div>
  )
}

const ACTION_LABEL: Record<UthAction, string> = {
  check: 'Check',
  bet4: 'Raise 4×',
  bet2: 'Raise 2×',
  bet1: 'Play 1×',
  fold: 'Fold',
}

const ACTION_KEY: Record<UthAction, string> = {
  check: 'C',
  bet4: 'B',
  bet2: 'B',
  bet1: 'B',
  fold: 'F',
}

function bigBet(actions: UthAction[]): UthAction {
  return actions.find((a) => a.startsWith('bet')) ?? 'check'
}

function adviceFor(game: UthGame, pending: Extract<Beat, { type: 'awaitDecision' }>) {
  const hole = game.human.hand!.cards
  if (pending.street === 'preflop') {
    const raise = preflopRaise(hole)
    return {
      label: raise ? 'raise 4×' : 'check',
      why: raise ? 'Strong enough to get four units in now.' : 'Not worth 4× — see a cheap flop.',
    }
  }
  if (pending.street === 'flop') {
    const raise = flopRaise(hole, game.board.slice(0, 3))
    return {
      label: raise ? 'raise 2×' : 'check',
      why: raise ? 'You have a pair that plays, or a strong draw.' : 'Nothing yet — check to the river.',
    }
  }
  const raise = riverRaise(hole, game.board)
  return {
    label: raise ? 'play 1×' : 'fold',
    why: raise ? 'You beat enough of the dealer’s hands to bet.' : 'Too weak — save the play bet.',
  }
}
