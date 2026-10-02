// The Trips side bet depends only on the player's seven-card hand and the pay
// table, not on any strategy — so its edge is a clean check on the evaluator,
// payKey and ratio, the same three the Blind bonus leans on. With the default
// 3/4/7/8/30/40/50 table it comes out around 3.5%.

import { buildShoeCards } from '../src/engine/cards'
import { makeRng } from '../src/engine/rng'
import { bestOf, CATEGORY_NAME } from '../src/poker/eval'
import { DEFAULT_UTH, isRoyal, payKey, ratio } from '../src/uth/rules'

const N = Number(process.argv[2] ?? 3_000_000)
const rng = makeRng(999)
const deck = buildShoeCards(1)

let net = 0
const hits: Record<string, number> = {}

for (let i = 0; i < N; i++) {
  for (let k = 0; k < 7; k++) {
    const j = k + rng.int(deck.length - k)
    const t = deck[k]
    deck[k] = deck[j]
    deck[j] = t
  }
  const score = bestOf(deck.slice(0, 7), {})
  const key = payKey(score.category, isRoyal(score.category, score.tiebreak))
  const bonus = key && DEFAULT_UTH.tripsPay[key]
  if (bonus) {
    net += ratio(bonus) // win: profit is the ratio, in units of the stake
    hits[key] = (hits[key] ?? 0) + 1
  } else {
    net -= 1 // lose the stake
  }
}

console.log(`\nTrips side bet — ${N.toLocaleString()} hands\n`)
for (const k of Object.keys(DEFAULT_UTH.tripsPay)) {
  console.log(`  ${k.padEnd(14)} ${(((hits[k] ?? 0) / N) * 100).toFixed(4)}%`)
}
console.log(`\n  house edge  ${((-net / N) * 100).toFixed(3)}%\n`)
void CATEGORY_NAME
