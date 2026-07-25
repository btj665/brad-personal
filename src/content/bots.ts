// The other four seats. Every one of them plays basic strategy correctly; they
// differ in what they bet and in a couple of harmless human habits.

import type { BotProfile } from '../engine/types'

export interface BotCharacter {
  name: string
  profile: BotProfile
  bankroll: number
  /** One line about how they play, shown on the seat. */
  tell: string
}

export const BOT_ROSTER: BotCharacter[] = [
  {
    name: 'Marguerite',
    bankroll: 2000,
    tell: 'Textbook basic strategy. Flat bets. Never says a word.',
    profile: {
      style: 'basic',
      betUnits: 1,
      maxSpread: 1,
      quips: ['By the book.', 'Same bet.'],
    },
  },
  {
    name: 'Deuce',
    bankroll: 5000,
    tell: 'Counts. Spreads his bet when the shoe goes rich, and takes insurance only then.',
    profile: {
      style: 'counter',
      betUnits: 1,
      maxSpread: 8,
      quips: ['Shoe is good.', 'Pressing it.', "I'll take insurance."],
    },
  },
  {
    name: 'Hollis',
    bankroll: 1500,
    tell: "Solid, but won't ever surrender a hand. Says it feels like quitting.",
    profile: {
      style: 'cautious',
      betUnits: 1,
      maxSpread: 1,
      quips: ['Play it out.', "I don't give hands back."],
    },
  },
  {
    name: 'Ruby',
    bankroll: 3000,
    tell: 'Bets bigger than she should. Plays the hands right, though.',
    profile: {
      style: 'aggressive',
      betUnits: 3,
      maxSpread: 1,
      quips: ['Let it ride.', 'Big one coming.'],
    },
  },
  {
    name: 'Whit',
    bankroll: 2500,
    tell: 'Another book player. Two units, every hand, all night.',
    profile: {
      style: 'basic',
      betUnits: 2,
      maxSpread: 1,
      quips: ['Book says hit.', 'Fine by me.'],
    },
  },
]
