// Big Six / the money wheel. Fifty-four stops, seven bets, no decisions — so
// there is nothing to simulate. This walks the whole wheel once per bet and
// prints the exact edge, which is always a whole number of stops over 54.
//
// The result is the point of the exercise: every bet on this wheel is worse than
// every bet in roulette, and the two 40:1 symbols are worse than a keno ticket.
// Big Six is the worst bet on a casino floor, and it takes 54 lines of counting
// to prove it rather than a million spins of hoping.
//
//   npx tsx scripts/bigsix-edge.ts

import { enumerateEdge, houseEdge, LABEL, PAYS, STOPS, SYMBOLS, TOTAL_STOPS, WHEEL } from '../src/bigsix/wheel'

/** Published house edges, for the comparison column. */
const PUBLISHED: Record<string, number> = {
  '1': 0.1111,
  '2': 0.1667,
  '5': 0.2222,
  '10': 0.1852,
  '20': 0.2222,
  joker: 0.2407,
  logo: 0.2407,
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nBig Six — ${TOTAL_STOPS} stops, enumerated exactly (no simulation)\n`)
console.log(
  `${'bet'.padEnd(7)} ${'stops'.padStart(6)} ${'pays'.padStart(6)} ${'return'.padStart(8)} ` +
    `${'edge'.padStart(9)} ${'published'.padStart(10)} ${'/54'.padStart(6)}`,
)
console.log('-'.repeat(60))

for (const s of SYMBOLS) {
  const n = STOPS[s]
  const edge = houseEdge(s)
  // Walking the ring must agree with the closed form; if it doesn't, the ring
  // was built with the wrong number of some symbol.
  if (Math.abs(edge - enumerateEdge(s)) > 1e-12) {
    throw new Error(`ring and stop counts disagree on ${s}`)
  }
  console.log(
    `${LABEL[s].padEnd(7)} ${`${n}/54`.padStart(6)} ${`${PAYS[s]}:1`.padStart(6)} ` +
      `${pct(1 - edge).padStart(8)} ${pct(edge).padStart(9)} ${pct(PUBLISHED[s]).padStart(10)} ` +
      `${`-${Math.round(edge * TOTAL_STOPS)}`.padStart(6)}`,
  )
}

console.log('-'.repeat(60))

// A sanity check that the ring really is the wheel the counts describe.
const built = SYMBOLS.map((s) => `${LABEL[s]}x${WHEEL.filter((x) => x === s).length}`).join('  ')
console.log(`ring: ${built}  =  ${WHEEL.length} stops`)

const best = [...SYMBOLS].sort((a, b) => houseEdge(a) - houseEdge(b))[0]
console.log(
  `\nThe kindest bet on the wheel is ${LABEL[best]} at ${pct(houseEdge(best))} — still twice the` +
    `\nAmerican roulette edge of 5.26%. There is no good bet here at all.\n`,
)
