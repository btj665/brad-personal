import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { windowOf } from '../../slots/evaluate'
import { SlotGame } from '../../slots/machine'
import { MACHINES } from '../../slots/machines'
import { exactBaseReturn } from '../../slots/rtp'
import type { Machine, Step, Win } from '../../slots/types'
import { BigWin, CabinetFrame, TopBox } from './Cabinet'
import { BonusRound } from './BonusRound'
import { PayScreen, PayStrip } from './PayScreen'
import { Reels, rollDuration } from './Reels'

const START = 500

/** How long each winning line is held up on its own, how long a crumbling screen
 *  takes to clear, and how long replacements take to fall. Tuned so a long
 *  cascade chain still resolves in a few seconds. */
const LINE_MS = 620
const NO_WIN_MS = 260
const CRUMBLE_MS = 300
const DROP_MS = 340
const AUTO_GAP_MS = 420

/** A spin worth this many times the stake earns the big-win screen. Below it the
 *  meters are celebration enough; above it the cabinet should stop everything. */
const BIG_WIN_AT = 8

type Phase = 'idle' | 'rolling' | 'reveal' | 'crumble' | 'drop' | 'bonus' | 'bigwin'

const cellKey = (reel: number, row: number) => `${reel},${row}`

function cellsOf(wins: Win[]): Set<string> {
  const out = new Set<string>()
  for (const w of wins) for (const [reel, row] of w.cells) out.add(cellKey(reel, row))
  return out
}

/** A meter that rolls up to its target rather than snapping, the way the credit
 *  display on a cabinet does. */
