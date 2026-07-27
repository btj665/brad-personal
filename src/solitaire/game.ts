// The one engine that plays every variant in `variants/`.
//
// It holds no rules of its own: everything it does is read off the `Variant`
// record it was handed. That is what makes the catalogue cheap — a new game is a
// new record — and it is also what keeps the solver honest, since the solver and
// the screen ask this same code what is legal.

import { buildShoeCards, RANKS } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card, Rank } from '../engine/types'
import type { Action, Build, Move, Pile, Variant } from './types'

/** Ace low: the order a foundation is built in. */
export function rankOrder(rank: Rank): number {
  return RANKS.indexOf(rank)
}

export function isRed(card: Card): boolean {
  return card.suit === 'H' || card.suit === 'D'
}

/** Does `lower` sit legally on `upper` under this rule? */
export function follows(upper: Card, lower: Card, rule: Build): boolean {
  if (rule.match === 'none') return false

  const a = rankOrder(upper.rank)
  const b = rankOrder(lower.rank)
  if (rule.direction === 'either') {
    // Golf and Black Hole take a card a rank either side of the top; with wrap on,
    // ace and king are neighbours too (a gap of twelve ranks, the long way round).
    const gap = Math.abs(a - b)
    if (gap !== 1 && !(rule.wrap && gap === 12)) return false
  } else {
    const step = rule.direction === 'down' ? -1 : 1
    const wrapped = rule.wrap ? (b - a + 13 * step + 13) % 13 === (step + 13) % 13 : false
    if (b !== a + step && !wrapped) return false
  }

  switch (rule.match) {
    case 'alternateColour':
      return isRed(upper) !== isRed(lower)
    case 'sameSuit':
      return upper.suit === lower.suit
    case 'sameColour':
      return isRed(upper) === isRed(lower)
    case 'differentSuit':
      return upper.suit !== lower.suit
    case 'anySuit':
      return true
  }
}

/** Is the run at the top of `pile` starting `from` a correctly built sequence? */
export function isRun(pile: Pile, from: number, rule: Build): boolean {
  for (let i = from; i < pile.cards.length - 1; i++) {
    if (!pile.cards[i].faceUp || !pile.cards[i + 1].faceUp) return false
    if (!follows(pile.cards[i].card, pile.cards[i + 1].card, rule)) return false
  }
  return true
}

export class Solitaire {
  variant: Variant
  seed: number
  piles: Pile[] = []
  /** Every action taken, for undo and for the record. */
  history: Array<{ action: Action; flipped: string | null }> = []
  redealsLeft: number
  /** The rank foundations start from, once the deal has decided it. */
  baseRank: Rank = 'A'
  moves = 0
  version = 0

  private listeners = new Set<() => void>()
  private rng: Rng

  constructor(opts: { variant: Variant; seed?: number }) {
    this.variant = opts.variant
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.redealsLeft = opts.variant.stock.redeals
    this.deal()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = (): number => this.version
  private touch() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  // -------------------------------------------------------------- the deal

  private shuffled(): Card[] {
    const v = this.variant
    let deck = buildShoeCards(v.decks)
    if (v.strip) {
      const gone = new Set(v.strip)
      deck = deck.filter((c) => !gone.has(c.rank))
    }
    // Fold the deck down to `suits` distinct suits without changing the card
    // count — Spider at one suit is 104 spades, not 26 cards. The copies of each
    // rank are handed out round-robin among the allowed suits, so the
    // multiplicity stays even and the same-suit lift rule then does the work of
    // making one suit easy and four hard.
    if (v.suits && v.suits < 4) {
      const allow: Card['suit'][] = (['S', 'H', 'D', 'C'] as const).slice(0, v.suits)
      const seen = new Map<Rank, number>()
      deck = deck.map((c) => {
        const n = seen.get(c.rank) ?? 0
        seen.set(c.rank, n + 1)
        return { ...c, suit: allow[n % allow.length] }
      })
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1)
      const t = deck[i]
      deck[i] = deck[j]
      deck[j] = t
    }
    return deck
  }

  private pile(kind: Pile['kind'], index: number): Pile {
    return { id: `${kind}-${index}`, kind, index, cards: [] }
  }

