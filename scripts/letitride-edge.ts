// The exact Let It Ride house edge, by enumeration. Nothing here is sampled.
//
// A round is a choice of three player cards out of 52 — C(52,3) = 22,100 — and
// then an ORDERED pair of community cards out of the remaining 49, which is
// 49 x 48 = 2,352. That is 51,979,200 equally likely rounds. The order of the two
// community cards matters even though the final hand doesn't care, because the
// first one is the card the player sees before deciding bet 2; so the pair is
// scored once and both orderings share the score.
//
// ---------------------------------------------------------------------------
// Let It Ride quotes two edge figures and they get confused constantly. Both are
// the SAME expected loss over a different denominator:
//
//   * 3.51% OF THE BASE BET. Expected loss per round measured in units of ONE of
//     the three equal bets. This is what "the house edge in Let It Ride" means in
//     every book and on every strategy card, and it is the number to compare
//     against other games' per-hand-decision edges.
//
//   * 2.85% OF THE AVERAGE TOTAL AMOUNT AT RISK. The same loss divided by the
//     average number of units actually left on the table when the hand is paid
//     (~1.23 of the three, because good play pulls most of them back). This is
//     the "element of risk" — what the player's money at stake actually earns.
//
//   * 1.17% of the three units posted up front is a third, valid-looking ratio
//     that nobody means by "the house edge", because two of those three units
//     are usually not at risk. It is printed below only so it can be recognised
//     and dismissed.
//
//   npx tsx scripts/letitride-edge.ts
//   npx tsx scripts/letitride-edge.ts 2000000    # rounds for the engine check

import { buildShoeCards } from '../src/engine/cards'
import type { Card } from '../src/engine/types'
import { score5 } from '../src/poker/eval'
import { LetItRideGame } from '../src/letitride/engine'
import { labelFor, oddsFor, payKeyFor, PAYTABLE, type PayKey } from '../src/letitride/rules'
import { letBet1Ride, letBet2Ride } from '../src/letitride/strategy'

const SIM_ROUNDS = Number(process.argv[2] ?? 1_000_000)

const deck = buildShoeCards(1)
const N = deck.length

// Every sum below is over integers, so the totals stay exact in a float64 and the
// final ratios are the true values, not estimates.
let rounds = 0 // ordered (three, c1, c2) outcomes counted
let netUnits = 0 // net units won, summed over outcomes
let riskUnits = 0 // units still on the table when paid, summed over outcomes
let bet1Rides = 0
let bet2Rides = 0

const KEYS: PayKey[] = PAYTABLE.map((r) => r.key)
const KEY_INDEX = new Map<PayKey, number>(KEYS.map((k, idx) => [k, idx]))
const hits = new Float64Array(KEYS.length + 1) // last slot = losers

// Hoisted scratch: 26 million score5 calls is enough that the allocations in
// this loop are the difference between a minute and five.
const three: Card[] = [deck[0], deck[0], deck[0]]
const four: Card[] = [deck[0], deck[0], deck[0], deck[0]]
const five: Card[] = [deck[0], deck[0], deck[0], deck[0], deck[0]]
const rest: Card[] = new Array<Card>(49).fill(deck[0])
const ride2 = new Uint8Array(49)

const started = Date.now()
let hands = 0

for (let i = 0; i < N - 2; i++) {
  three[0] = deck[i]
  for (let j = i + 1; j < N - 1; j++) {
    three[1] = deck[j]
    for (let k = j + 1; k < N; k++) {
      three[2] = deck[k]

      let m = 0
      for (let x = 0; x < N; x++) if (x !== i && x !== j && x !== k) rest[m++] = deck[x]

      const ride1 = letBet1Ride(three) ? 1 : 0

      four[0] = three[0]
      four[1] = three[1]
      four[2] = three[2]
      let ride2Sum = 0
      for (let a = 0; a < 49; a++) {
        four[3] = rest[a]
        const r = letBet2Ride(four) ? 1 : 0
        ride2[a] = r
        ride2Sum += r
      }

      five[0] = three[0]
      five[1] = three[1]
      five[2] = three[2]
      // Bet 3 always rides, so every outcome carries at least one unit; the "2 *"
      // is because each unordered community pair stands for two ordered rounds.
      const base = 2 * (1 + ride1)

      for (let a = 0; a < 48; a++) {
        five[3] = rest[a]
        for (let b = a + 1; b < 49; b++) {
          five[4] = rest[b]
          const pk = payKeyFor(score5(five))
          const ratio = pk === null ? -1 : oddsFor(pk)
          hits[pk === null ? KEYS.length : KEY_INDEX.get(pk)!] += 2
          // Swapping the community cards leaves the hand alone and only changes
          // which one bet 2 was decided on, so the two orderings differ by
          // ride2[a] vs ride2[b] and nothing else.
          const units = base + ride2[a] + ride2[b]
          netUnits += ratio * units
          riskUnits += units
        }
      }

      rounds += 2 * 1176
      bet1Rides += ride1 * 2352
      bet2Rides += ride2Sum * 48 // each first community card pairs with 48 seconds

      if (++hands % 2000 === 0) {
        const done = hands / 22100
        process.stderr.write(
          `\r  enumerating ${(done * 100).toFixed(0)}%  (${((Date.now() - started) / 1000).toFixed(0)}s)   `,
        )
      }
    }
  }
}
process.stderr.write('\r' + ' '.repeat(48) + '\r')

