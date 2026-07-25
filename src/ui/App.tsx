import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { BOT_ROSTER } from '../content/bots'
import { DEFAULT_RULES } from '../engine/rules'
import { randomSeed } from '../engine/rng'
import { Game, type Beat } from '../engine/table'
import type { RuleSet } from '../engine/types'
import { Controls } from './Controls'
import { GamePicker } from './GamePicker'
import { Settings } from './Settings'
import { TableView } from './Table'
import { WinToast } from './WinToast'

const STARTING_BANKROLL = 1000
const HUMAN_SEAT = 2

/** Casino pacing. The engine has no clock of its own — this is the clock. */
const BEAT_MS: Partial<Record<Beat['type'], number>> = {
  shuffle: 900,
  bet: 180,
  sitOut: 120,
  deal: 240,
  insurance: 500,
  evenMoney: 500,
  peek: 450,
  action: 550,
  revealHole: 650,
  dealerDraw: 600,
  settle: 2600, // long enough to read the outcomes before the table clears
  roundOver: 200,
}

interface Config {
  rules: RuleSet
  bots: number
}

/** Everything the player owns when the table closes: chips in the rack, plus any
 *  wager still live in the betting circle. A hand that has already been settled
 *  is NOT refunded — its money is back in the bankroll, and handing the bet back
 *  as well would mint chips out of nothing. */
function cashOut(game: Game): number {
  const seat = game.human
  const live = seat.hands.reduce((total, hand) => total + (hand.outcome ? 0 : hand.bet), 0)
  const insurance = seat.insuranceReturned === undefined ? seat.insurance : 0
  return seat.bankroll + live + insurance
}

function makeGame(config: Config, bankroll: number): Game {
  return new Game({
    rules: config.rules,
    seed: randomSeed(),
    humanSeat: HUMAN_SEAT,
    humanName: 'You',
    humanBankroll: bankroll,
    bots: BOT_ROSTER.slice(0, config.bots).map((b) => ({
      name: b.name,
      profile: b.profile,
      bankroll: b.bankroll,
    })),
  })
}

export function BlackjackScreen() {
  const [config, setConfig] = useState<Config>({ rules: DEFAULT_RULES, bots: 4 })
  const [game, setGame] = useState(() => makeGame({ rules: DEFAULT_RULES, bots: 4 }, STARTING_BANKROLL))
  const [showSettings, setShowSettings] = useState(false)
  const [coach, setCoach] = useState(false)
  const [showCount, setShowCount] = useState(false)
  const [lastBeat, setLastBeat] = useState<Beat | null>(null)

  // The engine is the source of truth; React just watches its version counter.
  useSyncExternalStore(game.subscribe, game.getVersion)

  const pending = game.pending()

  // --- the clock -----------------------------------------------------------
  //
  // Whenever the engine is not waiting on the player, step it forward after a
  // pause sized to whatever just happened. This is the only timing in the app.
  useEffect(() => {
    if (pending) return
    const wait = BEAT_MS[lastBeat?.type ?? 'deal'] ?? 300
    const timer = setTimeout(() => setLastBeat(game.step()), wait)
    return () => clearTimeout(timer)
    // game.version is what actually advances this; pending and lastBeat follow.
  }, [game, game.version, pending, lastBeat])

  const applyRules = useCallback(
    (rules: RuleSet, bots: number) => {
      setConfig({ rules, bots })
      // A rules change closes the table and opens a new one. You keep your money
      // — including anything already out in the betting circle, which the house
      // pushes back to you rather than keeping.
      setGame(makeGame({ rules, bots }, cashOut(game)))
      setLastBeat(null)
    },
    [game],
  )

  const rebuy = useCallback(() => {
    setGame(makeGame(config, STARTING_BANKROLL))
    setLastBeat(null)
  }, [config])

  const broke = game.human.bankroll < game.rules.minBet && game.phase === 'betting'

  const log = useMemo(() => game.log.slice(-7).reverse(), [game.log, game.version])

  // The round's net across every hand the human played, plus insurance.
  const settled = game.phase === 'settled'
  const winNet = settled
    ? game.human.hands.reduce((sum, hand) => sum + ((hand.returned ?? 0) - hand.bet), 0) +
      ((game.human.insuranceReturned ?? 0) - game.human.insurance)
    : 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <GamePicker
            rules={config.rules}
            onPick={(rules) => applyRules(rules, config.bots)}
            onOpenRules={() => setShowSettings(true)}
          />
        </div>

        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.human.bankroll.toLocaleString()}</b>
          </span>

          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((c) => !c)}
            title="Show what basic strategy would do"
          >
            Coach
          </button>
          <button
            className={`btn btn-ghost${showCount ? ' btn-on' : ''}`}
            onClick={() => setShowCount((c) => !c)}
            title="Show the running Hi-Lo count"
          >
            Count
          </button>
          <button className="btn btn-ghost" onClick={() => setShowSettings((s) => !s)}>
            Rules
          </button>
        </div>
      </header>

      <WinToast net={winNet} token={settled ? `bj-${game.round}` : 'bj-live'} />

      <main className="main">
        <TableView game={game} showCount={showCount} />

        <div className="tray">
          {broke ? (
            <div className="controls">
              <div className="prompt">
                <b>You're out of chips.</b> That is how the maths works out, given long enough.
              </div>
              <div className="button-row">
                <button className="btn btn-primary" onClick={rebuy}>
                  Buy in for {STARTING_BANKROLL}
                </button>
              </div>
            </div>
          ) : (
            <Controls game={game} pending={pending} coach={coach} />
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

      {showSettings && (
        <>
          <div className="scrim" onClick={() => setShowSettings(false)} />
          <Settings
            rules={config.rules}
            seats={config.bots}
            onApply={applyRules}
            onClose={() => setShowSettings(false)}
          />
        </>
      )}
    </>
  )
}
