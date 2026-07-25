# The Tables

Six casino games that share one deterministic engine core, one poker-hand
evaluator, and one deck of hand-drawn SVG cards:

- **Blackjack** — a five-seat table, a multi-deck shoe with a cut card, four
  robot players, and every rule variant as a live switch.
- **Ultimate Texas Hold'em** — ante, blind and trips, the 4×/2×/1× raise
  ladder, the blind bonus, and a dealer who has to open.
- **Pai Gow Poker** — a 53-card deck with the joker, split into a high and a low
  hand by the house way, 5% commission, and the Fortune bonus.
- **Video Poker** — five variants (Jacks or Better, Bonus, Double Bonus, Deuces
  Wild), with an optimal-play coach that solves the best hold exactly.
- **Roulette** — American, European and French (with la partage), a spinning
  wheel with a ball that rides to the winning pocket, and the full betting
  layout: straights, and splits, streets, corners and lines placed on the edges
  and corners of the numbers.
- **Craps** — a realistic table layout with pass / don't pass and come / don't
  come at true-odds, place bets on the box numbers, and the field.

```bash
npm run dev          # play them            → http://localhost:5173
npm test             # 191 engine tests
npm run build

npm run edge          # blackjack house edge, every ruleset, by simulation
npm run uth:edge      # ultimate hold'em house edge
npm run uth:trips     # the trips side-bet edge
npm run paigow:edge   # pai gow house edge
npm run vp:return     # video poker return of optimal play
npm run roulette:edge # roulette house edge, all three wheels
npm run craps:edge    # craps house edge, the main bets
npm run poker:freq    # the poker evaluator vs. textbook hand frequencies
```

---

## How we know it's right

Every one of these games has a house edge that is known from published analysis.
So none of them are validated by "it looks like it works" — each is simulated for
millions of hands and made to land on its known number. If a payout, a dealer
rule, or a strategy chart were wrong, the edge would come out wrong.

| Game | Simulated | Known |
|---|---|---|
| Blackjack (Vegas Strip, basic strategy) | 0.391% ± 0.08% | 0.41% |
| Pai Gow Poker (house way, dealer banks) | 2.72% ± 0.22% | ~2.84% |
| Roulette — European, even money | 2.673% | 2.70% |
| Roulette — French, la partage | 1.314% | 1.35% |
| Craps — pass line | 1.458% | 1.41% |
| Craps — field (2×/3×) | 2.744% | 2.78% |
| Ultimate Hold'em (Trips side bet) | 3.64% | pay-table dependent |

The poker evaluator is checked a second way: deal two million five-card hands and
its category frequencies match the textbook odds to four decimal places (`npm run
poker:freq`). That matters because four of the six games settle on it.

Video poker is the one return that resists a quick Monte Carlo: the royal flush
pays 800 and shows up once in ~40,000 hands, so the average takes an enormous
number of deals to settle even though each deal's value is computed exactly. Its
correctness rests instead on the pieces being unit-tested directly — the hand
classifier against every category, and the solver picking the known-correct hold
(keep the flush, hold four to the royal over a made flush, keep the pair).

Two real bugs were caught this way and would not have been caught otherwise:

- **Blackjack, European no-hole-card.** The dealer was skipping its second card
  against a lone player natural — but it must draw, because a dealer natural
  *pushes* that hand. Skipping it turned every one of those pushes into a 3:2
  win and leaked a third of a percent. The simulation found it; no unit test
  would have.
- **The Pai Gow joker.** The evaluator first ranked the A-2-3-4-5 wheel *above*
  a royal instead of second behind it — an off-by-one in the wheel's special
  Pai Gow value. Caught by the evaluator's ranking tests before it reached a
  table.

---

## The shape of it

```
src/
  engine/       Blackjack, and the shared card primitives.
    types.ts        Card, Rank, Suit — used by all three games.
    rng.ts          Seeded PRNG. Every game replays from one integer.
    cards.ts        Ranks, suits, building a shoe.
    shoe.ts         Multi-deck shoe, cut card, penetration, burn, CSM.
    table.ts        The blackjack state machine.
    strategy/       Basic strategy, Hi-Lo counting, the bots.

  poker/
    eval.ts         The hand evaluator. Ranks five cards, finds the best five
                    of seven, and knows the two things Pai Gow needs: the
                    semi-wild joker and the wheel ranking.

  uth/            Ultimate Texas Hold'em.
    engine.ts       ante → blind → 4x → flop → 2x → river → 1x/fold → showdown.
    strategy.ts     The published preflop / flop / river charts.
    rules.ts        Blind bonus and Trips pay tables.

  paigow/         Pai Gow Poker.
    engine.ts       deal 7 → set high/low → reveal → settle, 5% commission.
    houseway.ts     How to split seven cards. Never fouls (tested over 5000
                    real hands). The dealer and bots both follow it.
    fortune.ts      The seven-card Fortune bonus, incl. five aces and the
                    seven-card straight flush.

  videopoker/     Video Poker.
    classify.ts     A hand → a paying category, for both the standard family and
                    the fully-wild Deuces family.
    solver.ts       The optimal hold: the exact average payout of all 32 ways to
                    keep cards. Exact for holds of two-plus cards, sampled below.
    paytables.ts    The five variants.

  roulette/       Roulette.
    wheel.ts        Pocket order and colours for all three wheels.
    bets.ts         Every bet as the numbers it covers and what it pays,
                    including la partage on the French wheel.

  craps/
    engine.ts       Come-out and point rolls; pass/come/odds/place/field
                    settlement, resolved bet by bet on every roll.

  ui/             React. Reads the engines, never simulates them.
    Shell.tsx       The lobby: switch between the six tables.
    ...             One screen per game, plus shared Card and Chip components.
```

