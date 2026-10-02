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

/** For one reel over a uniform stop: the expected number of cells in the
 *  `rows`-high window that match `id` — the symbol itself or any wild — and the
 *  probability the window holds none of them. Both are exact, walking every stop;
 *  it mirrors `reelCountDistribution` but folds wilds into the match, because on a
 *  ways machine a wild pays as any symbol. A scatter never counts as a match. */
function reelMatchStats(
  strip: SymbolId[],
  rows: number,
  id: SymbolId,
  wilds: Set<SymbolId>,
): { expected: number; pNone: number } {
  let matches = 0
  let none = 0
  for (let stop = 0; stop < strip.length; stop++) {
    let n = 0
    for (let r = 0; r < rows; r++) {
      const s = strip[(stop + r) % strip.length]
      if (s === id || wilds.has(s)) n++
    }
    matches += n
    if (n === 0) none++
  }
  return { expected: matches / strip.length, pNone: none / strip.length }
}

/** The exact return of an all-ways cabinet, from its ways pays alone.
 *
 *  It factorizes because the reels are independent and, by `wayWins`, every
 *  symbol is scored on its own and the wins are summed. For one symbol `s`, a run
 *  of exactly length `k` pays `linePays[s][k] · ways`, where `ways` is the product
 *  of the matched-counts on reels 0..k-1. Take the expectation: the reels are
 *  independent, and `E[matched_i · 1{matched_i ≥ 1}] = E[matched_i]` since a zero
 *  count zeroes the product anyway. So the expected ways-and-indicator product is
 *  `∏_{i<k} E[match_i]`, and the run being *exactly* k needs reel k to break it —
 *  a factor `P(reel k has no match)` for k < reels, or 1 when k = reels. Hence
 *
 *    return = (1/waysCost) · Σ_s Σ_k linePays[s][k] · (∏_{i<k} E[match_i(s)]) · break
 *
 *  and we divide by `waysCost` because one stake buys every way at once. No
 *  sampling: `reelMatchStats` walks every stop of every strip. */
export function exactWaysReturn(machine: Machine): number {
  const wilds = new Set(machine.symbols.filter((s) => s.wild).map((s) => s.id))
  const scatters = new Set(machine.symbols.filter((s) => s.scatter).map((s) => s.id))
  const reels = machine.strips.length
  const cost = machine.waysCost ?? 1

  let expected = 0
  for (const [base, pays] of Object.entries(machine.linePays)) {
    if (scatters.has(base)) continue
    const stats = machine.strips.map((strip) => reelMatchStats(strip, machine.rows, base, wilds))
    let prefix = 1 // ∏_{i<k} E[match_i]
    for (let k = 1; k <= reels; k++) {
      prefix *= stats[k - 1].expected
      const per = pays[k] ?? 0
      if (per === 0) continue
      const breakFactor = k < reels ? stats[k].pNone : 1
      expected += per * prefix * breakFactor
    }
  }
  return expected / cost
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

/** The base game's exact return: the screen pays (lines, or all-ways on a ways
 *  cabinet) plus scatters, no features. */
export function exactBaseReturn(machine: Machine): number {
  const screen = machine.ways ? exactWaysReturn(machine) : exactLineReturn(machine)
  return screen + exactScatterReturn(machine)
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
