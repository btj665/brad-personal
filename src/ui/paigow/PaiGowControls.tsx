import { useEffect, useMemo, useState } from 'react'

import { CATEGORY_NAME, compare, score2, score5 } from '../../poker/eval'
import type { Beat, PaiGowGame } from '../../paigow/engine'
import { PlayingCard } from '../Card'
import { Chip } from '../Chips'

const OPTS = { wheelHigh: true }

export function PaiGowControls({ game, pending }: { game: PaiGowGame; pending: Beat | null }) {
  const rules = game.rules
  const seat = game.human
  const [bet, setBet] = useState(rules.minBet)
  const [fortune, setFortune] = useState(0)
  const [low, setLow] = useState<number[]>([])

  useEffect(() => {
    setBet(Math.max(rules.minBet, Math.min(bet, rules.maxBet)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules.minBet, rules.maxBet])

  // Reset the arrangement when a new hand is dealt.
  useEffect(() => {
    if (pending?.type === 'awaitSet') setLow([])
  }, [pending?.type, game.round])

  if (!pending) {
    return (
      <div className="controls controls-idle">
        <span className="dealing">Dealing…</span>
      </div>
    )
  }

  // ---------------------------------------------------------------- betting

  if (pending.type === 'awaitBet') {
    const total = bet + fortune
    const ok = total <= seat.bankroll && bet >= rules.minBet && bet <= rules.maxBet

    return (
      <div className="controls">
        <div className="uth-bet-grid">
          <div className="uth-bet-field">
            <span className="bet-label">Your bet</span>
            <div className="uth-stepper">
              <button className="btn" onClick={() => setBet((b) => Math.max(rules.minBet, b - rules.minBet))}>
                −
              </button>
              <b>{bet}</b>
              <button className="btn" onClick={() => setBet((b) => Math.min(rules.maxBet, b + rules.minBet))}>
                +
              </button>
            </div>
            <span className="bet-limits">
              {rules.minBet}–{rules.maxBet.toLocaleString()}
            </span>
          </div>

          <div className="uth-bet-field">
            <span className="bet-label">Fortune (optional)</span>
            <div className="chip-tray">
              <Chip value={0} size={34} onClick={() => setFortune(0)} label="No fortune" />
              {rules.chips.slice(0, 3).map((v) => (
                <Chip key={v} value={v} size={34} onClick={() => setFortune((f) => f + v)} />
              ))}
            </div>
            <span className="bet-limits">Fortune: {fortune}</span>
          </div>
        </div>

        <div className="button-row">
          <button className="btn btn-ghost" onClick={() => setFortune(0)}>
            Clear fortune
          </button>
          <button className="btn btn-primary" disabled={!ok} onClick={() => game.placeBet(bet, fortune)}>
            Deal
          </button>
          <button className="btn btn-ghost" onClick={() => game.sitOut()}>
            Sit out
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- setting

  if (pending.type === 'awaitSet') {
    return <SetControls game={game} low={low} setLow={setLow} />
  }

  return (
    <div className="controls controls-idle">
      <span className="dealing">…</span>
    </div>
  )
}

function SetControls({
  game,
  low,
  setLow,
}: {
  game: PaiGowGame
  low: number[]
  setLow: (u: number[]) => void
}) {
  const cards = game.human.hand!.cards
  const suggestion = useMemo(() => game.suggestion(), [game, game.round])

  const toggle = (uid: number) => {
    if (low.includes(uid)) setLow(low.filter((u) => u !== uid))
    else if (low.length < 2) setLow([...low, uid])
  }

  const lowCards = cards.filter((c) => low.includes(c.uid))
  const highCards = cards.filter((c) => !low.includes(c.uid))
  const complete = low.length === 2
  const highScore = complete ? score5(highCards, OPTS) : null
  const lowScore = complete ? score2(lowCards, OPTS) : null
  const foul = highScore && lowScore ? compare(highScore, lowScore) < 0 : false

  return (
    <div className="controls">
      <div className="uth-street">
        Set your hand: pick <b>two cards</b> for the low hand. The other five are the high hand,
        which must be the stronger of the two.
      </div>

      <div className="pg-setter">
        {cards.map((card) => (
          <button
            key={card.uid}
            className={`pg-pick${low.includes(card.uid) ? ' pg-pick-low' : ''}`}
            onClick={() => toggle(card.uid)}
          >
            <PlayingCard card={card} />
            <span className="pg-pick-tag">{low.includes(card.uid) ? 'Low' : 'High'}</span>
          </button>
        ))}
      </div>

      <div className="pg-setter-status">
        {complete ? (
          foul ? (
            <span className="pg-foul">
              Foul — the low hand ({CATEGORY_NAME[lowScore!.category]}) outranks the high hand. Try
              again.
            </span>
          ) : (
            <span className="pg-ok">
              High: {CATEGORY_NAME[highScore!.category]} · Low: {CATEGORY_NAME[lowScore!.category]}
            </span>
          )
        ) : (
          <span className="pg-hint">{2 - low.length} more to pick for the low hand.</span>
        )}
      </div>

      <div className="button-row">
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (suggestion) setLow(suggestion.low.map((c) => c.uid))
          }}
        >
          Show house way
        </button>
        <button className="btn" onClick={() => game.acceptHouseWay()}>
          Play house way
        </button>
        <button
          className="btn btn-primary"
          disabled={!complete || foul}
          onClick={() => game.setLow([low[0], low[1]] as [number, number])}
        >
          Set it
        </button>
      </div>
    </div>
  )
}
