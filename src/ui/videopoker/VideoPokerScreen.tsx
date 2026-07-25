import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { VideoPokerGame, type AutoHoldMode } from '../../videopoker/engine'
import type { PayCategory } from '../../videopoker/classify'
import { VARIANTS, payFor } from '../../videopoker/paytables'
import { PlayingCard } from '../Card'
import { WinToast } from '../WinToast'

const START = 200

/** The auto-hold button cycles off → winners → best. */
const NEXT_AUTO: Record<AutoHoldMode, AutoHoldMode> = {
  off: 'winners',
  winners: 'optimal',
  optimal: 'off',
}
const AUTO_LABEL: Record<AutoHoldMode, string> = {
  off: 'Auto-hold',
  winners: 'Auto-hold: winners',
  optimal: 'Auto-hold: best',
}

/** The order and labels the pay table is shown in, per family. */
const STANDARD_ROWS: Array<[PayCategory, string]> = [
  ['royalFlush', 'Royal flush'],
  ['straightFlush', 'Straight flush'],
  ['fourAces', 'Four aces'],
  ['fourTwoThruFour', 'Four 2s–4s'],
  ['fourFiveThruKing', 'Four 5s–Ks'],
  ['fourOfAKind', 'Four of a kind'],
  ['fullHouse', 'Full house'],
  ['flush', 'Flush'],
  ['straight', 'Straight'],
  ['threeOfAKind', 'Three of a kind'],
  ['twoPair', 'Two pair'],
  ['jacksOrBetter', 'Jacks or better'],
]

const DEUCES_ROWS: Array<[PayCategory, string]> = [
  ['naturalRoyal', 'Natural royal'],
  ['fourDeuces', 'Four deuces'],
  ['wildRoyal', 'Wild royal'],
  ['fiveOfAKind', 'Five of a kind'],
  ['straightFlush', 'Straight flush'],
  ['fourOfAKind', 'Four of a kind'],
  ['fullHouse', 'Full house'],
  ['flush', 'Flush'],
  ['straight', 'Straight'],
  ['threeOfAKind', 'Three of a kind'],
]

