// Auditing the win logic from the outside.
//
// `slots.test.ts` checks the evaluator against screens built by hand. This file
// does the opposite: it plays every cabinet for thousands of spins and re-derives
// each win it reports straight from the pay table, without using the evaluator to
// check the evaluator. Every claim a `Win` makes has to survive:
//
//   · its cells lie on the payline it names,
//   · they start on reel one and run unbroken (leftmost alignment),
//   · every one of them holds that symbol or a wild,
//   · the run is maximal — the next reel along doesn't also match,
//   · the pay equals the table entry times any multiplying wilds,
//   · the step's total is its wins times the step multiplier, and the steps
//     add up to what the spin says it paid.
//
// It was written after the cascading cabinet was accused of paying inconsistently.
// It wasn't — the arithmetic was right and the screen was misreporting it — but
// the accusation deserved a check that can be re-run rather than an argument.

import { describe, expect, it } from 'vitest'

import { makeRng } from '../engine/rng'
import { resolveSpin } from './machine'
import { MACHINES } from './machines'
import type { Machine } from './types'

const SPINS = 3_000

/** Structural rules every payline has to obey, whatever the cabinet. */
function paylineFaults(m: Machine): string[] {
  const faults: string[] = []
  const seen = new Set<string>()

  m.lines.forEach((line, i) => {
    if (line.length !== m.strips.length) {
      faults.push(`line ${i}: covers ${line.length} reels, machine has ${m.strips.length}`)
    }
    for (const row of line) {
      if (row < 0 || row >= m.rows) faults.push(`line ${i}: row ${row} is off the screen`)
    }
    // A payline is a path across the glass; it may step one row between adjacent
    // reels, never two. A line that jumps doesn't read as a line to a player.
    for (let r = 1; r < line.length; r++) {
      if (Math.abs(line[r] - line[r - 1]) > 1) {
        faults.push(`line ${i}: jumps ${line[r - 1]}→${line[r]} between reels ${r - 1} and ${r}`)
      }
    }
    const key = line.join(',')
    if (seen.has(key)) faults.push(`line ${i}: duplicates an earlier line`)
    seen.add(key)
  })

  return faults
}

