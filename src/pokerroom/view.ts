// The slice of a poker table the UI actually reads and drives.
//
// The solo table hands the renderer a live `PokerGame`, which has all of this
// already. An online guest has no engine — only the snapshots the host sends — so
// it builds a plain object of the same shape instead. Typing the table, the seats
// and the bet controls against this interface (not `PokerGame`) is what lets one
// set of components render both, with no change to the solo path.

import type { Card } from '../engine/types'
import type { Action, Beat, Seat, Variant } from './types'

export interface PokerView {
  seats: Seat[]
  board: Card[]
  pot: number
  hand: number
  button: number
  /** The seat the table is waiting on, or -1. */
  onClock: number
  over: boolean
  variant: Variant
  /** Which seat is "me" on this client — the seat whose private cards show and
   *  whose turn surfaces the controls. -1 for an observer with no seat. */
  humanSeat: number
  smallBlind: number
  currentBet: number
  /** seats[humanSeat]; the bet/draw controls read the local player's hand off it. */
  human: Seat
  version: number
  log: string[]
  subscribe: (fn: () => void) => () => void
  getVersion: () => number
  /** The beat the table is paused on for the local player, or null. */
  pending: () => Beat | null
  /** Take the local player's action (bet/raise/call/check/fold). */
  act: (action: Action) => void
  /** Submit the local player's draw discards. */
  applyDraw: (idx: number[]) => void
}