function PayTable({ game }: { game: VideoPokerGame }) {
  const rows = game.variant.family === 'deuces' ? DEUCES_ROWS : STANDARD_ROWS
  const winning = game.last?.category ?? null
  const bet = game.coins

  return (
    <table className="vp-paytable">
      <tbody>
        {rows.map(([cat, label]) => {
          const per = payFor(game.variant, cat)
          if (per === 0) return null
          return (
            <tr key={cat} className={winning === cat ? 'vp-pay-hit' : undefined}>
              <td className="vp-pay-name">{label}</td>
              <td className="vp-pay-amt">{per * bet}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const CAT_LABEL: Partial<Record<PayCategory, string>> = {
  royalFlush: 'Royal flush!',
  naturalRoyal: 'Natural royal!',
  wildRoyal: 'Wild royal!',
  fourDeuces: 'Four deuces!',
  straightFlush: 'Straight flush!',
  fiveOfAKind: 'Five of a kind!',
  fourAces: 'Four aces!',
  fourTwoThruFour: 'Four of a kind!',
  fourFiveThruKing: 'Four of a kind!',
  fourOfAKind: 'Four of a kind!',
  fullHouse: 'Full house',
  flush: 'Flush',
  straight: 'Straight',
  threeOfAKind: 'Three of a kind',
  twoPair: 'Two pair',
  jacksOrBetter: 'Jacks or better',
  nothing: '',
}

export function VideoPokerScreen() {
  const [game, setGame] = useState(() => new VideoPokerGame({ seed: randomSeed(), bankroll: START }))
  const [coach, setCoach] = useState(false)
  useSyncExternalStore(game.subscribe, game.getVersion)

  // The optimal hold is expensive, so compute it only when the coach is on and
  // only once per dealt hand.
  const hint = useMemo(() => {
    if (!coach || game.phase !== 'dealt' || !game.hand) return null
    return game.hint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach, game.phase, game.round])

  const display = game.hand ?? game.last
  const cards = display?.final ?? display?.cards ?? []
  const held = game.hand?.held ?? display?.cards.map(() => true) ?? []

  const changeVariant = useCallback((id: string) => game.setVariant(id), [game])
  const rebuy = useCallback(() => {
    setGame(
      new VideoPokerGame({
        seed: randomSeed(),
        variantId: game.variant.id,
        bankroll: START,
        autoHold: game.autoHold,
      }),
    )
  }, [game])

  const broke = game.bankroll < game.coins && game.phase !== 'dealt'
  const won = game.phase === 'complete' ? game.last?.won ?? 0 : 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <select
            className="vp-variant"
            value={game.variant.id}
            disabled={game.phase === 'dealt'}
            onChange={(e) => changeVariant(e.target.value)}
          >
            {VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} — {v.rtp}%
              </option>
            ))}
          </select>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Credits</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
          <button
            className={`btn btn-ghost${game.autoHold !== 'off' ? ' btn-on' : ''}`}
            onClick={() => game.setAutoHold(NEXT_AUTO[game.autoHold])}
            title="Pre-hold cards on the deal: winners keeps a dealt paying hand, best plays the optimal hold. Tap cards to override."
          >
            {AUTO_LABEL[game.autoHold]}
          </button>
          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((c) => !c)}
            title="Highlight the optimal cards to hold"
          >
            Coach
          </button>
        </div>
      </header>

      <WinToast
        net={game.phase === 'complete' ? won : 0}
        token={game.phase === 'complete' ? `vp-${game.round}` : 'vp-live'}
      />

      <main className="main">
        <div className="vp">
          <p className="vp-note">{game.variant.note}</p>

          <div className="vp-machine">
            <PayTable game={game} />

            <div className="vp-screen">
              <div className="vp-cards">
                {cards.length === 0
                  ? [0, 1, 2, 3, 4].map((i) => <span key={i} className="card-ghost" />)
                  : cards.map((card, i) => {
                      const isHeld = held[i]
                      const suggest = hint?.[i] && game.phase === 'dealt'
                      return (
                        <div key={card.uid} className="vp-cardslot">
                          <button
                            className={`vp-card${isHeld ? ' vp-card-held' : ''}${suggest ? ' vp-card-hint' : ''}`}
                            disabled={game.phase !== 'dealt'}
                            onClick={() => game.toggleHold(i)}
                          >
                            <PlayingCard card={card} />
                          </button>
                          <span className={`vp-holdtag${isHeld ? ' vp-holdtag-on' : ''}`}>
                            {game.phase === 'dealt' ? (isHeld ? 'HELD' : 'hold') : ''}
                          </span>
                        </div>
                      )
                    })}
              </div>

              <div className="vp-result">
                {game.phase === 'complete' && game.last?.category && CAT_LABEL[game.last.category] ? (
                  <span className={`vp-win${won > 0 ? ' vp-win-paid' : ''}`}>
                    {CAT_LABEL[game.last.category]}
                    {won > 0 ? ` — win ${won}` : ''}
                  </span>
                ) : game.phase === 'dealt' ? (
                  <span className="vp-prompt">
                    {game.autoHold !== 'off' && game.hand?.held.some(Boolean)
                      ? 'Auto-held — tap cards to change, then Draw.'
                      : 'Tap cards to hold, then Draw.'}
                  </span>
                ) : (
                  <span className="vp-prompt">Bet 1–5 credits and deal.</span>
                )}
              </div>
            </div>
          </div>

          <div className="vp-controls">
            <div className="vp-coins">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`vp-coin${game.coins === n ? ' vp-coin-on' : ''}`}
                  disabled={game.phase === 'dealt'}
                  onClick={() => game.setCoins(n)}
                >
                  {n}
                </button>
              ))}
              <span className="vp-coin-label">coins</span>
            </div>

            {broke ? (
              <button className="btn btn-primary" onClick={rebuy}>
                Buy in for {START}
              </button>
            ) : game.phase === 'dealt' ? (
              <button className="btn btn-primary btn-big" onClick={() => game.draw()}>
                Draw
              </button>
            ) : (
              <button className="btn btn-primary btn-big" disabled={!game.canDeal()} onClick={() => game.deal()}>
                Deal
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
