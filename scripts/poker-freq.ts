// Deals random five-card hands and tallies categories against the known odds.
// If the evaluator is right, these converge to the textbook percentages.

import { buildShoeCards } from '../src/engine/cards'
import { makeRng } from '../src/engine/rng'
import { Category, CATEGORY_NAME, score5 } from '../src/poker/eval'

const N = Number(process.argv[2] ?? 2_000_000)
const rng = makeRng(12345)

const KNOWN: Record<number, number> = {
  [Category.HighCard]: 50.1177,
  [Category.Pair]: 42.2569,
  [Category.TwoPair]: 4.7539,
  [Category.Trips]: 2.1128,
  [Category.Straight]: 0.3925,
  [Category.Flush]: 0.1965,
  [Category.FullHouse]: 0.1441,
  [Category.Quads]: 0.0240,
  [Category.StraightFlush]: 0.00139,
}

const counts = new Array(9).fill(0)
const deck = buildShoeCards(1)

for (let i = 0; i < N; i++) {
  // Fisher-Yates the first five positions only.
  for (let k = 0; k < 5; k++) {
    const j = k + rng.int(deck.length - k)
    const t = deck[k]
    deck[k] = deck[j]
    deck[j] = t
  }
  counts[score5(deck.slice(0, 5)).category]++
}

console.log(`\n${N.toLocaleString()} five-card hands\n`)
console.log(`${'category'.padEnd(18)} ${'measured'.padStart(9)} ${'known'.padStart(9)}`)
for (let c = 8; c >= 0; c--) {
  const measured = (counts[c] / N) * 100
  const known = KNOWN[c]
  const off = Math.abs(measured - known) > Math.max(0.05, known * 0.1)
  console.log(
    `${CATEGORY_NAME[c as Category].padEnd(18)} ${measured.toFixed(4).padStart(9)} ${known
      .toFixed(4)
      .padStart(9)}${off ? '   <-- off' : ''}`,
  )
}
console.log()
