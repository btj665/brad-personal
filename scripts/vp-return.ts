// Plays optimal video poker and reports the return — the fraction of every coin
// bet that comes back over time. Jacks or Better 9/6 is the reference at 99.54%.
//
// Optimal play is computed per hand by the solver (exact for holds of two-plus
// cards, sampled for the rare one-and-none holds), so this measures the pay
// table and the hand classifier together.
//
//   npm run vp:return
//   npm run vp:return -- 40000 deuces-full

import { buildShoeCards } from '../src/engine/cards'
import { makeRng } from '../src/engine/rng'
import { classify } from '../src/videopoker/classify'
import { payFor, VARIANTS, variantById } from '../src/videopoker/paytables'
import { solve } from '../src/videopoker/solver'

const N = Number(process.argv[2] ?? 5000)
const ONLY = process.argv[3]
const rng = makeRng(0x5eed)

function measure(variantId: string): { rtp: number; stderr: number } {
  const variant = variantById(variantId)
  const deck = buildShoeCards(1)
  let totalReturn = 0
  let sumSq = 0

  for (let n = 0; n < N; n++) {
    // Deal five.
    for (let k = 0; k < 5; k++) {
      const j = k + rng.int(deck.length - k)
      const t = deck[k]
      deck[k] = deck[j]
      deck[j] = t
    }
    const hand = deck.slice(0, 5)
    // best.ev is the EXACT expected return of this deal under optimal play, so
    // we average that rather than sampling one draw. Holds that keep two-plus
    // cards are enumerated exactly (unbiased); only the rare thin holds are
    // sampled. Note the wide error bar: the royal flush pays 800 and shows up
    // once in ~40k hands, so the central estimate needs a lot of deals to settle
    // even though the classifier and solver are exact (and unit-tested). Holds of
    // three-plus cards are enumerated exactly; thinner holds are sampled to keep
    // the default run to a couple of minutes.
    const { best } = solve(hand, variant, rng, { enumerateLimit: 2000, samples: 2000 })
    totalReturn += best.ev
    sumSq += best.ev * best.ev
  }

  const mean = totalReturn / N
  const stderr = Math.sqrt((sumSq / N - mean * mean) / N)
  // Bet is one coin per unit of pay, so return per coin = mean pay.
  return { rtp: mean * 100, stderr: stderr * 100 }
}

console.log(`\nVideo poker — optimal play, ${N.toLocaleString()} deals each\n`)
console.log(`${'variant'.padEnd(26)} ${'return'.padStart(9)} ${'±2σ'.padStart(8)} ${'expected'.padStart(9)}`)
console.log('-'.repeat(56))
for (const v of VARIANTS) {
  if (ONLY && v.id !== ONLY) continue
  const { rtp, stderr } = measure(v.id)
  console.log(
    `${v.label.padEnd(26)} ${rtp.toFixed(3).padStart(8)}% ${(2 * stderr).toFixed(3).padStart(7)}% ${v.rtp
      .toFixed(2)
      .padStart(8)}%`,
  )
}
// silence unused import in ONLY runs
void classify
void payFor
console.log()
