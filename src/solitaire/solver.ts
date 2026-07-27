// An honest, bounded automatic player — not a perfect solver.
//
// Perfect solvability for games like Klondike is a research result; this is a
// pragmatic best-first search that *attempts* a deal and reports whether it
// found a win, exhausted the reachable graph without one (a real loss), or hit
// its node budget and gave up. Because it can give up, every win rate it produces
// is a LOWER BOUND on true winnability: the games it fails to solve include some
// it simply didn't have the budget to crack. `scripts/sol-solve.ts` reports the
// give-up rate alongside every number so the reader knows how tight that bound is.
//
// The search is a perfect-information one: it can see the face-down cards, which
// is exactly how the published "X% winnable" figures are defined — a thoughtful
// player who knows the whole deal. The engine exposes those cards on `piles`, so
// the hash and the move generator both use them.
//
// Four things make the search tractable:
//   1. Best-first order. The frontier is a heap keyed by a "distance from won"
//      heuristic, so the search expands the most promising open position rather
//      than committing depth-first to one subtree — the failure mode that left a
//      plain DFS unable to finish winnable FreeCell deals.
//   2. Safe auto-moves. A card that can never again be needed in the tableau is
//      forced home without branching, collapsing long forced tails to one edge.
//   3. A canonical board hash + transposition set, so a position is expanded once
//      however it was reached. Interchangeable columns and cells are sorted away,
//      and for colour-based games the four red/black-preserving suit relabelings
//      are folded together too.
//   4. A node budget and a frontier cap, so a deep or unwinnable-looking deal is
//      abandoned rather than searched forever — and reported 'gaveup', not 'lost'.

import { RANKS } from '../engine/cards'
import type { Card, Rank, Suit } from '../engine/types'
import { Solitaire } from './game'
import type { Build, Move, PileCard, Variant } from './types'

export type Verdict = 'won' | 'lost' | 'gaveup'

export interface SolveOptions {
  /** States expanded before the search abandons the deal as 'gaveup'. */
  nodeBudget?: number
  /** Cap on the frontier (open list) size, a memory guard for the two-deck
   *  games. Overflowing it also ends the deal as 'gaveup', never a false loss. */
  frontierCap?: number
}

export interface SolveResult {
  verdict: Verdict
  /** Distinct states expanded — the search's cost, reported so a high give-up
   *  rate can be read against how hard the bot actually looked. */
  nodes: number
}

const DEFAULT_BUDGET = 60_000
// Caps the open list so a two-deck Spider search can't balloon the heap. Easy
// games finish long before reaching it; hard ones hit the node budget first or
// give up here, which is the honest outcome anyway.
const DEFAULT_FRONTIER = 250_000

// ---------------------------------------------------------------- the hash

const RANK_INDEX: ReadonlyMap<Rank, number> = new Map(RANKS.map((r, i) => [r, i]))
const SUIT_INDEX: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 }

// Suit relabelings that preserve solvability. For a colour-based build the only
// symmetries are the four that keep {S,C} and {H,D} intact — swapping the two
// blacks and/or the two reds maps any position to an equally-winnable one. For
// same-suit / any-suit games the full symmetric group would apply, but trying 24
// relabelings per node costs more than the extra collapsing saves, so those
// games canonicalise columns and cells only (the identity permutation below).
const COLOUR_PERMS: readonly (readonly number[])[] = [
  [0, 1, 2, 3], // identity
  [3, 1, 2, 0], // S <-> C
  [0, 2, 1, 3], // H <-> D
  [3, 2, 1, 0], // both
]
const IDENTITY_PERMS: readonly (readonly number[])[] = [[0, 1, 2, 3]]

function usesColour(b: Build): boolean {
  return b.match === 'alternateColour' || b.match === 'sameColour'
}

function suitPerms(v: Variant): readonly (readonly number[])[] {
  return usesColour(v.build) || usesColour(v.foundations.build) ? COLOUR_PERMS : IDENTITY_PERMS
}

