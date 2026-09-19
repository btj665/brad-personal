import { useEffect, useMemo, useState } from 'react'

import type { PokerGame } from '../../pokerroom/engine'
import type { Beat, Options } from '../../pokerroom/types'
import { PlayingCard } from '../Card'

/** Round a chip amount to the nearest small blind, then keep it legal. Keeps the
 *  slider and the quick buttons landing on tidy numbers a dealer would call. */
function tidy(value: number, step: number, lo: number, hi: number): number {
  const snapped = Math.round(value / step) * step
  return Math.max(lo, Math.min(snapped, hi))
}

function RaiseControls({ game, opt }: { game: PokerGame; opt: Options }) {
  const step = Math.max(1, game.smallBlind)
  const { minTo, maxTo, callAmount } = opt
  const [to, setTo] = useState(minTo)

  // A new turn (or a raise that moved the floor) resets the slider to the minimum.
  useEffect(() => {
    setTo(minTo)
  }, [minTo, maxTo])

  const canSize = maxTo > minTo || (opt.canBet && maxTo >= minTo && maxTo > 0)
  const potRaise = game.currentBet + game.pot + callAmount

  const quicks = useMemo(
    () =>
      [
        { key: 'min', label: 'Min', to: minTo },
        { key: 'half', label: '½ Pot', to: tidy(game.currentBet + (game.pot + callAmount) / 2, step, minTo, maxTo) },
        { key: 'pot', label: 'Pot', to: tidy(potRaise, step, minTo, maxTo) },
        { key: 'allin', label: 'All-in', to: maxTo },
      ].filter((q, i, all) => all.findIndex((x) => x.to === q.to) === i),
    [game.currentBet, game.pot, callAmount, minTo, maxTo, step, potRaise],
  )

  const verb = opt.canBet ? 'Bet' : 'Raise to'
  const commit = () =>
    game.act({ kind: opt.canBet ? 'bet' : 'raise', to: tidy(to, step, minTo, maxTo) })

  return (
    <div className="pk-raise">
      <div className="pk-raise-head">
        <span className="pk-raise-label">{verb}</span>
        <span className="pk-raise-amount">{to.toLocaleString()}</span>
      </div>

      <input
        className="pk-slider"
        type="range"
        min={minTo}
        max={maxTo}
        step={step}
        value={to}
        disabled={!canSize}
        onChange={(e) => setTo(Number(e.target.value))}
        aria-label="Bet amount"
      />

      <div className="pk-quicks">
        {quicks.map((q) => (
          <button
            key={q.key}
            className={`btn pk-quick${to === q.to ? ' btn-on' : ''}`}
            disabled={q.to < minTo || q.to > maxTo}
            onClick={() => setTo(q.to)}
          >
            {q.label}
          </button>
        ))}
      </div>

      <button className="btn btn-primary btn-action pk-commit" disabled={!canSize} onClick={commit}>
        {verb} {to.toLocaleString()}
      </button>
    </div>
  )
}

function DrawControls({ game }: { game: PokerGame }) {
  const seat = game.human
  const [picked, setPicked] = useState<Set<number>>(new Set())

  useEffect(() => {
    setPicked(new Set())
  }, [game.version])

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="controls pk-controls">
      <div className="prompt">
        <b>Your draw.</b> Tap the cards to discard, then confirm.
      </div>
      <div className="pk-draw-hand">
        {seat.cards.map((held, i) => (
          <button
            key={held.card.uid}
            className={`pk-draw-card${picked.has(i) ? ' pk-draw-picked' : ''}`}
            onClick={() => toggle(i)}
            aria-pressed={picked.has(i)}
          >
            <PlayingCard card={held.card} />
          </button>
        ))}
      </div>
      <div className="button-row button-row-actions">
        <button className="btn btn-primary btn-action" onClick={() => game.applyDraw([...picked])}>
          {picked.size === 0 ? 'Stand pat' : `Draw ${picked.size}`}
        </button>
      </div>
    </div>
  )
}

export function BetControls({ game, pending }: { game: PokerGame; pending: Beat | null }) {
  if (pending?.type === 'awaitDraw') return <DrawControls game={game} />

  if (pending?.type !== 'awaitAction') {
    return (
      <div className="controls controls-idle pk-controls">
        <span className="dealing">Action on the table…</span>
      </div>
    )
  }

  const opt = pending.options
  const showRaise = opt.canBet || opt.canRaise

  return (
    <div className="controls pk-controls">
      <div className="pk-actions">
        {opt.canFold && (
          <button className="btn btn-fold btn-action" onClick={() => game.act({ kind: 'fold' })}>
            Fold
          </button>
        )}
        {opt.canCheck ? (
          <button className="btn btn-action" onClick={() => game.act({ kind: 'check' })}>
            Check
          </button>
        ) : (
          <button className="btn btn-action" onClick={() => game.act({ kind: 'call' })}>
            Call {opt.callAmount.toLocaleString()}
          </button>
        )}
      </div>

      {showRaise && <RaiseControls game={game} opt={opt} />}
    </div>
  )
}
