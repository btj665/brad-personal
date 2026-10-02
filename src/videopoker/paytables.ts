// Video-poker variants. Each is a pay table (coins won per coin bet, at a full
// five-coin bet, which is why the royal flush is 800 rather than 250) and the
// family that says how to read a hand. The measured return of optimal play is on
// each — `npm run vp:return` reproduces it.

import type { Family, PayCategory } from './classify'

export interface Variant {
  id: string
  label: string
  family: Family
  /** Coins won per coin bet. Missing categories pay nothing. */
  pay: Partial<Record<PayCategory, number>>
  /** Measured return of optimal play, as a percentage. */
  rtp: number
  note: string
}

// Every quad pays the same in a plain Jacks-or-Better game.
const JOB_QUADS = { fourAces: 25, fourTwoThruFour: 25, fourFiveThruKing: 25, fourOfAKind: 25 }

export const VARIANTS: Variant[] = [
  {
    id: 'jacks-9-6',
    label: 'Jacks or Better 9/6',
    family: 'standard',
    rtp: 99.54,
    note: 'The benchmark. Full-pay: full house 9, flush 6. Almost break-even with perfect play.',
    pay: {
      royalFlush: 800,
      straightFlush: 50,
      ...JOB_QUADS,
      fullHouse: 9,
      flush: 6,
      straight: 4,
      threeOfAKind: 3,
      twoPair: 2,
      jacksOrBetter: 1,
    },
  },
  {
    id: 'jacks-8-5',
    label: 'Jacks or Better 8/5',
    family: 'standard',
    rtp: 97.3,
    note: 'The same game with the full house and flush shaved to 8 and 5. That one change costs over 2%.',
    pay: {
      royalFlush: 800,
      straightFlush: 50,
      ...JOB_QUADS,
      fullHouse: 8,
      flush: 5,
      straight: 4,
      threeOfAKind: 3,
      twoPair: 2,
      jacksOrBetter: 1,
    },
  },
  {
    id: 'bonus',
    label: 'Bonus Poker',
    family: 'standard',
    rtp: 99.17,
    note: 'Premium four-of-a-kinds: four aces pay 80, four 2s–4s pay 40. Paid for with an 8/5 full house and flush.',
    pay: {
      royalFlush: 800,
      straightFlush: 50,
      fourAces: 80,
      fourTwoThruFour: 40,
      fourFiveThruKing: 25,
      fourOfAKind: 25,
      fullHouse: 8,
      flush: 5,
      straight: 4,
      threeOfAKind: 3,
      twoPair: 2,
      jacksOrBetter: 1,
    },
  },
  {
    id: 'double-bonus',
    label: 'Double Bonus 9/7/5',
    family: 'standard',
    rtp: 99.11,
    note: 'Four aces pay 160, and even a plain quad pays 50 — but two pair is cut to 1, which is where you feel it.',
    pay: {
      royalFlush: 800,
      straightFlush: 50,
      fourAces: 160,
      fourTwoThruFour: 80,
      fourFiveThruKing: 50,
      fourOfAKind: 50,
      fullHouse: 9,
      flush: 7,
      straight: 5,
      threeOfAKind: 3,
      twoPair: 1,
      jacksOrBetter: 1,
    },
  },
  {
    id: 'deuces-full',
    label: 'Deuces Wild (full pay)',
    family: 'deuces',
    rtp: 100.76,
    note: 'Every 2 is wild. Full-pay 25/15/9/5/3/2/2 returns OVER 100% with perfect play — which is why you will not find it any more.',
    pay: {
      naturalRoyal: 800,
      fourDeuces: 200,
      wildRoyal: 25,
      fiveOfAKind: 15,
      straightFlush: 9,
      fourOfAKind: 5,
      fullHouse: 3,
      flush: 2,
      straight: 2,
      threeOfAKind: 1,
    },
  },
]

export function variantById(id: string): Variant {
  return VARIANTS.find((v) => v.id === id) ?? VARIANTS[0]
}

export function payFor(variant: Variant, category: PayCategory): number {
  return variant.pay[category] ?? 0
}
