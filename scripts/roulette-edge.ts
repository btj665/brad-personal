// Spins each wheel millions of times against a flat bet and reports the house
// edge. The straight-up bet gives the base edge of the wheel (5.26% American,
// 2.70% European); an even-money bet on the French wheel shows la partage
// cutting that to 1.35%.
//
//   npm run roulette:edge
//   npm run roulette:edge -- 4000000

import { makeRng } from '../src/engine/rng'
import { outsideBet, settleBet, straightBet, type Bet } from '../src/roulette/bets'
import { pockets, type Variant } from '../src/roulette/wheel'

const ROUNDS = Number(process.argv[2] ?? 2_000_000)

function edge(variant: Variant, bet: Bet, seed: number): number {
  const rng = makeRng(seed)
  const ring = pockets(variant)
  let net = 0
  for (let i = 0; i < ROUNDS; i++) {
    const pocket = ring[rng.int(ring.length)]
    net += settleBet(bet, pocket, variant, 1) - 1 // returned minus the 1 staked
  }
  return -net / ROUNDS
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nRoulette house edge — ${ROUNDS.toLocaleString()} spins each\n`)
const cases: Array<[string, Variant, Bet, number]> = [
  ['American, straight up', 'american', straightBet(17), 5.26],
  ['European, straight up', 'european', straightBet(17), 2.7],
  ['European, red', 'european', outsideBet('red'), 2.7],
  ['French, red (la partage)', 'french', outsideBet('red'), 1.35],
]
console.log(`${'bet'.padEnd(28)} ${'simulated'.padStart(10)} ${'expected'.padStart(9)}`)
console.log('-'.repeat(50))
for (const [label, variant, bet, expected] of cases) {
  console.log(`${label.padEnd(28)} ${pct(edge(variant, bet, 7)).padStart(10)} ${`${expected}%`.padStart(9)}`)
}
console.log()
