// What every machine on the floor returns.
//
// A slot's return is not published by anyone — it is designed, by choosing how
// often each symbol appears on each strip. So unlike every other game here there
// is no outside number to check against; the check is that the return computed
// from the strips matches the number the machine was cut to hit, and that a
// simulation of the whole thing — features included — agrees with it.
//
//   npm run slots:rtp
//   npm run slots:rtp -- 2000000
//
// The base column is exact: enumerated over the reels' marginals, no sampling.
// The played column includes cascades and free games, which feed a screen back
// into itself and so are measured rather than enumerated.

import { makeRng } from '../src/engine/rng'
import { resolveSpin } from '../src/slots/machine'
import { MACHINES } from '../src/slots/machines'
import { exactBaseReturn, exactHitFrequency, exactLineReturn, exactScatterReturn } from '../src/slots/rtp'

const SPINS = Number(process.argv[2] ?? 1_000_000)
const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nSlots — return per coin staked\n`)
console.log(`  machine            lines  scatter     base    target      played  ±2σ      hit`)
console.log(`  ${'-'.repeat(84)}`)

let bad = 0

for (const machine of MACHINES) {
  const line = exactLineReturn(machine)
  const scatter = exactScatterReturn(machine)
  const base = exactBaseReturn(machine)

  const rng = makeRng(0x5107 + machine.id.length)
  let staked = 0
  let paid = 0
  let sumSq = 0
  for (let i = 0; i < SPINS; i++) {
    const r = resolveSpin(machine, 1, rng)
    staked += r.staked
    paid += r.paid
    const ret = r.paid / r.staked
    sumSq += ret * ret
  }
  const played = paid / staked
  const variance = sumSq / SPINS - played * played
  const se2 = 2 * Math.sqrt(Math.max(variance, 0) / SPINS)

  const hit = exactHitFrequency(machine)
  const off = Math.abs(played - machine.targetRtp)
  const flag = off > Math.max(se2, 0.004) ? '  <-- off target' : ''
  if (flag) bad++

  console.log(
    `  ${machine.label.padEnd(20)}${pct(line).padStart(7)}${pct(scatter).padStart(9)}` +
      `${pct(base).padStart(9)}${pct(machine.targetRtp).padStart(10)}` +
      `${pct(played).padStart(12)}${pct(se2).padStart(8)}` +
      `${(Number.isNaN(hit) ? '   —' : pct(hit)).padStart(9)}${flag}`,
  )
}

console.log(`\n  base = lines + scatters, enumerated exactly from the strips.`)
console.log(`  played = ${SPINS.toLocaleString()} spins through the real engine, features included.`)
console.log(`  A machine with no feature must have played == base to within sampling error.\n`)

if (bad > 0) {
  console.log(`  ${bad} machine(s) are not returning what they were cut for.\n`)
  process.exit(1)
}
