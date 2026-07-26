import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'

import type { Bonus, BonusPlay, Machine, SymbolId } from '../../slots/types'
import { SlotArt } from './Symbols'

// The bonus rounds, on the glass.
//
// The engine has already played the round before this component mounts: `play`
// holds the wedge the wheel stopped on, the order the board turns over in, and
// the grid after every single respin. So nothing in here decides anything — it
// picks how long each beat is held and in what order the already-known facts
// reach the player's eye. Any arithmetic on a prize would be a second opinion
// about a number the engine has already published, which is how a cabinet ends
// up paying something its stated return doesn't cover.
//
// `play.paid` is in credits and is the only figure handed back. Where a round
// wants to print a prize on a wedge or a coin it uses the values the engine used
// (`bonus.wedges` × stake, or the coin values already baked into `play.grids`),
// never a total of its own.

/** Wheel: five turns, decelerating onto the wedge, then the award holds. */
const WHEEL_TURNS = 5
const WHEEL_MS = 2600
const WHEEL_HOLD_MS = 1700

/** Pick: the dud gets a beat alone, then the board spills what was left. */
const DUD_HOLD_MS = 720
const SPILL_MS = 95
const PICK_END_MS = 2000

/** Hold and spin: the trigger locks, then respins, then the ending. */
const LOCK_MS = 620
const FULL_HOLD_MS = 1700
const SPIN_END_MS = 1300

/** Total respin airtime and total landing airtime, shared out across however many
 *  respins this play took. A round that got lucky twenty times over cannot have
 *  twenty full beats or it outlasts anybody's interest, so the beat shrinks and
 *  the whole walk stays inside about four seconds either way. */
const ROLL_BUDGET_MS = 1500
const LAND_BUDGET_MS = 2000

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const credits = (n: number) => n.toLocaleString()

/* ------------------------------------------------------------------ hooks */

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [still, setStill] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(query)
    const onChange = () => setStill(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return still
}

/** A meter that climbs to its target the way a cabinet's win meter does. `still`
 *  snaps instead: someone who asked for no motion asked for the number, not the
 *  ride up to it. */
function useRollup(target: number, still: boolean): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  const raf = useRef(0)

  useEffect(() => {
    if (still) {
      from.current = target
      setShown(target)
      return
    }
    const start = from.current
    if (start === target) return
    const ms = clamp(240 + Math.abs(target - start) * 3, 240, 1000)
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
  }, [target, still])

  return shown
}

/** Run `fn` once, `ms` after `beat` changes — the one thing all three rounds are
 *  built out of. A null beat parks the timer, which is how a phase that waits on
 *  the player is expressed.
 *
 *  The beat, and not the delay, is what identifies a step: two steps of the same
 *  length in a row still have to be two timers, and keying off the duration alone
 *  would silently collapse them into one and stall the walk. */
function useTimer(beat: string | null, ms: number, fn: () => void): void {
  const held = useRef(fn)
  held.current = fn
  useEffect(() => {
    if (beat == null) return
    const t = setTimeout(() => held.current(), ms)
    return () => clearTimeout(t)
  }, [beat, ms])
}

/* ------------------------------------------------------------------ shell */

interface FrameProps {
  machine: Machine
  /** The symbol that bought the round, shown as the round's emblem. */
  trigger: SymbolId | null
  title: string
  note: string
  /** Top-right status: respins left, picks taken. */
  badge?: JSX.Element | null
  children: ReactNode
  totalLabel: string
  total: number
  still: boolean
  buttons: JSX.Element
}

function Frame({
  machine,
  trigger,
  title,
  note,
  badge,
  children,
  totalLabel,
  total,
  still,
  buttons,
}: FrameProps): JSX.Element {
  const shown = useRollup(total, still)
  return (
    <div className="slb-card">
      <div className="slb-head">
        {trigger != null && (
          <span className="slb-emblem">
            <SlotArt machine={machine.id} id={trigger} />
          </span>
        )}
        <span className="slb-titles">
          <b className="slb-title">{title}</b>
          <i className="slb-note">{note}</i>
        </span>
        {badge}
      </div>

      <div className="slb-body">{children}</div>

      <div className="slb-foot">
        <span className="slb-total">
          <i>{totalLabel}</i>
          <b>{credits(shown)}</b>
        </span>
        <span className="slb-buttons">{buttons}</span>
      </div>
    </div>
  )
}

