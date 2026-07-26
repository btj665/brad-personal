import { useCallback, useState, useSyncExternalStore } from 'react'

import { cardName } from '../../engine/cards'
import { randomSeed } from '../../engine/rng'
import type { Card } from '../../engine/types'
import {
  BURN,
  DECKS,
  HOUSE_EDGE,
  OUTCOME_NAME,
  TIE_PAYS,
  WarGame,
  type WarRound,
} from '../../war/engine'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'
import { WinToast } from '../WinToast'

const START = 1000
/** Even denominations only: a surrender hands back half the bet, and no table
 *  wants to make change for half a chip. */
const CHIPS = [2, 10, 50, 100]
const SHOE_CARDS = DECKS * 52

function net(r: WarRound): number {
  return r.returned + r.tieReturned - r.wagered
}

/** One side of the table: a label and up to two cards — the first, and the war
 *  card if it came to that. */
function Side({ label, cards, tilt }: { label: string; cards: Card[]; tilt: number }) {
  return (
    <div className="war-side">
      <span className="war-side-label">{label}</span>
      <div className="war-cards">
        {cards.length === 0 ? (
          <span className="card-ghost" />
        ) : (
          cards.map((c, i) => <PlayingCard key={c.uid} card={c} tilt={i === 1 ? tilt : 0} />)
        )}
      </div>
    </div>
  )
}