function winFaults(m: Machine, spins: number, coins = 1): string[] {
  const faults: string[] = []
  const rng = makeRng(20260726)
  const byId = new Map(m.symbols.map((s) => [s.id, s]))
  const stake = coins * m.lines.length

  for (let s = 0; s < spins && faults.length < 20; s++) {
    const result = resolveSpin(m, coins, rng)

    for (const [si, step] of result.steps.entries()) {
      const where = `spin ${s} step ${si}`
      let sum = 0

      for (const win of step.wins) {
        sum += win.paid

        if (win.kind === 'scatter') {
          // A scatter's cells are wherever it landed; the only claim to check is
          // that the count matches, and that the pay is off the total stake.
          if (win.cells.length !== win.count) {
            faults.push(`${where}: scatter says ${win.count} but lists ${win.cells.length} cells`)
          }
          for (const [reel, row] of win.cells) {
            if (step.window[reel][row] !== win.symbol) {
              faults.push(`${where}: scatter cell [${reel},${row}] is not ${win.symbol}`)
            }
          }
          const due = (m.scatterPays?.[win.symbol]?.[win.count] ?? 0) * stake
          if (due !== win.paid) faults.push(`${where}: scatter paid ${win.paid}, table says ${due}`)
          continue
        }

        const line = m.lines[win.line]
        if (!line) {
          faults.push(`${where}: names line ${win.line}, which doesn't exist`)
          continue
        }
        if (win.cells.length !== win.count) {
          faults.push(`${where}: line ${win.line} says ${win.count} but lists ${win.cells.length}`)
        }

        // Leftmost-aligned and unbroken, on the line it claims.
        win.cells.forEach(([reel, row], k) => {
          if (reel !== k) faults.push(`${where}: line ${win.line} cell ${k} sits on reel ${reel}`)
          if (line[reel] !== row) {
            faults.push(`${where}: line ${win.line} cell [${reel},${row}] is off its own line`)
          }
        })

        // Every cell holds the symbol or substitutes for it, and multiplying
        // wilds are counted once each.
        let multiplier = 1
        for (const [reel, row] of win.cells) {
          const id = step.window[reel][row]
          const sym = byId.get(id)
          if (id === win.symbol) continue
          if (!sym?.wild || sym.scatter) {
            faults.push(`${where}: line ${win.line} cell [${reel},${row}] holds ${id}`)
            continue
          }
          if (sym.multiplier) multiplier *= sym.multiplier
        }

        // Maximal: if the next reel along also matched and the table pays for the
        // longer run, the machine short-changed the player.
        const next = win.count
        if (next < m.strips.length) {
          const id = step.window[next][line[next]]
          const sym = byId.get(id)
          const matches = id === win.symbol || (sym?.wild && !sym.scatter)
          const paysMore = (m.linePays[win.symbol]?.[win.count + 1] ?? 0) > 0
          if (matches && paysMore) {
            faults.push(`${where}: line ${win.line} stopped at ${win.count} but reel ${next} matched`)
          }
        }

        const due = (m.linePays[win.symbol]?.[win.count] ?? 0) * coins * multiplier
        if (due !== win.paid) {
          faults.push(`${where}: line ${win.line} ${win.symbol}×${win.count} paid ${win.paid}, table says ${due}`)
        }
      }

      if (Math.abs(sum * step.multiplier - step.paid) !== 0) {
        faults.push(`${where}: paid ${step.paid}, but wins sum ${sum} × ${step.multiplier}`)
      }
    }

    // The reels and the bonus are the only two things that can pay, so together
    // they have to account for the spin exactly. A bonus award lives outside the
    // steps, which is precisely why it is easy to lose track of.
    const fromReels = result.steps.reduce((a, st) => a + st.paid, 0)
    const fromBonus = result.bonus?.paid ?? 0
    if (fromReels + fromBonus !== result.paid) {
      faults.push(
        `spin ${s}: reels ${fromReels} + bonus ${fromBonus} = ${fromReels + fromBonus}, spin says ${result.paid}`,
      )
    }
    if (result.bonus && result.bonus.paid < 0) faults.push(`spin ${s}: bonus paid ${result.bonus.paid}`)
    if (result.staked !== stake) faults.push(`spin ${s}: staked ${result.staked}, expected ${stake}`)
  }

  return faults
}

describe.each(MACHINES.map((m) => [m.label, m] as const))('%s', (_label, machine) => {
  it('has paylines that are legal, distinct paths across the glass', () => {
    expect(paylineFaults(machine)).toEqual([])
  })

  it('pays exactly what its own pay table says, over thousands of spins', () => {
    expect(winFaults(machine, SPINS)).toEqual([])
  })

  it('scales cleanly with coins per line', () => {
    // Every line pay is per-coin and every scatter pay is off the total stake, so
    // raising the bet must not change which combinations win — only the amounts.
    expect(winFaults(machine, 400, 5)).toEqual([])
  })
})

describe('a cascade always ends on a screen that paid nothing', () => {
  const cascading = MACHINES.filter((m) => m.feature.kind === 'cascade')

  it.each(cascading.map((m) => [m.label, m] as const))(
    '%s — which is why the total belongs to the spin, not the glass',
    (_label, machine) => {
      const rng = makeRng(4242)
      let chains = 0
      for (let s = 0; s < 600; s++) {
        const result = resolveSpin(machine, 1, rng)
        const last = result.steps[result.steps.length - 1]
        // The chain stops precisely because a screen didn't pay, so the screen the
        // player is left looking at never has a win on it.
        expect(last.wins).toHaveLength(0)
        expect(last.paid).toBe(0)
        if (result.steps.length > 1) chains++
      }
      // If this ever hit zero the assertion above would be vacuous.
      expect(chains).toBeGreaterThan(50)
    },
  )
})
