import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { BaccaratGame, type Beat } from '../../baccarat/engine'
import { tableauGrid } from '../../baccarat/rules'
import type { BaccaratHand, BetName, RoundResult, Winner } from '../../baccarat/types'
import { randomSeed } from '../../engine/rng'
import { PlayingCard } from '../Card'
import { Chip, ChipStack } from '../Chips'
import { WinToast } from '../WinToast'

const START = 1000

/** How long each beat sits on screen. Baccarat has no decisions, so the pacing
 *  *is* the game: a third card that arrives instantly isn't worth watching. */
const BEAT_MS: Partial<Record<Beat['type'], number>> = {
  card: 480,
  natural: 1100,
  stand: 800,
  settle: 2300,
  roundOver: 120,
}

const SPOTS: Array<{ name: BetName; title: string; pays: string }> = [
  { name: 'playerPair', title: 'P Pair', pays: '11:1' },
  { name: 'player', title: 'Player', pays: '1:1' },
  { name: 'tie', title: 'Tie', pays: '8:1' },
  { name: 'banker', title: 'Banker', pays: '1:1 less 5%' },
  { name: 'bankerPair', title: 'B Pair', pays: '11:1' },
]

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

const BEAD: Record<Winner, string> = { player: 'P', banker: 'B', tie: 'T' }

function Hand({ label, hand, side, won }: {
  label: string
  hand: BaccaratHand
  side: 'player' | 'banker'
  won: boolean
}) {
  const ghosts = Math.max(0, 2 - hand.cards.length)
  return (
    <div className={`bac-hand bac-hand-${side}${won ? ' bac-hand-won' : ''}`}>
      <div className="bac-hand-head">
        <span className="bac-hand-name">{label}</span>
        <span className="bac-total">{hand.cards.length > 0 ? hand.total : '–'}</span>
      </div>
      <div className="bac-cards">
        {hand.cards.map((card, i) => (
          // The third card is laid across the first two, as a dealer places it.
          <span key={card.uid} className={i === 2 ? 'bac-card bac-card-third' : 'bac-card'}>
            <PlayingCard card={card} tilt={i === 2 ? -90 : 0} />
          </span>
        ))}
        {Array.from({ length: ghosts }, (_, i) => (
          <span key={`ghost-${i}`} className="card-ghost" />
        ))}
      </div>
    </div>
  )
}

/** The bead plate: one marker per coup, oldest first. Every baccarat player in
 *  the world watches this, and none of it means anything. */
