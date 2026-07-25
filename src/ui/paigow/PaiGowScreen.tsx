import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { PaiGowGame, type Beat } from '../../paigow/engine'
import { WinToast } from '../WinToast'
import { PaiGowControls } from './PaiGowControls'
import { PaiGowTable } from './PaiGowTable'

const START = 1000
const HUMAN = 1
const BOT_NAMES = ['Guo', 'Renata', 'Sax']

const BEAT_MS: Partial<Record<Beat['type'], number>> = {
  bet: 200,
  sitOut: 140,
  deal: 600,
  set: 320,
  reveal: 700,
  settle: 2600,
  roundOver: 200,
}

function make(bankroll: number, autoSet: boolean): PaiGowGame {
  const game = new PaiGowGame({
    seed: randomSeed(),
    humanSeat: HUMAN,
    humanName: 'You',
    humanBankroll: bankroll,
    bots: BOT_NAMES.map((name) => ({ name, bankroll: 1500 })),
  })
  game.human.autoSet = autoSet
  return game
}

export function PaiGowScreen() {
  const [autoSet, setAutoSet] = useState(false)
  const [game, setGame] = useState(() => make(START, false))
  const [lastBeat, setLastBeat] = useState<Beat | null>(null)

  useSyncExternalStore(game.subscribe, game.getVersion)
  const pending = game.pending()

  // Keep the live game's autoSet flag in step with the toggle.
  useEffect(() => {
    game.human.autoSet = autoSet
  }, [game, autoSet])

  useEffect(() => {
    if (pending) return
    const wait = BEAT_MS[lastBeat?.type ?? 'deal'] ?? 300
    const timer = setTimeout(() => setLastBeat(game.step()), wait)
    return () => clearTimeout(timer)
  }, [game, game.version, pending, lastBeat])

  const rebuy = useCallback(() => {
    setGame(make(START, autoSet))
    setLastBeat(null)
  }, [autoSet])

  const broke = game.human.bankroll < game.rules.minBet && game.phase === 'betting'
  const log = useMemo(() => game.log.slice(-7).reverse(), [game.log, game.version])

  // Net for the round = main hand plus the Fortune side bet.
  const settled = game.phase === 'settled'
  const h = game.human.hand
  const winNet =
    settled && h?.outcome !== undefined
      ? (h.returned ?? 0) - h.bet + (h.fortuneReturned ?? 0) - h.fortune
      : 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Pai Gow Poker</span>
          <label className="pg-auto">
            <input type="checkbox" checked={autoSet} onChange={(e) => setAutoSet(e.target.checked)} />
            Set for me (house way)
          </label>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.human.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={winNet} token={settled ? `pg-${game.round}` : 'pg-live'} />

      <main className="main">
        <PaiGowTable game={game} />

      <div className="tray">
        {broke ? (
          <div className="controls">
            <div className="prompt">
              <b>Out of chips.</b> Slow bleed — but a bleed all the same.
            </div>
            <div className="button-row">
              <button className="btn btn-primary" onClick={rebuy}>
                Buy in for {START}
              </button>
            </div>
          </div>
        ) : (
          <PaiGowControls game={game} pending={pending} />
        )}

        <ul className="log">
          {log.map((entry, i) => (
            <li key={`${game.version}-${i}`} className={i === 0 ? 'log-fresh' : undefined}>
              {entry.text}
            </li>
          ))}
        </ul>
      </div>
      </main>
    </>
  )
}