  deal(): void {
    const v = this.variant
    this.rng = makeRng(this.seed)
    this.redealsLeft = v.stock.redeals
    this.history = []
    this.moves = 0

    const deck = this.shuffled()
    const piles: Pile[] = []
    for (let i = 0; i < v.tableau.piles; i++) piles.push(this.pile('tableau', i))
    for (let i = 0; i < v.foundations.piles; i++) piles.push(this.pile('foundation', i))
    for (let i = 0; i < v.cells; i++) piles.push(this.pile('cell', i))
    if (v.reserve) for (let i = 0; i < v.reserve.piles; i++) piles.push(this.pile('reserve', i))
    piles.push(this.pile('stock', 0))
    if (v.stock.kind === 'waste') piles.push(this.pile('waste', 0))

    const take = (): Card => deck.pop()!
    const by = (kind: Pile['kind'], i: number) => piles.find((p) => p.kind === kind && p.index === i)!

    // Tableau, dealt a row at a time the way it is done by hand — which matters
    // only for which physical card lands where, but that is the whole deal.
    const counts =
      typeof v.tableau.deal === 'number'
        ? new Array(v.tableau.piles).fill(v.tableau.deal)
        : v.tableau.deal
    const deepest = Math.max(...counts)
    for (let row = 0; row < deepest; row++) {
      for (let i = 0; i < v.tableau.piles; i++) {
        if (row >= counts[i]) continue
        const fd = v.tableau.faceDown
        let down: boolean
        if (Array.isArray(fd)) down = row < fd[i]
        else if (fd === 'none') down = false
        else if (fd === 'allButLast') down = row < counts[i] - 1
        else down = row < fd
        by('tableau', i).cards.push({ card: take(), faceUp: !down })
      }
    }

    if (v.reserve) {
      for (let i = 0; i < v.reserve.piles; i++) {
        for (let n = 0; n < v.reserve.cards; n++) {
          by('reserve', i).cards.push({ card: take(), faceUp: v.reserve.faceUp })
        }
      }
      // Only the top of a face-down reserve shows.
      if (!v.reserve.faceUp) {
        for (let i = 0; i < v.reserve.piles; i++) {
          const p = by('reserve', i)
          if (p.cards.length) p.cards[p.cards.length - 1].faceUp = true
        }
      }
    }

    // Canfield and its relatives take their foundation rank from the deal rather
    // than always starting at an ace.
    if (v.foundations.base === 'dealt') {
      const first = by('reserve', 0).cards[by('reserve', 0).cards.length - 1] ?? { card: take(), faceUp: true }
      this.baseRank = first.card.rank
      const f = by('foundation', 0)
      if (f.cards.length === 0 && by('reserve', 0).cards.length) {
        f.cards.push(by('reserve', 0).cards.pop()!)
        f.cards[0].faceUp = true
      }
    } else {
      this.baseRank = 'A'
    }

    const stock = by('stock', 0)
    while (deck.length) stock.cards.push({ card: take(), faceUp: false })

    this.piles = piles
    this.touch()
  }

  get(id: string): Pile | undefined {
    return this.piles.find((p) => p.id === id)
  }

  // -------------------------------------------------------------- legality

  /** The rank a foundation wants next. */
  private foundationWants(pile: Pile): { rank: Rank; suit?: Card['suit'] } | null {
    const base = rankOrder(this.baseRank)
    if (pile.cards.length === 0) return { rank: this.baseRank }
    const top = pile.cards[pile.cards.length - 1].card
    const next = (rankOrder(top.rank) - base + 1) % 13
    if (next === 0) return null // complete
    return { rank: RANKS[(base + next) % 13], suit: top.suit }
  }

  /** The build rule a liftable run must satisfy — placement's rule unless the
   *  variant overrides `liftMatch` (Spider: place any suit, carry one suit). */
  private liftBuild(): Build {
    const m = this.variant.liftMatch
    return m ? { ...this.variant.build, match: m } : this.variant.build
  }

  /** Spider-family: the foundations take a whole finished suit, not one card at a
   *  time. Marked by dealing the stock straight onto the tableau, which only these
   *  games do. */
  discardsRuns(): boolean {
    if (this.variant.foundations.discardRuns !== undefined) return this.variant.foundations.discardRuns
    return this.variant.stock.kind === 'tableau' || this.variant.foundations.base === 'K'
  }

  /** How many cards this game will let you lift right now. */
  capacity(toEmpty: boolean): number {
    const v = this.variant
    if (v.lift === 'one') return 1
    if (v.lift !== 'freeCell') return Infinity
    const freeCells = this.piles.filter((p) => p.kind === 'cell' && p.cards.length === 0).length
    const freeCols = this.piles.filter((p) => p.kind === 'tableau' && p.cards.length === 0).length
    // Moving *into* an empty column can't also use that column as a stepping
    // stone, which is the classic off-by-one in this formula.
    const usable = toEmpty ? Math.max(0, freeCols - 1) : freeCols
    return (freeCells + 1) * Math.pow(2, usable)
  }