// A card is three sortable chars: rank, (relabeled) suit, face-up flag. Face-up
// matters because a face-down card is unplayable even though the search knows
// what it is.
function cardCode(pc: PileCard, perm: readonly number[]): string {
  const ri = RANK_INDEX.get(pc.card.rank) ?? 0
  const si = perm[SUIT_INDEX[pc.card.suit]]
  return String.fromCharCode(65 + ri) + String.fromCharCode(97 + si) + (pc.faceUp ? '1' : '0')
}

function serializeWith(game: Solitaire, perm: readonly number[]): string {
  const cols: string[] = []
  const cells: string[] = []
  const founds: string[] = []
  const reserves: string[] = []
  let stock = ''
  let waste = ''
  for (const p of game.piles) {
    const s = p.cards.map((pc) => cardCode(pc, perm)).join('')
    switch (p.kind) {
      case 'tableau':
        cols.push(s)
        break
      case 'cell':
        cells.push(s)
        break
      case 'foundation':
        founds.push(s)
        break
      case 'reserve':
        reserves.push(s)
        break
      case 'stock':
        stock = s
        break
      case 'waste':
        waste = s
        break
    }
  }
  // Columns, cells, foundations and reserves are each interchangeable as a group
  // — which physical pile holds a stack never affects what is legal — so sorting
  // erases that ordering. Stock and waste keep their order: it is the sequence
  // you will draw them in, and it matters. Redeals-left distinguishes otherwise
  // identical boards with different stock lives remaining.
  cols.sort()
  cells.sort()
  founds.sort()
  reserves.sort()
  return `T${cols.join('.')}|C${cells.join('.')}|F${founds.join('.')}|R${reserves.join('.')}|S${stock}|W${waste}|r${game.redealsLeft}`
}

/** A canonical key for the position: same board (up to symmetry) → same string,
 *  genuinely different boards → different strings. */
export function canonicalHash(game: Solitaire): string {
  const perms = suitPerms(game.variant)
  if (perms.length === 1) return serializeWith(game, perms[0])
  let best: string | null = null
  for (const perm of perms) {
    const s = serializeWith(game, perm)
    if (best === null || s < best) best = s
  }
  return best as string
}

// ---------------------------------------------------------------- safe moves

/** Rank a foundation of each suit has reached (0 = no cards, i.e. ace not up). */
function foundationReach(game: Solitaire): Record<Suit, number> {
  const reach: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 }
  for (const p of game.piles) {
    if (p.kind !== 'foundation' || p.cards.length === 0) continue
    const suit = p.cards[p.cards.length - 1].card.suit
    if (p.cards.length > reach[suit]) reach[suit] = p.cards.length
  }
  return reach
}

// The classic FreeCell auto-play rule for alternate-colour builds: a card is
// safe to send home once no opposite-colour card that might sit on it still
// needs a tableau home. Aces and twos are always safe.
function alternateColourSafe(reach: Record<Suit, number>, card: Card): boolean {
  const r = (RANK_INDEX.get(card.rank) ?? 0) + 1
  if (r <= 2) return true
  const black = card.suit === 'S' || card.suit === 'C'
  const opp: [Suit, Suit] = black ? ['H', 'D'] : ['S', 'C']
  const sameOtherSuit: Suit = black ? (card.suit === 'S' ? 'C' : 'S') : card.suit === 'H' ? 'D' : 'H'
  const oppMin = Math.min(reach[opp[0]], reach[opp[1]])
  return oppMin >= r - 1 && reach[sameOtherSuit] >= r - 2
}

