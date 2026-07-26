// The return, computed rather than measured.
//
// A slot's return is a property of its strips and its pay table, so it can be
// enumerated exactly — no sampling, no error bar. Two facts make it cheap:
//
//   1. Over a uniform stop, every row of a reel's window is a uniform draw from
//      that reel's strip. So every payline sees the same marginal distribution,
//      and the expected pay of one line is the expected pay of all of them.
//      Total line return is then just that one number (each line is staked one
//      coin, so the stake divides out). Lines overlap, but expectation is linear
//      and doesn't care.
//   2. Scatters pay on a count over the whole screen, so their return needs the
//      distribution of that count — obtained per reel by walking every stop, then
//      convolved across reels.
//
// Features that feed a screen back into itself — cascades, free games — are not
// enumerated here; their return is measured by `simulateReturn` and the base
// game below is the cross-check that the strips and pay table are right.

import type { Rng } from '../engine/rng'
import { lineWins, scatterWins, windowOf } from './evaluate'
import type { Machine, SymbolId } from './types'

/** Probability of each symbol on one reel, over a uniform stop. */
export function symbolProbabilities(strip: SymbolId[]): Map<SymbolId, number> {
  const counts = new Map<SymbolId, number>()
  for (const id of strip) counts.set(id, (counts.get(id) ?? 0) + 1)
  const p = new Map<SymbolId, number>()
  for (const [id, n] of counts) p.set(id, n / strip.length)
  return p
}

/** Expected coins returned per coin staked, from line wins alone.
 *
 *  Enumerates every combination of symbols across the reels, weighted by the
 *  reels' marginals. It evaluates each one through the same `lineWins` the live
 *  game uses — on a one-row window with a single flat line — so the computed
 *  return and the played game can never drift apart. */
export function exactLineReturn(machine: Machine): number {
  const reels = machine.strips.length
  const probs = machine.strips.map(symbolProbabilities)
  const perReel = probs.map((p) => [...p.entries()])

  // A one-row window and one straight line: the same evaluator, minimal screen.
  const flat: Machine = {
    ...machine,
    rows: 1,
    lines: [new Array(reels).fill(0)],
    scatterPays: undefined,
  }

  let expected = 0
  const column: SymbolId[] = new Array(reels)

  const walk = (reel: number, p: number): void => {
    if (p === 0) return
    if (reel === reels) {
      const wins = lineWins(
        column.map((id) => [id]),
        flat,
        1,
      )
      if (wins.length > 0) expected += p * wins[0].paid
      return
    }
    for (const [id, q] of perReel[reel]) {
      column[reel] = id
      walk(reel + 1, p * q)
    }
  }
  walk(0, 1)

  return expected
}

/** How many of `id` are visible on one reel, for each stop, as a distribution
 *  over counts. */
function reelCountDistribution(strip: SymbolId[], rows: number, id: SymbolId): number[] {
  const dist = new Array(rows + 1).fill(0)
  for (let stop = 0; stop < strip.length; stop++) {
    let n = 0
    for (let r = 0; r < rows; r++) if (strip[(stop + r) % strip.length] === id) n++
    dist[n]++
  }
  return dist.map((c) => c / strip.length)
}

/** Distribution of how many `id` land on the whole screen. */
export function screenCountDistribution(machine: Machine, id: SymbolId): number[] {
  let total = [1]
  for (const strip of machine.strips) {
    const reel = reelCountDistribution(strip, machine.rows, id)
    const next = new Array(total.length + reel.length - 1).fill(0)
    for (let a = 0; a < total.length; a++) {
      if (total[a] === 0) continue
      for (let b = 0; b < reel.length; b++) next[a + b] += total[a] * reel[b]
    }
    total = next
  }
  return total
}

/** Expected return per coin staked from scatter pays, which are quoted as
 *  multiples of the total stake and so are already a fraction of it. */
export function exactScatterReturn(machine: Machine): number {
  if (!machine.scatterPays) return 0
  let expected = 0
  for (const [id, schedule] of Object.entries(machine.scatterPays)) {
    const dist = screenCountDistribution(machine, id)
    for (const [countText, pay] of Object.entries(schedule)) {
      const count = Number(countText)
      expected += (dist[count] ?? 0) * pay
    }
  }
  return expected
}

/** The base game's exact return: lines plus scatters, no features. */
export function exactBaseReturn(machine: Machine): number {
  return exactLineReturn(machine) + exactScatterReturn(machine)
}

/** How often a spin pays anything at all — the number that decides whether a
 *  machine feels alive or dead, and the one players actually notice. */
export function exactHitFrequency(machine: Machine): number {
  let stops = 1
  for (const strip of machine.strips) stops *= strip.length

  // Every screen has to be walked for this one, and five long strips is a
  // hundred million of them. Rather than quietly sample and call it exact,
  // decline — the callers print a dash.
  if (stops > 40_000_000) return NaN

  const reels = machine.strips.length
  const position = new Array(reels).fill(0)
  let hits = 0
  let seen = 0

  const walk = (reel: number): void => {
    if (reel === reels) {
      seen++
      const win = windowOf(machine.strips, position, machine.rows)
      if (lineWins(win, machine, 1).length > 0 || scatterWins(win, machine, 1).length > 0) hits++
      return
    }
    for (let s = 0; s < machine.strips[reel].length; s++) {
      position[reel] = s
      walk(reel + 1)
    }
  }
  walk(0)
  return hits / seen
}

/** Measured return, including whatever the feature adds. The base game's exact
 *  figure above is what says the strips are right; this says the feature is. */
export function simulateReturn(
  machine: Machine,
  spins: number,
  rng: Rng,
  spinOnce: (machine: Machine, rng: Rng) => { staked: number; paid: number },
): { rtp: number; stderr: number } {
  let staked = 0
  let paid = 0
  let sumSq = 0
  for (let i = 0; i < spins; i++) {
    const r = spinOnce(machine, rng)
    staked += r.staked
    paid += r.paid
    const net = (r.paid - r.staked) / r.staked
    sumSq += net * net
  }
  const rtp = paid / staked
  const variance = sumSq / spins - Math.pow(paid / staked - 1, 2)
  return { rtp, stderr: Math.sqrt(Math.max(variance, 0) / spins) }
}