function Road({ results }: { results: RoundResult[] }) {
  const tally = { player: 0, banker: 0, tie: 0 }
  for (const r of results) tally[r.winner]++
  return (
    <div className="bac-road">
      <div className="bac-road-head">
        <span className="bac-road-title">Bead plate</span>
        <span className="bac-tally">
          <b className="bac-ink-player">P {tally.player}</b>
          <b className="bac-ink-banker">B {tally.banker}</b>
          <b className="bac-ink-tie">T {tally.tie}</b>
        </span>
      </div>
      <div className="bac-beads">
        {results.length === 0 && <span className="bac-road-empty">No coups yet.</span>}
        {results.map((r) => (
          <span
            key={r.round}
            className={`bac-bead bac-bead-${r.winner}`}
            title={`#${r.round}: Player ${r.playerTotal}, Banker ${r.bankerTotal}`}
          >
            {BEAD[r.winner]}
            {r.playerPair && <i className="bac-dot bac-dot-player" />}
            {r.bankerPair && <i className="bac-dot bac-dot-banker" />}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The drawing tableau, printed the way the table card prints it. Nobody at the
 *  table gets a say in any of it, which is the point. */
function Tableau() {
  const grid = useMemo(() => tableauGrid(), [])
  return (
    <div className="bac-tableau">
      <div className="bac-tableau-title">Banker draws — third-card table</div>
      <table className="bac-grid">
        <thead>
          <tr>
            <th className="bac-grid-corner">B ↓ / P →</th>
            {Array.from({ length: 10 }, (_, t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, b) => (
            <tr key={b}>
              <th>{b}</th>
              {row.map((draws, t) => (
                <td key={t} className={draws ? 'bac-cell-draw' : 'bac-cell-stand'}>
                  {draws ? 'D' : 'S'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bac-tableau-note">
        Player draws on 0–5 and stands on 6–7. If the player stands, the banker draws on 0–5.
        A two-card 8 or 9 either side is a natural and both hands stand.
      </p>
    </div>
  )
}

/** What the table is doing right now, in one line. */
function caption(game: BaccaratGame, beat: Beat | null): string {
  if (game.phase === 'betting') {
    const r = game.lastResult
    if (!r) return 'Place your bets.'
    const who =
      r.winner === 'tie' ? 'Tie' : r.winner === 'player' ? 'Player wins' : 'Banker wins'
    return `Player ${r.playerTotal}, Banker ${r.bankerTotal} — ${who}. Place your bets.`
  }
  if (!beat || game.phase === 'deal') return 'Cards…'
  switch (beat.type) {
    case 'natural':
      return `Natural ${beat.total} — ${beat.side === 'player' ? 'Player' : 'Banker'}. Both stand.`
    case 'stand':
      return `${beat.side === 'player' ? 'Player' : 'Banker'} stands on ${beat.total}.`
    case 'card':
      if (beat.third) return `${beat.side === 'player' ? 'Player' : 'Banker'} draws.`
      return 'Cards…'
    case 'settle': {
      const r = game.lastResult
      if (!r) return ''
      const who =
        r.winner === 'tie' ? 'Tie' : r.winner === 'player' ? 'Player wins' : 'Banker wins'
      return `Player ${r.playerTotal}, Banker ${r.bankerTotal} — ${who}.`
    }
    default:
      return ''
  }
}

export function BaccaratScreen() {
  const [game, setGame] = useState(() => new BaccaratGame({ seed: randomSeed(), bankroll: START }))
  const [lastBeat, setLastBeat] = useState<Beat | null>(null)
  const [showTableau, setShowTableau] = useState(false)

  useSyncExternalStore(game.subscribe, game.getVersion)
  const pending = game.pending()

  // The clock. Nothing here decides anything — it only lets the coup be seen.
  useEffect(() => {
    if (pending) return
    const wait = BEAT_MS[lastBeat?.type ?? 'card'] ?? 400
    const timer = window.setTimeout(() => setLastBeat(game.step()), wait)
    return () => window.clearTimeout(timer)
  }, [game, game.version, pending, lastBeat])

  const rebuy = useCallback(() => {
    setGame(new BaccaratGame({ seed: randomSeed(), bankroll: START }))
    setLastBeat(null)
  }, [])

  const deal = useCallback(() => {
    if (game.deal()) setLastBeat(null)
  }, [game])

  const betting = game.phase === 'betting'
  const settling = game.phase === 'settled'
  const result = game.lastResult
  const broke = betting && game.bankroll < game.rules.minBet && game.staked === 0
  const road = useMemo(() => game.results.slice(-48), [game.results, game.version])
  const log = useMemo(() => game.log.slice(-7).reverse(), [game.log, game.version])

  // Only decorate the spots while the coup is being paid — after that the felt
  // is cleared and the chips belong to the next round.
  const spotState = (name: BetName): string => {
    if (!settling || !result) return ''
    if (result.wagers[name] === 0) return ''
    if (result.returned[name] > result.wagers[name]) return ' bac-spot-won'
    if (result.returned[name] === result.wagers[name]) return ' bac-spot-push'
    return ' bac-spot-lost'
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Baccarat</span>
          <span className="bac-shoe" title={`${game.rules.decks}-deck shoe`}>
            <span className="bac-shoe-fill" style={{ width: `${game.shoeRemaining * 100}%` }} />
            <span className="bac-shoe-text">
              {game.freshShoe ? 'New shoe' : `Shoe ${Math.round(game.shoeRemaining * 100)}%`}
            </span>
          </span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{money(game.bankroll)}</b>
          </span>
        </div>
      </header>

      <WinToast
        net={settling && result ? result.net : 0}
        token={result ? `bac-${result.round}` : 'bac-live'}
      />

      <main className="main">
        <div className="bac">
          <div className="bac-table felt">
            <div className="bac-hands">
              <Hand
                label="Player"
                side="player"
                hand={game.player}
                won={settling && result?.winner === 'player'}
              />
              <div className="bac-versus">
                {settling && result ? (
                  <span className={`bac-net${result.net >= 0 ? ' bac-up' : ' bac-down'}`}>
                    {result.net >= 0 ? `+${money(result.net)}` : money(result.net)}
                  </span>
                ) : (
                  <span className="bac-versus-mark">vs</span>
                )}
              </div>
              <Hand
                label="Banker"
                side="banker"
                hand={game.banker}
                won={settling && result?.winner === 'banker'}
              />
            </div>

            <div className={`bac-callout${settling ? ' bac-callout-loud' : ''}`}>
              {caption(game, lastBeat)}
            </div>

            <div className="bac-layout">
              {SPOTS.map((spot) => (
                <button
                  key={spot.name}
                  type="button"
                  className={`bac-spot bac-spot-${spot.name}${spotState(spot.name)}`}
                  disabled={!betting}
                  onClick={() => game.place(spot.name)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    game.removeBet(spot.name)
                  }}
                  title={`${spot.title} pays ${spot.pays} — right-click to take it back`}
                >
                  <span className="bac-spot-name">{spot.title}</span>
                  <span className="bac-spot-pays">{spot.pays}</span>
                  <span className="bac-spot-chips">
                    <ChipStack amount={game.wagers[spot.name]} denominations={game.rules.chips} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="bac-side">
            <Road results={road} />
            <button
              className={`btn btn-ghost${showTableau ? ' btn-on' : ''}`}
              onClick={() => setShowTableau((v) => !v)}
            >
              {showTableau ? 'Hide the tableau' : 'Show the tableau'}
            </button>
            {showTableau && <Tableau />}
          </div>

          <div className="tray">
            <div className="controls">
              {broke ? (
                <>
                  <div className="prompt">
                    <b>Out of chips.</b> The commission got there first.
                  </div>
                  <div className="button-row">
                    <button className="btn btn-primary" onClick={rebuy}>
                      Buy in for {START}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bac-bet-row">
                    <span className="bac-chips">
                      {game.rules.chips.map((v) => (
                        <span
                          key={v}
                          className={`bac-chip${game.chip === v ? ' bac-chip-on' : ''}`}
                        >
                          <Chip
                            value={v}
                            size={36}
                            onClick={() => game.setChip(v)}
                            disabled={!betting}
                            label={`Bet with ${v} chips`}
                          />
                        </span>
                      ))}
                    </span>
                    <span className="bac-staked">
                      <span className="bankroll-label">On the layout</span>
                      <b>{game.staked.toLocaleString()}</b>
                    </span>
                  </div>

                  <div className="button-row">
                    <button
                      className="btn btn-ghost"
                      disabled={!betting || game.staked === 0}
                      onClick={() => game.clearBets()}
                    >
                      Clear
                    </button>
                    <button className="btn btn-ghost" disabled={!betting} onClick={() => game.rebet()}>
                      Same bets
                    </button>
                    <button
                      className="btn btn-primary btn-big"
                      disabled={!game.canDeal()}
                      onClick={deal}
                    >
                      {betting ? 'Deal' : 'Dealing…'}
                    </button>
                  </div>
                  <div className="prompt bac-hintline">
                    Click a spot to add a chip, right-click to take the bet back. Once the cards
                    come out, the tableau plays both hands — there is nothing left to decide.
                  </div>
                </>
              )}
            </div>

            <ul className="log">
              {log.map((entry, i) => (
                <li key={`${game.version}-${i}`} className={i === 0 ? 'log-fresh' : undefined}>
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </>
  )
}