function isSafeFoundationMove(game: Solitaire, m: Move, reach: Record<Suit, number>): boolean {
  // Spider-style discards of a finished suit are always safe — the run leaves
  // play entirely and can never be wanted back.
  if (game.discardsRuns()) return true
  const v = game.variant
  // Same-suit builds: the only card that ever stacks on rank R is (R-1) of the
  // same suit, and that card is already home the instant R becomes playable, so
  // R serves no further tableau purpose.
  if (v.build.match === 'sameSuit') return true
  if (v.build.match === 'alternateColour') {
    const src = game.get(m.from)
    if (!src || src.cards.length === 0) return false
    return alternateColourSafe(reach, src.cards[src.cards.length - 1].card)
  }
  // any-suit / same-colour non-spider builds: no cheap safety proof, so never
  // force — the ordinary search will play these when useful.
  return false
}

/** Play every safe foundation move available, repeatedly, and return how many —
 *  the count lets a caller that wants the board back (the end-game probe) undo
 *  them; the main search reaches its positions by snapshot and ignores it.
 *
 *  Deliberately does NOT go through `legalMoves()`: that enumerates the whole
 *  board and is the search's hottest cost, whereas foundation moves come only
 *  from the exposed top of a pile (a single card) or, in Spider, a finished suit
 *  at a column top. Scanning those directly keeps this cheap enough to run on
 *  every expanded node. */
function applySafeAutomoves(game: Solitaire): number {
  const founds = game.piles.filter((p) => p.kind === 'foundation')
  const discards = game.discardsRuns()
  const suitLen = 13 - (game.variant.strip?.length ?? 0)
  let count = 0
  for (;;) {
    let played = false
    if (discards) {
      // Only a completed same-suit K-to-A run discards, and it always may.
      const empty = founds.find((f) => f.cards.length === 0)
      if (empty) {
        for (const src of game.piles) {
          if (src.kind !== 'tableau' || src.cards.length < suitLen) continue
          if (game.canMove(src.id, empty.id, suitLen)) {
            game.move(src.id, empty.id, suitLen)
            count++
            played = true
            break
          }
        }
      }
    } else {
      const reach = foundationReach(game)
      scan: for (const src of game.piles) {
        if (src.kind === 'foundation' || src.kind === 'stock' || src.cards.length === 0) continue
        const top = src.cards[src.cards.length - 1]
        if (!top.faceUp) continue
        if (!isSafeFoundationMove(game, { from: src.id, to: '', count: 1 }, reach)) continue
        for (const f of founds) {
          if (game.canMove(src.id, f.id, 1)) {
            game.move(src.id, f.id, 1)
            count++
            played = true
            break scan
          }
        }
      }
    }
    if (!played) break
  }
  return count
}

function undoTimes(game: Solitaire, n: number): void {
  for (let i = 0; i < n; i++) game.undo()
}

/** Close to the end and nothing hidden — worth a greedy auto-finish probe. */
function nearWin(game: Solitaire): boolean {
  const v = game.variant
  const target = v.decks * 4 * (13 - (v.strip?.length ?? 0))
  let home = 0
  for (const p of game.piles) {
    if (p.kind === 'foundation') home += p.cards.length
    else if (p.kind === 'tableau') {
      for (const pc of p.cards) if (!pc.faceUp) return false // a hidden card can still block
    }
  }
  return target - home <= 13
}

// ---------------------------------------------------------------- ordering

type Transition = Move | 'draw'

