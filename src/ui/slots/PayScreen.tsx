// The PAYS screen.
//
// What a cabinet shows when you press the pay button: every symbol's ladder in
// real credits at the bet you're actually playing, every payline drawn as a
// grid, the feature and the bonus round in plain words, and the return.
//
// Two rules run through all of it:
//
//   1. Nothing is written per cabinet. Every number, every symbol, every line,
//      every sentence is read off the `Machine` object — including which
//      sentences exist at all, because a machine with no scatter, no feature and
//      no bonus must simply not show those cards. A fifth cabinet added to
//      `machines/` renders here with no edit.
//   2. Amounts are shown as credits, not as the per-coin multipliers stored in
//      the config. `linePays` is per coin staked on a line and `scatterPays` is a
//      multiple of the *total* stake; those two are quoted in different units and
//      the one thing a pay screen must never do is let a player add them
//      together. So each is labelled with the unit it is in and shown at the
//      current bet.
//
// The honest-return card is not decoration either. `exactBaseReturn` enumerates
// the base game from the strips, and anything that feeds a screen back into
// itself has to be measured instead; the screen says which is which rather than
// quoting one number and hoping.

import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'

import { pickValue, wheelValue } from '../../slots/bonus'
import { exactBaseReturn } from '../../slots/rtp'
import type { Bonus, Machine, SlotSymbol, SymbolId } from '../../slots/types'
import { SlotArt } from './Symbols'

/* ------------------------------------------------------------------ helpers */

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US')

/** A multiple of the stake. Scatter and bonus schedules carry fractions (half
 *  your bet back for three bells), so this can't just be an integer format. */
function times(n: number): string {
  if (Number.isInteger(n)) return `${n}×`
  return `${Number(n.toFixed(2))}×`
}

/** A ladder row: one paying symbol and its schedule. */
interface Ladder {
  id: SymbolId
  sym: SlotSymbol | undefined
  pays: number[]
  top: number
}

/** Every symbol with a line schedule, best award first. Ties keep the order the
 *  cabinet declares its symbols in, so the premiums stay grouped. */
