import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { CrapsGame, type Point } from '../../craps/engine'
import { WinToast } from '../WinToast'

const START = 500
const CHIPS = [5, 25, 100]
const BOX: Point[] = [4, 5, 6, 8, 9, 10]
const BOX_LABEL: Record<Point, string> = { 4: '4', 5: '5', 6: 'SIX', 8: '8', 9: 'NINE', 10: '10' }

function Pip({ n }: { n: number }) {
  const on: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  }
  const set = new Set(on[n] ?? [])
  return (
    <div className="die">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`die-pip${set.has(i) ? ' die-pip-on' : ''}`} />
      ))}
    </div>
  )
}

function Chip({ amount, kind = 'flat' }: { amount: number; kind?: 'flat' | 'odds' | 'come' | 'dc' }) {
  if (!amount) return null
  return <span className={`cr2-chip cr2-chip-${kind}`}>{amount}</span>
}

export function CrapsScreen() {
  const [game, setGame] = useState(() => new CrapsGame({ seed: randomSeed(), bankroll: START }))
  useSyncExternalStore(game.subscribe, game.getVersion)

  const [rolling, setRolling] = useState(false)
  useEffect(() => {
    if (!rolling) return
    const t = window.setTimeout(() => setRolling(false), 550)
    return () => window.clearTimeout(t)
  }, [rolling])

  const rebuy = useCallback(() => setGame(new CrapsGame({ seed: randomSeed(), bankroll: START })), [])
  const roll = useCallback(() => {
    if (!game.canRoll()) return
    game.roll()
    setRolling(true)
  }, [game])

  const b = game.bets
  const dice = game.lastRoll
  const res = game.lastResolution
  const broke = game.bankroll < 5 && game.atRisk === 0
  const onPoint = game.phase === 'point'

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Craps</span>
          <span className={`cr-puck${onPoint ? ' cr-puck-on' : ''}`}>{onPoint ? `POINT ${game.point}` : 'COME OUT'}</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={res && !rolling ? res.net : 0} token={`cr-${game.rolls}`} />

      <main className="main">
        <div className="cr">
          <div className="cr-dice-area">
            {dice ? (
              <>
                <div className={rolling ? 'cr-tumble' : undefined}>
                  <Pip n={dice.a} />
                </div>
                <div className={rolling ? 'cr-tumble cr-tumble-b' : undefined}>
                  <Pip n={dice.b} />
                </div>
                <div className="cr-roll-total">
                  <b>{dice.total}</b>
                  {res && !rolling && (
                    <span className={`cr-net${res.net >= 0 ? ' rl-up' : ' rl-down'}`}>
                      {res.net >= 0 ? `+${res.net}` : res.net}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="cr-prompt">Place your bets and roll.</span>
            )}
          </div>

          {res && !rolling && res.notes.length > 0 && <div className="cr-notes">{res.notes.join(' · ')}</div>}

          {/* The felt, laid out the way a craps table reads. */}
          <div className="cr2 felt">
            <div className="cr2-top">
              <button
                className="cr2-cell cr2-dc"
                disabled={!onPoint}
                onClick={() => game.betDontCome()}
                title="Don't Come"
              >
                <span className="cr2-cap">DON'T COME</span>
                <span className="cr2-bar">Bar 12</span>
                <Chip amount={b.dontComeFlat} kind="dc" />
              </button>

              <div className="cr2-boxes">
                {BOX.map((n) => {
                  const come = b.come.get(n)
                  const isPoint = onPoint && game.point === n
                  return (
                    <button
                      key={n}
                      className={`cr2-box${isPoint ? ' cr2-box-point' : ''}`}
                      onClick={() => game.placeBet(n)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (come) game.addOdds(n)
                      }}
                      title={`Place ${n} · right-click adds odds to a come point`}
                    >
                      {isPoint && <span className="cr2-puck">ON</span>}
                      <span className="cr2-box-num">{BOX_LABEL[n]}</span>
                      <span className="cr2-box-chips">
                        <Chip amount={b.place.get(n) ?? 0} />
                        {come && <Chip amount={come.amount + come.odds} kind="come" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button className="cr2-cell cr2-come" disabled={!onPoint} onClick={() => game.betCome()}>
              <span className="cr2-cap-big">COME</span>
              <Chip amount={b.comeFlat} kind="come" />
            </button>

            <button className="cr2-cell cr2-field" onClick={() => game.betField()}>
              <span className="cr2-cap">FIELD</span>
              <span className="cr2-field-nums">2 · 3 · 4 · 9 · 10 · 11 · 12</span>
              <span className="cr2-field-note">2 and 12 pay double</span>
              <Chip amount={b.field} />
            </button>

            <div className="cr2-line-row">
              <button
                className="cr2-cell cr2-dontpass"
                disabled={onPoint || !!b.dontPass}
                onClick={() => game.betDontPass()}
              >
                <span className="cr2-cap">DON'T PASS BAR</span>
                <Chip amount={b.dontPass?.amount ?? 0} kind="dc" />
                <Chip amount={b.dontPass?.odds ?? 0} kind="odds" />
              </button>
            </div>

            <div className="cr2-line-row">
              <button className="cr2-cell cr2-pass" disabled={onPoint || !!b.pass} onClick={() => game.betPass()}>
                <span className="cr2-cap-big">PASS LINE</span>
                <Chip amount={b.pass?.amount ?? 0} />
                <Chip amount={b.pass?.odds ?? 0} kind="odds" />
              </button>
              <button
                className="cr2-cell cr2-oddsbox"
                disabled={!onPoint || !(b.pass || b.dontPass)}
                onClick={() => game.addOdds(b.pass ? 'pass' : 'dontPass')}
                title="Back the line with true-odds"
              >
                <span className="cr2-cap">ODDS</span>
              </button>
            </div>
          </div>

          <div className="cr-controls">
            <div className="rl-chips">
              {CHIPS.map((v) => (
                <button
                  key={v}
                  className={`vp-coin${game.chip === v ? ' vp-coin-on' : ''}`}
                  onClick={() => game.setChip(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="rl-actions">
              <span className="rl-staked">At risk: {game.atRisk}</span>
              {!onPoint && (
                <button className="btn btn-ghost" onClick={() => game.clearBets()} disabled={game.atRisk === 0}>
                  Clear
                </button>
              )}
              {broke ? (
                <button className="btn btn-primary" onClick={rebuy}>
                  Buy in for {START}
                </button>
              ) : (
                <button className="btn btn-primary btn-big" disabled={!game.canRoll() || rolling} onClick={roll}>
                  {rolling ? 'Rolling…' : 'Roll'}
                </button>
              )}
            </div>
          </div>

          <div className="rl-board">
            {game.history.map((t, i) => (
              <span key={`${game.rolls}-${i}`} className="cr-hist">
                {t}
              </span>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