  canMove(from: string, to: string, count: number): boolean {
    const src = this.get(from)
    const dst = this.get(to)
    if (!src || !dst || src === dst || count < 1) return false
    if (src.cards.length < count) return false
    if (src.kind === 'stock') return false

    const moving = src.cards.slice(src.cards.length - count)
    if (moving.some((c) => !c.faceUp)) return false
    const head = moving[0].card

    if (dst.kind === 'foundation') {
      // Spider and its kin don't build a foundation a card at a time — they
      // discard a whole finished suit at once. Such a foundation only ever takes
      // a complete run onto an empty pile, never a single card.
      if (this.discardsRuns()) {
        if (dst.cards.length !== 0) return false
        const ranks = 13 - (this.variant.strip?.length ?? 0)
        if (count !== ranks) return false
        if (head.rank !== 'K') return false
        return isRun(src, src.cards.length - count, this.variant.foundations.build)
      }
      if (count !== 1) return false
      const fbuild = this.variant.foundations.build
      if (fbuild.direction === 'either') {
        // Golf/Black Hole: not a monotone ace-to-king climb, so it never "wants"
        // one particular rank — any card a step either side of the top will do.
        if (dst.cards.length === 0) return true
        return follows(dst.cards[dst.cards.length - 1].card, head, fbuild)
      }
      const want = this.foundationWants(dst)
      if (!want) return false
      if (want.rank !== head.rank) return false
      if (want.suit && want.suit !== head.suit) return false
      if (dst.cards.length === 0) return true
      return follows(dst.cards[dst.cards.length - 1].card, head, this.variant.foundations.build)
    }

    if (dst.kind === 'cell') return count === 1 && dst.cards.length === 0
    if (dst.kind === 'stock' || dst.kind === 'waste' || dst.kind === 'reserve') return false

    // Tableau.
    if (src.kind === 'foundation' && !this.variant.foundationToTableau) return false
    if (count > 1) {
      if (this.variant.lift === 'one') return false
      if (this.variant.lift === 'sequence' || this.variant.lift === 'freeCell') {
        // A group lifts as a unit only when it satisfies the lift rule, which is
        // the placement rule unless the game says otherwise. Spider places any
        // suit but only carries a same-suit run.
        if (!isRun(src, src.cards.length - count, this.liftBuild())) return false
      }
    }
    if (this.variant.lift === 'freeCell' && count > this.capacity(dst.cards.length === 0)) return false

    if (dst.cards.length === 0) {
      switch (this.variant.empty) {
        case 'none':
          return false
        case 'kingOnly':
          return head.rank === 'K'
        case 'baseRank':
          return head.rank === this.baseRank
        case 'any':
          return true
      }
    }
    return follows(dst.cards[dst.cards.length - 1].card, head, this.variant.build)
  }

  /** Every legal move on the board, for the hint button and the solver. */
  legalMoves(): Move[] {
    const out: Move[] = []
    const max = this.variant.lift === 'one' ? 1 : 13
    for (const src of this.piles) {
      if (src.kind === 'stock' || src.cards.length === 0) continue
      for (let count = 1; count <= Math.min(max, src.cards.length); count++) {
        if (src.kind !== 'tableau' && count > 1) break
        for (const dst of this.piles) {
          if (dst === src) continue
          if (this.canMove(src.id, dst.id, count)) out.push({ from: src.id, to: dst.id, count })
        }
      }
    }
    return out
  }

  // -------------------------------------------------------------- playing

  move(from: string, to: string, count = 1): boolean {
    if (!this.canMove(from, to, count)) return false
    const src = this.get(from)!
    const dst = this.get(to)!
    const moving = src.cards.splice(src.cards.length - count, count)
    dst.cards.push(...moving)

    // Turning the newly exposed card is part of the move, so undo can put it back.
    let flipped: string | null = null
    const top = src.cards[src.cards.length - 1]
    if (src.kind === 'tableau' && top && !top.faceUp) {
      top.faceUp = true
      flipped = src.id
    }

    this.history.push({ action: { from, to, count }, flipped })
    this.moves++
    this.touch()
    return true
  }

