import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { PokerGame } from '../../pokerroom/engine'
import { ranker } from '../../pokerroom/ranker'
import { VARIANTS, variantById } from '../../pokerroom/variants'
import { pokerBrain, pokerDraw } from '../../pokerroom/bot'
import type { Beat, BotProfile } from '../../pokerroom/types'
import { WinToast } from '../WinToast'
import { PokerTable } from './PokerTable'
import { BetControls } from './BetControls'

const BIG_BLIND = 20
const BUY_IN = 2000
const HUMAN = 0
const SEATS = 6

/** Five regulars with distinct tempers, so the table plays like a table and not
 *  one bot copied six times. The brain reads these; the screen only names them. */
const BOTS: Array<{ name: string; profile: BotProfile }> = [
  { name: 'Renata', profile: { looseness: 0.34, aggression: 0.55, bluff: 0.09, quips: [] } },
  { name: 'Duke', profile: { looseness: 0.52, aggression: 0.28, bluff: 0.04, quips: [] } },
  { name: 'Mina', profile: { looseness: 0.4, aggression: 0.45, bluff: 0.12, quips: [] } },
  { name: 'Cole', profile: { looseness: 0.62, aggression: 0.66, bluff: 0.18, quips: [] } },
  { name: 'Yara', profile: { looseness: 0.28, aggression: 0.38, bluff: 0.05, quips: [] } },
]

/** How long each beat is held on screen before the next `step()`. A fold clears
 *  fast; a showdown lingers so the reveal and the award can be read. */
const BEAT_MS: Partial<Record<Beat['type'], number>> = {
  handStart: 500,
  post: 260,
  deal: 560,
  action: 620,
  street: 340,
  showdown: 1400,
  award: 1300,
  handOver: 500,
}

function make(variantId: string): PokerGame {
  return new PokerGame({
    variant: variantById(variantId),
    ranker,
    brain: pokerBrain,
    botDraw: pokerDraw,
    seed: randomSeed(),
    bigBlind: BIG_BLIND,
    buyIn: BUY_IN,
    humanSeat: HUMAN,
    seats: SEATS,
    bots: BOTS,
  })
}

export function PokerScreen() {
  const [variantId, setVariantId] = useState(VARIANTS[0].id)
  const [game, setGame] = useState(() => make(VARIANTS[0].id))
  const [lastBeat, setLastBeat] = useState<Beat | null>(null)

  useSyncExternalStore(game.subscribe, game.getVersion)
  const pending = game.pending()

  // Winners of the hand in progress and the pot they collected, gathered from the
  // `award` beats as they stream by — the seats and cards to light at showdown.
  const [winners, setWinners] = useState<Set<number>>(new Set())
  const [awardNet, setAwardNet] = useState(0)
  // The human's stack when the hand began, so the toast can show their net.
  const handStartStack = useRef(game.human.stack)

  // Deal the first hand once the table is built.
  useEffect(() => {
    if (game.hand === 0 && !game.over) {
      handStartStack.current = game.human.stack
      game.startHand()
      setLastBeat({ type: 'handStart', hand: game.hand, button: game.button })
    }
  }, [game])

  // The clock: advance one beat at a time whenever the table isn't waiting on the
  // human. The engine flips `over` while the showdown and award beats are still
  // queued, so the clock keeps draining until the terminal `handOver` — that's
  // what surfaces the reveal, the pot award and the winners to light.
  useEffect(() => {
    if (pending || lastBeat?.type === 'handOver') return
    let wait = BEAT_MS[lastBeat?.type ?? 'deal'] ?? 300
    if (lastBeat?.type === 'action' && lastBeat.action.kind === 'fold') wait = 380
    const timer = setTimeout(() => setLastBeat(game.step()), wait)
    return () => clearTimeout(timer)
  }, [game, game.version, pending, lastBeat])

  // Track the award beats for the reveal, and clear them at the start of a hand.
  useEffect(() => {
    if (!lastBeat) return
    if (lastBeat.type === 'handStart') {
      setWinners(new Set())
      setAwardNet(0)
    } else if (lastBeat.type === 'award') {
      setWinners((prev) => new Set(prev).add(lastBeat.seat))
      if (lastBeat.seat === HUMAN) setAwardNet((n) => n + lastBeat.amount)
    }
  }, [lastBeat])

  const pickVariant = useCallback((id: string) => {
    setVariantId(id)
    const g = make(id)
    setGame(g)
    setLastBeat(null)
    setWinners(new Set())
    setAwardNet(0)
  }, [])

  const dealNext = useCallback(() => {
    handStartStack.current = game.human.stack
    game.startHand()
    setLastBeat({ type: 'handStart', hand: game.hand, button: game.button })
  }, [game])

  const rebuy = useCallback(() => {
    pickVariant(variantId)
  }, [pickVariant, variantId])

  const log = useMemo(() => game.log.slice(-8).reverse(), [game.log, game.version])

  // The engine flips `over` at the showdown beat, but the award reveal is still
  // streaming; the hand is only truly settled once the terminal beat lands. Hold
  // the end-of-hand controls until then so "Deal next hand" doesn't jump in over
  // the reveal.
  const settled = game.over && lastBeat?.type === 'handOver'
  const busted = settled && game.human.stack <= 0
  const net = game.human.stack - handStartStack.current

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <select
            className="sl-picker pk-picker"
            value={variantId}
            onChange={(e) => pickVariant(e.target.value)}
          >
            {VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="sl-blurb pk-blurb">{game.variant.blurb}</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Your stack</span>
            <b>{game.human.stack.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={settled ? net : 0} token={`pk-${game.hand}-${settled ? 'over' : 'live'}`} />

      <main className="main">
        <PokerTable game={game} winners={winners} awardNet={awardNet} />

        <div className="tray pk-tray">
          {settled ? (
            <div className="controls controls-idle pk-idle">
              {busted ? (
                <>
                  <div className="prompt">
                    <b>You're out of chips.</b> Buy back in for another go.
                  </div>
                  <div className="button-row button-row-actions">
                    <button className="btn btn-primary" onClick={rebuy}>
                      Buy in for {BUY_IN.toLocaleString()}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="prompt">
                    {net > 0 ? (
                      <>You took down <b>+{net.toLocaleString()}</b> that hand.</>
                    ) : net < 0 ? (
                      <>That one cost you <b>{net.toLocaleString()}</b>.</>
                    ) : (
                      <>Hand over.</>
                    )}
                  </div>
                  <div className="button-row button-row-actions">
                    <button className="btn btn-primary" onClick={dealNext}>
                      Deal next hand
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <BetControls game={game} pending={pending} />
          )}

          <ul className="log">
            {log.map((entry, i) => (
              <li key={`${game.version}-${i}`} className={i === 0 ? 'log-fresh' : undefined}>
                {entry}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  )
}
