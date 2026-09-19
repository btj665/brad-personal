import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Machine, SymbolId } from '../../slots/types'
import { SlotArt } from './Symbols'

/** How many junk symbols scroll past before a reel lands, and how much more each
 *  reel to the right gets. The stagger is the whole reason a slot feels like a
 *  slot: the reels start together and stop left to right, so the last one carries
 *  all the suspense. */
const FILLER = 12
const FILLER_STEP = 5

/** Roll time for reel one, and the extra each reel to its right takes. */
const ROLL_MS = 620
const ROLL_STEP_MS = 170

/** How much longer an anticipation reel spins. Long enough to hold a breath,
 *  short enough that even a three-reel near-miss chain still resolves in ~3.5s.
 *  It accumulates, so reels to the right of an anticipation reel wait too. */
const ANT_MS = 820

/** The gap between reels, in px — mirrors `.sl-reels { gap }` in the stylesheet.
 *  The payline overlay is drawn in reel coordinates, so the two must agree. */
const GAP = 5

export function rollDuration(reels: number): number {
  return ROLL_MS + (reels - 1) * ROLL_STEP_MS
}

/** Whether the viewer has asked for less motion. Read live (not cached) so a
 *  spin honours the current setting. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const key = (reel: number, row: number) => `${reel},${row}`

/** A symbol whose accumulation across reels builds a trigger, paired with the
 *  count that completes it — a scatter with its paying counts, the free-games
 *  trigger, the bonus trigger. Detecting a near-miss is just watching one of
 *  these land one short as each reel stops. */
interface Trigger {
  sym: SymbolId
  threshold: number
}

function keyTriggers(machine: Machine): Trigger[] {
  const reels = machine.strips.length
  const out: Trigger[] = []
  const push = (sym: SymbolId | undefined, threshold: number | undefined) => {
    if (!sym || !threshold || threshold < 2) return
    if (out.some((t) => t.sym === sym && t.threshold === threshold)) return
    out.push({ sym, threshold })
  }
  if (machine.bonus) push(machine.bonus.trigger, machine.bonus.triggerCount)
  if (machine.feature.kind === 'freeSpins') push(machine.feature.trigger, machine.feature.triggerCount)
  // Every paying scatter count is its own held-breath moment: one short of the
  // first paying count is the classic near-miss; one short of the next is the
  // escalation when a fourth or fifth is already on the glass.
  if (machine.scatterPays) {
    for (const [sym, table] of Object.entries(machine.scatterPays)) {
      for (const n of Object.keys(table).map(Number)) {
        if (Number.isFinite(n) && n <= reels + 1) push(sym, n)
      }
    }
  }
  return out
}

/** Is reel `r` an anticipation reel, given the already-resolved window? True when
 *  the reels that will have stopped before it land exactly one short of some
 *  trigger — so this reel is the one that could complete it, or tease and miss.
 *  Computed from the decided result; it changes nothing about the outcome. */
function isAnticipationReel(window: SymbolId[][], triggers: Trigger[], r: number): boolean {
  if (r <= 0) return false
  for (const { sym, threshold } of triggers) {
    let count = 0
    for (let reel = 0; reel < r; reel++) {
      for (const s of window[reel]) if (s === sym) count++
    }
    if (count === threshold - 1) return true
  }
  return false
}

export interface SpinTiming {
  /** ms from spin start until each reel lands. */
  land: number[]
  /** Which reels get the anticipation treatment. */
  ant: boolean[]
  /** ms until the last reel lands — when the reveal may begin. */
  total: number
}

/** Per-reel landing times for a spin, stretched by anticipation. Pure, and used
 *  by both the reels (for their transitions and stop timers) and the screen (to
 *  know when the roll is over), so the two never disagree. */
export function spinTiming(machine: Machine, window: SymbolId[][], reduced: boolean): SpinTiming {
  const reels = machine.strips.length
  const triggers = reduced ? [] : keyTriggers(machine)
  const ant = new Array<boolean>(reels).fill(false)
  const land: number[] = []
  let extra = 0
  for (let r = 0; r < reels; r++) {
    const a = isAnticipationReel(window, triggers, r)
    ant[r] = a
    if (a) extra += ANT_MS
    land[r] = ROLL_MS + r * ROLL_STEP_MS + extra
  }
  return { land, ant, total: land[reels - 1] ?? ROLL_MS }
}

