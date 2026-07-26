import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { windowOf } from '../../slots/evaluate'
import { SlotGame } from '../../slots/machine'
import { MACHINES } from '../../slots/machines'
import { exactBaseReturn } from '../../slots/rtp'
import type { Machine, Step, Win } from '../../slots/types'
import { Reels, rollDuration } from './Reels'
import { SlotArt } from './Symbols'

const START = 500

/** How long each winning line is held up on its own during the reveal, how long
 *  a crumbling screen takes to clear, and how long the replacements take to fall.
 *  Tuned so a long cascade chain still resolves in a few seconds. */
const LINE_MS = 620
const NO_WIN_MS = 260
const CRUMBLE_MS = 300
const DROP_MS = 340
const AUTO_GAP_MS = 420

type Phase = 'idle' | 'rolling' | 'reveal' | 'crumble' | 'drop'

const cellKey = (reel: number, row: number) => `${reel},${row}`

function cellsOf(wins: Win[]): Set<string> {
  const out = new Set<string>()
  for (const w of wins) for (const [reel, row] of w.cells) out.add(cellKey(reel, row))
  return out
}

/** A meter that rolls up to its target rather than snapping, the way the credit
 *  display on a cabinet does. Big wins take longer, but never more than a beat. */
function useRollup(target: number): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  const raf = useRef(0)

  useEffect(() => {
    const start = from.current
    if (start === target) return
    const distance = Math.abs(target - start)
    const ms = Math.min(900, 220 + distance * 4)
    const t0 = performance.now()

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      // Ease out, so it sprints then settles onto the number.
      const eased = 1 - Math.pow(1 - p, 3)
      const value = Math.round(start + (target - start) * eased)
      setShown(value)
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else from.current = target
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return shown
}

function PayTable({ machine, coins }: { machine: Machine; coins: number }) {
  const rows = Object.entries(machine.linePays)
    .map(([id, pays]) => ({ id, pays, top: Math.max(...pays) }))
    .sort((a, b) => b.top - a.top)

  return (
    <div className="sl-glass">
      <div className="sl-glass-head">Line pays · {coins} per line</div>
      <div className="sl-paylist">
        {rows.map(({ id, pays }) => (
          <div className="sl-payrow" key={id}>
            <span className="sl-payart">
              <SlotArt machine={machine.id} id={id} />
            </span>
            <span className="sl-paynums">
              {pays
                .map((p, n) => (p > 0 ? `${n}×${p * coins}` : null))
                .filter(Boolean)
                .join('  ')}
            </span>
          </div>
        ))}
      </div>

      {machine.scatterPays &&
        Object.entries(machine.scatterPays).map(([id, schedule]) => {
          const rungs = Object.entries(schedule)
            .map(([n, p]) => [Number(n), p] as const)
            .filter(([, p]) => p > 0)
            .sort((a, b) => a[0] - b[0])
          // The ladder carries entries past the point where it stops climbing, so
          // that "nine or more" is literally true and a future strip edit can't
          // silently pay zero for the best screen in the game. On the glass that
          // would just be the jackpot repeated, so it collapses to "9+".
          const top = Math.max(...rungs.map(([, p]) => p))
          const firstTop = rungs.find(([, p]) => p === top)?.[0] ?? 0
          return (
            <div className="sl-payscatter" key={id}>
              <div className="sl-glass-head">
                <span className="sl-payart sl-payart-inline">
                  <SlotArt machine={machine.id} id={id} />
                </span>
                anywhere · × total bet
              </div>
              <div className="sl-paynums">
                {rungs
                  .filter(([n]) => n <= firstTop)
                  .map(([n, p]) => `${n === firstTop ? `${n}+` : n}: ${p}×`)
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
  useSyncExternalStore(game.subscribe, game.getVersion)

  const [phase, setPhase] = useState<Phase>('idle')
  const [stepIndex, setStepIndex] = useState(0)
  /** Which of this step's wins is being shown on its own. */
  const [winIndex, setWinIndex] = useState(0)
  const [spinToken, setSpinToken] = useState(0)
  const [auto, setAuto] = useState(0)
  /** Paid so far this spin, for the win meter. */
  const [running, setRunning] = useState(0)

  const steps: Step[] = game.result?.steps ?? []
  const step: Step | null = steps[stepIndex] ?? null
  const busy = phase !== 'idle'

  const rest = useMemo(
    () => windowOf(machine.strips, machine.strips.map(() => 0), machine.rows),
    [machine],
  )
  const screen = step?.window ?? rest

  // --- the reveal walk -----------------------------------------------------
  //
  // A spin is already fully resolved by the engine; everything below is theatre.
  // Roll the reels, hold each winning line up in turn, then either collapse into
  // the next cascade screen or stop.

  useEffect(() => {
    if (phase !== 'rolling') return
    const t = setTimeout(() => {
      setPhase('reveal')
      setWinIndex(0)
    }, rollDuration(machine.strips.length))
    return () => clearTimeout(t)
  }, [phase, spinToken, machine.strips.length])

  useEffect(() => {
    if (phase !== 'reveal' || !step) return

    if (step.wins.length === 0) {
      const t = setTimeout(() => advance(), NO_WIN_MS)
      return () => clearTimeout(t)
    }
    if (winIndex === 0) setRunning((r) => r + step.paid)
    if (winIndex < step.wins.length) {
      // Twenty paylines means a good screen can pay six or eight of them at once.
      // Holding each for a full beat would take ten seconds, so the walk speeds up
      // as the win count climbs rather than testing anybody's patience.
      const many = step.wins.length
      const dwell = many > 6 ? 230 : many > 3 ? 390 : LINE_MS
      const t = setTimeout(() => setWinIndex((i) => i + 1), dwell)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => advance(), 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex, winIndex, step])

  useEffect(() => {
    if (phase !== 'crumble') return
    const t = setTimeout(() => {
      setStepIndex((i) => i + 1)
      setWinIndex(0)
      setPhase('drop')
    }, CRUMBLE_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'drop') return
    const t = setTimeout(() => setPhase('reveal'), DROP_MS)
    return () => clearTimeout(t)
  }, [phase, stepIndex])

  /** Leave the current step: collapse into the next one, spin fresh reels for it,
   *  or finish. */
  const advance = useCallback(() => {
    const next = steps[stepIndex + 1]
    if (!next) {
      setPhase('idle')
      return
    }
    if (next.spun) {
      // A free game, or the next paid screen: the reels turn again.
      setStepIndex((i) => i + 1)
      setWinIndex(0)
      setSpinToken((t) => t + 1)
      setPhase('rolling')
      return
    }
    setPhase(step && step.wins.length > 0 ? 'crumble' : 'drop')
    if (!step || step.wins.length === 0) {
      setStepIndex((i) => i + 1)
      setWinIndex(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, stepIndex, step])

  // --- input ---------------------------------------------------------------

  const spin = useCallback(() => {
    if (!game.canSpin()) return
    setRunning(0)
    game.spin()
    setStepIndex(0)
    setWinIndex(0)
    setSpinToken((t) => t + 1)
    setPhase('rolling')
  }, [game])

  // Autoplay just presses the button, so it can't diverge from hand play.
  useEffect(() => {
    if (phase !== 'idle' || auto <= 0) return
    if (!game.canSpin()) {
      setAuto(0)
      return
    }
    const t = setTimeout(() => {
      setAuto((n) => n - 1)
      spin()
    }, AUTO_GAP_MS)
    return () => clearTimeout(t)
  }, [phase, auto, spin, game])

  const pick = useCallback(
    (id: string) => {
      const next = MACHINES.find((m) => m.id === id) ?? MACHINES[0]
      setAuto(0)
      setMachine(next)
      game.setMachine(next)
      setStepIndex(0)
      setWinIndex(0)
      setRunning(0)
      setPhase('idle')
    },
    [game],
  )

  const rebuy = useCallback(() => {
    const g = new SlotGame({ machine, seed: randomSeed(), bankroll: START })
    g.setCoinsPerLine(game.coinsPerLine)
    setGame(g)
    setStepIndex(0)
    setRunning(0)
    setPhase('idle')
  }, [machine, game.coinsPerLine])

  // --- what to light -------------------------------------------------------

  const lit = useMemo(() => {
    if (!step || phase === 'rolling') return new Set<string>()
    if (phase === 'reveal' && step.wins.length > 0) {
      // Hold each line up on its own; once they've all been shown, light them all.
      const w = step.wins[winIndex]
      return w ? cellsOf([w]) : cellsOf(step.wins)
    }
    // A finished spin leaves its winners lit, the way a cabinet does — the result
    // stays readable until the next spin instead of going dark the moment the
    // reveal ends.
    if (phase === 'idle' || phase === 'crumble') return cellsOf(step.wins)
    return new Set<string>()
  }, [step, phase, winIndex])

  const crumbling = phase === 'crumble' && step ? cellsOf(step.wins) : new Set<string>()

  const credits = useRollup(game.bankroll)
  const baseReturn = useMemo(() => exactBaseReturn(machine), [machine])
  const broke = game.bankroll < game.totalBet()
  const showing = step?.wins[winIndex]
  const freeLeft = steps.slice(stepIndex).filter((s) => s.free).length

  // What the whole spin did, for the summary the machine rests on. A cascade's
  // last screen is barren by definition, so the total has to be attributed to the
  // spin rather than to whatever happens to be on the glass at the end.
  const paidSteps = steps.filter((s) => s.paid > 0)
  const linesPaid = paidSteps.reduce((n, s) => n + s.wins.length, 0)
  const chainLength = steps.filter((s) => !s.spun).length + 1
  const chainAt = Math.min(stepIndex + 1, chainLength)
  const freeSpinsThisSpin = game.result?.freeSpinsAwarded ?? 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <select
            className="sl-picker"
            value={machine.id}
            disabled={busy}
            onChange={(e) => pick(e.target.value)}
          >
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
            <b>{credits.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <main className="main">
        <div className={`sl sl-${machine.id}`}>
          <div className="sl-cabinet">
            {/* The belly glass: machine name and what it is. */}
            <div className="sl-topbox">
              <span className="sl-name">{machine.label}</span>
              <span className="sl-tagline">{machine.note}</span>
            </div>

            <div className="sl-body">
              <PayTable machine={machine} coins={game.coinsPerLine} />

              <div className="sl-window">
                {step?.free && <div className="sl-freebanner">Free game{freeLeft > 1 ? ` · ${freeLeft} left` : ''}</div>}
                {/* Only badge a multiplier on a screen it actually multiplied. A
                    cascade chain always ends on a screen that paid nothing, and a
                    ×5 hanging over that screen is a claim the machine can't back. */}
                {step && step.multiplier > 1 && step.paid > 0 && (
                  <div className="sl-multbadge">×{step.multiplier}</div>
                )}
                {chainLength > 1 && busy && (
                  <div className="sl-dropcount">
                    Drop {chainAt} / {chainLength}
                  </div>
                )}

                <Reels
                  machine={machine}
                  window={screen}
                  lit={lit}
                  crumbling={crumbling}
                  spinToken={spinToken}
                  dropped={phase === 'drop'}
                />

                <div className="sl-callout">
                  {phase === 'rolling' ? (
                    <span className="sl-dim">…</span>
                  ) : showing ? (
                    <span className="sl-hit">
                      {showing.kind === 'scatter'
                        ? `${showing.count} scatters`
                        : `Line ${showing.line + 1} — ${showing.count} of a kind`}
                      <b>+{showing.paid * (step?.multiplier ?? 1)}</b>
                    </span>
                  ) : running > 0 ? (
                    <span className="sl-hit">
                      Total win <b>+{running.toLocaleString()}</b>
                      <em className="sl-breakdown">
                        {[
                          `${linesPaid} line${linesPaid === 1 ? '' : 's'}`,
                          paidSteps.length > 1 ? `${paidSteps.length} paying drops` : null,
                          freeSpinsThisSpin > 0 ? `${freeSpinsThisSpin} free games` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </em>
                    </span>
                  ) : game.result ? (
                    <span className="sl-dim">No win</span>
                  ) : (
                    <span className="sl-dim">Set your bet and spin</span>
                  )}
                </div>
              </div>
            </div>

            {/* The button deck. */}
            <div className="sl-deck">
              <div className="sl-meters">
                <span className="sl-meter">
                  <i>Bet</i>
                  <b>{game.totalBet()}</b>
                </span>
                <span className="sl-meter">
                  <i>Lines</i>
                  <b>{machine.lines.length}</b>
                </span>
                <span className="sl-meter sl-meter-win">
                  <i>Win</i>
                  <b>{running.toLocaleString()}</b>
                </span>
              </div>

              <div className="sl-coins">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`sl-coin${game.coinsPerLine === n ? ' sl-coin-on' : ''}`}
                    disabled={busy}
                    onClick={() => game.setCoinsPerLine(n)}
                  >
                    {n}
                  </button>
                ))}
                <i>per line</i>
              </div>

              <div className="sl-buttons">
                {auto > 0 ? (
                  <button className="sl-auto sl-auto-on" onClick={() => setAuto(0)}>
                    Stop · {auto}
                  </button>
                ) : (
                  <span className="sl-autoset">
                    {[10, 25, 50].map((n) => (
                      <button key={n} className="sl-auto" disabled={busy || broke} onClick={() => setAuto(n)}>
                        {n}
                      </button>
                    ))}
                    <i>auto</i>
                  </span>
                )}

                {broke ? (
                  <button className="sl-spin" onClick={rebuy}>
                    Buy in
                    <i>{START} credits</i>
                  </button>
                ) : (
                  <button className="sl-spin" disabled={busy} onClick={spin}>
                    Spin
                    <i>{game.totalBet()} credits</i>
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="sl-truth">
            This cabinet's base game returns <b>{(baseReturn * 100).toFixed(2)}%</b> of every
            coin staked, enumerated exactly from its reel strips — not sampled, not a guess. It
            was cut to {(machine.targetRtp * 100).toFixed(1)}%
            {machine.feature.kind === 'none'
              ? '.'
              : ', the rest coming from the feature, which has to be measured because a screen feeds the next one.'}{' '}
            <code>npm run slots:rtp</code> checks it.
          </p>
        </div>
      </main>
    </>
  )
}
