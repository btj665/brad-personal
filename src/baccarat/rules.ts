// The paytables and the drawing tableau.
//
// The tableau is the game. It is fixed by the rules of the house, identical in
// every casino in the world, and neither the player nor the dealer may deviate
// from it — which is why baccarat has no strategy and this file has no options.

import type { Rank } from '../engine/types'
import type { BaccaratRules, BetName, Ratio, Winner } from './types'

export const BET_NAMES: readonly BetName[] = [
  'player',
  'banker',
  'tie',
  'playerPair',
  'bankerPair',
]

export const BET_LABEL: Record<BetName, string> = {
  player: 'Player',
  banker: 'Banker',
  tie: 'Tie',
  playerPair: 'P Pair',
  bankerPair: 'B Pair',
}

/** Standard big-table punto banco: eight decks, 5% commission on Banker, Tie at
 *  8:1, either pair at 11:1. Tie is sometimes offered at 9:1 and the pairs at
 *  various numbers; these are the common ones, and they are what the published
 *  edges in `scripts/baccarat-edge.ts` are quoted against. */
export const DEFAULT_BACCARAT: BaccaratRules = {
  label: 'Baccarat',
  decks: 8,
  penetration: 0.94,
  commission: 0.05,
  pays: {
    player: [1, 1],
    banker: [1, 1],
    tie: [8, 1],
    playerPair: [11, 1],
    bankerPair: [11, 1],
  },
  minBet: 5,
  maxBet: 2000,
  chips: [5, 25, 100, 500],
}

export function ratio(r: Ratio): number {
  return r[0] / r[1]
}

/** Baccarat counts tens and courts as nothing and the ace as one. No other game
 *  in the codebase counts a card this way, so this can't come from
 *  `engine/cards`, whose `rankValue` is the blackjack one (ace = 11). */
export function cardPoints(rank: Rank): number {
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0
  return Number(rank)
}

/** A hand's total is the sum of its points modulo ten, so 7 + 8 is 5. */
export function total(points: readonly number[]): number {
  let sum = 0
  for (const p of points) sum += p
  return sum % 10
}

/** A two-card 8 or 9. Both hands stand at once and the coup is over. */
export function isNatural(twoCardTotal: number): boolean {
  return twoCardTotal === 8 || twoCardTotal === 9
}

/** The player's half of the tableau: draw on 0–5, stand on 6–7. Only consulted
 *  when neither side showed a natural. */
export function playerDraws(playerTotal: number): boolean {
  return playerTotal <= 5
}

/** If the player stood on two cards the banker uses the player's rule. */
export function bankerDrawsAfterStand(bankerTotal: number): boolean {
  return bankerTotal <= 5
}

/** The banker's half of the tableau, when the player has taken a third card.
 *  `playerThird` is that card's point value, so a ten or a court is a 0 here and
 *  an ace is a 1 — the row for "player drew an 8" means an actual eight.
 *
 *  A banker two-card total of 8 or 9 never reaches this function: that's a
 *  natural, and the player never drew. */
export function bankerDrawsAgainstThird(bankerTotal: number, playerThird: number): boolean {
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true
    case 3:
      return playerThird !== 8
    case 4:
      return playerThird >= 2 && playerThird <= 7
    case 5:
      return playerThird >= 4 && playerThird <= 7
    case 6:
      return playerThird === 6 || playerThird === 7
    default:
      return false // 7 stands
  }
}

/** The tableau as a grid for display: one row per banker two-card total 0–7, one
 *  column per point value of the player's third card 0–9. */
export function tableauGrid(): boolean[][] {
  const rows: boolean[][] = []
  for (let b = 0; b <= 7; b++) {
    const row: boolean[] = []
    for (let t = 0; t <= 9; t++) row.push(bankerDrawsAgainstThird(b, t))
    rows.push(row)
  }
  return rows
}

export interface Coup {
  playerPoints: number[]
  bankerPoints: number[]
  playerTotal: number
  bankerTotal: number
  winner: Winner
  natural: boolean
  /** How many cards the coup consumed: four, five or six. */
  used: number
}

/** Walk a whole coup from a run of card point values in dealing order — player,
 *  banker, player, banker, then the player's third, then the banker's third.
 *
 *  This is the reference implementation of the tableau: the engine deals the same
 *  cards a beat at a time for the screen's benefit, and the edge script's exact
 *  enumeration calls straight into here. Values, not cards, because the
 *  enumeration works over the ten point values rather than the 52 ranks. */
export function resolveCoup(points: readonly number[]): Coup {
  const at = (i: number): number => {
    const v = points[i]
    if (v === undefined) throw new Error(`resolveCoup: needed a card at ${i}`)
    return v
  }

  const playerPoints = [at(0), at(2)]
  const bankerPoints = [at(1), at(3)]
  let playerTotal = total(playerPoints)
  let bankerTotal = total(bankerPoints)
  const natural = isNatural(playerTotal) || isNatural(bankerTotal)
  let used = 4

  if (!natural) {
    let playerThird: number | null = null
    if (playerDraws(playerTotal)) {
      playerThird = at(used++)
      playerPoints.push(playerThird)
      playerTotal = total(playerPoints)
    }
    const draw =
      playerThird === null
        ? bankerDrawsAfterStand(bankerTotal)
        : bankerDrawsAgainstThird(bankerTotal, playerThird)
    if (draw) {
      bankerPoints.push(at(used++))
      bankerTotal = total(bankerPoints)
    }
  }

  const winner: Winner =
    playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie'

  return { playerPoints, bankerPoints, playerTotal, bankerTotal, winner, natural, used }
}