/** A cell of the tape. Split out so the art only re-renders when its symbol
 *  changes, which matters when ten reels of filler are scrolling. */
function Cell({
  machine,
  id,
  lit,
  crumbling,
  dropping,
}: {
  machine: Machine
  id: SymbolId
  lit?: boolean
  crumbling?: boolean
  dropping?: boolean
}) {
  const sym = machine.symbols.find((s) => s.id === id)
  const classes = [
    'sl-cell',
    sym?.wild ? 'sl-cell-wild' : '',
    sym?.scatter ? 'sl-cell-scatter' : '',
    !sym?.label ? 'sl-cell-blank' : '',
    lit ? 'sl-cell-lit' : '',
    crumbling ? 'sl-cell-crumble' : '',
    dropping ? 'sl-cell-drop' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <SlotArt machine={machine.id} id={id} />
    </div>
  )
}

export interface ReelsProps {
  machine: Machine
  /** The screen to show once the reels land. */
  window: SymbolId[][]
  /** Cells to light up, as "reel,row". */
  lit: Set<string>
  /** Cells being taken out by a cascade. */
  crumbling: Set<string>
  /** Bumped once per spin; starts the roll. */
  spinToken: number
  /** True during a cascade step, so new symbols drop rather than appear. */
  dropped: boolean
  /** Fired as each reel lands, with whether the *next* reel is an anticipation
   *  reel — the screen turns that into the reel-stop thunk and the rising tone. */
  onReelLand?: (reel: number, nextAnticipates: boolean) => void
  /** The winning cells of the line currently being shown, [reel, row], or null.
   *  Drawn as a bright path so the player sees why the line paid. */
  payCells?: Array<[number, number]> | null
  /** Bumped per shown win so the path redraws for each line in turn. */
  payKey?: string
}

