# The Tables

Sixteen casino games — including a slot floor of four cabinets — sharing one
deterministic engine core, two poker-hand evaluators, and one deck of hand-drawn
SVG cards.

**Card tables**

- **Blackjack** — a five-seat table, a multi-deck shoe with a cut card, four
  robot players, and every rule variant as a live switch — including **Free Bet**
  (free doubles and splits, dealer pushes on 22) and **Spanish 21** (48-card
  deck, the bonus ladder, double-down rescue).
- **Baccarat** — punto banco on eight decks, the drawing tableau that neither
  side may deviate from, banker commission, both pair bets, and a bead plate.
- **Pai Gow Poker** — a 53-card deck with the joker, split into a high and a low
  hand by the house way, 5% commission, and the Fortune bonus.
- **Ultimate Texas Hold'em** — ante, blind and trips, the 4×/2×/1× raise
  ladder, the blind bonus, and a dealer who has to open.
- **Three Card Poker** — ante/play against a dealer who needs a queen, the ante
  bonus, and Pair Plus on either of its two historical pay tables.
- **Caribbean Stud** — five cards each against one dealer card face up, a dealer
  who qualifies on ace-king, the raise ladder, and a progressive that prints its
  own break-even meter.
- **Mississippi Stud** — three community cards turned one at a time, 1×–3×
  raises at every street, and a pay table that settles on the *total* wagered.
- **Let It Ride** — three bets, two of which you may pull back as the board
  comes out, and no dealer hand to beat.
- **Casino War** — one card each, and the only decision in the building that
  matters: surrender half, or go to war.

**Dice & wheels**

- **Craps** — a realistic table layout with pass / don't pass and come / don't
  come at true-odds, place bets on the box numbers, and the field.
- **Roulette** — American, European and French (with la partage), a spinning
  wheel with a ball that rides to the winning pocket, and the full betting
  layout: straights, splits, streets, corners and lines placed on the edges
  and corners of the numbers.
- **Sic Bo** — three dice and all 52 spots, every one priced on the felt.
- **Big Six** — the money wheel, 54 stops, and the worst odds on the floor
  printed next to each symbol.

**Machines**

- **Video Poker** — five variants (Jacks or Better, Bonus, Double Bonus, Deuces
  Wild), an optimal-play coach that solves the best hold exactly, auto-hold, and
  Triple / Five / Ten Play.
- **Slots** — four cabinets, chosen to be four different *mechanics* rather than
  four themes, because the theme is the only part of a slot that doesn't change
  the arithmetic: a three-reel stepper with doubling wilds and a top-box wheel; a
  thirty-line game whose bells pay from anywhere and then lock and respin; a
  cascading screen where winners crumble, the chain escalates, and boulders hide
  prizes; and a lounge with free games, a wild that swallows a whole reel, and
  eight backstage doors.
- **Keno** — pick one to ten of eighty, drawn twenty at a time, with the exact
  hypergeometric odds and an honest note about what the ticket costs you.

```bash
npm run dev          # play them            → http://localhost:5173
npm test             # 758 engine tests
npm run build

npm run edges         # every game's validation, one sweep

npm run edge          # blackjack house edge, every ruleset, by simulation
npm run baccarat:edge # baccarat, exact + 25M coups
npm run paigow:edge   # pai gow house edge
npm run uth:edge      # ultimate hold'em house edge
npm run uth:trips     # the trips side-bet edge
npm run tcp:edge      # three card poker, exact
npm run cstud:edge    # caribbean stud, exact + a billion hands
npm run mstud:edge    # mississippi stud, exact
npm run lir:edge      # let it ride, exact
npm run war:edge      # casino war, exact
npm run craps:edge    # craps house edge, the main bets
npm run roulette:edge # roulette house edge, all three wheels
npm run sicbo:edge    # sic bo, exact, all 216 rolls
npm run bigsix:edge   # big six, exact, all 54 stops
npm run vp:return     # video poker return, 1 / 3 / 5 / 10 hands
npm run slots:rtp     # every cabinet's return, exact base + measured feature
npm run keno:return   # keno, exact hypergeometric
npm run poker:freq    # the poker evaluator vs. textbook hand frequencies
```

