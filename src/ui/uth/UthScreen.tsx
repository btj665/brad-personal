import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { UthGame, type Beat } from '../../uth/engine'
import { WinToast } from '../WinToast'
import { UthControls } from './UthControls'
import { UthTable } from './UthTable'

const START = 1000
const HUMAN = 1
const BOT_NAMES = ['Vera', 'Sol', 'Marlow']

const BEAT_MS: Partial<Record<Beat['type'], number>> = {
  bet: 220,
  sitOut: 140,
  deal: 550,
  decision: 620,
  flop: 700,
  turnRiver: 800,
  reveal: 700,
  settle: 2600,
  roundOver: 200,
}

function make(bankroll: number): UthGame {
  return new UthGame({
    seed: randomSeed(),
    humanSeat: HUMAN,
    humanName: 'You',
    humanBankroll: bankroll,
    bots: BOT_NAMES.map((name) => ({ name, bankroll: 1500 })),
  })
}

export function UthScreen() {
  const [game, setGame] = useState(() => make(START))
  const [lastBeat, setLastBeat] = useState<Beat | null>(null)
  const [coach, setCoach] = useState(false)

  useSyncExternalStore(game.subscribe, game.getVersion)
  const pending = game.pending()

  useEffect(() => {
    if (pending) return
    const wait = BEAT_MS[lastBeat?.type ?? 'deal'] ?? 300
    const timer = setTimeout(() => setLastBeat(game.step()), wait)
    return () => clearTimeout(timer)
  }, [game, game.version, pending, lastBeat])

  const rebuy = useCallback(() => {
    setGame(make(START))
    setLastBeat(null)
  }, [])

  const broke = game.human.bankroll < game.rules.minBet * 2 && game.phase === 'betting'
  const log = useMemo(() => game.log.slice(-7).reverse(), [game.log, game.version])

  const settled = game.phase === 'settled'
  const winNet = settled ? game.human.hand?.payout?.net ?? 0 : 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Ultimate Texas Hold’em</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.human.bankroll.toLocaleString()}</b>
          </span>
          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((c) => !c)}
            title="Show the recommended play"
          >
            Coach
          </button>
        </div>
      </header>

      <WinToast net={winNet} token={settled ? `uth-${game.round}` : 'uth-live'} />

      <main className="main">
        <UthTable game={game} />

      <div className="tray">
        {broke ? (
          <div className="controls">
            <div className="prompt">
              <b>Out of chips.</b> The ante and the blind add up over a night.
            </div>
            <div className="button-row">
              <button className="btn btn-primary" onClick={rebuy}>
                Buy in for {START}
              </button>
            </div>
          </div>
        ) : (
          <UthControls game={game} pending={pending} coach={coach} />
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