function ladders(machine: Machine): Ladder[] {
  const order = new Map(machine.symbols.map((s, i) => [s.id, i]))
  return Object.entries(machine.linePays)
    .map(([id, pays]) => ({
      id,
      pays,
      sym: machine.symbols.find((s) => s.id === id),
      top: Math.max(0, ...pays),
    }))
    .sort((a, b) => b.top - a.top || (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
}

/** Which run lengths any symbol on this machine pays for. A stepper pays a lone
 *  cherry, so this is not simply 3..reels. */
function runLengths(machine: Machine): number[] {
  const seen = new Set<number>()
  for (const pays of Object.values(machine.linePays)) {
    pays.forEach((p, n) => {
      if (p > 0) seen.add(n)
    })
  }
  return [...seen].sort((a, b) => a - b)
}

interface Rung {
  count: number
  pay: number
  /** True when this rung is where the ladder stops climbing and rungs above it
   *  repeat the same award — printed `9+` rather than six identical rows. */
  plus: boolean
}

/** A scatter ladder, with the flat top collapsed.
 *
 *  A schedule may deliberately carry entries past the point where it stops
 *  climbing, so that "nine or more" is literally true and a later strip edit
 *  that stacks one more scatter can't silently pay nothing for the best screen
 *  in the game. On the glass that would be the jackpot printed five times. */
function scatterRungs(schedule: Record<number, number>): Rung[] {
  const rungs = Object.entries(schedule)
    .map(([n, pay]) => ({ count: Number(n), pay }))
    .filter((r) => r.pay > 0)
    .sort((a, b) => a.count - b.count)
  if (rungs.length === 0) return []
  const top = Math.max(...rungs.map((r) => r.pay))
  const firstTop = rungs.find((r) => r.pay === top)?.count ?? 0
  const capped = rungs.some((r) => r.count > firstTop)
  return rungs
    .filter((r) => r.count <= firstTop)
    .map((r) => ({ ...r, plus: capped && r.count === firstTop }))
}

/** Collapse repeats, keeping the order they were declared in. A wheel with
 *  twenty-four wedges usually has five or six distinct awards, and printing the
 *  same wedge five times says nothing that "5 of 24" doesn't say better. */
function grouped(values: number[]): Array<{ value: number; n: number }> {
  const out: Array<{ value: number; n: number }> = []
  for (const value of values) {
    const seen = out.find((o) => o.value === value)
    if (seen) seen.n++
    else out.push({ value, n: 1 })
  }
  return out
}

/** Small inline artwork, for naming a symbol inside a sentence. */
function Ico({ machine, id }: { machine: Machine; id: SymbolId }): JSX.Element {
  return (
    <span className="slp-ico">
      <SlotArt machine={machine.id} id={id} />
    </span>
  )
}

/** "3 ★ anywhere" — the trigger, drawn rather than described. */
function Trigger({
  machine,
  id,
  count,
}: {
  machine: Machine
  id: SymbolId
  count: number
}): JSX.Element {
  // Beyond a handful, a row of copies stops reading as a count and starts
  // reading as clutter.
  const drawn = count <= 5 ? count : 1
  return (
    <span className="slp-trigger">
      {count > drawn && <b>{count}</b>}
      {Array.from({ length: drawn }, (_, i) => (
        <Ico key={i} machine={machine} id={id} />
      ))}
    </span>
  )
}

/* --------------------------------------------------------- payline diagrams */

/** One payline as a grid: reels wide, `rows` tall, the cells on the line filled
 *  in the cabinet's accent and a path traced through them.
 *
 *  The path is the point. Filled cells alone say which positions pay; the line
 *  through their centres is what makes twenty of these distinguishable at a
 *  glance, because two lines can cover a similar set of cells and still be
 *  completely different shapes.
 *
 *  Numbered from one to match what the reel window calls out when it pays —
 *  `Win.line` is a zero-based index into `machine.lines`. */
function LineBox({
  line,
  index,
  rows,
}: {
  line: number[]
  index: number
  rows: number
}): JSX.Element {
  const reels = line.length
  const cells: JSX.Element[] = []
  for (let reel = 0; reel < reels; reel++) {
    for (let row = 0; row < rows; row++) {
      const on = line[reel] === row
      cells.push(
        <rect
          key={`${reel},${row}`}
          className={on ? 'slp-lc slp-lc-on' : 'slp-lc'}
          x={reel * 10 + 0.7}
          y={row * 10 + 0.7}
          width={8.6}
          height={8.6}
          rx={1.7}
        />,
      )
    }
  }
  return (
    <div className="slp-linebox">
      <svg
        className="slp-linegrid"
        viewBox={`0 0 ${reels * 10} ${rows * 10}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Line ${index + 1}: ${line.map((r) => r + 1).join('-')}`}
      >
        {cells}
        <polyline
          className="slp-lpath"
          points={line.map((row, reel) => `${reel * 10 + 5},${row * 10 + 5}`).join(' ')}
        />
      </svg>
      <span className="slp-linenum">{index + 1}</span>
    </div>
  )
}

/* --------------------------------------------------------------- the specials */

/** The wild, the scatter, the expanding wild, the trigger: whatever this cabinet
 *  has that isn't just a run of matching pictures. Assembled from the symbol
 *  flags and from what `feature` and `bonus` point at, so a machine with none of
 *  them shows nothing here. */
function specialNotes(machine: Machine): Array<{ id: SymbolId; lines: string[] }> {
  const notes: Array<{ id: SymbolId; lines: string[] }> = []
  const feature = machine.feature
  const bonus = machine.bonus

  for (const sym of machine.symbols) {
    const lines: string[] = []
    if (sym.wild) {
      lines.push('Wild — stands in for any paying symbol, but never for a scatter.')
      if (sym.multiplier) {
        lines.push(
          `Every wild in a win multiplies it ×${sym.multiplier}, and they compound: two of them pay ${sym.multiplier * sym.multiplier}×.`,
        )
      }
      if (machine.linePays[sym.id]) lines.push('It also has a schedule of its own, above.')
      else lines.push('It has no schedule of its own — it only completes other symbols.')
    }
    if (sym.scatter) {
      lines.push('Pays on how many land anywhere on the screen: not on a line, not touching.')
    }
    if (sym.expanding) {
      lines.push('When it lands it can fill its whole reel, top to bottom.')
    }
    if (feature.kind === 'freeSpins' && feature.trigger === sym.id) {
      lines.push(`${feature.triggerCount} anywhere buys ${feature.spins} free games.`)
    }
    if (feature.kind === 'freeSpins' && feature.expandingWild === sym.id) {
      lines.push('During the free games it expands over its whole reel.')
    }
    if (bonus && bonus.trigger === sym.id) {
      lines.push(`${bonus.triggerCount} anywhere starts the bonus round.`)
    }
    if (lines.length > 0) notes.push({ id: sym.id, lines })
  }
  return notes
}

/* ----------------------------------------------------------------- the cards */

function LinePayCard({ machine, coins }: { machine: Machine; coins: number }): JSX.Element {
  const rows = ladders(machine)
  const counts = runLengths(machine)

  return (
    <section className="slp-card">
      <h3 className="slp-h">Line pays</h3>
      <p className="slp-sub">
        Credits <b>per line</b>, at {coins} coin{coins === 1 ? '' : 's'} a line. Every line is
        staked and paid on its own. Runs start on reel one and must be unbroken.
      </p>

      <table className="slp-ladder">
        <thead>
          <tr>
            <th className="slp-lad-sym" scope="col">
              <span className="slp-sr">Symbol</span>
            </th>
            {counts.map((n) => (
              <th key={n} scope="col">
                <b>{n}</b>
                <i>{n === 1 ? 'on reel 1' : 'in a row'}</i>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="slp-lad-sym">
                <span className="slp-art">
                  <SlotArt machine={machine.id} id={row.id} />
                </span>
                {row.sym?.wild && <em className="slp-tag">wild</em>}
              </td>
              {counts.map((n) => {
                const pay = row.pays[n] ?? 0
                return (
                  <td key={n} className={pay > 0 ? 'slp-amt' : 'slp-amt slp-nil'}>
                    {pay > 0 ? fmt(pay * coins) : '–'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ScatterCard({
  machine,
  coins,
  totalBet,
}: {
  machine: Machine
  coins: number
  totalBet: number
}): JSX.Element | null {
  const table = machine.scatterPays
  if (!table) return null
  const entries = Object.entries(table).filter(([, s]) => scatterRungs(s).length > 0)
  if (entries.length === 0) return null

  return (
    <section className="slp-card">
      <h3 className="slp-h">Pays from anywhere</h3>
      <p className="slp-sub">
        Counted over the whole screen — no line, no adjacency. Paid as a multiple of your{' '}
        <b>total bet</b> ({totalBet} credits at {coins} a line × {machine.lines.length} lines), not
        per line.
      </p>

      {entries.map(([id, schedule]) => (
        <div className="slp-scat" key={id}>
          <span className="slp-art slp-art-big">
            <SlotArt machine={machine.id} id={id} />
          </span>
          <div className="slp-scat-rungs">
            {scatterRungs(schedule).map((r) => (
              <span className="slp-rung" key={r.count}>
                <i>
                  {r.count}
                  {r.plus ? '+' : ''}
                </i>
                <b>{fmt(r.pay * totalBet)}</b>
                <em>{times(r.pay)} bet</em>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function LinesCard({ machine }: { machine: Machine }): JSX.Element {
  return (
    <section className="slp-card">
      <h3 className="slp-h">
        Paylines <span className="slp-count">{machine.lines.length}</span>
      </h3>
      <p className="slp-sub">
        {machine.lines.length === 1
          ? 'One line, through the middle. The rows above and below are there to be looked at.'
          : `All ${machine.lines.length} are staked on every spin. The numbers are the ones the machine calls out when it pays.`}
      </p>
      <div className="slp-lines">
        {machine.lines.map((line, i) => (
          <LineBox key={i} line={line} index={i} rows={machine.rows} />
        ))}
      </div>
    </section>
  )
}

function SpecialsCard({ machine }: { machine: Machine }): JSX.Element | null {
  const notes = specialNotes(machine)
  if (notes.length === 0) return null
  return (
    <section className="slp-card">
      <h3 className="slp-h">Special symbols</h3>
      <ul className="slp-specials">
        {notes.map((n) => (
          <li key={n.id}>
            <span className="slp-art slp-art-big">
              <SlotArt machine={machine.id} id={n.id} />
            </span>
            <span className="slp-special-text">{n.lines.join(' ')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FeatureCard({ machine }: { machine: Machine }): JSX.Element {
  const f = machine.feature

  if (f.kind === 'none') {
    return (
      <section className="slp-card">
        <h3 className="slp-h">The feature</h3>
        <p className="slp-body-text">
          This cabinet has none. Everything it pays is on this screen already
          {machine.scatterPays ? ' — the lines and the anywhere pays.' : ' — the lines.'}
        </p>
      </section>
    )
  }

  if (f.kind === 'cascade') {
    const last = f.multipliers[f.multipliers.length - 1]
    return (
      <section className="slp-card">
        <h3 className="slp-h">The feature · cascade</h3>
        <p className="slp-body-text">
          Nothing spins twice. Whatever wins is taken out of the screen, everything above it falls
          into the gap, fresh symbols drop in from the top — and the new screen is paid as well, at
          a higher multiplier each time.
        </p>
        <div className="slp-chips">
          {f.multipliers.map((m, i) => (
            <span className="slp-chip" key={i}>
              <i>
                {i === f.multipliers.length - 1 && f.multipliers.length > 1
                  ? `drop ${i + 1}+`
                  : `drop ${i + 1}`}
              </i>
              <b>×{m}</b>
            </span>
          ))}
        </div>
        <p className="slp-body-text">
          ×{last} holds for every drop past the {f.multipliers.length}
          {f.multipliers.length === 1 ? 'st' : 'th'}. A chain of <b>{f.freeSpinsAt}</b> drops out of
          one spin buys <b>{f.freeSpins} free games</b>, once per spin. A chain ends the moment a
          screen pays nothing, which is what the blank symbols on the strips are for.
        </p>
      </section>
    )
  }

  return (
    <section className="slp-card">
      <h3 className="slp-h">The feature · free games</h3>
      <p className="slp-body-text">
        <Trigger machine={machine} id={f.trigger} count={f.triggerCount} /> anywhere on the screen
        buys <b>{f.spins} free games</b>, played at your current bet and costing nothing. Every win
        during them pays <b>×{f.multiplier}</b>.
      </p>
      {f.expandingWild && (
        <p className="slp-body-text">
          For the length of the round, any <Ico machine={machine} id={f.expandingWild} /> that lands
          floods its whole reel from top to bottom — so one of them on a middle reel counts on every
          line that runs through that reel.
        </p>
      )}
    </section>
  )
}

/** Everything the three bonus kinds share: what starts it, and who decides the
 *  total. Both are printed for all three, because both are true for all three. */
function bonusIntro(bonus: Bonus): string {
  switch (bonus.kind) {
    case 'wheel':
      return 'a wheel, spun once.'
    case 'pick':
      return 'a board of prizes, turned over one box at a time.'
    case 'holdSpin':
      return 'coins lock in place and the empty cells spin again.'
  }
}

/** How this particular round is already over before it starts. */
function alreadyDecided(bonus: Bonus): string {
  switch (bonus.kind) {
    case 'wheel':
      return 'the wheel knows where it will stop before it begins turning.'
    case 'pick':
      return 'the board is dealt — every box, including the duds — before you touch one.'
    case 'holdSpin':
      return 'every respin has already been rolled, coins and all.'
  }
}

function BonusCard({
  machine,
  totalBet,
}: {
  machine: Machine
  totalBet: number
}): JSX.Element | null {
  const b = machine.bonus
  if (!b) return null

  const cells = machine.strips.length * machine.rows
  const coinTotal =
    b.kind === 'holdSpin' ? b.coins.reduce((sum, c) => sum + c.weight, 0) : 0

  return (
    <section className="slp-card slp-card-bonus">
      <h3 className="slp-h">The bonus round</h3>
      <p className="slp-body-text">
        <Trigger machine={machine} id={b.trigger} count={b.triggerCount} /> anywhere on a paid spin
        starts it — {bonusIntro(b)} Awards are multiples of your <b>total bet</b>, so at{' '}
        {totalBet} credits a spin the credits below are what you would be paid.
      </p>

      {b.kind === 'wheel' && (
        <>
          <div className="slp-chips">
            {grouped(b.wedges).map((w) => (
              <span className="slp-chip" key={w.value}>
                <i>{times(w.value)}</i>
                <b>{fmt(w.value * totalBet)}</b>
                <em>
                  {w.n} of {b.wedges.length}
                </em>
              </span>
            ))}
          </div>
          <p className="slp-body-text">
            {b.wedges.length} wedges, and <b>every one is equally likely</b> — there is no small
            slice for the big number. That makes the round worth {times(wheelValue(b))} your bet on
            average, or {fmt(wheelValue(b) * totalBet)} credits at this bet.
          </p>
        </>
      )}

      {b.kind === 'pick' && (
        <>
          <div className="slp-chips">
            {grouped(b.prizes).map((p) => (
              <span className="slp-chip" key={p.value}>
                <i>{times(p.value)}</i>
                <b>{fmt(p.value * totalBet)}</b>
                {p.n > 1 && <em>×{p.n}</em>}
              </span>
            ))}
            {/* One per dud, because the board's composition is the whole price of
                the round and a count in prose is easy to skim past. */}
            {Array.from({ length: b.enders }, (_, i) => (
              <span className="slp-chip slp-chip-dud" key={`dud${i}`}>
                <i>dud</i>
              </span>
            ))}
          </div>
          <p className="slp-body-text">
            {b.prizes.length} prizes and <b>{b.enders} dud{b.enders === 1 ? '' : 's'}</b> are
            shuffled together. You keep turning boxes over and keep everything you find, until you
            turn over a dud — and then the round is finished, whatever is left on the board. With{' '}
            {b.enders} dud{b.enders === 1 ? '' : 's'} in the pile, each prize survives to be
            collected one time in {b.enders + 1}, so the round averages {times(pickValue(b))} your
            bet — {fmt(pickValue(b) * totalBet)} credits at this bet.
          </p>
        </>
      )}

      {b.kind === 'holdSpin' && (
        <>
          <div className="slp-chips">
            {b.coins.map((c, i) => (
              <span className="slp-chip" key={i}>
                <i>{times(c.value)}</i>
                <b>{fmt(c.value * totalBet)}</b>
                <em>{((c.weight / coinTotal) * 100).toFixed(0)}%</em>
              </span>
            ))}
          </div>
          <p className="slp-body-text">
            The symbols that triggered it turn into coins and stay put. You get{' '}
            <b>{b.respins} respins</b>, and every time a new coin lands they are handed back in
            full — so a round only ends when {b.respins} respins go by with nothing new. Each empty
            cell catches a coin about {(b.coinChance * 100).toFixed(0)}% of the time. Fill all{' '}
            {cells} cells and the screen pays a further <b>{times(b.fullScreen)} your total bet</b>{' '}
            ({fmt(b.fullScreen * totalBet)} credits) on top of the coins.
          </p>
        </>
      )}

      <p className="slp-body-text slp-plain">
        The outcome is decided the moment the round triggers: {alreadyDecided(b)} What you touch, and
        in what order, sets how the total is revealed to you — it does not set the total. That is
        what the cabinets do, and it is the only version whose price can be stated honestly.
      </p>
    </section>
  )
}

function ReturnCard({ machine }: { machine: Machine }): JSX.Element {
  const base = useMemo(() => exactBaseReturn(machine), [machine])
  // What the enumeration can't reach. Split in two, because they are not the same
  // claim: a cascade or a free game hands a screen back to itself and can only be
  // measured, while a wheel or a pick board has an exact average that simply
  // isn't a property of the reel strips and so isn't in the figure either.
  const measured: string[] = []
  if (machine.feature.kind === 'cascade') measured.push('the cascades', 'the free games they buy')
  if (machine.feature.kind === 'freeSpins') measured.push('the free games')
  if (machine.bonus?.kind === 'holdSpin') measured.push('the respins')

  const priced =
    machine.bonus?.kind === 'wheel'
      ? `the wheel, whose average is exactly ${times(wheelValue(machine.bonus))} the bet because every wedge is equally likely`
      : machine.bonus?.kind === 'pick'
        ? `the pick board, whose average is exactly ${times(pickValue(machine.bonus))} the bet — the prize pool over one more than the duds`
        : null

  const outside = [...measured, ...(priced ? [priced] : [])]

  return (
    <section className="slp-card slp-card-truth">
      <h3 className="slp-h">The return</h3>
      <div className="slp-figures">
        <span className="slp-figure">
          <i>Base game, enumerated</i>
          <b>{(base * 100).toFixed(2)}%</b>
        </span>
        <span className="slp-figure">
          <i>Cut to</i>
          <b>{(machine.targetRtp * 100).toFixed(1)}%</b>
        </span>
      </div>
      <p className="slp-body-text">
        The first figure is not a sample. It is every combination the reel strips can show, weighted
        by how often it lands, run through the same evaluator the game plays with — and it counts
        only what the reels themselves pay.
        {outside.length > 0 ? ` Outside it: ${outside.join(', and ')}.` : ''}
        {measured.length > 0
          ? ' Anything that feeds a screen back into itself has to be measured over millions of spins rather than enumerated, which is why the two figures are not the same number.'
          : outside.length > 0
            ? ' The second figure is what the cabinet was cut to once that is added back.'
            : ' Nothing else on this cabinet pays, so that figure is the whole machine.'}
      </p>
    </section>
  )
}

/* ------------------------------------------------------------ the pay screen */

export function PayScreen({
  machine,
  coins,
  open,
  onClose,
}: {
  machine: Machine
  coins: number
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  const panel = useRef<HTMLDivElement | null>(null)

  // Escape closes it, from wherever the focus happens to be.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Opened fresh, or switched cabinet with it open: start at the top and take
  // the focus, so a keyboard is looking at the thing that just appeared.
  useEffect(() => {
    if (!open) return
    const node = panel.current
    if (!node) return
    node.scrollTop = 0
    node.focus({ preventScroll: true })
  }, [open, machine])

  if (!open) return null

  const totalBet = coins * machine.lines.length

  return (
    // The cabinet class carries this machine's accent, so the overlay is tinted
    // like the box it covers whether or not it is nested inside one.
    <div
      className={`slp-scrim sl-${machine.id}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="slp-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${machine.label} — pay table`}
        tabIndex={-1}
        ref={panel}
      >
        <header className="slp-top">
          <div className="slp-title">
            <span className="slp-kicker">Pays</span>
            <h2>{machine.label}</h2>
          </div>
          <div className="slp-bet">
            <span className="slp-figure">
              <i>Coins per line</i>
              <b>{coins}</b>
            </span>
            <span className="slp-figure">
              <i>Lines</i>
              <b>{machine.lines.length}</b>
            </span>
            <span className="slp-figure slp-figure-key">
              <i>Total bet</i>
              <b>{totalBet}</b>
            </span>
          </div>
          <button className="slp-close" onClick={onClose} aria-label="Close the pay table">
            ×
          </button>
        </header>

        <div className="slp-grid">
          {/* The two tall things — the ladders, as long as the machine has
              symbols, and the payline grids, as tall as it has lines — sit side
              by side. Everything written in words goes underneath at full width,
              so a cabinet with no scatter and few symbols doesn't leave half a
              column empty. */}
          <div className="slp-col">
            <LinePayCard machine={machine} coins={coins} />
            {/* The return goes under the ladder rather than last in the row of
                prose cards: it is about the numbers directly above it, and a row
                of three fills its line where a row of four leaves an orphan. */}
            <ReturnCard machine={machine} />
          </div>
          <div className="slp-col">
            <LinesCard machine={machine} />
            {/* The anywhere pays sit under the payline diagrams on purpose: the
                one thing to understand about them is that none of those diagrams
                applies to them. */}
            <ScatterCard machine={machine} coins={coins} totalBet={totalBet} />
          </div>
        </div>

        <div className="slp-notes">
          <SpecialsCard machine={machine} />
          <FeatureCard machine={machine} />
          <BonusCard machine={machine} totalBet={totalBet} />
        </div>

        <footer className="slp-foot">
          <span>Malfunction voids all pays. Escape, or click outside, to go back.</span>
          <button className="slp-done" onClick={onClose}>
            Back to the reels
          </button>
        </footer>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- the strip */

/** The always-visible strip beside the reels: the best few awards at the bet
 *  being played, and a way through to everything else.
 *
 *  It deliberately does not try to be the pay screen in 210 pixels. Only the top
 *  award of each of the best symbols, one line for the anywhere pays if there
 *  are any, and what the feature is — the ladders, the payline grids, the bonus
 *  and the return all live behind the button. */
export function PayStrip({
  machine,
  coins,
  onSeeAll,
}: {
  machine: Machine
  coins: number
  /** Wired to whatever opens `PayScreen`. Without it the strip still says where
   *  the rest of the pays are, it just can't take you there. */
  onSeeAll?: () => void
}): JSX.Element {
  const rows = ladders(machine).slice(0, 5)
  const totalBet = coins * machine.lines.length
  const scatter = machine.scatterPays
    ? Object.entries(machine.scatterPays)
        .map(([id, schedule]) => ({ id, rungs: scatterRungs(schedule) }))
        .filter((s) => s.rungs.length > 0)[0]
    : undefined
  const best = scatter?.rungs[scatter.rungs.length - 1]

  const feature =
    machine.feature.kind === 'cascade'
      ? `${machine.feature.freeSpinsAt} drops → ${machine.feature.freeSpins} free games`
      : machine.feature.kind === 'freeSpins'
        ? `${machine.feature.triggerCount} triggers → ${machine.feature.spins} free games ×${machine.feature.multiplier}`
        : null
  const bonus = machine.bonus
    ? machine.bonus.kind === 'holdSpin'
      ? 'Hold & spin bonus'
      : machine.bonus.kind === 'wheel'
        ? 'Wheel bonus'
        : 'Pick bonus'
    : null

  return (
    <div className="slp-strip">
      <div className="slp-strip-head">
        <span>Top pays</span>
        <em>{coins}/line</em>
      </div>

      <ul className="slp-strip-list">
        {rows.map((row) => {
          const count = row.pays.lastIndexOf(row.top)
          return (
            <li key={row.id}>
              <span className="slp-art">
                <SlotArt machine={machine.id} id={row.id} />
              </span>
              <i>{count}</i>
              <b>{fmt(row.top * coins)}</b>
            </li>
          )
        })}
        {scatter && best && (
          <li className="slp-strip-scat">
            <span className="slp-art">
              <SlotArt machine={machine.id} id={scatter.id} />
            </span>
            <i>
              {best.count}
              {best.plus ? '+' : ''}
            </i>
            <b>{fmt(best.pay * totalBet)}</b>
          </li>
        )}
      </ul>

      <div className="slp-strip-note">
        {scatter
          ? 'Bottom row pays from anywhere, × total bet. The rest is per line.'
          : 'Credits per line, at this bet.'}
      </div>

      {(feature || bonus) && (
        <div className="slp-strip-feat">{[feature, bonus].filter(Boolean).join(' · ')}</div>
      )}

      {onSeeAll ? (
        <button className="slp-strip-more" onClick={onSeeAll}>
          See all pays
          <i>
            {machine.lines.length} line{machine.lines.length === 1 ? '' : 's'} · odds
          </i>
        </button>
      ) : (
        <div className="slp-strip-more slp-strip-more-flat">
          Press <b>Pays</b> for all {machine.lines.length} line
          {machine.lines.length === 1 ? '' : 's'} and the odds
        </div>
      )}
    </div>
  )
}