export function Reels({
  machine,
  window,
  lit,
  crumbling,
  spinToken,
  dropped,
  onReelLand,
  payCells,
  payKey,
}: ReelsProps) {
  const reels = machine.strips.length
  const rows = machine.rows

  // A tape is the screen followed by junk. Parking it scrolled deep into the junk
  // and animating back to zero scrolls the symbols downward, which is the
  // direction a real reel turns.
  //
  // Only the *junk* is state, and only a new spin rebuilds it. The visible part is
  // always read straight off the current `window` prop, which is what lets a
  // cascade repaint the screen in place: the reels don't roll for a tumble, the
  // symbols just change. Holding the whole tape in state instead meant the window
  // prop was ignored after the first roll, so every cascade step redrew the screen
  // that had already paid.
  const [junk, setJunk] = useState<SymbolId[][]>([])
  const [rolling, setRolling] = useState(false)
  const [landed, setLanded] = useState<boolean[]>(() => new Array(reels).fill(true))
  // The timing this spin is running on, so the render can size each reel's
  // transition and flag which reels are anticipating.
  const [timing, setTiming] = useState<SpinTiming>(() => ({
    land: [],
    ant: new Array<boolean>(reels).fill(false),
    total: rollDuration(reels),
  }))
  const firstRender = useRef(true)

  // Which cells changed since the last screen — those are the ones a cascade
  // drops in. Compared against a ref so a re-render for any other reason (a chip
  // click, the win meter ticking) doesn't re-trigger the animation.
  const previous = useRef<SymbolId[][]>(window)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useLayoutEffect(() => {
    if (!dropped) {
      previous.current = window
      setFresh(new Set())
      return
    }
    const changed = new Set<string>()
    for (let reel = 0; reel < window.length; reel++) {
      for (let row = 0; row < window[reel].length; row++) {
        if (previous.current?.[reel]?.[row] !== window[reel][row]) changed.add(key(reel, row))
      }
    }
    previous.current = window
    setFresh(changed)
  }, [window, dropped])

  // Build the tapes and park them, then release on the next frame so the browser
  // has a layout to animate from. Without the frame gap the transition is skipped
  // and the reels teleport.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    // The window is already resolved when a spin starts, so the anticipation is
    // decided here, up front — it only changes how long reels roll, never what
    // they land on.
    const t = spinTiming(machine, window, prefersReducedMotion())
    setTiming(t)

    const built = machine.strips.map((strip, reel) => {
      const filler: SymbolId[] = []
      // Scale the junk to the roll time so speed stays roughly constant: an
      // anticipation reel that rolls longer also has further to travel, so it
      // keeps spinning rather than crawling in slow motion.
      const extraMs = t.land[reel] - (ROLL_MS + reel * ROLL_STEP_MS)
      const extraCells = Math.round((extraMs / ROLL_STEP_MS) * FILLER_STEP)
      const n = FILLER + reel * FILLER_STEP + extraCells
      for (let i = 0; i < n; i++) filler.push(strip[Math.floor(Math.random() * strip.length)])
      return filler
    })
    setJunk(built)
    setRolling(true)
    setLanded(new Array(reels).fill(false))

    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setRolling(false)))

    // Mark each reel landed as its own transition ends, so the blur lifts and the
    // cabinet thunks one reel at a time. The stop also drives the sound.
    const timers = built.map((_, reel) =>
      setTimeout(() => {
        setLanded((was) => was.map((l, i) => (i === reel ? true : l)))
        onReelLand?.(reel, t.ant[reel + 1] ?? false)
      }, t.land[reel]),
    )

    return () => {
      cancelAnimationFrame(frame)
      for (const t2 of timers) clearTimeout(t2)
    }
    // Only a new spin rolls the reels; a cascade step redraws them in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken])

  // Cell size is set here rather than in the stylesheet because the tape's
  // translate is expressed in whole cells, so the two must agree exactly.
  const cell = rows >= 4 ? 60 : reels >= 5 ? 76 : 88

  // The overlay is drawn in the reels' own pixel box, cell centres included.
  const overlayW = reels * cell + (reels - 1) * GAP
  const overlayH = rows * cell
  const center = (reel: number, row: number): [number, number] => [
    reel * (cell + GAP) + cell / 2,
    row * cell + cell / 2,
  ]
  const linePts =
    payCells && payCells.length > 1
      ? [...payCells]
          .sort((a, b) => a[0] - b[0])
          .map(([r, rw]) => center(r, rw).join(','))
          .join(' ')
      : null

  return (
    <div
      className={`sl-reels${lit.size > 0 ? ' slr-win' : ''}`}
      style={{ ['--sl-cell' as string]: `${cell}px`, ['--sl-rows' as string]: rows }}
    >
      {Array.from({ length: reels }, (_, reel) => {
        const filler = junk[reel] ?? []
        // The screen first, the junk above it — so parking the tape at
        // -filler.length shows junk, and animating to 0 brings the screen down.
        const tape = [...window[reel], ...filler]
        const isLanded = landed[reel]
        // Actively anticipating: this reel is a near-miss reel, the reel to its
        // left has already landed, and it hasn't stopped yet.
        const anticipating = !isLanded && (timing.ant[reel] ?? false) && landed[reel - 1] === true
        const dur = timing.land[reel] ?? ROLL_MS + reel * ROLL_STEP_MS
        return (
          <div
            className={`sl-reel${isLanded ? ' sl-reel-landed' : ''}${anticipating ? ' slr-reel-ant' : ''}`}
            key={reel}
          >
            <div
              className={`sl-tape${!isLanded ? ' sl-tape-rolling' : ''}`}
              style={{
                transform: rolling
                  ? `translateY(calc(var(--sl-cell) * ${-filler.length}))`
                  : 'translateY(0)',
                transition: rolling
                  ? 'none'
                  : `transform ${dur}ms cubic-bezier(0.16, 0.72, 0.14, 1.04)`,
              }}
            >
              {tape.map((id, i) => (
                <Cell
                  key={`${reel}-${i}-${id}`}
                  machine={machine}
                  id={id}
                  lit={i < rows && isLanded && lit.has(key(reel, i))}
                  crumbling={i < rows && crumbling.has(key(reel, i))}
                  dropping={i < rows && fresh.has(key(reel, i))}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* The payline: a bright path through the cells that paid, drawn on as each
          line is revealed. This is what tells the player *why* they won. */}
      {linePts && (
        <svg
          className="slr-payline-svg"
          key={payKey}
          width={overlayW}
          height={overlayH}
          viewBox={`0 0 ${overlayW} ${overlayH}`}
          aria-hidden="true"
        >
          <polyline className="slr-payline" points={linePts} />
          {payCells?.map(([r, rw], i) => {
            const [cx, cy] = center(r, rw)
            return <circle key={i} className="slr-payline-node" cx={cx} cy={cy} r={cell * 0.15} />
          })}
        </svg>
      )}
    </div>
  )
}
