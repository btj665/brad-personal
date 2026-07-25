import { useState } from 'react'

import { BlackjackScreen } from './App'
import { CrapsScreen } from './craps/CrapsScreen'
import { PaiGowScreen } from './paigow/PaiGowScreen'
import { RouletteScreen } from './roulette/RouletteScreen'
import { UthScreen } from './uth/UthScreen'
import { VideoPokerScreen } from './videopoker/VideoPokerScreen'

type GameId = 'blackjack' | 'uth' | 'paigow' | 'videopoker' | 'roulette' | 'craps'

const GAMES: Array<{ id: GameId; label: string; blurb: string }> = [
  { id: 'blackjack', label: 'Blackjack', blurb: 'Multi-deck shoe, every variant' },
  { id: 'uth', label: "Ultimate Hold'em", blurb: 'Ante, blind, trips' },
  { id: 'paigow', label: 'Pai Gow Poker', blurb: 'Two hands, dealer banks' },
  { id: 'videopoker', label: 'Video Poker', blurb: 'Five variants, optimal-play coach' },
  { id: 'roulette', label: 'Roulette', blurb: 'American, European, French' },
  { id: 'craps', label: 'Craps', blurb: 'Pass, come, odds, place, field' },
]

export function App() {
  const [game, setGame] = useState<GameId>('blackjack')

  return (
    <div className="app">
      <nav className="gamenav">
        <span className="gamenav-brand">The Tables</span>
        <div className="gamenav-tabs">
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`gamenav-tab${game === g.id ? ' gamenav-tab-on' : ''}`}
              onClick={() => setGame(g.id)}
            >
              <span className="gamenav-name">{g.label}</span>
              <span className="gamenav-blurb">{g.blurb}</span>
            </button>
          ))}
        </div>
      </nav>

      {game === 'blackjack' && <BlackjackScreen />}
      {game === 'uth' && <UthScreen />}
      {game === 'paigow' && <PaiGowScreen />}
      {game === 'videopoker' && <VideoPokerScreen />}
      {game === 'roulette' && <RouletteScreen />}
      {game === 'craps' && <CrapsScreen />}
    </div>
  )
}
