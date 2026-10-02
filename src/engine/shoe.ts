import { buildShoeCards } from './cards'
import type { Rng } from './rng'
import type { Card, RuleSet } from './types'

/** A multi-deck shoe with a cut card, exactly like the plastic wedge the dealer
 *  buries in the stack. When the cut card is dealt out, the shoe finishes the
 *  current round and then reshuffles. */
export class Shoe {
  cards: Card[] = []
  /** Cards that have been dealt, newest last. Feeds the discard tray. */
  discards: Card[] = []
  burned: Card | null = null
  /** Index into the *original* stack where the cut card sits. */
  private cutIndex = 0
  private dealt = 0
  cutCardOut = false

  constructor(
    private rules: RuleSet,
    private rng: Rng,
  ) {
    this.shuffle()
  }

  /** 52, or 48 at a Spanish 21 table. Everything that measures the shoe against
   *  its own length — the cut card, the progress bar — has to ask this rather
   *  than assume a French deck. */
  get cardsPerDeck(): number {
    return this.rules.removeTens ? 48 : 52
  }

  shuffle(): void {
    // `buildShoeCards` is shared with six other games and deals a French deck.
    // The Spanish deck is that deck with the rank-10 cards pulled out — jacks,
    // queens and kings stay — so it is a filter here rather than an option there.
    const built = buildShoeCards(this.rules.decks)
    this.cards = this.rules.removeTens ? built.filter((c) => c.rank !== '10') : built
    // Fisher–Yates, driven by the seeded RNG.
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1)
      const tmp = this.cards[i]
      this.cards[i] = this.cards[j]
      this.cards[j] = tmp
    }
    this.discards = []
    this.dealt = 0
    this.cutCardOut = false
    this.burned = null

    if (this.rules.burnCard && this.cards.length > 0) {
      this.burned = this.cards.pop()!
      this.discards.push(this.burned)
    }

    const total = this.rules.decks * this.cardsPerDeck
    this.cutIndex = Math.floor(total * this.rules.penetration)
  }

  draw(): Card {
    if (this.cards.length === 0) this.shuffle()
    const card = this.cards.pop()!
    this.discards.push(card)
    this.dealt++
    if (this.dealt >= this.cutIndex) this.cutCardOut = true
    return card
  }

  get cardsRemaining(): number {
    return this.cards.length
  }

  get decksRemaining(): number {
    return this.cards.length / this.cardsPerDeck
  }

  /** How deep into the shoe we are, 0..1 — drives the cut-card indicator. */
  get progress(): number {
    const total = this.rules.decks * this.cardsPerDeck
    return total === 0 ? 0 : this.dealt / total
  }
}
