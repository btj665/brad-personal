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

export function rollDuration(reels: number): number {
  return ROLL_MS + (reels - 1) * ROLL_STEP_MS
}

const key = (reel: number, row: number) => `${reel},${row}`

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
}

export function Reels({ machine, window, lit, crumbling, spinToken, dropped }: ReelsProps) {
  const reels = machine.strips.length
  const rows = machine.rows

  // A tape is the landing screen followed by junk. Parking it scrolled deep into
  // the junk and animating back to zero scrolls the symbols downward, which is
  // the direction a real reel turns.
  const [tapes, setTapes] = useState<SymbolId[][]>([])
  const [rolling, setRolling] = useState(false)
  const [landed, setLanded] = useState<boolean[]>(() => new Array(reels).fill(true))
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
    const built = window.map((col, reel) => {
      const strip = machine.strips[reel]
      const junk: SymbolId[] = []
      const n = FILLER + reel * FILLER_STEP
      for (let i = 0; i < n; i++) junk.push(strip[Math.floor(Math.random() * strip.length)])
      return [...col, ...junk]
    })
    setTapes(built)
    setRolling(true)
    setLanded(new Array(reels).fill(false))

    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setRolling(false)))

    // Mark each reel landed as its own transition ends, so the blur lifts and the
    // cabinet thunks one reel at a time.
    const timers = built.map((_, reel) =>
      setTimeout(
        () => setLanded((was) => was.map((l, i) => (i === reel ? true : l))),
        ROLL_MS + reel * ROLL_STEP_MS,
      ),
    )

    return () => {
      cancelAnimationFrame(frame)
      for (const t of timers) clearTimeout(t)
    }
    // Only a new spin rolls the reels; a cascade step redraws them in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken])

  // Cell size is set here rather than in the stylesheet because the tape's
  // translate is expressed in whole cells, so the two must agree exactly.
  const cell = rows >= 4 ? 60 : reels >= 5 ? 76 : 88

  return (
    <div
      className="sl-reels"
      style={{ ['--sl-cell' as string]: `${cell}px`, ['--sl-rows' as string]: rows }}
    >
      {Array.from({ length: reels }, (_, reel) => {
        const tape = tapes[reel] ?? window[reel]
        const junk = tape.length - rows
        const isLanded = landed[reel]
        return (
          <div className={`sl-reel${isLanded ? ' sl-reel-landed' : ''}`} key={reel}>
            <div
              className={`sl-tape${!isLanded ? ' sl-tape-rolling' : ''}`}
              style={{
                transform: rolling ? `translateY(calc(var(--sl-cell) * ${-junk}))` : 'translateY(0)',
                transition: rolling
                  ? 'none'
                  : `transform ${ROLL_MS + reel * ROLL_STEP_MS}ms cubic-bezier(0.16, 0.72, 0.14, 1.04)`,
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
    </div>
  )
}
