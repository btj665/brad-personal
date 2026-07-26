// What every machine on the floor returns.
//
// A slot's return is not published by anyone — it is designed, by choosing how
// often each symbol appears on each strip. So unlike every other game here there
// is no outside number to check against; the check is that the return computed
// from the strips matches the number the machine was cut to hit, and that a
// simulation of the whole thing — features included — agrees with it.
//
//   npm run slots:rtp
//   npm run slots:rtp -- 2000000
//
// The base column is exact: enumerated over the reels' marginals, no sampling.
// The played column includes cascades and free games, which feed a screen back
// into itself and so are measured rather than enumerated.

import { makeRng } from '../src/engine/rng'
import { resolveSpin } from '../src/slots/machine'
import { MACHINES } from '../src/slots/machines'
import { exactBaseReturn, exactHitFrequency, exactLineReturn } from '../src/slots/rtp'

// A slot needs far more spins than a table game to resolve. The per-spin return
// of a five-reel machine has a standard deviation around 3 to 7 times the stake,
// so half a million spins pins the return to only about a percentage point —
// enough to miss a machine that is a point off what it claims, which is exactly
// what happened while these were being cut. Defaults are set high on purpose.
const SPINS = Number(process.argv[2] ?? 1_500_000)
const SEEDS = Number(process.argv[3] ?? 8)
const pct = (x: number) => `${(x * 100).toFixed(3)}%`

interface Measured {
  /** Every seed's own return, ascending. */
  runs: number[]
  /** All the spins pooled, which is the figure to quote. */
  pooled: number
  /** Two standard errors on `pooled`. */
  se2: number
  /** Per-spin standard deviation, in units of the stake. */
  sd: number
}

function measure(machine: (typeof MACHINES)[number]): Measured {
  const runs: number[] = []
  let allStaked = 0
  let allPaid = 0
  let sumSq = 0

  for (let s = 0; s < SEEDS; s++) {
    const rng = makeRng(1_000_003 * (s + 1) + machine.id.length)
    let staked = 0
    let paid = 0
    for (let i = 0; i < SPINS; i++) {
      const r = resolveSpin(machine, 1, rng)
      staked += r.staked
      paid += r.paid
      const x = r.paid / r.staked
      sumSq += x * x
    }
    runs.push(paid / staked)
    allStaked += staked
    allPaid += paid
  }

  const n = SPINS * SEEDS
  const pooled = allPaid / allStaked
  const sd = Math.sqrt(Math.max(sumSq / n - pooled * pooled, 0))
  return { runs: runs.sort((a, b) => a - b), pooled, se2: (2 * sd) / Math.sqrt(n), sd }
}

console.log(`\nSlots — return per coin staked\n`)
console.log(`  machine              base    target     played      ±2σ   seed spread          hit`)
console.log(`  ${'-'.repeat(86)}`)

let bad = 0

for (const machine of MACHINES) {
  const base = exactBaseReturn(machine)
  const { runs, pooled, se2, sd } = measure(machine)
  const hit = exactHitFrequency(machine)

  // The pooled figure with its error bar is what decides, not the spread — the
  // spread is printed because it shows how far a single stream can wander, which
  // is the trap when measuring one of these.
  const missed = Math.abs(pooled - machine.targetRtp) > Math.max(se2, 0.004)
  if (missed) bad++

  console.log(
    `  ${machine.label.padEnd(16)}${pct(base).padStart(9)}${pct(machine.targetRtp).padStart(10)}` +
      `${pct(pooled).padStart(11)}${pct(se2).padStart(9)}   ` +
      `${pct(runs[0])}–${pct(runs[runs.length - 1])}` +
      `${(Number.isNaN(hit) ? '  —' : pct(hit)).padStart(11)}${missed ? '  <-- off target' : ''}`,
  )

  const lineShare = exactLineReturn(machine) / base
  const detail =
    machine.feature.kind === 'none'
      ? `all of it enumerated: ${pct(lineShare)} of the base is line pays, the rest scatters`
      : `base is the first screen only; the ${machine.feature.kind} adds ${pct((pooled - base) / pooled)} of the return`
  console.log(`  ${' '.repeat(16)}${detail}. Per-spin SD ${sd.toFixed(2)}×.`)
}

console.log(`\n  base   = lines + scatters, enumerated exactly from the strips — no sampling.`)
console.log(`  played = ${SEEDS} seeds × ${SPINS.toLocaleString()} spins = ${((SEEDS * SPINS) / 1e6).toFixed(1)}M per machine.`)
console.log(`  A machine with no feature must play at its base return. One with a feature`)
console.log(`  cannot be enumerated at all — a screen feeds the next one — so it is measured,`)
console.log(`  and with a per-spin SD this large that needs millions of spins, not thousands.\n`)

if (bad > 0) {
  console.log(`  ${bad} machine(s) are not returning what they were cut for.\n`)
  process.exit(1)
}