---

## How we know it's right

Every one of these games except the slots has a house edge that is known from
published analysis. So none of them are validated by "it looks like it works" —
each is measured and made to land on its known number. If a payout, a dealer
rule, or a strategy chart were wrong, the edge would come out wrong. (The slots
are the exception, and they get their own section below: nobody publishes a
slot's return because it is designed rather than derived.)

**Where the outcome space is small enough, we don't simulate at all — we
enumerate it.** An exact number can be asserted in a test; a sampled one can
only be checked against an error bar. Eight of the table games are now solved
exactly:

| Game | Method | Measured | Published |
|---|---|---|---|
| Sic Bo — all 52 spots | all 216 rolls | exact, every spot | every spot |
| Big Six — all 7 symbols | all 54 stops | exact, every symbol | every symbol |
| Keno — picks 1–10 | BigInt hypergeometric | 25.000%–30.184% | — |
| Three Card Poker — ante/play | 407,170,400 hand pairs | 3.373% | 3.37% |
| Three Card Poker — Pair Plus | all 22,100 hands | 7.276% / 2.317% | 7.28% / 2.32% |
| Mississippi Stud | all 1,326 starting hands | 4.915% | 4.910% |
| Let It Ride | 51,979,200 ordered rounds | 3.508% | 3.51% |
| Casino War | the 312-card composition | 2.877% | 2.88% |
| Baccarat — banker | all ≤6-card sequences | 1.058% | 1.06% |
| Baccarat — player / tie / pairs | as above | 1.235% / 14.360% / 10.361% | 1.24% / 14.36% / 10.36% |

And the games that are still simulated:

| Game | Simulated | Known |
|---|---|---|
| Blackjack (Vegas Strip, basic strategy) | 0.391% ± 0.08% | 0.41% |
| Blackjack (Free Bet) | 1.19% | 1.04% — see below |
| Blackjack (Spanish 21) | 1.28% | 0.40% — see below |
| Pai Gow Poker (house way, dealer banks) | 2.72% ± 0.22% | ~2.84% |
| Caribbean Stud (A-K-J-8-3 rule) | 5.3229% | 5.32% for this rule |
| Roulette — European, even money | 2.673% | 2.70% |
| Roulette — French, la partage | 1.314% | 1.35% |
| Craps — pass line | 1.458% | 1.41% |
| Craps — field (2×/3×) | 2.744% | 2.78% |
| Ultimate Hold'em (Trips side bet) | 3.64% | pay-table dependent |

### Slots are the exception, and the interesting one

Every other game here has a house edge that exists outside this repository. A
slot doesn't: its return is not a consequence of the rules, it is **designed**,
by choosing how often each symbol appears on each reel strip. There is no
published figure to check against.

That makes them easier to verify rather than harder. The strips and the pay table
are the whole specification, so the return can be **enumerated exactly** — and it
is enumerated through the same evaluator the live game uses, on a one-row window
with a single flat line, so the computed return and the played game cannot drift
apart. Each cabinet then asserts that figure against the number it was cut to
hit.

| Cabinet | Reels | Bonus | Exact base | Measured | Cut for |
|---|---|---|---|---|---|
| Bars & Sevens | 3-reel stepper, doubling wilds | top-box wheel | 76.486% | 90.174% | 90% |
| Bell Ringer | 30 lines, bells pay from anywhere | hold & spin | 85.311% | 94.901% | 95% |
| Rockslide | cascading reels, 1×→10× ladder | pick a boulder | 44.702% | 94.818% | 95% |
| The Late Show | expanding wilds, free games at 2× | eight doors | 65.136% | 95.944% | 96% |

The **base** column is the reels alone. Nothing that feeds a screen back into
itself can be enumerated — a cascade produces its own next screen, a free-games
round changes the screen's distribution, a respin re-grants itself — so for those
the base is a real number and a genuine cross-check that the strips are right,
and the full return is measured. `npm run slots:rtp` prints both and never blurs
them together; it also names *which* features sit outside the enumeration, since
a wheel worth 15% of a machine is otherwise easy to hide inside a reassuring
"exact" figure.

Two of the three bonus mechanics are priced in **closed form**, so the cabinets
carrying them were re-cut algebraically rather than by hunting:

- A **wheel** with equally-likely wedges is worth its own mean. Bars & Sevens is
  the whole machine priced without a single simulated spin: the strip weave lands
  its two bonus symbols 23 stops apart on a 32-stop reel, so no three-row window
  can hold both, "three on screen" is exactly "one per reel", and the trigger is
  `(6/32)³ = 27/4096`. Times a mean wedge of `492/24 = 20.5` that is `0.135132`
  of the return, exactly, on top of an enumerated `0.764862` — **0.899994**
  against a target of 0.90.
- A **pick** round is worth its whole prize pool divided by `duds + 1`. With `d`
  duds shuffled among the prizes, any given prize is collected exactly when it
  precedes all of them, and those `d + 1` items are in uniform random order — so
  it is collected with probability `1/(d+1)`, independent of how many other
  prizes there are. Verified against simulation on four boards, including a
  degenerate one-prize-four-duds case, before it was relied on.
- **Hold and spin** has no closed form, because respins re-grant themselves
  whenever a coin lands, so it is measured.

Adding the bonus symbol cost nothing, which is the trick that made the retune
cheap: `BON` replaced **blanks**, not paying symbols. Since the evaluator treats
it as a blocker exactly like a blank, every window's win set, every cascade and
every scatter distribution is untouched, and `exactLineReturn` did not move at
all — asserted by relabelling `BON` back to `-` and checking the base return
matches to twelve places.

Bell Ringer's rebalance is the one worth reading. Its bells already paid a
scatter ladder up to 9+; now six bells also buy a hold-and-spin, so **only the
rungs the round replaces came down** — 3, 4 and 5 are untouched, because they
never bought a round and have no business funding one. Rungs 6+ fell from
`0.140563` of the return to `0.043852`, and the round is `0.096808`: the money
didn't leave the machine, it left the glass. Two side effects: the ladder now
reads `5 → 9, 6 → 10`, which looks like a typo and is the opposite (the sixth
bell is worth 40× all in), and dropping a 1200× top award cut the per-spin
standard deviation from about 12 to 4.7, so that cabinet now resolves four times
as sharply as it used to.

Measuring a slot is harder than it looks, which cost real time here. A five-reel
machine's per-spin return has a standard deviation of **3 to 12 times the stake**,
so a single run of half a million spins pins the return to only about a
percentage point. The Late Show was reported at 96% on the strength of two 4M-spin
runs reading 95.9% and 95.7%; eight independent seeds put the truth at 95.0%,
four and a half standard errors below the claim. Both original runs were real —
just two sigma high, which one stream cannot tell you.

Re-cutting it was itself worth the trouble. Because `resolveSpin` never consults
the pay table when it draws stops, a given seed produces an *identical* sequence
of screens whatever the pay table says. So instead of re-simulating each
candidate, the fix tallied multiplier-weighted win counts per (symbol, run
length, base or free) over one fixed 12M-spin stream — an exact linear model of
the return as a function of the pay card, verified by reproducing the raw figure
to six digits. Candidates were then scored against that identical stream, which
removes sampling noise from the comparison entirely. The whole gap turned out to
sit in the ace column. The trim was fitted on eight seeds and then confirmed on
**sixteen seeds disjoint from the fit**, reading 96.182% ± 0.300% over 24M spins;
`npm run slots:rtp` independently reads 95.993% ± 0.425%. The sweep now defaults
to eight seeds of 1.5M spins and prints the per-spin SD beside every figure, so
the next person doesn't repeat the mistake.

Two arithmetic traps are worth knowing before editing a strip, both of which
produced absurd returns during the build:

- **Blanks are the machine.** Without a frequent non-paying symbol, every screen
  of three matching symbols pays, and a three-reel stepper returns **375%**. The
  dead space between symbols sets the price, not the pay table.
- **A doubling wild counts twice over.** Each reel weighs a symbol at
  `(count + 2·wilds)`, not `(count + wilds)` — the multiplier lands once in the
  odds and once in the pay. Missing it made a strip that looked tight return
  **160%**, and it only surfaced by breaking the return down per symbol.

And one about the mechanic itself: **Rockslide's cascade amplifies its first drop
by 1.93×, not the 2–3× a naive model predicts.** A win removes about three cells
out of twenty and the other seventeen are *known non-winners* that survive
intact, so the chance of continuing is roughly half a fresh screen's hit
frequency rather than equal to it. Chains die faster than a geometric model
suggests, and the 10× rung is reached on 0.18% of spins.

The poker evaluator is checked a second way: deal two million five-card hands and
its category frequencies match the textbook odds to four decimal places (`npm run
poker:freq`). That matters because seven of the fifteen games settle on it. The
three-card evaluator in `poker/eval3.ts` is checked harder still — a census over
all 22,100 three-card hands, which is the only real proof that a straight
outranks a flush when you only hold three cards.

Video poker's *return* resists a quick Monte Carlo — the royal pays 800 and shows
up once in ~40,000 hands — so its correctness rests on the pieces being tested
directly. Multi-hand, though, is proved exactly: enumerating every draw from all
ten pools, the largest disagreement between the ten hands' expected values is
**0**. That is what "the return doesn't change, only the variance" means, and it
is asserted rather than sampled.

### Bugs this caught

- **Sic Bo, the total 6 and 15 spots.** Priced at 18:1, which yields a 12.04%
  edge — the published figure is 16.67%, which is that spot at **17:1**. The
  enumeration made a one-unit paytable error impossible to miss. Two of the
  reference edges it was checked against were also wrong: 30.09% is a *specific*
  triple paying 150:1, not any triple at 30:1, and 18.98% is the total-9 figure,
  not a specific double. The test now asserts all 52 spots with no exception list.
- **Caribbean Stud's target, not its code.** The engine measured 5.32% against a
  "published" 5.22% and the gap was real but misattributed: 5.22% is *upcard-aware
  optimal* play, and the A-K-J-8-3 rule the game plays is 5.32%. Found by
  building a second, independent implementation and running a billion hands
  against it.
- **Casino War can't be validated by simulation.** Its non-tie branch has exactly
  zero expected value but contributes ±1 unit of noise, so a flat-bet estimator
  has a standard error of ~0.1 percentage points per million rounds — it cannot
  resolve 2.88% to two decimals however long you run it. The script prints the
  exact and the sampled columns side by side (2.877% against 2.915%) so the
  difference is visible rather than mysterious.
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
    types.ts        Card, Rank, Suit — used by every game.
    rng.ts          Seeded PRNG. Every game replays from one integer.
    cards.ts        Ranks, suits, building a shoe.
    shoe.ts         Multi-deck shoe, cut card, penetration, burn, CSM, and the
                    48-card Spanish deck as a filter.
    table.ts        The blackjack state machine, incl. free bets and the
                    Spanish bonus ladder.
    strategy/       Basic strategy, Hi-Lo counting, the bots.

  poker/
    eval.ts         The five-card evaluator. Ranks five, finds the best five of
                    seven, and knows the two things Pai Gow needs: the semi-wild
                    joker and the wheel ranking.
    eval3.ts        The three-card evaluator, deliberately a separate type from
                    the five-card one — with three cards a straight beats a
                    flush, and nominally distinct enums stop that being mixed up.

  baccarat/       rules.ts holds the drawing tableau as an explicit switch, plus
                  resolveCoup() — the reference walk the tests and the exact
                  enumeration both call.
  uth/            ante → blind → 4x → flop → 2x → river → 1x/fold → showdown.
  paigow/         deal 7 → set high/low → reveal → settle, 5% commission.
  threecard/      ante/play, the ante bonus, both Pair Plus tables.
  caribbean/      fold or raise 2x; the progressive's return in closed form.
  mstud/          three streets of 1x–3x, paid on the total wagered.
  letitride/      three bets, two pull-backs, both published charts.
  war/            high card, then surrender or war.
  craps/          come-out and point rolls; pass/come/odds/place/field.
  roulette/       three wheels; every bet as the numbers it covers.
  sicbo/          52 spots as coverage plus price, and the exact edge of each.
  keno/           odds.ts does the hypergeometric in BigInt, because C(80,20)
                  is 393x past MAX_SAFE_INTEGER and doubles lose it silently.
  bigsix/         54 stops; the edge is a closed form and an enumeration that
                  must agree.
  videopoker/     classify → solver → paytables, single line through Ten Play.
  slots/          types.ts is the whole specification of a cabinet: strips, rows,
                  paylines, pay table, feature, bonus. evaluate.ts reads a stopped
                  screen; rtp.ts enumerates the return from the strips through
                  that same evaluator; machine.ts resolves a spin — every cascade
                  in a chain, every free game it bought, and the bonus round —
                  into a list of steps the UI walks on a timer.
    bonus.ts      Wheel, pick and hold-and-spin, plus the closed forms that price
                  the first two. All three are decided the instant they trigger:
                  a player's clicks set the order of the reveal, not the total,
                  which is what the cabinets do and the only version whose return
                  can be stated and then held to.
    machines/     One file per cabinet, and each is data plus a feature tag: the
                  engine does the work, so a new machine is a pay table and a
                  set of strips, not a new state machine.

  ui/             React. Reads the engines, never simulates them.
    Shell.tsx       The lobby, grouped into card tables, dice and machines.
    ...             One screen per game, plus shared Card and Chip components.
```

**None of the engines have a clock.** Each advances exactly one *beat* per
`step()` and returns a description of what happened, or resolves synchronously
where there is nothing to pace. The UI calls `step()` on a timer for casino
pacing; the tests and simulators call it in a tight loop. Same code, same
results — which is why millions of hands take seconds and every game replays
perfectly from its seed.

---

## The robots

Three of the games seat you next to others; the rule there is that **the players
next to you never make a play that would make you wince.** This is enforced by
tests, not hoped for.

- **Blackjack** — all four bots play correct basic strategy against every
  two-card hand, upcard, count, and ruleset. They differ only in bet sizing and
  a couple of harmless human habits (one won't surrender; one overbets). The
  counter uses the Illustrious 18 — minus splitting tens, which is correct and
  is also the single most annoying thing a stranger can do at a table.
- **Ultimate Hold'em** — the bots play the published simple charts. Sound,
  never-embarrassing play. It gives up a little to the theoretical optimum
  (which needs a solver), and `npm run uth:edge` reports honestly what it costs.
- **Pai Gow** — the dealer and the bots set their hands by the house way, the
  same fixed procedure a real dealer must follow. It plays close to optimal and,
  by law and by test, never fouls.

The other twelve are played solo against the house. Several of them have a
**Coach** that shows what correct play would be: video poker solves the hold
exactly, and three card poker, let it ride, mississippi stud and caribbean stud
highlight what their published charts say.

---

## Playing them

**Blackjack.** Chips, then Deal. Hit / Stand / Double / Split / Surrender on the
buttons or `H S D P R`. The "Rules" panel — or the game-name dropdown on the
felt — switches between nine real games and lets you set every rule by hand:
decks, penetration, H17/S17, European no-hole-card, 3:2 vs 6:5, surrender,
re-split and hit aces, Charlies, free bets, the Spanish deck and its bonuses.
**Coach** shows the book play; **Count** shows the running Hi-Lo.

**Baccarat.** Chips on Player, Banker, Tie or either pair, then Deal. Nothing to
decide after that — the tableau plays both hands, and the "Show the tableau"
button prints the grid it is following. The bead plate keeps the shoe's history.

**Pai Gow.** Bet (and an optional Fortune bonus). Then arrange your seven cards:
click two for the low hand, and the engine won't let you foul. Or hit **Play
house way** — or tick "set for me" up top.

**Ultimate Hold'em.** Post the ante and blind (and an optional Trips bonus).
Raise 4× before the flop, 2× after it, or 1× at the river — or fold.

**Three Card Poker.** Ante, and optionally Pair Plus. Look at three cards, then
Fold or Play. The dealer needs a queen to open. Both Pair Plus schedules are
selectable, so the one-pip flush difference between them is visible.

**Caribbean Stud.** Ante, and optionally the $1 progressive. One dealer card
shows; Fold or Raise twice the ante. The rail states the progressive's live
return and its break-even meter, because a side bet that is only good above a
threshold should say so.

**Mississippi Stud.** Ante, then two hole cards. Raise 1×, 2× or 3× — or fold —
before each of the three community cards. Everything is paid on the *total*
wagered, which is why the ladder is worth climbing on a good hand.

**Let It Ride.** Three equal bets go up. After three cards you may pull the first
back; after the fourth card, the second. The third always rides.

**Casino War.** One card each. On a tie, surrender half or double up and go to
war. **Going to war is always the better of the two** — the simulator proves it.

**Craps.** Click a chip, then a bet: Pass / Don't Pass on the come-out; Come /
Don't Come and the box numbers once a point is set; Add Odds behind the line; the
field any time. Roll the dice. The puck up top shows the point.

**Roulette.** Pick a wheel. Click a chip value, then the layout: a number for a
straight-up, or one of the dots on the edges and corners for a split, street,
corner or line, plus dozens, columns and the even-money bets (right-click to
clear a spot). Spin, and watch the ball ride to the pocket.

**Sic Bo.** Chip, then a spot — every one prints what it pays. Small, Big, Odd
and Even all lose to a triple. Shake, and the winning spots light.

**Big Six.** Pick a symbol and spin. Each spot prints its stops-out-of-54 and its
exact house edge, which is the most useful thing anyone can tell you about this
game.

**Video Poker.** Pick a variant (its return is on the label) and a machine: one,
three, five or ten hands. Bet 1–5 coins **each** — the total bet panel shows what
that actually comes to, which is the thing that surprises people about Ten Play.
Deal, tap the cards to hold, draw; every hand draws from its own deck.
**Coach** highlights the cards perfect play would keep. **Auto-hold** pre-selects
holds on the deal — *winners* keeps exactly the cards of a dealt paying hand,
*best* pre-holds the solver's optimal play; either way, tap any card to override
before drawing.

**Slots.** Pick a cabinet from the dropdown (its return is on the label), set
coins per line, and spin — or set 10, 25 or 50 on autoplay. The reels start
together and stop left to right, so the last one carries the suspense; each
winning line is then held up on its own before the total rolls up on the meter.
On Rockslide the winners crumble out and fresh stone falls into the gaps at a
rising multiplier until the chain dies. On The Late Show three marquees buy ten
free games and the spotlight floods its whole reel. Land the bonus symbol and the
cabinet hands over: a wheel to spin, boulders or doors to open, or bells that lock
and respin. A spin paying eight times the bet or more gets the big-win screen.

**Press Pays.** Every symbol's full ladder in real credits, a diagram of every
payline numbered to match what the machine calls out when it pays, the feature and
the bonus round explained in the cabinet's own numbers, and the return — stated as
what is enumerated and what is measured, with the reason for the difference.

Everything on these machines is drawn: the symbols in `ui/slots/Symbols.tsx`, the
top boxes, rails, belly glass and coin trays in `ui/slots/Cabinet.tsx`. Four
cabinets, four palettes, no bitmaps anywhere.

**Keno.** Mark one to ten of the eighty numbers, or use quick pick. Twenty are
called. The rail shows the pay table for your pick count and the house edge that
comes with it.

---

## What isn't here

- **Spanish 21 measures 1.28% against a published 0.40%, and that gap is real.**
  About 0.34% of it is redoubling, which isn't implemented and which the
  published figure assumes. The rest is that both blackjack variants play the
  ordinary six-deck chart plus documented deviations, not a chart drawn for the
  variant — a real Spanish chart reworks the whole hard-total block for the
  missing tens. Free Bet is closer (1.19% against 1.04%) for the same reason.
  The settlement is exercised by tests; it's the strategy that's approximate,
  and `npm run edge` prints the discrepancy rather than rounding it away.
- **Keno's rate card is transcribed, not sourced.** The maths is exact — the
  probabilities sum to 1 in BigInt and the 1-in-8,911,711 ten-spot is asserted —
  but the network here blocks every gambling reference host, so the pay table
  itself comes from memory. The 1-spot landing on exactly 75.000% is that card's
  known signature, which is reassuring but not proof. Swap a row in
  `keno/paytables.ts` and the printed edge follows it; nothing asserts a
  hardcoded return.
- **Blackjack Switch isn't here.** It needs a two-hand-with-swapping state
  machine rather than the rule switches Free Bet and Spanish 21 fit into.
- **The slot cabinets are original, deliberately.** They implement the mechanics
  of the machines they were modelled on — the stepper's doubling wild, the
  count-anywhere scatter ladder, the tumbling screen, the expanding-wild free
  round — with their own names, symbols and strips. No real performer is named or
  depicted and no other company's cabinet names appear, because the mechanic is
  the part worth building and the trademark isn't. Nothing here reproduces any
  commercial machine's actual reel strips or pay table, so the returns are ours
  and match nothing on a real floor.
- Slots have no progressive meters, no nudge or hold features, no "ways" games
  (243-ways and the like — every cabinet here pays on defined lines), and no
  sound. The cascade refills from the reel's own strip rather than from a
  physical column above it, which is the right model for the arithmetic and is
  why the enumerated base return stays meaningful. The reels are also honest
  about being theatre: the engine resolves a spin completely before the first
  reel moves, exactly as a real cabinet does, and everything after that is
  animation over a decided result.
- Caribbean Stud plays the published A-K-J-8-3 rule, not upcard-aware optimal
  play; that's the ~0.10% between the two published figures. Its progressive
  meter is fixed rather than growing, since that's the only version whose return
  is a single checkable number, and there's no aggregate payout cap.
- Blackjack uses the 4–8 deck strategy chart at every deck count; a few
  single-deck cells differ by a fraction of a percent.
- Ultimate Hold'em bots play the simple charts, not a perfect solver, so their
  measured edge sits above the ~2.19% theoretical floor.
- Pai Gow is dealer-banked only (no player banking rotation).
- Side bets are sparse by design: Trips (Hold'em), Fortune (Pai Gow), Pair Plus
  (three card), both baccarat pairs, the war tie, and the caribbean progressive.
  No 21+3, Perfect Pairs, Dragon Bonus, 6-Card Bonus, Match the Dealer, or
  keno/video-poker multipliers.
- Craps covers the line, come, odds, place and field bets — not the proposition
  and hardway center bets. Roulette's exotic zero bets beyond the single-zero
  splits and the American top line aren't laid out, though the engine settles
  any set of numbers.
- **The rendering is checked now.** All fifteen screens are driven through a
  headless browser, screenshotted and asserted free of console errors — the
  earlier caveat that this had been built without a browser to hand no longer
  applies. What isn't automated is taste: run `npm run dev` and judge the
  layout yourself.
