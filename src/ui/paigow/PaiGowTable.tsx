import { CATEGORY_NAME } from '../../poker/eval'
import type { PaiGowGame } from '../../paigow/engine'
import type { PaiGowSeat, Setting } from '../../paigow/types'
import { PlayingCard } from '../Card'
import { ChipStack } from '../Chips'

function SplitView({ setting, hidden }: { setting: Setting | null; hidden?: boolean }) {
  if (!setting) return null
  if (hidden) {
    return (
      <div className="pg-split">
        <div className="pg-row">
          {[0, 1, 2, 3, 4].map((i) => (
            <PlayingCard key={i} down />
          ))}
        </div>
        <div className="pg-row">
          {[0, 1].map((i) => (
            <PlayingCard key={i} down />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="pg-split">
      <div className="pg-hand-line">
        <span className="pg-hand-tag">High</span>
        <div className="pg-row">
          {setting.high.map((c) => (
            <PlayingCard key={c.uid} card={c} />
          ))}
        </div>
        <span className="pg-hand-rank">{CATEGORY_NAME[setting.highScore.category]}</span>
      </div>
      <div className="pg-hand-line">
        <span className="pg-hand-tag">Low</span>
        <div className="pg-row">
          {setting.low.map((c) => (
            <PlayingCard key={c.uid} card={c} />
          ))}
        </div>
        <span className="pg-hand-rank">{CATEGORY_NAME[setting.lowScore.category]}</span>
      </div>
    </div>
  )
}

function SeatView({
  seat,
  game,
  isHuman,
}: {
  seat: PaiGowSeat
  game: PaiGowGame
  isHuman: boolean
}) {
  if (seat.name === '') {
    return (
      <div className="pg-seat pg-seat-empty">
        <div className="uth-seat-label">Open</div>
      </div>
    )
  }
  const h = seat.hand
  const settled = game.phase === 'settled'

  return (
    <div className={`pg-seat${isHuman ? ' pg-seat-human' : ''}`}>
      <div className="uth-seat-label">
        {seat.name}
        {isHuman && <span className="seat-you"> (you)</span>}
      </div>

      {h?.setting ? (
        <SplitView setting={h.setting} hidden={!isHuman && !settled} />
      ) : (
        <div className="pg-facedown">{h ? 'Setting…' : ''}</div>
      )}

      {h && h.bet > 0 && (
        <div className="pg-seat-foot">
          <ChipStack amount={h.bet} denominations={game.rules.chips} />
          {h.fortune > 0 && <span className="pg-fortune">Fortune {h.fortune}</span>}
        </div>
      )}

      {settled && h?.outcome && (
        <div className={`uth-result uth-result-${h.outcome === 'win' ? 'win' : h.outcome === 'push' ? 'push' : 'lose'}`}>
          {h.outcome.toUpperCase()}
          {h.commissionPaid ? <span className="uth-net">−{h.commissionPaid.toFixed(0)} comm</span> : null}
        </div>
      )}

      <div className="uth-bank">{seat.bankroll.toLocaleString()}</div>
    </div>
  )
}

export function PaiGowTable({ game }: { game: PaiGowGame }) {
  return (
    <div className="pg-table">
      <div className="felt pg-felt">
        <div className="pg-dealer">
          <div className="uth-seat-label">Dealer (banker)</div>
          {game.dealer.setting ? (
            <SplitView setting={game.dealer.setting} hidden={!game.dealer.revealed} />
          ) : (
            <div className="pg-facedown">{game.dealer.cards.length ? 'Setting…' : ''}</div>
          )}
        </div>

        <div className="pg-seats">
          {game.seats.map((seat, i) => (
            <SeatView key={i} seat={seat} game={game} isHuman={i === game.humanSeat} />
          ))}
        </div>
      </div>
    </div>
  )
}
