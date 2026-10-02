// Runs every game's edge/return check in one go, so the whole suite's honesty
// can be re-established with one command. Each game's own script is the source
// of truth; this only sequences them and passes a smaller sample size so the
// whole sweep finishes in minutes rather than hours.
//
//   npm run edges
//   npm run edges -- 2000000     # a slower, tighter sweep
//
// The exactly-solvable games (sic bo, big six, keno) ignore the sample size:
// they enumerate their outcome space and print exact numbers.

import { spawnSync } from 'node:child_process'

const SAMPLES = process.argv[2] ?? '400000'

interface Check {
  script: string
  title: string
  /** Games whose scripts enumerate rather than sample take no argument. */
  exact?: boolean
}

const CHECKS: Check[] = [
  { script: 'scripts/poker-freq.ts', title: 'Poker evaluator vs. textbook frequencies' },
  { script: 'scripts/edge.ts', title: 'Blackjack, every ruleset' },
  { script: 'scripts/baccarat-edge.ts', title: 'Baccarat' },
  { script: 'scripts/paigow-edge.ts', title: 'Pai Gow Poker' },
  { script: 'scripts/uth-edge.ts', title: "Ultimate Texas Hold'em" },
  { script: 'scripts/uth-trips.ts', title: "Ultimate Hold'em — Trips side bet" },
  { script: 'scripts/threecard-edge.ts', title: 'Three Card Poker' },
  { script: 'scripts/caribbean-edge.ts', title: 'Caribbean Stud' },
  { script: 'scripts/mstud-edge.ts', title: 'Mississippi Stud' },
  { script: 'scripts/letitride-edge.ts', title: 'Let It Ride' },
  { script: 'scripts/war-edge.ts', title: 'Casino War' },
  { script: 'scripts/craps-edge.ts', title: 'Craps' },
  { script: 'scripts/roulette-edge.ts', title: 'Roulette, all three wheels' },
  { script: 'scripts/sicbo-edge.ts', title: 'Sic Bo — exact, all 216 rolls', exact: true },
  { script: 'scripts/bigsix-edge.ts', title: 'Big Six — exact, all 54 stops', exact: true },
  { script: 'scripts/vp-return.ts', title: 'Video Poker' },
  { script: 'scripts/keno-return.ts', title: 'Keno — exact hypergeometric', exact: true },
]

const failures: string[] = []

for (const check of CHECKS) {
  console.log(`\n${'='.repeat(72)}\n${check.title}\n${'='.repeat(72)}`)
  const args = ['tsx', check.script, ...(check.exact ? [] : [SAMPLES])]
  const run = spawnSync('npx', args, { stdio: 'inherit' })
  if (run.status !== 0) failures.push(check.script)
}

console.log(`\n${'='.repeat(72)}`)
if (failures.length === 0) {
  console.log(`All ${CHECKS.length} checks ran.`)
} else {
  console.log(`${failures.length} of ${CHECKS.length} checks failed to run:`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
