// Measures how winnable each solitaire variant is by turning the bounded auto-
// player loose on a run of deals and reporting the win rate with a confidence
// interval.
//
// The number is only as good as the player. This bot gives up on deals it can't
// crack inside its node budget, and a give-up is counted as a non-win — so every
// win rate here is a LOWER BOUND on true winnability. The table prints the give-
// up rate next to each figure precisely so a weak bound announces itself: a high
// give-up rate means "at least this much, and probably a good deal more". The
// published figure from the literature is printed underneath each variant so the
// measured number can be sanity-checked against it.
//
//   npm run sol:solve                        all variants, 200 deals × 20k nodes
//   npm run sol:solve -- --seeds 40          fewer deals, wider intervals, faster
//   npm run sol:solve -- --budget 80000      search harder per deal
//   npm run sol:solve -- freecell klondike-1 just these variants
//
// Deals are seeds 1..N, so every run is reproducible. Runtime is dominated by the
// hard, deep games (Klondike, Spider, Forty Thieves): those burn the whole node
// budget on nearly every deal, so a full default run is long — narrow it with
// --seeds / --budget or a variant list for a quick look.

import { solveDeal, type Verdict } from '../src/solitaire/solver'
import type { Variant } from '../src/solitaire/types'
import { VARIANTS } from '../src/solitaire/variants'

interface Args {
  seeds: number
  budget: number
  ids: string[]
}

function parseArgs(argv: string[]): Args {
  const out: Args = { seeds: 200, budget: 20_000, ids: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--seeds') out.seeds = Number(argv[++i])
    else if (a === '--budget') out.budget = Number(argv[++i])
    else if (a.startsWith('--')) {
      console.error(`Unknown flag "${a}"`)
      process.exit(1)
    } else out.ids.push(a)
  }
  return out
}

// Wilson score interval for a binomial proportion — behaves sensibly near 0 and
// 1, which is where FreeCell and Vegas Klondike live, unlike the normal approx.
function wilson(wins: number, n: number): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 0 }
  const z = 1.96
  const p = wins / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

const args = parseArgs(process.argv.slice(2))
const variants: Variant[] = args.ids.length
  ? args.ids.map((id) => {
      const v = VARIANTS.find((x) => x.id === id)
      if (!v) {
        console.error(`Unknown variant "${id}". Known: ${VARIANTS.map((x) => x.id).join(', ')}`)
        process.exit(1)
      }
      return v
    })
  : VARIANTS

console.log(
  `\nSolitaire winnability — ${args.seeds} deals per variant, ${args.budget.toLocaleString()} node budget`,
)
console.log('Win rate = confirmed wins / deals; give-ups count as non-wins, so each rate is a lower bound.\n')

const header = `${'variant'.padEnd(22)} ${'won'.padStart(4)} ${'lost'.padStart(4)} ${'gave'.padStart(4)}  ${'win rate (95% CI)'.padEnd(24)} ${'nodes~'.padStart(8)}`
console.log(header)
console.log('-'.repeat(header.length))

for (const v of variants) {
  let won = 0
  let lost = 0
  let gave = 0
  let nodeSum = 0
  for (let seed = 1; seed <= args.seeds; seed++) {
    const r = solveDeal(v, seed, { nodeBudget: args.budget })
    nodeSum += r.nodes
    const verdict: Verdict = r.verdict
    if (verdict === 'won') won++
    else if (verdict === 'lost') lost++
    else gave++
  }
  const n = args.seeds
  const ci = wilson(won, n)
  const rate = `${pct(won / n)} [${pct(ci.lo)}, ${pct(ci.hi)}]`
  const meanNodes = Math.round(nodeSum / n).toLocaleString()
  console.log(
    `${v.label.padEnd(22)} ${String(won).padStart(4)} ${String(lost).padStart(4)} ${String(gave).padStart(4)}  ${rate.padEnd(24)} ${meanNodes.padStart(8)}  gaveup ${pct(gave / n)}`,
  )
  if (v.published) console.log(`   published: ${v.published}`)
}

console.log(
  '\nA high give-up rate means the bound is loose: the true win rate is at least the figure shown and likely higher.\n',
)