const lossPerRound = -netUnits / rounds // in units of one base bet
const avgAtRisk = riskUnits / rounds
const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nLet It Ride — exact, all ${rounds.toLocaleString()} rounds enumerated`)
console.log(`(${(22100).toLocaleString()} three-card hands x 2,352 ordered community pairs)\n`)

console.log('  Final hand                     frequency        pays')
console.log('  ' + '-'.repeat(56))
for (let idx = 0; idx < KEYS.length; idx++) {
  const p = hits[idx] / rounds
  const one = p === 0 ? '—' : `1 in ${Math.round(1 / p).toLocaleString()}`
  console.log(
    `  ${labelFor(KEYS[idx]).padEnd(26)} ${(p * 100).toFixed(5).padStart(9)}%  ${one.padStart(13)}   ${oddsFor(KEYS[idx])}:1`,
  )
}
console.log(
  `  ${'Loser'.padEnd(26)} ${((hits[KEYS.length] / rounds) * 100).toFixed(5).padStart(9)}%`,
)

console.log(`\n  Bet 1 let ride    ${pct(bet1Rides / rounds)}`)
console.log(`  Bet 2 let ride    ${pct(bet2Rides / rounds)}`)
console.log(`  Bet 3 let ride    ${pct(1)}  (it has no choice)`)
console.log(`  Average units left on the table when paid   ${avgAtRisk.toFixed(4)} of 3\n`)

console.log(`  Expected loss per round   ${lossPerRound.toFixed(6)} units of one base bet\n`)
console.log(`  HOUSE EDGE, per base bet          ${pct(lossPerRound)}   (published: 3.51%)`)
console.log(`    denominator: one of the three equal bets`)
console.log(`  ELEMENT OF RISK, per unit at risk ${pct(lossPerRound / avgAtRisk)}   (published: 2.85%)`)
console.log(`    denominator: average units still riding at the payout (${avgAtRisk.toFixed(4)})`)
console.log(`  Loss per unit POSTED              ${pct(lossPerRound / 3)}   (not "the house edge")`)
console.log(`    denominator: all three units put up on the deal\n`)

// -------------------------------------------------------------- engine check
//
// The enumeration above never touches the engine — it drives rules.ts and
// strategy.ts directly. So play the engine too, on the same charts, and check it
// lands in the same place. The error bar is wide (a 1000:1 royal on three units
// dominates the variance), so this catches an engine that mis-settles, not a
// third decimal place.

const game = new LetItRideGame({ seed: 0x1eeb1de, bankroll: 1e12, unit: 1 })
let simNet = 0
let simRisk = 0
let simSq = 0
for (let r = 0; r < SIM_ROUNDS; r++) {
  game.playRound()
  const last = game.last!
  simNet += last.net
  simRisk += last.riding.filter(Boolean).length
  simSq += last.net * last.net
}
const simMean = simNet / SIM_ROUNDS
const sigma = Math.sqrt((simSq / SIM_ROUNDS - simMean * simMean) / SIM_ROUNDS)

console.log(`  Engine cross-check — ${SIM_ROUNDS.toLocaleString()} rounds on the same charts`)
console.log(`    house edge per base bet   ${pct(-simMean)} ±${pct(2 * sigma)} (2σ)`)
console.log(`    average units at risk     ${(simRisk / SIM_ROUNDS).toFixed(4)}`)
console.log()
