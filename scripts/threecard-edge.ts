// Three Card Poker's house edge, enumerated exactly — nothing here is sampled.
//
// Pair Plus is a wager on three cards and nothing else, so all C(52,3) = 22,100
// hands are simply walked. Ante/Play needs the dealer too:
//
//   C(52,3) x C(49,3) = 22,100 x 18,424 = 407,170,400 hand pairs
//
// every one equally likely. That is small enough to enumerate outright if the
// hands are pre-scored into packed integers first (see `strength3`), which is
// what the tables below are for. It takes a few seconds and the answer comes
// back with no confidence interval attached.
//
// Published figures, from the standard analysis of the same enumeration:
//   Ante/Play      house edge 3.37% of the ante, element of risk 2.01%
//   Pair Plus      1-3-6-30-40  7.28%      1-4-6-30-40  2.32%
//
//   npx tsx scripts/threecard-edge.ts

import { buildShoeCards } from '../src/engine/cards'
import { score3, strength3 } from '../src/poker/eval3'
import {
  anteBonusOdds,
  dealerQualifies,
  pairPlusOdds,
  PAIR_PLUS_TABLES,
  shouldRaise,
} from '../src/threecard/rules'

const DECK = buildShoeCards(1)
const N = DECK.length // 52
const DEALER_HANDS = 18424 // C(49,3)

// ------------------------------------------------------------------ pre-score

// Flat index (a*52 + b)*52 + c, filled only for a < b < c. 140,608 slots is
// 700KB of typed array and turns the inner loop into two array reads.
const SLOTS = N * N * N
const STRENGTH = new Int32Array(SLOTS)
const QUALIFIES = new Uint8Array(SLOTS)
const RAISES = new Uint8Array(SLOTS)
const BONUS = new Int8Array(SLOTS)

const combos: number[] = [] // every a<b<c flat index, in order

for (let a = 0; a < N; a++) {
  for (let b = a + 1; b < N; b++) {
    for (let c = b + 1; c < N; c++) {
      const idx = (a * N + b) * N + c
      const s = score3([DECK[a], DECK[b], DECK[c]])
      STRENGTH[idx] = strength3(s)
      QUALIFIES[idx] = dealerQualifies(s) ? 1 : 0
      RAISES[idx] = shouldRaise(s) ? 1 : 0
      BONUS[idx] = anteBonusOdds(s)
      combos.push(idx)
    }
  }
}

// ------------------------------------------------------------------ ante/play

let net = 0 // in ante units, summed over every hand pair
let wagered = 0 // ante, plus the Play bet when it is made
let anteTotal = 0
let raiseHands = 0

const rest = new Int32Array(N - 3)

for (let a = 0; a < N; a++) {
  for (let b = a + 1; b < N; b++) {
    for (let c = b + 1; c < N; c++) {
      const pIdx = (a * N + b) * N + c
      anteTotal += DEALER_HANDS

      if (!RAISES[pIdx]) {
        // Folding costs the ante against every dealer hand alike, so there is
        // nothing to enumerate.
        net -= DEALER_HANDS
        wagered += DEALER_HANDS
        continue
      }

      raiseHands++
      wagered += 2 * DEALER_HANDS
      // The Ante bonus is paid on the player's cards whatever the dealer holds.
      net += BONUS[pIdx] * DEALER_HANDS

      let n = 0
      for (let i = 0; i < N; i++) if (i !== a && i !== b && i !== c) rest[n++] = i

      const pStrength = STRENGTH[pIdx]
      let noQualify = 0
      let wins = 0
      let losses = 0

      for (let i = 0; i < n - 2; i++) {
        const base1 = rest[i] * N * N
        for (let j = i + 1; j < n - 1; j++) {
          const base2 = base1 + rest[j] * N
          for (let k = j + 1; k < n; k++) {
            const dIdx = base2 + rest[k]
            if (QUALIFIES[dIdx] === 0) {
              noQualify++
            } else {
              const d = STRENGTH[dIdx]
              if (d < pStrength) wins++
              else if (d > pStrength) losses++
              // Exact ties push both bets: nothing to add.
            }
          }
        }
      }

      // No qualify: ante pays 1:1, Play is returned. Win: both pay 1:1.
      // Loss: both are taken.
      net += noQualify + 2 * wins - 2 * losses
    }
  }
}

// ------------------------------------------------------------------ pair plus

interface PpResult {
  label: string
  edge: number
  published: number
}

const pairPlus: PpResult[] = PAIR_PLUS_TABLES.map((table) => {
  let pp = 0
  for (const idx of combos) {
    // Recovering the three cards from the flat index is cheaper than keeping a
    // second table of hands around.
    const c = idx % N
    const b = Math.floor(idx / N) % N
    const a = Math.floor(idx / (N * N))
    const odds = pairPlusOdds(table, score3([DECK[a], DECK[b], DECK[c]]))
    pp += odds > 0 ? odds : -1
  }
  return { label: table.id, edge: -pp / combos.length, published: table.edge }
})

// ------------------------------------------------------------------ report

const pct = (x: number) => `${(x * 100).toFixed(3)}%`
const pairs = anteTotal.toLocaleString()

console.log(`\nThree Card Poker — exact enumeration of ${pairs} hand pairs\n`)
console.log('  Ante / Play, raising on Q-6-4 or better')
console.log(`    Raise frequency                    ${pct(raiseHands / combos.length)}`)
console.log(`    House edge      (loss / ante)      ${pct(-net / anteTotal)}   (published: 3.37%)`)
console.log(`    Element of risk (loss / wagered)   ${pct(-net / wagered)}   (published: 2.01%)`)
console.log('\n  Pair Plus, over all 22,100 hands')
for (const r of pairPlus) {
  console.log(
    `    ${r.label.padEnd(13)} house edge         ${pct(r.edge)}   (published: ${(r.published * 100).toFixed(2)}%)`,
  )
}
console.log(
  '\n  The only difference between the two Pair Plus tables is the flush row,\n' +
    '  3:1 against 4:1. It is worth about five points of house edge.\n',
)