  /** Turn the stock. Deals to the waste, or straight onto the tableau in Spider. */
  drawStock(): boolean {
    const v = this.variant
    const stock = this.get('stock-0')!

    if (v.stock.kind === 'tableau') {
      if (stock.cards.length === 0) return false
      // Spider will not deal onto an empty column.
      const cols = this.piles.filter((p) => p.kind === 'tableau')
      if (cols.some((p) => p.cards.length === 0)) return false
      const n = Math.min(cols.length, stock.cards.length)
      for (let i = 0; i < n; i++) {
        const c = stock.cards.pop()!
        c.faceUp = true
        cols[i].cards.push(c)
      }
      this.history.push({ action: { from: 'stock', to: 'waste', count: n }, flipped: null })
      this.moves++
      this.touch()
      return true
    }

    if (v.stock.kind === 'foundation') {
      // Golf turns the stock straight onto the play pile, whatever the card is;
      // it simply becomes the new base to build away from.
      if (stock.cards.length === 0) return false
      const foundation = this.get('foundation-0')!
      const n = Math.min(v.stock.draw, stock.cards.length)
      for (let i = 0; i < n; i++) {
        const c = stock.cards.pop()!
        c.faceUp = true
        foundation.cards.push(c)
      }
      this.history.push({ action: { from: 'stock', to: 'waste', count: n }, flipped: null })
      this.moves++
      this.touch()
      return true
    }

    if (v.stock.kind !== 'waste') return false
    const waste = this.get('waste-0')!

    if (stock.cards.length === 0) {
      if (waste.cards.length === 0) return false
      if (this.redealsLeft === 0) return false
      if (this.redealsLeft > 0) this.redealsLeft--
      while (waste.cards.length) {
        const c = waste.cards.pop()!
        c.faceUp = false
        stock.cards.push(c)
      }
      this.history.push({ action: { from: 'redeal', to: 'stock', count: 0 }, flipped: null })
      this.moves++
      this.touch()
      return true
    }

    const n = Math.min(v.stock.draw, stock.cards.length)
    for (let i = 0; i < n; i++) {
      const c = stock.cards.pop()!
      c.faceUp = true
      waste.cards.push(c)
    }
    this.history.push({ action: { from: 'stock', to: 'waste', count: n }, flipped: null })
    this.moves++
    this.touch()
    return true
  }

  undo(): boolean {
    const last = this.history.pop()
    if (!last) return false
    const { action, flipped } = last

    if (action.from === 'redeal') {
      const stock = this.get('stock-0')!
      const waste = this.get('waste-0')!
      while (stock.cards.length) {
        const c = stock.cards.pop()!
        c.faceUp = true
        waste.cards.push(c)
      }
      if (this.redealsLeft >= 0) this.redealsLeft++
    } else if (action.from === 'stock') {
      const stock = this.get('stock-0')!
      if (this.variant.stock.kind === 'tableau') {
        const cols = this.piles.filter((p) => p.kind === 'tableau')
        for (let i = action.count - 1; i >= 0; i--) {
          const c = cols[i].cards.pop()!
          c.faceUp = false
          stock.cards.push(c)
        }
      } else if (this.variant.stock.kind === 'foundation') {
        const foundation = this.get('foundation-0')!
        for (let i = 0; i < action.count; i++) {
          const c = foundation.cards.pop()!
          c.faceUp = false
          stock.cards.push(c)
        }
      } else {
        const waste = this.get('waste-0')!
        for (let i = 0; i < action.count; i++) {
          const c = waste.cards.pop()!
          c.faceUp = false
          stock.cards.push(c)
        }
      }
    } else {
      const src = this.get(action.from)!
      const dst = this.get(action.to)!
      if (flipped) {
        const p = this.get(flipped)!
        if (p.cards.length) p.cards[p.cards.length - 1].faceUp = false
      }
      const back = dst.cards.splice(dst.cards.length - action.count, action.count)
      src.cards.push(...back)
    }

    this.moves++
    this.touch()
    return true
  }

  // -------------------------------------------------------------- the end

  /** Cards that have to reach the foundations for the game to be over. */
  private targetCards(): number {
    const v = this.variant
    const ranks = 13 - (v.strip?.length ?? 0)
    return v.decks * 4 * ranks
  }

  won(): boolean {
    const v = this.variant
    // Spider-likes win by completing runs and discarding them, which this engine
    // models as foundations that take a whole sequence — so both shapes reduce to
    // "everything is on a foundation".
    const home = this.piles
      .filter((p) => p.kind === 'foundation')
      .reduce((n, p) => n + p.cards.length, 0)
    if (v.foundations.piles === 0) return false
    return home === this.targetCards()
  }

  /** Send everything that can go home, repeatedly. The one convenience every
   *  solitaire program has, and the engine does it so the screen can't cheat. */
  autoFinish(limit = 400): number {
    let moved = 0
    for (let pass = 0; pass < limit; pass++) {
      // A finished run discarding to a Spider foundation is worth auto-playing too,
      // so this looks for any tableau→foundation move rather than only singles.
      const move = this.legalMoves().find((m) => this.get(m.to)!.kind === 'foundation')
      if (!move) break
      this.move(move.from, move.to, move.count)
      moved++
    }
    return moved
  }
}

export { makeRng, randomSeed }