export function WarScreen() {
  const [game, setGame] = useState(() => new WarGame({ seed: randomSeed(), bankroll: START, bet: 10 }))
  useSyncExternalStore(game.subscribe, game.getVersion)

  const rebuy = useCallback(
    () => setGame(new WarGame({ seed: randomSeed(), bankroll: START, bet: 10 })),
    [],
  )

  const hand = game.hand
  const settled = game.phase === 'settled' && hand !== null
  const tie = game.phase === 'tie' && hand !== null
  const broke = game.bankroll < CHIPS[0] && game.phase === 'bet'
  const result = settled ? net(hand) : 0

  const dealerCards = hand?.dealer ?? []
  const playerCards = hand?.player ?? []

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Casino War</span>
          <span className="war-tagline">
            {DECKS} decks · ties go to war · house {(HOUSE_EDGE.war * 100).toFixed(2)}%
          </span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={result} token={settled ? `war-${game.round}` : 'war-live'} />

      <main className="main">
        <div className="war">
          <div className="war-felt">
            <div className="war-shoe">
              <span className="war-shoe-bar">
                <span
                  className="war-shoe-fill"
                  style={{ width: `${(game.shoe.length / SHOE_CARDS) * 100}%` }}
                />
              </span>
              <span className="war-shoe-text">
                {game.shoe.length} of {SHOE_CARDS} left
              </span>
            </div>

            <Side label="Dealer" cards={dealerCards} tilt={4} />

            <div className="war-burn">
              {hand && hand.burn.length > 0 ? (
                <>
                  {hand.burn.map((c) => (
                    <PlayingCard key={c.uid} down />
                  ))}
                  <span className="war-burn-label">{BURN} burned</span>
                </>
              ) : (
                <span className="war-burn-label war-burn-idle">
                  {tie ? 'War burns three' : 'High card wins, even money'}
                </span>
              )}
            </div>

            <Side label="You" cards={playerCards} tilt={-4} />

            <div className="war-spots">
              <div className="war-spot">
                <span className="war-spot-label">Bet</span>
                <ChipStack amount={hand ? hand.bet + hand.raise : game.bet} denominations={CHIPS} />
              </div>
              <div className="war-spot">
                <span className="war-spot-label">Tie {TIE_PAYS}:1</span>
                {(hand ? hand.tieBet : game.tieBet) > 0 ? (
                  <ChipStack amount={hand ? hand.tieBet : game.tieBet} denominations={CHIPS} />
                ) : (
                  <span className="war-spot-empty" />
                )}
              </div>
            </div>
          </div>

          <div className="war-verdict">
            {settled ? (
              <>
                <span className="war-verdict-name">{OUTCOME_NAME[hand.outcome!]}</span>
                <span className="war-verdict-cards">
                  {cardName(hand.player[hand.player.length - 1])} vs{' '}
                  {cardName(hand.dealer[hand.dealer.length - 1])}
                </span>
                <span className={`war-verdict-net${result >= 0 ? ' war-up' : ' war-down'}`}>
                  {result >= 0 ? `+${result}` : result}
                </span>
              </>
            ) : tie ? (
              <span className="war-verdict-name war-verdict-tie">This is war.</span>
            ) : (
              <span className="war-verdict-idle">One card each. Ace is high, suits don't count.</span>
            )}
          </div>

          <div className="controls">
            {broke ? (
              <div className="button-row button-row-actions">
                <button className="btn btn-primary btn-big" onClick={rebuy}>
                  Buy in for {START}
                </button>
              </div>
            ) : tie ? (
              <>
                <p className="prompt">
                  Both cards are <b>{hand.player[0].rank}</b>. Surrender and lose half your{' '}
                  {hand.bet}, or match it to go to war — the raise pays even money and the original
                  bet pushes, so {hand.bet * 2} is at risk to win {hand.bet}.
                </p>
                <div className="button-row button-row-actions">
                  <button className="btn btn-ghost btn-action" onClick={() => game.surrender()}>
                    Surrender {hand.bet / 2}
                  </button>
                  <button
                    className="btn btn-primary btn-big btn-action"
                    disabled={!game.canGoToWar()}
                    onClick={() => game.goToWar()}
                  >
                    Go to war
                  </button>
                </div>
                <p className="war-note">
                  Going to war costs {(HOUSE_EDGE.war * 100).toFixed(2)}% in the long run;
                  surrendering every tie costs {(HOUSE_EDGE.surrender * 100).toFixed(2)}%. Never
                  surrender.
                </p>
              </>
            ) : settled ? (
              <div className="button-row button-row-actions">
                <button className="btn btn-primary btn-big" onClick={() => game.next()}>
                  Next hand
                </button>
              </div>
            ) : (
              <>
                <div className="war-bets">
                  <div className="war-bet-row">
                    <span className="war-bet-label">Bet</span>
                    {CHIPS.map((v) => (
                      <button
                        key={v}
                        className={`vp-coin${game.bet === v ? ' vp-coin-on' : ''}`}
                        onClick={() => game.setBet(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="war-bet-row">
                    <span className="war-bet-label">Tie</span>
                    <button
                      className={`vp-coin${game.tieBet === 0 ? ' vp-coin-on' : ''}`}
                      onClick={() => game.setTieBet(0)}
                    >
                      –
                    </button>
                    {CHIPS.slice(0, 2).map((v) => (
                      <button
                        key={v}
                        className={`vp-coin${game.tieBet === v ? ' vp-coin-on' : ''}`}
                        onClick={() => game.setTieBet(v)}
                      >
                        {v}
                      </button>
                    ))}
                    <span className="war-bet-note">
                      pays {TIE_PAYS}:1 — and costs {(HOUSE_EDGE.tie * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="button-row button-row-actions">
                  <button
                    className="btn btn-primary btn-big"
                    disabled={!game.canDeal()}
                    onClick={() => game.deal()}
                  >
                    Deal
                  </button>
                </div>
              </>
            )}
          </div>

          {game.history.length > 0 && (
            <div className="war-history">
              {game.history.map((r) => (
                <span
                  key={r.n}
                  className={`war-chit war-chit-${r.outcome}`}
                  title={`${OUTCOME_NAME[r.outcome!]} — ${cardName(r.player[0])} vs ${cardName(r.dealer[0])}`}
                >
                  {net(r) >= 0 ? `+${net(r)}` : net(r)}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