function Go({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="slb-btn slb-btn-go" onClick={onClick}>
      {label}
    </button>
  )
}

function Ghost({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="slb-btn slb-btn-ghost" onClick={onClick}>
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ wheel */

const WS = 264
const W_OUT = 122
const W_IN = 34
const W_TEXT = 80

/** A point at `deg` clockwise from twelve o'clock, on a box centred on the
 *  origin — the same frame `RouletteWheel` draws in. */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), -r * Math.cos(a)]
}

function sector(r0: number, r1: number, a0: number, a1: number): string {
  const [x0o, y0o] = polar(r1, a0)
  const [x1o, y1o] = polar(r1, a1)
  const [x1i, y1i] = polar(r0, a1)
  const [x0i, y0i] = polar(r0, a0)
  return `M ${x0o} ${y0o} A ${r1} ${r1} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${r0} ${r0} 0 0 0 ${x0i} ${y0i} Z`
}

type WheelPhase = 'intro' | 'spin' | 'paid'

function WheelRound({
  machine,
  bonus,
  play,
  stake,
  still,
  finish,
}: {
  machine: Machine
  bonus: Extract<Bonus, { kind: 'wheel' }>
  play: BonusPlay
  stake: number
  still: boolean
  finish: () => void
}): JSX.Element {
  const wedges = bonus.wedges
  const target = clamp(play.wedge ?? 0, 0, wedges.length - 1)
  const seg = 360 / wedges.length

  // Bringing wedge `target` under the pointer means turning the wheel back by its
  // angle; the whole turns in front of that are just the show. A bonus wheel spins
  // once and stops, so unlike the roulette ball there is no previous rotation to
  // accumulate past — the landing angle is the same sum, from zero.
  const rest = ((-target * seg) % 360 + 360) % 360
  const landed = 360 * WHEEL_TURNS + rest

  const [phase, setPhase] = useState<WheelPhase>(still ? 'paid' : 'intro')
  const [rot, setRot] = useState(still ? rest : 0)
  const [moving, setMoving] = useState(false)

  const spin = useCallback(() => {
    setRot(landed)
    setMoving(true)
    setPhase('spin')
  }, [landed])

  /** Land it now, wherever the animation had got to. */
  const cut = useCallback(() => {
    setMoving(false)
    setRot(rest)
    setPhase('paid')
  }, [rest])

  useTimer(phase === 'spin' ? 'spin' : null, WHEEL_MS, () => {
    setMoving(false)
    setPhase('paid')
  })
  useTimer(phase === 'paid' ? 'paid' : null, WHEEL_HOLD_MS, finish)

  // Brightest wedge is the biggest award. Every wedge is equally likely, so this
  // is decoration and not a hint — there is deliberately no near-miss dressing.
  const top = Math.max(...wedges)

  const labels = wedges.map((w) => credits(w * stake))
  const font = wedges.length <= 8 ? 15 : wedges.length <= 12 ? 13 : wedges.length <= 16 ? 11 : 9.5
  // Across the arc a label is boxed in by the width of its own wedge; along the
  // radius it has the whole ring to play with. Across reads better — at rest the
  // winning wedge is at twelve o'clock, where an across-the-arc label is
  // horizontal — so it wins whenever the longest award on this wheel fits between
  // two spokes, and long awards on a crowded wheel fall back to radial.
  const arc = (2 * Math.PI * W_TEXT) / wedges.length
  const across = Math.max(...labels.map((l) => l.length)) * font * 0.62 + 10 < arc

  return (
    <Frame
      machine={machine}
      trigger={bonus.trigger}
      title="Bonus wheel"
      note={
        phase === 'intro'
          ? `${bonus.triggerCount} on screen buys one spin. Every wedge is equally likely.`
          : `${wedges.length} wedges · one spin`
      }
      badge={
        phase === 'paid' ? (
          <span className="slb-badge slb-badge-win" aria-live="polite">
            {wedges[target]}× bet
          </span>
        ) : null
      }
      totalLabel="Bonus win"
      total={phase === 'paid' ? play.paid : 0}
      still={still}
      buttons={
        phase === 'intro' ? (
          <Go label="Spin" onClick={spin} />
        ) : phase === 'spin' ? (
          <Ghost label="Stop" onClick={cut} />
        ) : (
          <Go label="Collect" onClick={finish} />
        )
      }
    >
      <div className="slb-wheelbox">
        <div
          className="slb-wheelspin"
          style={{
            transform: `rotate(${rot}deg)`,
            transition: moving ? `transform ${WHEEL_MS}ms cubic-bezier(0.17, 0.75, 0.22, 1)` : 'none',
          }}
        >
          <svg viewBox={`${-WS / 2} ${-WS / 2} ${WS} ${WS}`} className="slb-wheelsvg" aria-hidden="true">
            <circle cx={0} cy={0} r={W_OUT + 7} className="slb-w-rim" />
            {wedges.map((w, i) => {
              const [tx, ty] = polar(W_TEXT, i * seg)
              const angle = i * seg
              // Which way up a label finishes depends on where its wedge comes to
              // rest, not where it started — the whole wheel turns by the landing
              // angle, and at rest is the only time anybody reads these. So the
              // half of the wheel that would end up inverted is flipped, in the
              // frame it stops in.
              const view = (((i - target) * seg) % 360 + 360) % 360
              const turn = across
                ? view > 90 && view < 270
                  ? angle + 180
                  : angle
                : view > 180
                  ? angle + 90
                  : angle - 90
              return (
                <g key={i}>
                  <path
                    d={sector(W_IN, W_OUT, angle - seg / 2, angle + seg / 2)}
                    className={[
                      'slb-w-seg',
                      w === top ? 'slb-w-seg-top' : i % 2 ? 'slb-w-seg-odd' : 'slb-w-seg-even',
                      phase === 'paid' && i === target ? 'slb-w-seg-hit' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <text
                    x={tx}
                    y={ty}
                    className="slb-w-label"
                    fontSize={font}
                    transform={`rotate(${turn} ${tx} ${ty})`}
                  >
                    {labels[i]}
                  </text>
                </g>
              )
            })}
            <circle cx={0} cy={0} r={W_IN} className="slb-w-hub" />
            <circle cx={0} cy={0} r={7} className="slb-w-cap" />
          </svg>
        </div>

        {/* The pointer does not turn with the wheel, so it lives outside it. */}
        <svg viewBox="0 0 40 34" className={`slb-w-ptr${phase === 'paid' ? ' slb-w-ptr-hit' : ''}`} aria-hidden="true">
          <path d="M20 32 L4 4 L36 4 Z" />
        </svg>
      </div>

      <div className="slb-award" aria-live="polite">
        {phase === 'paid' ? (
          <span className="slb-award-win">
            {credits(play.paid)} credits
            <i>
              {wedges[target]}× total bet
            </i>
          </span>
        ) : (
          <span className="slb-award-idle">
            {phase === 'intro' ? 'Press spin' : 'Spinning…'}
          </span>
        )}
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------- pick */

/** A turned-over object. `mine` separates what the player collected from what the
 *  board gave up at the end, because those two read completely differently. */
type Face = { value: number; mine: boolean } | null

type PickPhase = 'play' | 'hold' | 'spill' | 'done'

function PickRound({
  machine,
  bonus,
  play,
  still,
  finish,
}: {
  machine: Machine
  bonus: Extract<Bonus, { kind: 'pick' }>
  play: BonusPlay
  still: boolean
  finish: () => void
}): JSX.Element {
  const reveals = play.reveals ?? []
  const missed = play.missed ?? []
  const size = Math.max(bonus.prizes.length + bonus.enders, reveals.length + missed.length)

  const [board, setBoard] = useState<Face[]>(() => {
    const out: Face[] = new Array<Face>(size).fill(null)
    if (!still) return out
    // No-motion: the board is already over, so it is already turned over.
    let i = 0
    for (const value of reveals) out[i++] = { value, mine: true }
    for (const value of missed) out[i++] = { value, mine: false }
    return out
  })
  const [phase, setPhase] = useState<PickPhase>(still ? 'done' : 'play')

  const taken = board.reduce((n, c) => n + (c != null && c.mine ? 1 : 0), 0)
  const collected = board.reduce((sum, c) => sum + (c && c.mine ? c.value : 0), 0)
  const left = board.reduce((sum, c) => sum + (c && !c.mine ? c.value : 0), 0)
  const hitDud = board.some((c) => c != null && c.mine && c.value === 0)

  const turn = useCallback(
    (at: number) => {
      if (phase !== 'play' || board[at] != null) return
      const value = reveals[taken]
      if (value === undefined) return
      setBoard((was) => was.map((c, i) => (i === at ? { value, mine: true } : c)))
      // A dud ends it; so does running out of board, which is the round the player
      // will talk about.
      if (value === 0 || taken + 1 >= reveals.length) setPhase('hold')
    },
    [phase, board, reveals, taken],
  )

  /** Finish the presentation without waiting: collect what was picked, turn the
   *  rest over, and let it settle. The award does not change — it never could. */
  const rush = useCallback(() => {
    setBoard((was) => {
      let r = was.filter((c) => c != null && c.mine).length
      let k = was.filter((c) => c != null && !c.mine).length
      return was.map((c) => {
        if (c != null) return c
        const value = reveals[r]
        if (value !== undefined) {
          r++
          return { value, mine: true }
        }
        return { value: missed[k++] ?? 0, mine: false }
      })
    })
    setPhase('done')
  }, [reveals, missed])

  useTimer(phase === 'hold' ? 'hold' : null, DUD_HOLD_MS, () => setPhase('spill'))

  // The spill goes one object at a time: all at once is a flicker, one at a time
  // is a wince.
  const open = board.filter((c) => c != null).length
  useTimer(phase === 'spill' ? `spill-${open}` : null, SPILL_MS, () => {
    if (open >= board.length) {
      setPhase('done')
      return
    }
    setBoard((was) => {
      const k = was.filter((c) => c != null && !c.mine).length
      const at = was.findIndex((c) => c == null)
      if (at < 0) return was
      return was.map((c, i) => (i === at ? { value: missed[k] ?? 0, mine: false } : c))
    })
  })

  useTimer(phase === 'done' ? 'done' : null, PICK_END_MS, finish)

  const cols = size <= 6 ? 3 : size <= 12 ? 4 : size <= 20 ? 5 : 6

  return (
    <Frame
      machine={machine}
      trigger={bonus.trigger}
      title="Pick bonus"
      note={
        phase === 'play'
          ? 'Every object hides a prize. One of them ends the round.'
          : hitDud
            ? 'That one ended it.'
            : 'The whole board — nothing left behind.'
      }
      badge={
        <span className="slb-badge">
          {taken} pick{taken === 1 ? '' : 's'}
        </span>
      }
      totalLabel="Collected"
      total={phase === 'done' ? play.paid : collected}
      still={still}
      buttons={
        phase === 'done' ? (
          <Go label="Collect" onClick={finish} />
        ) : (
          <Ghost label="Reveal all" onClick={rush} />
        )
      }
    >
      <div className="slb-boardwrap">
        <div
          className="slb-board"
          style={{ ['--slb-cols' as string]: cols, ['--slb-rows' as string]: Math.ceil(size / cols) }}
        >
          {board.map((face, i) => {
            const up = face != null
            const dud = up && face.value === 0
            return (
              <button
                key={i}
                className={[
                  'slb-tile',
                  up ? 'slb-tile-open' : '',
                  up && !face.mine ? 'slb-tile-missed' : '',
                  dud ? 'slb-tile-dud' : '',
                  up && face.mine && !dud ? 'slb-tile-prize' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={up || phase !== 'play'}
                onClick={() => turn(i)}
                aria-label={
                  up ? (dud ? 'ends the round' : `${face.value} credits`) : `object ${i + 1}, not turned over`
                }
              >
                <span className="slb-flip">
                  <span className="slb-lid">
                    <SlotArt machine={machine.id} id={bonus.trigger} />
                  </span>
                  <span className="slb-face">
                    {dud ? <b className="slb-end">END</b> : <b className="slb-val">{credits(face?.value ?? 0)}</b>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="slb-award" aria-live="polite">
        {phase === 'done' ? (
          left > 0 ? (
            <span className="slb-award-sting">
              Left on the board: <b>{credits(left)}</b>
            </span>
          ) : (
            <span className="slb-award-win">Board cleared</span>
          )
        ) : (
          <span className="slb-award-idle">
            {phase === 'play' ? 'Pick an object' : hitDud ? 'Bonus over' : 'That was the lot'}
          </span>
        )}
      </div>
    </Frame>
  )
}

/* -------------------------------------------------------------- hold & spin */

type SpinPhase = 'lock' | 'roll' | 'land' | 'done'

/** Where a grid gained coins against the grid before it. */
function landings(grids: Array<Array<number | null>>): Array<Set<number>> {
  return grids.map((grid, g) => {
    const out = new Set<number>()
    if (g === 0) return out
    const before = grids[g - 1]
    for (let i = 0; i < grid.length; i++) if (grid[i] != null && before[i] == null) out.add(i)
    return out
  })
}

function Coin({ value }: { value: number }): JSX.Element {
  // The face is 72 units across, so the type has to come down as the award goes
  // up — a five-figure coin is the one nobody may have to squint at.
  const label = credits(value)
  const font = [38, 38, 38, 32, 27, 23, 19][label.length] ?? 16
  return (
    <svg viewBox="0 0 100 100" className="slb-coin" role="img" aria-label={`${label} credits`}>
      <circle cx="50" cy="50" r="45" className="slb-coin-edge" />
      <circle cx="50" cy="50" r="36" className="slb-coin-face" />
      <ellipse cx="38" cy="30" rx="14" ry="8" className="slb-coin-shine" transform="rotate(-24 38 30)" />
      <text x="50" y="51" className="slb-coin-val" fontSize={font}>
        {label}
      </text>
    </svg>
  )
}

function SpinRound({
  machine,
  bonus,
  play,
  stake,
  still,
  finish,
}: {
  machine: Machine
  bonus: Extract<Bonus, { kind: 'holdSpin' }>
  play: BonusPlay
  stake: number
  still: boolean
  finish: () => void
}): JSX.Element {
  const grids = play.grids ?? []
  const last = grids.length - 1
  const cols = Math.max(1, machine.strips.length)

  const fresh = useMemo(() => landings(grids), [grids])

  /** Respins left after each grid, replayed from the same rule the engine used:
   *  a respin costs one, and any coin at all buys the whole allowance back. That
   *  reset is the entire drama of this mechanic, so it has to be exact. */
  const respinsAt = useMemo(() => {
    const out: number[] = [bonus.respins]
    for (let g = 1; g < grids.length; g++) {
      const before = out[g - 1] - 1
      out.push(fresh[g].size > 0 ? bonus.respins : before)
    }
    return out
  }, [grids.length, fresh, bonus.respins])

  const [at, setAt] = useState(still ? last : 0)
  const [phase, setPhase] = useState<SpinPhase>(still ? 'done' : 'lock')

  const respins = Math.max(0, grids.length - 1)
  const roll = clamp(ROLL_BUDGET_MS / Math.max(1, respins), 70, 280)
  const land = clamp(LAND_BUDGET_MS / Math.max(1, respins), 130, 480)

  const jump = useCallback(() => {
    setAt(last)
    setPhase('done')
  }, [last])

  useTimer(phase === 'lock' ? 'lock' : null, LOCK_MS, () => setPhase(at < last ? 'roll' : 'done'))
  useTimer(phase === 'roll' ? `roll-${at}` : null, roll, () => {
    setAt((g) => g + 1)
    setPhase('land')
  })
  // A respin that landed something gets the full beat; one that landed nothing is
  // over almost as soon as it started, which is what makes the next hit register.
  useTimer(phase === 'land' ? `land-${at}` : null, fresh[at]?.size ? land : Math.max(90, land * 0.45), () =>
    setPhase(at < last ? 'roll' : 'done'),
  )
  useTimer(phase === 'done' ? 'done' : null, play.full ? FULL_HOLD_MS : SPIN_END_MS, finish)

  const grid = grids[at] ?? []
  const rolling = phase === 'roll'
  const justLanded = phase === 'land' && (fresh[at]?.size ?? 0) > 0
  const held = grid.filter((c) => c != null).length
  const onScreen = grid.reduce<number>((sum, c) => sum + (c ?? 0), 0)
  const full = play.full === true && phase === 'done'

  return (
    <Frame
      machine={machine}
      trigger={bonus.trigger}
      title="Hold & spin"
      note={
        phase === 'done'
          ? full
            ? 'Every cell filled.'
            : 'No more coins — the round is over.'
          : 'Coins lock. Every new coin buys the respins back.'
      }
      badge={
        <span className={`slb-badge slb-respins${justLanded ? ' slb-respins-reset' : ''}`} aria-live="polite">
          <i>respins</i>
          <b>{phase === 'done' ? 0 : respinsAt[at] ?? 0}</b>
        </span>
      }
      totalLabel="Bonus win"
      // At the end the engine's figure stands, full-screen award and all; part way
      // through, what is on the glass is what has been won.
      total={phase === 'done' ? play.paid : onScreen}
      still={still}
      buttons={
        phase === 'done' ? (
          <Go label="Collect" onClick={finish} />
        ) : (
          <Ghost label="Finish" onClick={jump} />
        )
      }
    >
      <div className="slb-hs">
        <div
          className={`slb-grid${full ? ' slb-grid-full' : ''}`}
          style={{
            ['--slb-cols' as string]: cols,
            ['--slb-rows' as string]: Math.ceil(grid.length / cols),
          }}
        >
          {grid.map((cell, i) => {
            const isNew = phase === 'land' && fresh[at]?.has(i)
            return (
              <div
                key={i}
                className={[
                  'slb-hscell',
                  cell == null ? 'slb-hscell-empty' : 'slb-hscell-held',
                  cell == null && rolling ? 'slb-hscell-live' : '',
                  // Once the round is over the empties stop looking hopeful.
                  cell == null && phase === 'done' ? 'slb-hscell-cold' : '',
                  isNew ? 'slb-hscell-new' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {cell == null ? <span className="slb-hollow" aria-hidden="true" /> : <Coin value={cell} />}
              </div>
            )
          })}
        </div>

        <div className="slb-hsmeta">
          <span className="slb-hsheld">
            <i>locked</i>
            <b>
              {held} / {grid.length}
            </b>
          </span>
          <span className="slb-award" aria-live="polite">
            {full ? (
              <span className="slb-full">
                Full screen<i>+{credits(bonus.fullScreen * stake)}</i>
              </span>
            ) : justLanded ? (
              <span className="slb-award-win">Respins reset</span>
            ) : (
              <span className="slb-award-idle">
                {phase === 'lock' ? 'Coins locked' : phase === 'done' ? 'Round over' : 'Respinning…'}
              </span>
            )}
          </span>
        </div>
      </div>
    </Frame>
  )
}

/* -------------------------------------------------------------- the overlay */

/** Whatever the round was, it paid this. Shown when a `BonusPlay` arrives without
 *  the detail its own presentation needs, so a missing field costs the player the
 *  show and not the money. */
function Award({
  machine,
  paid,
  still,
  finish,
}: {
  machine: Machine
  paid: number
  still: boolean
  finish: () => void
}): JSX.Element {
  // Collects itself as well as offering the button, so no path through here can
  // leave a spin waiting on a click that never comes.
  useTimer('award', 2400, finish)
  return (
    <Frame
      machine={machine}
      trigger={null}
      title="Bonus"
      note="The round is complete."
      totalLabel="Bonus win"
      total={paid}
      still={still}
      buttons={<Go label="Collect" onClick={finish} />}
    >
      <div className="slb-award slb-award-solo">
        <span className="slb-award-win">{credits(paid)} credits</span>
      </div>
    </Frame>
  )
}

export function BonusRound({
  machine,
  bonus,
  play,
  coins,
  onDone,
}: {
  machine: Machine
  bonus: Bonus
  play: BonusPlay
  coins: number
  onDone: (paid: number) => void
}): JSX.Element {
  const still = useReducedMotion()
  // Wedge and full-screen awards are quoted as multiples of the total bet, which
  // is every line at the current coins — the same figure the engine was handed.
  const stake = coins * machine.lines.length

  const done = useRef(false)
  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onDone(play.paid)
  }, [onDone, play.paid])

  let body: JSX.Element
  if (play.kind === 'wheel' && bonus.kind === 'wheel' && bonus.wedges.length > 0) {
    body = <WheelRound machine={machine} bonus={bonus} play={play} stake={stake} still={still} finish={finish} />
  } else if (play.kind === 'pick' && bonus.kind === 'pick' && play.reveals) {
    body = <PickRound machine={machine} bonus={bonus} play={play} still={still} finish={finish} />
  } else if (play.kind === 'holdSpin' && bonus.kind === 'holdSpin' && play.grids && play.grids.length > 0) {
    body = <SpinRound machine={machine} bonus={bonus} play={play} stake={stake} still={still} finish={finish} />
  } else {
    body = <Award machine={machine} paid={play.paid} still={still} finish={finish} />
  }

  return (
    <div className="slb" role="dialog" aria-modal="true" aria-label="Bonus round">
      {body}
    </div>
  )
}
