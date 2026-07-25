// The robot players.
//
// The design rule here: every bot plays a hand the way a competent player at a
// real table plays it. Nobody hits eighteen, nobody stands on eight, nobody
// splits tens. The personalities differ in *bet sizing* and in a couple of very
// common, very small human tendencies — the kind of thing you'd actually see
// next to you — never in a way that's obviously wrong.

import { canSurrender } from '../rules'
import type { Action, BotProfile, Card, Hand, RuleSet, Seat } from '../types'
import { basicStrategy } from './basic'
import { countDeviation, shouldInsure, betUnits } from './count'

export interface BotContext {
  rules: RuleSet
  /** Hi-Lo true count, for the counter. Others ignore it. */
  trueCount: number
}

export function botAction(
  profile: BotProfile,
  hand: Hand,
  up: Card,
  seat: Seat,
  ctx: BotContext,
): Action {
  const { rules, trueCount } = ctx
  const basic = basicStrategy(hand, up, seat, rules)

  switch (profile.style) {
    case 'counter': {
      // Surrender is a strong play; the counter keeps it and deviates only on
      // the hit/stand/double/split decisions.
      if (basic === 'surrender') return basic
      return countDeviation(hand, up, trueCount, seat, rules) ?? basic
    }

    case 'cautious': {
      // Never surrenders — a lot of players simply won't hand back a live hand.
      // Costs about a tenth of a percent; annoys nobody.
      if (basic === 'surrender') {
        return cautiousFallback(hand, up, seat, rules)
      }
      return basic
    }

    case 'aggressive': {
      // Would rather take the card than give up half the bet, and won't hand
      // back a hand either. Still fully within basic-strategy sanity.
      if (basic === 'surrender') return cautiousFallback(hand, up, seat, rules)
      return basic
    }

    case 'basic':
    default:
      return basic
  }
}

/** What basic strategy would say if the house had no surrender at all. */
function cautiousFallback(hand: Hand, up: Card, seat: Seat, rules: RuleSet): Action {
  if (!canSurrender(hand, rules)) return basicStrategy(hand, up, seat, rules)
  const noSurrender: RuleSet = { ...rules, surrender: 'none' }
  return basicStrategy(hand, up, seat, noSurrender)
}

/** Insurance. Only the counter ever takes it, and only when the count says so —
 *  which is the correct play, and also what a good player at your table does. */
export function botInsurance(profile: BotProfile, ctx: BotContext): boolean {
  if (profile.style === 'counter') return shouldInsure(ctx.trueCount)
  return false
}

/** Even money on a natural is the same bet as insurance, so the same answer. */
export function botEvenMoney(profile: BotProfile, ctx: BotContext): boolean {
  return botInsurance(profile, ctx)
}

export function botBet(profile: BotProfile, seat: Seat, ctx: BotContext): number {
  const { rules, trueCount } = ctx
  const units =
    profile.style === 'counter'
      ? betUnits(trueCount, profile.maxSpread) * profile.betUnits
      : profile.betUnits

  const wanted = units * rules.minBet
  const capped = Math.min(wanted, rules.maxBet, seat.bankroll)
  // Never push out less than the table minimum; if the bankroll can't cover it,
  // the seat sits out.
  return capped >= rules.minBet ? roundToChip(capped, rules) : 0
}

/** Bots bet in real chips, not arbitrary amounts. */
function roundToChip(amount: number, rules: RuleSet): number {
  const smallest = Math.min(...rules.chips, rules.minBet)
  return Math.max(rules.minBet, Math.floor(amount / smallest) * smallest)
}