**None of the engines have a clock.** Each advances exactly one *beat* per
`step()` and returns a description of what happened. The UI calls `step()` on a
timer for casino pacing; the tests and simulators call it in a tight loop. Same
code, same results — which is why millions of hands take seconds and every game
replays perfectly from its seed.

---

## The robots

Three of the games seat you next to others; the rule there is that **the players
next to you never make a play that would make you wince.** This is enforced by
tests, not hoped for. (Video poker, roulette and craps are played solo against
the house, so there's no one to be irritated by — but video poker has a coach
that plays the hand perfectly.)

- **Blackjack** — all four bots play correct basic strategy against every
  two-card hand, upcard, count, and ruleset. They differ only in bet sizing and
  a couple of harmless human habits (one won't surrender; one overbets). The
  counter uses the Illustrious 18 — minus splitting tens, which is correct and
  is also the single most annoying thing a stranger can do at a table.
- **Ultimate Hold'em** — the bots play the published simple charts: raise 4×
  with the standard preflop hands, 2× on a made pair or strong draw, and 1× or
  fold at the river by hidden-pair. Sound, never-embarrassing play. It gives up
  a little to the theoretical optimum (which needs a solver), and `npm run
  uth:edge` reports honestly what it costs.
- **Pai Gow** — the dealer and the bots set their hands by the house way, the
  same fixed procedure a real dealer must follow. It plays close to optimal and,
  by law and by test, never fouls.

---

## Playing them

**Blackjack.** Chips, then Deal. Hit / Stand / Double / Split / Surrender on the
buttons or `H S D P R`. The "Rules" panel — or the game-name dropdown on the
felt — switches between seven real games and lets you set every variant by hand:
decks, penetration, H17/S17, European no-hole-card, 3:2 vs 6:5, surrender,
re-split and hit aces, Charlies, and more. **Coach** shows the book play;
**Count** shows the running Hi-Lo.

**Ultimate Hold'em.** Post the ante and blind (and an optional Trips bonus).
Raise 4× before the flop, 2× after it, or 1× at the river — or fold. **Coach**
tells you what the charts say.

**Pai Gow.** Bet (and an optional Fortune bonus). Then arrange your seven cards:
click two for the low hand, and the engine won't let you foul. Or hit **Play
house way** — or tick "set for me" up top to have every hand set automatically.

**Video Poker.** Pick a variant from the dropdown (its return is on the label).
Bet 1–5 coins, deal, tap the cards to hold, draw. **Coach** highlights the cards
perfect play would keep. **Auto-hold** pre-selects holds on the deal — *winners*
keeps exactly the cards of a dealt paying hand (so a winner is never thrown away
by accident), *best* pre-holds the solver's optimal play; either way, tap any
card to override before drawing.

**Roulette.** Pick a wheel. Click a chip value, then the layout: a number for a
straight-up, or one of the dots on the edges and corners for a split, street,
corner or line, plus dozens, columns and the even-money bets (right-click to
clear a spot). Spin, and watch the ball ride to the pocket. "Same bets"
re-places the last round.

**Craps.** Click a chip, then a bet: Pass / Don't Pass on the come-out; Come /
Don't Come and the box numbers once a point is set; Add Odds behind the line; the
field any time. Roll the dice. The puck up top shows the point.

---

## What isn't here

- Blackjack uses the 4–8 deck strategy chart at every deck count; a few
  single-deck cells differ by a fraction of a percent.
- Ultimate Hold'em bots play the simple charts, not a perfect solver, so their
  measured edge sits above the ~2.19% theoretical floor. The engine itself is
  exact — settlement is verified against a hand-derived all-in case, and the
  Trips edge and evaluator frequencies pin down the rest.
- Pai Gow is dealer-banked only (no player banking rotation), and side bets are
  Trips (Hold'em) and Fortune (Pai Gow) — no 21+3 or Perfect Pairs.
- Craps covers the line, come, odds, place and field bets — not the proposition
  and hardway center bets. Roulette's inside bets (splits, streets, corners,
  lines) are all clickable now; the exotic zero bets beyond the single-zero
  splits and the American top line aren't laid out, though the engine settles
  any set of numbers.
- The engines are all driven end-to-end through their own APIs in tests, and the
  dev server compiles and serves every screen — but this was built without a
  browser to hand, so **the rendering itself is unverified by eye.** Run `npm
  run dev` and look at it.