// A rough "distance from won", lower being better. It is only ever used to rank
// sibling moves so the depth-first search dives toward the promising ones first
// — a good order is what turns FreeCell from a hopeless wander into a search that
// usually finds the win in a few thousand nodes. The terms: cards not yet home
// dominate; empty columns and free cells are working room and are rewarded;
// face-down cards are ignorance and are penalised (so Klondike/Spider chase the
// moves that turn them up); and a needed card buried under others is counted by
// how deeply it is buried.
function heuristic(game: Solitaire): number {
  let home = 0
  let faceDown = 0
  let emptyCols = 0
  let freeCells = 0
  for (const p of game.piles) {
    if (p.kind === 'foundation') home += p.cards.length
    else if (p.kind === 'tableau') {
      if (p.cards.length === 0) emptyCols++
      for (const pc of p.cards) if (!pc.faceUp) faceDown++
    } else if (p.kind === 'cell' && p.cards.length === 0) freeCells++
  }
  let buried = 0
  if (!game.discardsRuns()) {
    // How deeply each suit's next-wanted card sits, counted in one pass: a card
    // is "the one this suit wants next" when its rank equals the suit's reach.
    const reach = foundationReach(game)
    for (const p of game.piles) {
      if (p.kind !== 'tableau') continue
      const len = p.cards.length
      for (let i = 0; i < len; i++) {
        const card = p.cards[i].card
        if ((RANK_INDEX.get(card.rank) ?? 0) === reach[card.suit]) buried += len - 1 - i
      }
    }
  }
  return -home * 3 - emptyCols * 2 - freeCells + faceDown * 2 + buried
}

// The legal transitions worth trying from a position, lightly filtered to drop
// interchangeable and pointless siblings. Ordering is left to the search's
// priority queue, which ranks by the resulting board rather than by move shape.
function childTransitions(game: Solitaire): Transition[] {
  const moves = game.legalMoves()
  // Moving to any one empty column (or any one empty cell) is interchangeable
  // with moving to another; keep a single representative so siblings don't all
  // lead to the same canonical state. And moving a *partial* run into an empty
  // column only shuffles — allow just a single card or the whole movable pile.
  const seenEmptyCol = new Set<string>()
  const seenEmptyCell = new Set<string>()
  const kept: Move[] = []
  for (const m of moves) {
    const src = game.get(m.from)
    const dst = game.get(m.to)
    if (!src || !dst) continue
    if (dst.cards.length === 0 && dst.kind === 'tableau') {
      if (m.count !== 1 && m.count !== src.cards.length) continue
      const key = `${m.from}|${m.count}`
      if (seenEmptyCol.has(key)) continue
      seenEmptyCol.add(key)
    } else if (dst.cards.length === 0 && dst.kind === 'cell') {
      const key = `${m.from}|${m.count}`
      if (seenEmptyCell.has(key)) continue
      seenEmptyCell.add(key)
    }
    kept.push(m)
  }
  const transitions: Transition[] = kept
  // Turning the stock is always an option; the search weighs it against the rest.
  if (game.variant.stock.kind !== 'none') transitions.push('draw')
  return transitions
}

// ---------------------------------------------------------------- snapshots

// The engine has no load-state API, but its pile order is fixed once dealt, so a
// position is captured and restored by swapping each pile's card list. Face-up
// flags are copied (they differ between snapshots); the immutable Card objects
// are shared. This lets the search jump between frontier nodes instead of only
// walking the tree by undo, which is what a best-first search needs.
interface Snapshot {
  piles: PileCard[][]
  redeals: number
}

function snapshot(game: Solitaire): Snapshot {
  return {
    piles: game.piles.map((p) => p.cards.map((pc) => ({ card: pc.card, faceUp: pc.faceUp }))),
    redeals: game.redealsLeft,
  }
}

function restore(game: Solitaire, snap: Snapshot): void {
  for (let i = 0; i < game.piles.length; i++) {
    game.piles[i].cards = snap.piles[i].map((pc) => ({ card: pc.card, faceUp: pc.faceUp }))
  }
  game.redealsLeft = snap.redeals
  game.history = [] // snapshots restore position, not the path taken to it
}

// A binary min-heap of open positions, keyed by heuristic then insertion order so
// equally-promising states are explored oldest-first rather than clumping.
interface Open {
  snap: Snapshot
  pri: number
  seq: number
}