function useRollup(target: number): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  const raf = useRef(0)

  useEffect(() => {
    const start = from.current
    if (start === target) return
    const ms = Math.min(900, 220 + Math.abs(target - start) * 4)
    const t0 = performance.now()

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(start + (target - start) * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else from.current = target
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return shown
}

export function SlotsScreen() {
  const [machine, setMachine] = useState<Machine>(MACHINES[0])
  const [game, setGame] = useState(
    () => new SlotGame({ machine: MACHINES[0], seed: randomSeed(), bankroll: START }),
  )
  useSyncExternalStore(game.subscribe, game.getVersion)

  const [phase, setPhase] = useState<Phase>('idle')
  const [stepIndex, setStepIndex] = useState(0)
  const [winIndex, setWinIndex] = useState(0)
  const [spinToken, setSpinToken] = useState(0)
  const [auto, setAuto] = useState(0)
  const [pays, setPays] = useState(false)
  /** Paid so far this spin, for the win meter. */
  const [running, setRunning] = useState(0)
  /** The bonus has been played out on screen, so its award may show. */
  const [bonusSettled, setBonusSettled] = useState(true)

  const steps: Step[] = game.result?.steps ?? []
  const step: Step | null = steps[stepIndex] ?? null
  const result = game.result
  const busy = phase !== 'idle'

  const rest = useMemo(
    () => windowOf(machine.strips, machine.strips.map(() => 0), machine.rows),
    [machine],
  )
  const screen = step?.window ?? rest

  // --- the reveal walk -----------------------------------------------------
  //
  // A spin is already fully resolved by the engine, bonus included; everything
  // below is theatre over a decided result.

  useEffect(() => {
    if (phase !== 'rolling') return
    const t = setTimeout(() => {
      setPhase('reveal')
      setWinIndex(0)
    }, rollDuration(machine.strips.length))
    return () => clearTimeout(t)
  }, [phase, spinToken, machine.strips.length])

  /** Leave the reels: the bonus, then the big-win screen, then rest. */
  const finishSpin = useCallback(() => {
    if (result?.bonus && !bonusSettled) {
      setPhase('bonus')
      return
    }
    const multiple = result ? result.paid / result.staked : 0
    setPhase(multiple >= BIG_WIN_AT ? 'bigwin' : 'idle')
  }, [result, bonusSettled])

  useEffect(() => {
    if (phase !== 'reveal' || !step) return

    if (step.wins.length === 0) {
      const t = setTimeout(() => advance(), NO_WIN_MS)
      return () => clearTimeout(t)
    }
    if (winIndex === 0) setRunning((r) => r + step.paid)
    if (winIndex < step.wins.length) {
      // Twenty paylines means a good screen can pay six or eight at once. Holding
      // each for a full beat would take ten seconds, so the walk speeds up as the
      // win count climbs rather than testing anybody's patience.
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

  /** Collapse into the next screen, spin fresh reels for it, or leave the reels. */
  const advance = useCallback(() => {
    const next = steps[stepIndex + 1]
    if (!next) {
      finishSpin()
      return
    }
    if (next.spun) {
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
  }, [steps, stepIndex, step, finishSpin])

  // --- input ---------------------------------------------------------------

  const spin = useCallback(() => {
    if (!game.canSpin()) return
    setRunning(0)
    setBonusSettled(false)
    game.spin()
    setStepIndex(0)
    setWinIndex(0)
    setSpinToken((t) => t + 1)
    setPhase('rolling')
  }, [game])

  const onBonusDone = useCallback(
    (paid: number) => {
      setBonusSettled(true)
      setRunning((r) => r + paid)
      const multiple = result ? result.paid / result.staked : 0
      setPhase(multiple >= BIG_WIN_AT ? 'bigwin' : 'idle')
    },
    [result],
  )

  // Autoplay just presses the button, so it can't diverge from hand play.
  useEffect(() => {
    if (phase !== 'idle' || auto <= 0 || pays) return
    if (!game.canSpin()) {
      setAuto(0)
      return
    }
    const t = setTimeout(() => {
      setAuto((n) => n - 1)
      spin()
    }, AUTO_GAP_MS)
    return () => clearTimeout(t)
  }, [phase, auto, pays, spin, game])

  const pick = useCallback(
    (id: string) => {
      const next = MACHINES.find((m) => m.id === id) ?? MACHINES[0]
      setAuto(0)
      setMachine(next)
      game.setMachine(next)
      setStepIndex(0)
      setWinIndex(0)
      setRunning(0)
      setBonusSettled(true)
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
    setBonusSettled(true)
    setPhase('idle')
  }, [machine, game.coinsPerLine])

  // --- what to light -------------------------------------------------------

  const lit = useMemo(() => {
    if (!step || phase === 'rolling') return new Set<string>()
    if (phase === 'reveal' && step.wins.length > 0) {
      const w = step.wins[winIndex]
      return w ? cellsOf([w]) : cellsOf(step.wins)
    }
    // A finished spin leaves its winners lit, the way a cabinet does.
    if (phase === 'idle' || phase === 'crumble' || phase === 'bigwin') return cellsOf(step.wins)
    return new Set<string>()
  }, [step, phase, winIndex])

  const crumbling = phase === 'crumble' && step ? cellsOf(step.wins) : new Set<string>()

  // The engine banks the bonus award the moment the spin resolves, but the player
  // hasn't played it yet — so hold it out of the credit meter until they have, or
  // the machine pays them before it shows them why.
  const withheld = result?.bonus && !bonusSettled ? result.bonus.paid : 0
  const credits = useRollup(game.bankroll - withheld)

  const baseReturn = useMemo(() => exactBaseReturn(machine), [machine])
  const broke = game.bankroll < game.totalBet()
  const showing = step?.wins[winIndex]
  const freeLeft = steps.slice(stepIndex).filter((s) => s.free).length

  const paidSteps = steps.filter((s) => s.paid > 0)
  const linesPaid = paidSteps.reduce((n, s) => n + s.wins.length, 0)
  const chainLength = steps.filter((s) => !s.spun).length + 1
  const chainAt = Math.min(stepIndex + 1, chainLength)
  const freeSpinsThisSpin = result?.freeSpinsAwarded ?? 0
  const multiple = result ? result.paid / result.staked : 0

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
          <button className="btn btn-ghost" onClick={() => setPays(true)}>
            Pays
          </button>
          <span className="bankroll">
            <span className="bankroll-label">Credits</span>
            <b>{credits.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <main className="main">
        <div className={`sl sl-${machine.id}`}>
          <TopBox machine={machine.id} label={machine.label} />
          <p className="sl-tagline">{machine.note}</p>

          {/* The stage is what the bonus round and the big-win screen cover. They
              are `position: absolute; inset: 0`, so their parent decides how much
              of the machine they take over — and both want the whole cabinet, not
              just the reel window, or a 264px wheel gets clipped by a 300px box. */}
          <div className="sl-stage">
          <CabinetFrame
            machine={machine.id}
            bellyText={`${machine.lines.length} line${machine.lines.length === 1 ? '' : 's'}`}
          >
            <div className="sl-body">
              <PayStrip machine={machine} coins={game.coinsPerLine} onSeeAll={() => setPays(true)} />

              <div className="sl-window">
                {step?.free && (
                  <div className="sl-freebanner">
                    Free game{freeLeft > 1 ? ` · ${freeLeft} left` : ''}
                  </div>
                )}
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
                          result?.bonus && bonusSettled ? 'bonus' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </em>
                    </span>
                  ) : result ? (
                    <span className="sl-dim">No win</span>
                  ) : (
                    <span className="sl-dim">Set your bet and spin</span>
                  )}
                </div>

              </div>
            </div>

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
                      <button
                        key={n}
                        className="sl-auto"
                        disabled={busy || broke}
                        onClick={() => setAuto(n)}
                      >
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
          </CabinetFrame>

            {phase === 'bonus' && result?.bonus && machine.bonus && (
              <BonusRound
                machine={machine}
                bonus={machine.bonus}
                play={result.bonus}
                coins={game.coinsPerLine}
                onDone={onBonusDone}
              />
            )}

            {/* Keyed on the round so a second big win remounts and replays rather
                than sitting on a timer that already fired. */}
            {phase === 'bigwin' && result && (
              <BigWin
                key={`bw-${game.round}`}
                amount={result.paid}
                multiple={multiple}
                machine={machine.id}
                kind={result.bonus ? 'bonus' : freeSpinsThisSpin > 0 ? 'free' : 'win'}
                onDone={() => setPhase('idle')}
              />
            )}
          </div>

          <p className="sl-truth">
            This cabinet's base game returns <b>{(baseReturn * 100).toFixed(2)}%</b> of every
            coin staked, enumerated exactly from its reel strips — not sampled, not a guess. It
            was cut to {(machine.targetRtp * 100).toFixed(1)}%
            {machine.feature.kind === 'none' && !machine.bonus
              ? '.'
              : ', the rest coming from the features, which have to be measured because a screen feeds the next one.'}{' '}
            <code>npm run slots:rtp</code> checks it.
          </p>

          <PayScreen
            machine={machine}
            coins={game.coinsPerLine}
            open={pays}
            onClose={() => setPays(false)}
          />
        </div>
      </main>
    </>
  )
}
