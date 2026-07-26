import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { CaribbeanGame, UP_INDEX } from '../../caribbean/engine'
import {
  breakEvenMeter,
  PAY_LABEL,
  PAY_ORDER,
  progressiveReturn,
  progressiveWin,
  type PayKey,
} from '../../caribbean/rules'
import { raiseReason, shouldRaise } from '../../caribbean/strategy'
import { CATEGORY_NAME } from '../../poker/eval'
import { randomSeed } from '../../engine/rng'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'
import { WinToast } from '../WinToast'

const START = 1000

export function CaribbeanScreen() {
  const [game, setGame] = useState(
    () => new CaribbeanGame({ seed: randomSeed(), bankroll: START }),
  )
  const [coach, setCoach] = useState(false)
  useSyncExternalStore(game.subscribe, game.getVersion)

  const rebuy = useCallback(
    () => setGame(new CaribbeanGame({ seed: randomSeed(), bankroll: START })),
    [],
  )

  // F folds, R raises — the only two keys the game ever needs.
  useEffect(() => {
    if (game.phase !== 'decide') return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'f') {
        e.preventDefault()
        game.fold()
      } else if (k === 'r') {
        e.preventDefault()
        game.raise()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, game.phase, game.round])

  const hand = game.hand
  const settled = game.phase === 'complete'
  const s = hand?.settlement ?? null
  const rules = game.rules

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Caribbean Stud</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((v) => !v)}
            title="Show the published raise/fold rule for the hand you were dealt"
          >
            Coach
          </button>
        </div>
      </header>

      <WinToast net={s?.net ?? 0} token={settled ? `cs-${game.round}` : 'cs-live'} />

      <main className="main">
        <div className="cs">
          <section className="cs-felt">
            <div className="cs-side">
              <span className="cs-side-label">
                Dealer
                {game.dealer.qualifies === null
                  ? ''
                  : game.dealer.qualifies
                    ? ' — opens'
                    : ' — does not qualify'}
              </span>
              <div className="cs-row">
                {game.dealer.cards.length === 0
                  ? [0, 1, 2, 3, 4].map((i) => <span key={i} className="card-ghost" />)
                  : game.dealer.cards.map((card, i) => (
                      <span key={card.uid} className="cs-slot">
                        <PlayingCard
                          card={card}
                          down={!game.dealer.revealed && i !== UP_INDEX}
                          tilt={(i - 2) * 1.5}
                        />
                        {i === UP_INDEX && !game.dealer.revealed && (
                          <span className="cs-uptag">up</span>
                        )}
                      </span>
                    ))}
              </div>
              <span className="cs-hand-name">
                {game.dealer.score ? CATEGORY_NAME[game.dealer.score.category] : ''}
              </span>
            </div>

            <div className="cs-verdict">
              {settled && s ? (
                <span className={`cs-result cs-result-${s.result}`}>{verdict(s.result, s.qualifies)}</span>
              ) : game.phase === 'decide' ? (
                <span className="cs-result">Fold, or Raise {hand ? hand.ante * 2 : 0}?</span>
              ) : (
                <span className="cs-result cs-result-idle">Ante up.</span>
              )}
            </div>

            <div className="cs-side">
              <span className="cs-side-label">You</span>
              <div className="cs-row">
                {!hand
                  ? [0, 1, 2, 3, 4].map((i) => <span key={i} className="card-ghost" />)
                  : hand.cards.map((card, i) => (
                      <span key={card.uid} className="cs-slot">
                        <PlayingCard card={card} tilt={(i - 2) * 1.5} />
                      </span>
                    ))}
              </div>
              <span className="cs-hand-name">
                {hand ? CATEGORY_NAME[hand.score.category] : ''}
              </span>
            </div>

            <div className="cs-circles">
              <Circle label="Ante" amount={hand ? hand.ante : game.ante} chips={rules.chips} />
              <Circle label="Raise (2×)" amount={hand?.raise ?? 0} chips={rules.chips} />
              <Circle
                label="Progressive"
                amount={hand ? hand.progressive : game.progressive ? rules.progressive.cost : 0}
                chips={[1]}
              />
            </div>
          </section>

          <aside className="cs-rail">
            <h3 className="cs-rail-title">Raise pays</h3>
            <table className="cs-paytable">
              <tbody>
                {PAY_ORDER.map((key) => (
                  <tr key={key} className={hitRow(key, s?.playerKey, s?.result)}>
                    <td className="cs-pay-name">{PAY_LABEL[key]}</td>
                    <td className="cs-pay-odds">{rules.raisePay[key]}:1</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="cs-rail-note">
              Dealer must have <b>ace-king or better</b> to play. If he doesn’t, the ante pays
              even money and the Raise is returned — whatever you are holding.
            </p>

            <h3 className="cs-rail-title">Progressive ${rules.progressive.cost}</h3>
            <div className="cs-meter">${rules.progressive.meter.toLocaleString()}</div>
            <table className="cs-paytable">
              <tbody>
                {PAY_ORDER.filter((k) => progressiveWin(rules.progressive, k) > 0).map((key) => (
                  <tr key={key} className={hand?.progressive ? hitRow(key, s?.playerKey) : undefined}>
                    <td className="cs-pay-name">{PAY_LABEL[key]}</td>
                    <td className="cs-pay-odds">
                      ${progressiveWin(rules.progressive, key).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cs-rail-note cs-rail-warn">
              Returns {(progressiveReturn(rules.progressive) * 100).toFixed(1)}% at this meter.
              It only breaks even above ${Math.ceil(breakEvenMeter(rules.progressive)).toLocaleString()}.
            </p>
          </aside>
        </div>

        <div className="tray">
          <div className="controls">
            {/* Broke means broke at the table minimum, not at the ante currently
                set — otherwise a big ante would hide the stepper that fixes it. */}
            {game.phase !== 'decide' && game.bankroll < rules.minAnte * 3 ? (
              <div className="button-row button-row-actions">
                <button className="btn btn-primary btn-big" onClick={rebuy}>
                  Buy in for {START}
                </button>
              </div>
            ) : game.phase === 'decide' ? (
              <>
                <p className="prompt">
                  Dealer shows <b>{game.upcard ? face(game.upcard.rank) : ''}</b>. Fold and give up
                  the ante, or Raise <b>{hand ? hand.ante * 2 : 0}</b>.
                </p>
                {coach && hand && (
                  <div className="cs-coach">
                    Book says <b>{shouldRaise(hand.cards, hand.score) ? 'raise' : 'fold'}</b>.{' '}
                    {raiseReason(hand.cards, hand.score)}
                  </div>
                )}
                <div className="button-row button-row-actions">
                  <button className="btn btn-ghost cs-fold" onClick={() => game.fold()}>
                    Fold <span className="cs-key">F</span>
                  </button>
                  <button className="btn btn-primary btn-big" onClick={() => game.raise()}>
                    Raise {hand ? hand.ante * 2 : 0} <span className="cs-key">R</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="cs-bet-row">
                  <span className="cs-stepper">
                    <button
                      className="btn"
                      onClick={() => game.setAnte(game.ante - rules.minAnte)}
                      aria-label="Lower the ante"
                    >
                      −
                    </button>
                    <b>{game.ante}</b>
                    <button
                      className="btn"
                      onClick={() => game.setAnte(game.ante + rules.minAnte)}
                      aria-label="Raise the ante"
                    >
                      +
                    </button>
                  </span>
                  <button
                    className={`btn btn-ghost${game.progressive ? ' btn-on' : ''}`}
                    onClick={() => game.toggleProgressive()}
                    title="A dollar on your own five cards. Bad below the break-even meter."
                  >
                    Progressive ${rules.progressive.cost}
                  </button>
                  <span className="cs-out">{game.stakeOut} out, {game.ante * 2} held back</span>
                </div>
                <div className="button-row button-row-actions">
                  <button
                    className="btn btn-primary btn-big"
                    disabled={!game.canDeal()}
                    onClick={() => game.deal()}
                  >
                    {game.round === 0 ? 'Deal' : 'Next hand'}
                  </button>
                </div>
              </>
            )}
          </div>

          <ul className="log">
            {game.log
              .slice(-6)
              .reverse()
              .map((entry, i) => (
                <li key={`${entry.round}-${i}`} className={i === 0 ? 'log-fresh' : undefined}>
                  {entry.text}
                </li>
              ))}
          </ul>
        </div>
      </main>
    </>
  )
}

function Circle({
  label,
  amount,
  chips,
}: {
  label: string
  amount: number
  chips: number[]
}) {
  return (
    <div className="cs-circle">
      <span className="cs-circle-label">{label}</span>
      <span className="cs-circle-spot">
        {amount > 0 ? <ChipStack amount={amount} denominations={chips} /> : null}
      </span>
    </div>
  )
}

function verdict(result: string, qualifies: boolean): string {
  if (result === 'fold') return 'Folded — ante taken.'
  if (!qualifies) return 'Dealer doesn’t qualify — ante pays, Raise back.'
  if (result === 'win') return 'You win.'
  if (result === 'lose') return 'Dealer wins.'
  return 'Push.'
}

/** Light up the row the hand was actually paid on — only when it was paid. */
function hitRow(key: PayKey, playerKey?: PayKey, result?: string): string | undefined {
  if (playerKey !== key) return undefined
  if (result !== undefined && result !== 'win') return undefined
  return 'cs-pay-hit'
}

const FACE: Record<string, string> = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack' }
function face(rank: string): string {
  return FACE[rank] ?? `a ${rank}`
}
