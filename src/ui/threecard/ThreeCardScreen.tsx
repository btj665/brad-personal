import { useCallback, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { Cat3, handName } from '../../poker/eval3'
import { ThreeCardGame, type Outcome } from '../../threecard/engine'
import {
  ANTE_BONUS,
  LIMITS,
  PAIR_PLUS_TABLES,
  pairPlusKey,
  STRATEGY_NOTE,
  type BonusKey,
  type PairPlusKey,
} from '../../threecard/rules'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'
import { WinToast } from '../WinToast'

const START = 1000

const BONUS_ROWS: Array<[BonusKey, Cat3, string]> = [
  ['straightFlush', Cat3.StraightFlush, 'Straight flush'],
  ['trips', Cat3.Trips, 'Three of a kind'],
  ['straight', Cat3.Straight, 'Straight'],
]

const PP_ROWS: Array<[PairPlusKey, string]> = [
  ['straightFlush', 'Straight flush'],
  ['trips', 'Three of a kind'],
  ['straight', 'Straight'],
  ['flush', 'Flush'],
  ['pair', 'Pair'],
]

const OUTCOME_LABEL: Record<Outcome, string> = {
  fold: 'Folded',
  noQualify: 'Dealer doesn’t qualify',
  win: 'You win',
  lose: 'Dealer wins',
  push: 'Push',
}

/** A betting circle. It is drawn even when empty so the felt never reflows, and
 *  `ghost` shows the Play bet's price before it has been made. */
function Spot({
  label,
  amount,
  live,
  ghost,
  onClick,
}: {
  label: string
  amount: number
  live?: boolean
  ghost?: boolean
  onClick?: () => void
}) {
  const cls = [
    'tcp-spot',
    live ? 'tcp-spot-live' : '',
    ghost ? 'tcp-spot-ghost' : '',
    onClick ? 'tcp-spot-click' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <span className="tcp-spot-label">{label}</span>
      <span className="tcp-spot-chips">
        {ghost ? (
          <span className="tcp-spot-ghost-amount">{amount}</span>
        ) : (
          amount > 0 && <ChipStack amount={amount} denominations={LIMITS.chips} />
        )}
      </span>
    </>
  )

  if (!onClick) return <div className={cls}>{inner}</div>
  return (
    <button type="button" className={cls} onClick={onClick} title={`Add ${label.toLowerCase()}`}>
      {inner}
    </button>
  )
}

export function ThreeCardScreen() {
  const [game, setGame] = useState(() => new ThreeCardGame({ seed: randomSeed(), bankroll: START }))
  const [coach, setCoach] = useState(false)
  useSyncExternalStore(game.subscribe, game.getVersion)

  const rebuy = useCallback(
    () =>
      setGame(new ThreeCardGame({ seed: randomSeed(), bankroll: START, pairPlusTableId: game.table.id })),
    [game],
  )

  const deciding = game.phase === 'decide'
  const settled = game.phase === 'complete'
  // The finished hand stays on the felt while the next bet is made.
  const hand = game.hand ?? game.last
  const payout = settled ? (game.last?.payout ?? null) : null
  const hint = coach ? game.hint() : null
  const broke = !deciding && !game.canDeal()

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Three Card Poker</span>
          <select
            className="tcp-schedule"
            value={game.table.id}
            disabled={deciding}
            onChange={(e) => game.setTable(e.target.value)}
            title="The Pair Plus schedule. The flush row is the whole difference."
          >
            {PAIR_PLUS_TABLES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} — {(t.edge * 100).toFixed(2)}% edge
              </option>
            ))}
          </select>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((v) => !v)}
            title={STRATEGY_NOTE}
          >
            Coach
          </button>
        </div>
      </header>

      <WinToast
        net={payout && payout.net > 0 ? payout.net : 0}
        token={settled ? `tcp-${game.round}` : 'tcp-live'}
      />

      <main className="main">
        <div className="tray tcp-tray">
          <div className="tcp-felt felt">
            <div className="tcp-row">
              <span className="tcp-seat-label">Dealer</span>
              <div className="tcp-cards">
                {hand
                  ? hand.dealer.map((card, i) => (
                      <PlayingCard key={card.uid} card={card} down={!settled} tilt={(i - 1) * 3} />
                    ))
                  : [0, 1, 2].map((i) => <span key={i} className="card-ghost" />)}
              </div>
              <span className={`tcp-rank${settled ? '' : ' tcp-rank-dim'}`}>
                {settled && hand
                  ? `${handName(hand.dealerScore)}${payout?.dealerQualified ? '' : ' — doesn’t qualify'}`
                  : 'Face down until you decide'}
              </span>
            </div>

            <div className="tcp-divider" />

            <div className="tcp-row">
              <span className={`tcp-rank${hand ? '' : ' tcp-rank-dim'}`}>
                {hand ? handName(hand.playerScore) : 'Waiting on a bet'}
              </span>
              <div className="tcp-cards">
                {hand
                  ? hand.player.map((card, i) => (
                      <PlayingCard key={card.uid} card={card} tilt={(i - 1) * 3} />
                    ))
                  : [0, 1, 2].map((i) => <span key={i} className="card-ghost" />)}
              </div>
              <span className="tcp-seat-label">You</span>
            </div>

            <div className="tcp-spots">
              <Spot
                label="Ante"
                amount={deciding && hand ? hand.ante : game.ante}
                live
                onClick={deciding ? undefined : () => game.addAnte(game.chip)}
              />
              <Spot
                label="Play"
                amount={deciding && hand ? hand.ante : 0}
                live={deciding}
                ghost={deciding}
              />
              <Spot
                label="Pair Plus"
                amount={deciding && hand ? hand.pairPlusBet : game.pairPlus}
                live={(deciding ? (hand?.pairPlusBet ?? 0) : game.pairPlus) > 0}
                onClick={deciding ? undefined : () => game.addPairPlus(game.chip)}
              />
            </div>

            {payout && (
              <div
                className={`tcp-result tcp-result-${payout.net > 0 ? 'win' : payout.net < 0 ? 'lose' : 'push'}`}
              >
                <b>{OUTCOME_LABEL[payout.outcome]}</b>
                {payout.anteBonus > 0 && <span className="tcp-tag">Ante bonus +{payout.anteBonus}</span>}
                {payout.pairPlus > 0 && (
                  <span className="tcp-tag">
                    Pair Plus +{payout.pairPlus - (game.last?.pairPlusBet ?? 0)}
                  </span>
                )}
                <span className="tcp-net">{payout.net >= 0 ? `+${payout.net}` : payout.net}</span>
              </div>
            )}
          </div>

          <div className="tcp-panel">
            <div className="tcp-paytable">
              <h3 className="tcp-paytable-head">Ante bonus</h3>
              <p className="tcp-paytable-note">
                Paid on your three cards whether the dealer qualifies or even wins.
              </p>
              <table>
                <tbody>
                  {BONUS_ROWS.map(([key, cat, label]) => (
                    <tr
                      key={key}
                      className={
                        settled && hand && hand.playerScore.category === cat ? 'tcp-pay-hit' : undefined
                      }
                    >
                      <td>{label}</td>
                      <td>{ANTE_BONUS[key]}:1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tcp-paytable">
              <h3 className="tcp-paytable-head">Pair Plus</h3>
              <p className="tcp-paytable-note">{game.table.note}</p>
              <table>
                <tbody>
                  {PP_ROWS.map(([key, label]) => (
                    <tr
                      key={key}
                      className={
                        settled && hand && pairPlusKey(hand.playerScore) === key ? 'tcp-pay-hit' : undefined
                      }
                    >
                      <td>{label}</td>
                      <td>{game.table.pay[key]}:1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="tcp-panel-note">
              The dealer qualifies on <b>queen high</b> or better. When the dealer doesn’t qualify the
              ante pays 1:1 and the Play bet is handed back.
            </p>
          </div>
        </div>

        <div className="controls tcp-controls">
          {deciding ? (
            <>
              <p className="prompt">
                You hold <b>{hand ? handName(hand.playerScore) : ''}</b>. Match the ante to see the
                dealer, or fold and give it up.
              </p>
              {hint !== null && (
                <p className="coach">
                  Q-6-4 says <b>{hint ? 'Play' : 'Fold'}</b>.
                </p>
              )}
              <div className="button-row button-row-actions">
                <button
                  className={`btn btn-big${hint === false ? ' btn-primary' : ' btn-ghost'}`}
                  onClick={() => game.fold()}
                >
                  Fold
                </button>
                <button
                  className={`btn btn-big${hint === false ? ' btn-ghost' : ' btn-primary'}`}
                  onClick={() => game.play()}
                >
                  Play {hand?.ante ?? 0}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="tcp-chiprow">
                {LIMITS.chips.map((v) => (
                  <button
                    key={v}
                    className={`vp-coin${game.chip === v ? ' vp-coin-on' : ''}`}
                    onClick={() => game.setChip(v)}
                  >
                    {v}
                  </button>
                ))}
                <span className="tcp-chiprow-note">
                  Tap a spot to add. Staked {game.staked} — the table wants the ante twice over, so it
                  can be matched by the Play bet.
                </span>
              </div>
              <div className="button-row button-row-actions">
                <button className="btn btn-ghost" onClick={() => game.clearBets()}>
                  Reset bets
                </button>
                {broke ? (
                  <button className="btn btn-primary btn-big" onClick={rebuy}>
                    Buy in for {START}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-big" onClick={() => game.deal()}>
                    Deal
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <ul className="log">
          {game.log
            .slice(-6)
            .reverse()
            .map((entry, i) => (
              <li key={`${entry.round}-${i}`}>{entry.text}</li>
            ))}
        </ul>
      </main>
    </>
  )
}
