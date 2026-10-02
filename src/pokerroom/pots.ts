// Splitting the pot.
//
// When everyone can cover the betting there is one pot and the best hand takes
// it. The moment someone is all-in for less than the others, the pot layers: a
// player can only win, from each opponent, as much as they themselves put in.
// So a short all-in makes a main pot they can win and a side pot they cannot,
// and two all-ins for different amounts make three pots. Getting this exactly
// right is the whole reason this is its own file with its own tests.
//
// Two rules, applied in order:
//   1. An uncalled bet comes back. If one player put in strictly more than
//      anyone else could match, the unmatched top is returned to them — it was
//      never a wager, nobody was covering it.
//   2. What remains layers by commitment. Each distinct commitment level is a
//      layer contributed to by everyone who reached it, and winnable by those of
//      them who did not fold.

export interface PotLayer {
  amount: number
  /** Seats that may win this layer: reached its level and did not fold. */
  eligible: number[]
}

export interface Split {
  pots: PotLayer[]
  /** Uncalled chips handed straight back, by seat. */
  refunds: Map<number, number>
}

/** `committed[i]` is the total seat i put in this hand; `folded` is the set of
 *  seats that folded (their chips stay in the pots as dead money, but they can't
 *  win). Seats not in `committed` (never in the hand) are ignored. */
export function splitPot(committed: Map<number, number>, folded: Set<number>): Split {
  const refunds = new Map<number, number>()
  const live = new Map<number, number>()
  for (const [seat, amt] of committed) if (amt > 0) live.set(seat, amt)

  // --- rule 1: return an uncalled top bet -------------------------------------
  //
  // Sort commitments descending; if the single largest exceeds the next largest,
  // the difference was never matched by anyone, so it goes back.
  const amounts = [...live.values()].sort((a, b) => b - a)
  if (amounts.length >= 1) {
    const top = amounts[0]
    const second = amounts[1] ?? 0
    if (top > second) {
      // Exactly one seat can hold the max (commitments are per-seat totals, but
      // two seats could tie at the top — then nothing is uncalled).
      const leaders = [...live].filter(([, a]) => a === top)
      if (leaders.length === 1) {
        const [seat] = leaders[0]
        refunds.set(seat, top - second)
        live.set(seat, second)
      }
    }
  }

  // --- rule 2: layer by commitment level --------------------------------------
  const levels = [...new Set(live.values())].filter((v) => v > 0).sort((a, b) => a - b)
  const pots: PotLayer[] = []
  let prev = 0
  for (const level of levels) {
    const band = level - prev
    prev = level
    const contributors = [...live].filter(([, a]) => a >= level).map(([s]) => s)
    const eligible = contributors.filter((s) => !folded.has(s))
    const amount = band * contributors.length
    if (amount === 0) continue

    // Fold a layer nobody eligible can win into the previous pot rather than
    // orphaning chips — this only arises from dead money left by folds, and it
    // belongs to whoever wins the pot below it.
    if (eligible.length === 0) {
      if (pots.length > 0) pots[pots.length - 1].amount += amount
      continue
    }

    // Merge with the previous layer when the same players are eligible — three
    // callers make one pot, not three identical ones.
    const last = pots[pots.length - 1]
    if (last && sameSet(last.eligible, eligible)) last.amount += amount
    else pots.push({ amount, eligible })
  }

  return { pots, refunds }
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

/** The total in all pots plus refunds — must equal the total committed, always.
 *  The tests and the engine both assert this: chips are never created or lost. */
export function splitTotal(split: Split): number {
  let t = 0
  for (const p of split.pots) t += p.amount
  for (const r of split.refunds.values()) t += r
  return t
}
