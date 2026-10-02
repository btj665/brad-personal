// The exact return of every keno pick count.
//
// Nothing here is simulated. A keno round has C(80,20) = 3,535,316,142,212,174,320
// equally likely outcomes, but they collapse into at most eleven cases per
// ticket — you caught 0, 1, … n of your n spots — and each case has a closed-form
// hypergeometric probability. So the return is a weighted sum of eleven numbers,
// computed once, correct to the last digit the printer can hold. A simulator
// would take billions of tickets to resolve a ten-spot's top prize to two
// decimals and still be an estimate.
//
//   tsx scripts/keno-return.ts
//   tsx scripts/keno-return.ts nevada-1
//
// The house edge this prints is 25%–30%. That is what casino keno is, and this
// script is deliberately blunt about it: the same suite reports blackjack at
// about 0.4%, so a keno ticket is roughly seventy times the price per unit bet.

import {
  catchDistribution,
  catchProbability,
  oneIn,
  oneInFloor,
  TOTAL_DRAWS,
} from '../src/keno/odds'
import {
  expectedReturn,
  houseEdge,
  payFor,
  PAYTABLES,
  paytableById,
  PICK_COUNTS,
  winningCatches,
} from '../src/keno/paytables'

const ONLY = process.argv[2]
const table = ONLY ? paytableById(ONLY) : PAYTABLES[0]

const pct = (x: number) => `${(x * 100).toFixed(3)}%`
const money = (x: number) => x.toLocaleString('en-US')
/** C(80,20) does not fit in a double, so it is grouped as a BigInt — printing it
 *  through Number() here would be a precision bug in the middle of a precision
 *  report. */
const bigMoney = (x: bigint) => x.toLocaleString('en-US')
/** "1 in 8,911,711", the way a rate card writes it. */
const chance = (picks: number, caught: number) => {
  const n = oneIn(picks, caught)
  if (!Number.isFinite(n)) return 'never'
  return n < 1000 ? `1 in ${n.toFixed(2)}` : `1 in ${bigMoney(oneInFloor(picks, caught))}`
}

console.log(`\nKeno — exact returns, ${table.label}`)
console.log(`Rate card: ${table.source}`)
console.log(`Possible draws: C(80,20) = ${bigMoney(TOTAL_DRAWS)} (counted, not sampled)\n`)

// ── Per-pick detail ────────────────────────────────────────────────────────────
for (const n of PICK_COUNTS) {
  const rows = winningCatches(table, n)
  console.log(`${n}-spot ticket`)
  console.log(
    `  ${'catch'.padStart(5)} ${'pays'.padStart(9)} ${'probability'.padStart(13)} ${'odds'.padStart(16)} ${'of the return'.padStart(14)}`,
  )
  console.log(`  ${'-'.repeat(62)}`)
  for (const k of rows) {
    const pay = payFor(table, n, k)
    const p = catchProbability(n, k)
    console.log(
      `  ${String(k).padStart(5)} ${money(pay).padStart(9)} ${p.toExponential(4).padStart(13)} ${chance(n, k).padStart(16)} ${pct(p * pay).padStart(14)}`,
    )
  }
  const ret = expectedReturn(table, n)
  console.log(
    `  ${'none'.padStart(5)} ${'0'.padStart(9)} ${lossProbability(n).toExponential(4).padStart(13)} ${''.padStart(16)} ${pct(0).padStart(14)}`,
  )
  console.log(`  return ${pct(ret)}    house edge ${pct(1 - ret)}\n`)
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('Summary — exact return and house edge by pick count\n')
console.log(
  `${'pick'.padStart(4)} ${'return'.padStart(9)} ${'house edge'.padStart(11)} ${'top prize'.padStart(11)} ${'odds of a solid ticket'.padStart(24)}`,
)
console.log('-'.repeat(64))
for (const n of PICK_COUNTS) {
  console.log(
    `${String(n).padStart(4)} ${pct(expectedReturn(table, n)).padStart(9)} ${pct(houseEdge(table, n)).padStart(11)} ${money(payFor(table, n, n)).padStart(11)} ${chance(n, n).padStart(24)}`,
  )
}

const edges = PICK_COUNTS.map((n) => houseEdge(table, n))
// "best" throughout means best for the player: the smallest house edge.
const best = Math.min(...edges)
const worst = Math.max(...edges)
console.log('-'.repeat(64))
console.log(
  `     best return ${pct(1 - best)}   worst return ${pct(1 - worst)}   edge spans ${pct(best)} – ${pct(worst)}`,
)

// ── Validation ────────────────────────────────────────────────────────────────
// The reason to do this exactly rather than by sampling: these are checkable.
console.log('\nValidation\n')
for (const n of PICK_COUNTS) {
  const sum = catchDistribution(n).reduce((a, b) => a + b, 0)
  const drift = Math.abs(sum - 1)
  console.log(
    `  ${String(n).padStart(2)}-spot: catch probabilities sum to ${sum.toFixed(15)} (off by ${drift.toExponential(2)})`,
  )
}
console.log(`\n  catch 10 of 10   ${chance(10, 10)}   (published: 1 in 8,911,711)`)
console.log(`  catch  0 of 10   ${chance(10, 0)}   (published: 1 in 21.8)`)
console.log(`  catch  1 of  1   ${chance(1, 1)}   (exactly 20/80)`)

// ── The honest part ───────────────────────────────────────────────────────────
const BLACKJACK_EDGE = 0.004
console.log(
  `\nFor scale: basic-strategy blackjack in this suite holds about ${pct(BLACKJACK_EDGE)}.`,
)
console.log(
  `The kindest keno ticket on this card holds ${pct(best)} — ${(best / BLACKJACK_EDGE).toFixed(0)}x worse.`,
)
console.log(
  `The worst holds ${pct(worst)}, i.e. ${pct(1 - worst)} of every dollar comes back.\n`,
)

/** The chance a ticket pays nothing at all — the row a rate card never prints. */
function lossProbability(picks: number): number {
  const winners = new Set(winningCatches(table, picks))
  let p = 0
  for (let k = 0; k <= picks; k++) if (!winners.has(k)) p += catchProbability(picks, k)
  return p
}
