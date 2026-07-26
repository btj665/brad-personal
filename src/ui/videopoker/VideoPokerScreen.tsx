import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import type { Card } from '../../engine/types'
import { HAND_COUNTS, VideoPokerGame, type AutoHoldMode } from '../../videopoker/engine'
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

/** What the machines call themselves. */
const HANDS_LABEL: Record<number, string> = {
  1: 'Single Line',
  3: 'Triple Play',
  5: 'Five Play',
  10: 'Ten Play',
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

function PayTable({ game, hit }: { game: VideoPokerGame; hit: PayCategory | null }) {
  const rows = game.variant.family === 'deuces' ? DEUCES_ROWS : STANDARD_ROWS
  const bet = game.coins

  return (
    <table className="vp-paytable">
      <tbody>
        {rows.map(([cat, label]) => {
          const per = payFor(game.variant, cat)
          if (per === 0) return null
          return (
            <tr key={cat} className={hit === cat ? 'vp-pay-hit' : undefined}>
              <td className="vp-pay-name">{label}</td>
              <td className="vp-pay-amt">{per * bet}</td>
            </tr>
          )
        })}
        {game.hands > 1 && (
          <tr className="vpm-pay-foot">
            <td colSpan={2}>
              Every figure is what ONE hand pays. {game.hands} hands are in play, so the bet is{' '}
              {game.hands} × {game.coins} = {game.totalBet()}.
            </td>
          </tr>
        )}
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

interface RowSpec {
  key: string
  label: string
  cards: Card[]
  /** Cards not drawn yet, shown face down the way a real machine does. */
  pending?: boolean[]
  category: PayCategory | null
  won: number
}

/** One of the hands stacked above the dealt row. Not interactive: the holds were
 *  chosen once, on the row below. */
function HandRow({ row }: { row: RowSpec }) {
  const paid = row.won > 0
  const cat = row.category ? CAT_LABEL[row.category] : ''

  return (
    <div className={`vpm-row${paid ? ' vpm-row-paid' : ''}`}>
      <span className="vpm-row-label">{row.label}</span>
      <div className="vpm-row-cards">
        {row.cards.length === 0
          ? [0, 1, 2, 3, 4].map((i) => <span key={i} className="vpm-ghost" />)
          : row.cards.map((card, i) => (
              <PlayingCard key={`${i}-${card.uid}`} card={card} down={row.pending?.[i]} />
            ))}
      </div>
      <span className="vpm-row-pay">
        {cat ? <span className="vpm-row-cat">{cat}</span> : null}
        {paid ? <b className="vpm-row-won">+{row.won}</b> : null}
      </span>
    </div>
  )
}

export function VideoPokerScreen() {
  const [game, setGame] = useState(() => new VideoPokerGame({ seed: randomSeed(), bankroll: START }))
  const [coach, setCoach] = useState(false)
  useSyncExternalStore(game.subscribe, game.getVersion)

  // The optimal hold is expensive, so compute it only when the coach is on and
  // only once per dealt hand. It is a property of the dealt five, so Ten Play
  // costs exactly what one line costs — never solve per drawn hand.
  const hint = useMemo(() => {
    if (!coach || game.phase !== 'dealt' || !game.hand) return null
    return game.hint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach, game.phase, game.round])

  const dealt = game.hand
  // Last round's rows are only worth showing while they still match the machine
  // the player is sitting at; changing the hand count clears the screen the way
  // a real one does.
  const done =
    game.phase === 'complete' && game.last && game.last.hands === game.hands ? game.last : null
  const liveHands = dealt?.hands ?? game.hands

  const display = dealt ?? done
  const cards = display?.final ?? display?.cards ?? []
  const held = dealt?.held ?? display?.cards.map(() => true) ?? []

  // Hands 2..N, stacked so the numbering climbs away from the dealt row.
  const upper: RowSpec[] = []
  for (let i = liveHands - 1; i >= 1; i--) {
    const label = `Hand ${i + 1}`
    const drawn = done?.draws[i]
    if (dealt) {
      upper.push({
        key: `p${i}`,
        label,
        cards: dealt.cards,
        pending: dealt.held.map((h) => !h),
        category: null,
        won: 0,
      })
    } else if (drawn) {
      upper.push({ key: `d${i}`, label, cards: drawn.cards, category: drawn.category, won: drawn.won })
    } else {
      upper.push({ key: `g${i}`, label, cards: [], category: null, won: 0 })
    }
  }

  const changeVariant = useCallback((id: string) => game.setVariant(id), [game])
  const rebuy = useCallback(() => {
    setGame(
      new VideoPokerGame({
        seed: randomSeed(),
        variantId: game.variant.id,
        bankroll: START,
        autoHold: game.autoHold,
        hands: game.hands,
      }),
    )
  }, [game])

  const broke = game.bankroll < game.totalBet() && game.phase !== 'dealt'
  const won = done?.won ?? 0
  const paidHands = done ? done.draws.filter((d) => d.won > 0).length : 0

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
          <span className="vpm-machine-name">{HANDS_LABEL[game.hands]}</span>
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
        net={game.phase === 'complete' ? game.last?.won ?? 0 : 0}
        token={game.phase === 'complete' ? `vp-${game.round}` : 'vp-live'}
      />

      <main className="main">
        <div className="vp">
          <p className="vp-note">{game.variant.note}</p>

          <div className="vp-machine">
            <PayTable game={game} hit={done?.category ?? null} />

            <div className="vp-screen">
              {liveHands > 1 && (
                <div className={`vpm-rows vpm-rows-${liveHands}`}>
                  {upper.map((row) => (
                    <HandRow key={row.key} row={row} />
                  ))}
                </div>
              )}

              {liveHands > 1 && (
                <span className="vpm-deal-label">
                  Hand 1 — the deal. Hold here; every hand above draws from these holds.
                </span>
              )}

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
                {done && liveHands > 1 ? (
                  <span className={`vp-win${won > 0 ? ' vp-win-paid' : ''}`}>
                    {paidHands === 0
                      ? `No hand paid — down ${done.bet}`
                      : `${paidHands} of ${liveHands} hands paid — win ${won}`}
                  </span>
                ) : done && done.category && CAT_LABEL[done.category] ? (
                  <span className={`vp-win${won > 0 ? ' vp-win-paid' : ''}`}>
                    {CAT_LABEL[done.category]}
                    {won > 0 ? ` — win ${won}` : ''}
                  </span>
                ) : game.phase === 'dealt' ? (
                  <span className="vp-prompt">
                    {game.autoHold !== 'off' && dealt?.held.some(Boolean)
                      ? 'Auto-held — tap cards to change, then Draw.'
                      : 'Tap cards to hold, then Draw.'}
                  </span>
                ) : (
                  <span className="vp-prompt">Pick a machine, bet, and deal.</span>
                )}
              </div>
            </div>
          </div>

          <div className="vp-controls vpm-controls">
            <div className="vpm-hands">
              {HAND_COUNTS.map((n) => (
                <button
                  key={n}
                  className={`vpm-hand${game.hands === n ? ' vpm-hand-on' : ''}`}
                  disabled={game.phase === 'dealt'}
                  onClick={() => game.setHands(n)}
                  title={HANDS_LABEL[n]}
                >
                  {n}
                </button>
              ))}
              <span className="vp-coin-label">hands</span>
            </div>

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
              <span className="vp-coin-label">coins each</span>
            </div>

            <div className={`vpm-bet${game.hands > 1 ? ' vpm-bet-multi' : ''}`}>
              <span className="vpm-bet-label">Total bet</span>
              <b className="vpm-bet-amt">{game.totalBet()}</b>
              <span className="vpm-bet-calc">
                {game.hands} × {game.coins}
              </span>
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
              <button
                className="btn btn-primary btn-big"
                disabled={!game.canDeal()}
                onClick={() => game.deal()}
              >
                Deal <span className="vpm-btn-bet">{game.totalBet()}</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
