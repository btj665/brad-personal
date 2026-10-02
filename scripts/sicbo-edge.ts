// Sic Bo has 216 outcomes, so there is nothing here to simulate: this walks
// every roll against every spot on the layout and prints the exact edge as a
// fraction over 216. If a spot disagrees with its published figure, the bug is
// in src/sicbo/bets.ts — or the published figure is wrong, which is the case for
// three of them (see below).
//
//   npx tsx scripts/sicbo-edge.ts

import {
  ALL_ROLLS,
  edgeUnits,
  hitCount,
  houseEdge,
  LAYOUT,
  publishedEdge,
  settleBet,
  type Bet,
} from '../src/sicbo/bets'

const pct = (x: number) => `${(x * 100).toFixed(2)}%`

/** The published figure is quoted to two decimals, so agree to within rounding. */
const agrees = (bet: Bet) => Math.abs(houseEdge(bet) * 100 - publishedEdge(bet)) < 0.005

console.log(`\nSic Bo house edge — exact, over all ${ALL_ROLLS.length} rolls\n`)
console.log(
  `${'spot'.padEnd(16)} ${'pays'.padStart(11)} ${'wins'.padStart(8)} ${'keeps'.padStart(7)} ` +
    `${'exact'.padStart(8)} ${'published'.padStart(9)}`,
)
console.log('-'.repeat(66))

const off: Bet[] = []
for (const bet of LAYOUT) {
  const ok = agrees(bet)
  if (!ok) off.push(bet)
  console.log(
    `${bet.label.padEnd(16)} ${bet.pays.padStart(11)} ${`${hitCount(bet)}/216`.padStart(8)} ` +
      `${`${edgeUnits(bet)}/216`.padStart(7)} ${pct(houseEdge(bet)).padStart(8)} ` +
      `${`${publishedEdge(bet).toFixed(2)}%`.padStart(9)} ${ok ? '' : '  <-- differs'}`,
  )
}

// A sanity check on the enumeration itself: the 216 rolls have to account for
// every combination exactly once, and one unit on every spot on the layout has
// to come back as the sum of the individual edges.
const layoutUnits = LAYOUT.reduce((n, bet) => n + edgeUnits(bet), 0)
let flatNet = 0
for (const roll of ALL_ROLLS) for (const bet of LAYOUT) flatNet += settleBet(bet, roll, 1) - 1
if (-flatNet !== layoutUnits) throw new Error(`enumeration disagrees with itself: ${-flatNet} vs ${layoutUnits}`)

console.log(`\nCovering the whole layout, one unit a spot: the house keeps ${pct(layoutUnits / (216 * LAYOUT.length))}.`)

if (off.length > 0) {
  console.log(`\n${off.length} spot(s) differ from the published sheet. The enumeration above is arithmetic;`)
  console.log('the published numbers for these belong to other bets:')
  console.log('  · any triple at 30:1 is 13.89% (30/216). 30.09% (65/216) is a *specific*')
  console.log('    triple paying 150:1 — a different bet on a stingier layout.')
  console.log('  · a specific double at 10:1 is 18.52% (40/216). 18.98% (41/216) is the')
  console.log('    total-9-or-12 figure, which this script also prints, correctly, below it.')
  console.log('  · a 6 or 15 at 18:1 is 12.04% (26/216). 16.67% is that spot at 17:1, the')
  console.log('    commoner Macau price; change TOTAL_PAYOUT[6] and [15] to 17 to land on it.')
}
console.log()
