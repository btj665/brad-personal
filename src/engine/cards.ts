import type { Card, Rank, Suit } from './types'

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']

export const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
]

/** An ace counts 11 here; `evaluate` demotes it to 1 when the hand would bust. */
export function rankValue(rank: Rank): number {
  if (rank === 'A') return 11
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}

export function isTenValue(card: Card): boolean {
  return rankValue(card.rank) === 10
}

export function isAce(card: Card): boolean {
  return card.rank === 'A'
}

export const SUIT_PIP: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

export const RED_SUITS: readonly Suit[] = ['H', 'D']

export function isRed(card: Card): boolean {
  return card.suit === 'H' || card.suit === 'D'
}

export function cardName(card: Card): string {
  return `${card.rank}${SUIT_PIP[card.suit]}`
}

/** Build `decks` unshuffled 52-card decks, with a shoe-unique uid on every card. */
export function buildShoeCards(decks: number): Card[] {
  const cards: Card[] = []
  let uid = 0
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ uid: uid++, rank, suit })
      }
    }
  }
  return cards
}
