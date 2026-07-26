import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { windowOf } from '../../slots/evaluate'
import { SlotGame } from '../../slots/machine'
import { MACHINES } from '../../slots/machines'
import { exactBaseReturn } from '../../slots/rtp'
import type { Machine, Step, SymbolId } from '../../slots/types'
import { WinToast } from '../WinToast'

const START = 500

/** How long each screen of a cascade chain stays up. Long enough to read, short
 *  enough that an eight-step chain doesn't outstay its welcome. */
const STEP_MS = 620

function symbolClass(machine: Machine, id: SymbolId): string {
  const sym = machine.symbols.find((s) => s.id === id)
  if (!sym) return 'sl-sym'
  if (sym.wild) return 'sl-sym sl-sym-wild'
  if (sym.scatter) return 'sl-sym sl-sym-scatter'
  if (!sym.label) return 'sl-sym sl-sym-blank'
  return 'sl-sym'
}

function Reels({
  machine,
  step,
  spinning,
}: {
  machine: Machine
  step: Step | null
  spinning: boolean
}) {
  const lit = new Set<string>()
  if (step) for (const w of step.wins) for (const [r, c] of w.cells) lit.add(`${r},${c}`)

  // At rest a cabinet shows symbols, not empty glass — park every reel at its
  // first stop rather than painting blanks.
  const window = step?.window ?? windowOf(machine.strips, machine.strips.map(() => 0), machine.rows)

  return (
    <div className={`sl-reels${spinning ? ' sl-reels-spinning' : ''}`}>
      {window.map((col, reel) => (
        <div className="sl-reel" key={reel}>
          {col.map((id, row) => {
            const sym = machine.symbols.find((s) => s.id === id)
            const on = lit.has(`${reel},${row}`)
            return (
              <div
                className={`${symbolClass(machine, id)}${on ? ' sl-sym-win' : ''}`}
                key={`${reel}-${row}-${id}`}
              >
                {sym?.label ?? id}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PayTable({ machine, coins }: { machine: Machine; coins: number }) {
  const rows = Object.entries(machine.linePays)
    .map(([id, pays]) => {
      const best = pays.reduce((m, p, i) => (p > 0 ? i : m), 0)
      return { id, pays, best, top: pays[best] ?? 0 }
    })
    .sort((a, b) => b.top - a.top)

  return (
    <div className="sl-paytable">
      <div className="sl-paytable-head">Line pays — per coin, {coins} on</div>
      {rows.map(({ id, pays }) => {
        const sym = machine.symbols.find((s) => s.id === id)
        return (
          <div className="sl-pay-row" key={id}>
            <span className={symbolClass(machine, id)}>{sym?.label ?? id}</span>
            <span className="sl-pay-vals">
              {pays
                .map((p, n) => (p > 0 ? `${n}: ${p * coins}` : null))
                .filter(Boolean)
                .join('   ')}
            </span>
          </div>
        )
      })}

      {machine.scatterPays &&
        Object.entries(machine.scatterPays).map(([id, schedule]) => {
          const sym = machine.symbols.find((s) => s.id === id)
          return (
            <div className="sl-pay-scatter" key={id}>
              <div className="sl-paytable-head">
                {sym?.label ?? id} anywhere — × total bet
              </div>
              <div className="sl-pay-vals">
                {Object.entries(schedule)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([n, p]) => `${n}: ${p}×`)
                  .join('   ')}
              </div>
            </div>
          )
        })}
    </div>
  )
}

export function SlotsScreen() {
  const [machine, setMachine] = useState<Machine>(MACHINES[0])
  const [game, setGame] = useState(
    () => new SlotGame({ machine: MACHINES[0], seed: randomSeed(), bankroll: START }),
  )
  const [stepIndex, setStepIndex] = useState(0)
  useSyncExternalStore(game.subscribe, game.getVersion)

  const steps = game.result?.steps ?? []
  const showing = steps[Math.min(stepIndex, steps.length - 1)] ?? null
  const running = stepIndex < steps.length - 1

  // Walk the chain a screen at a time. A machine with no cascade resolves to a
  // single step, so this fires once and stops.
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => setStepIndex((i) => i + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [running, stepIndex, game.round])

  const pick = useCallback(
    (id: string) => {
      const next = MACHINES.find((m) => m.id === id) ?? MACHINES[0]
      setMachine(next)
      game.setMachine(next)
      setStepIndex(0)
    },
    [game],
  )

  const spin = useCallback(() => {
    game.spin()
    setStepIndex(0)
  }, [game])

  const rebuy = useCallback(() => {
    const g = new SlotGame({ machine, seed: randomSeed(), bankroll: START })
    g.setCoinsPerLine(game.coinsPerLine)
    setGame(g)
    setStepIndex(0)
  }, [machine, game.coinsPerLine])

  // The exact base return is cheap for small strips and expensive for big ones;
  // it never changes for a given machine, so compute it once.
  const baseReturn = useMemo(() => exactBaseReturn(machine), [machine])

  const broke = game.bankroll < game.totalBet()
  const result = game.result
  const net = result && !running ? result.paid - result.staked : 0
  const freeSpins = result?.freeSpinsAwarded ?? 0
  const chain = steps.filter((s) => !s.free).length

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <select className="sl-picker" value={machine.id} onChange={(e) => pick(e.target.value)}>
            {MACHINES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {(m.targetRtp * 100).toFixed(1)}%
              </option>
            ))}
          </select>
          <span className="sl-blurb">{machine.blurb}</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Credits</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={net} token={running ? 'sl-live' : `sl-${game.round}`} />

      <main className="main">
        <div className="sl">
          <p className="sl-note">{machine.note}</p>

          <div className="sl-cabinet">
            <PayTable machine={machine} coins={game.coinsPerLine} />

            <div className="sl-screen">
              <Reels machine={machine} step={showing} spinning={running} />

              <div className="sl-readout">
                {showing && showing.multiplier > 1 && (
                  <span className="sl-mult">×{showing.multiplier}</span>
                )}
                {showing?.free && <span className="sl-free">Free game</span>}
                {result && !running ? (
                  net > 0 ? (
                    <span className="sl-win">
                      Win {result.paid.toLocaleString()}
                      {chain > 1 ? ` — ${chain} drops` : ''}
                      {freeSpins > 0 ? ` — ${freeSpins} free games` : ''}
                    </span>
                  ) : (
                    <span className="sl-prompt">No win. Spin again.</span>
                  )
                ) : (
                  <span className="sl-prompt">
                    {running ? 'Cascading…' : 'Pick a machine, set your bet, and spin.'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="sl-controls">
            <div className="sl-coins">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`sl-coin${game.coinsPerLine === n ? ' sl-coin-on' : ''}`}
                  disabled={running}
                  onClick={() => game.setCoinsPerLine(n)}
                >
                  {n}
                </button>
              ))}
              <span className="sl-coin-label">per line</span>
            </div>

            <div className="sl-bet">
              <span className="sl-bet-label">Total bet</span>
              <b>{game.totalBet()}</b>
              <span className="sl-bet-lines">
                {machine.lines.length} line{machine.lines.length === 1 ? '' : 's'}
              </span>
            </div>

            {broke ? (
              <button className="btn btn-primary btn-big" onClick={rebuy}>
                Buy in for {START}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-big"
                disabled={running || !game.canSpin()}
                onClick={spin}
              >
                Spin
              </button>
            )}
          </div>

          <p className="sl-truth">
            This machine's base game returns <b>{(baseReturn * 100).toFixed(2)}%</b> of every
            coin staked, computed exactly from its reel strips — not sampled, and not a
            guess. It was cut to {(machine.targetRtp * 100).toFixed(1)}%
            {machine.feature.kind === 'none'
              ? '.'
              : ', the rest coming from the feature. Run `npm run slots:rtp` to check it.'}
          </p>
        </div>
      </main>
    </>
  )
}