class Frontier {
  private heap: Open[] = []
  get size(): number {
    return this.heap.length
  }
  private less(a: Open, b: Open): boolean {
    return a.pri < b.pri || (a.pri === b.pri && a.seq < b.seq)
  }
  push(item: Open): void {
    const h = this.heap
    h.push(item)
    let i = h.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(h[i], h[parent])) break
      ;[h[i], h[parent]] = [h[parent], h[i]]
      i = parent
    }
  }
  pop(): Open {
    const h = this.heap
    const top = h[0]
    const last = h.pop() as Open
    if (h.length > 0) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < h.length && this.less(h[l], h[smallest])) smallest = l
        if (r < h.length && this.less(h[r], h[smallest])) smallest = r
        if (smallest === i) break
        ;[h[i], h[smallest]] = [h[smallest], h[i]]
        i = smallest
      }
    }
    return top
  }
}

// ---------------------------------------------------------------- the search

/** Attempt a deal. Returns 'won' if a winning line was found, 'lost' if the whole
 *  reachable graph was searched without one, or 'gaveup' if the node budget or
 *  frontier cap was hit first. A 'lost' is only ever returned after an exhaustive
 *  search, so it is trustworthy; a 'gaveup' means the number it feeds is a lower
 *  bound that a bigger budget might beat.
 *
 *  Best-first, not depth-first: the frontier is ordered by the heuristic so the
 *  search always expands the most promising open position. That is what keeps it
 *  from burying itself in one losing subtree — the failure mode that made a plain
 *  DFS leave winnable FreeCell deals unsolved. */
export function solve(game: Solitaire, opts: SolveOptions = {}): SolveResult {
  const budget = opts.nodeBudget ?? DEFAULT_BUDGET
  const frontierCap = opts.frontierCap ?? DEFAULT_FRONTIER
  const visited = new Set<string>() // positions already expanded (post auto-move)
  const pushed = new Set<string>() // positions already queued, to keep the frontier finite
  const frontier = new Frontier()
  let nodes = 0
  let gaveUp = false
  let seq = 0

  frontier.push({ snap: snapshot(game), pri: heuristic(game), seq: seq++ })
  pushed.add(canonicalHash(game))

  while (frontier.size > 0) {
    if (nodes >= budget) {
      gaveUp = true
      break
    }
    restore(game, frontier.pop().snap)

    // Forced progress first, so the transposition key is the position after every
    // inevitable move — different parents that funnel to the same board merge here.
    applySafeAutomoves(game)
    if (game.won()) return { verdict: 'won', nodes }

    const key = canonicalHash(game)
    if (visited.has(key)) continue
    visited.add(key)
    nodes++

    // End-game probe: when almost everything is home and nothing is hidden, just
    // shovel the rest onto the foundations. Wins outright or is undone — a cheap
    // way to close deals without searching the final dozen moves.
    if (nearWin(game)) {
      const shoved = game.autoFinish()
      if (game.won()) return { verdict: 'won', nodes }
      undoTimes(game, shoved)
    }

    for (const t of childTransitions(game)) {
      if (t === 'draw') {
        // drawStock returns false when the draw is illegal (empty stock with no
        // redeal, or Spider refusing to deal onto an empty column) — skip it.
        if (!game.drawStock()) continue
      } else {
        game.move(t.from, t.to, t.count)
      }
      if (game.won()) return { verdict: 'won', nodes }
      const childKey = canonicalHash(game)
      if (!visited.has(childKey) && !pushed.has(childKey)) {
        if (pushed.size >= frontierCap) {
          gaveUp = true // out of room; some states go unexplored
        } else {
          pushed.add(childKey)
          frontier.push({ snap: snapshot(game), pri: heuristic(game), seq: seq++ })
        }
      }
      game.undo()
    }
  }

  return { verdict: gaveUp ? 'gaveup' : 'lost', nodes }
}

/** Deal a variant at a seed and solve it — the unit `sol-solve.ts` runs in bulk. */
export function solveDeal(variant: Variant, seed: number, opts: SolveOptions = {}): SolveResult {
  return solve(new Solitaire({ variant, seed }), opts)
}
