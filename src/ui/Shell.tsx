import { useState } from 'react'

import { BlackjackScreen } from './App'
import { BaccaratScreen } from './baccarat/BaccaratScreen'
import { BigSixScreen } from './bigsix/BigSixScreen'
import { CaribbeanScreen } from './caribbean/CaribbeanScreen'
import { CrapsScreen } from './craps/CrapsScreen'
import { KenoScreen } from './keno/KenoScreen'
import { LetItRideScreen } from './letitride/LetItRideScreen'
import { MStudScreen } from './mstud/MStudScreen'
import { PaiGowScreen } from './paigow/PaiGowScreen'
import { RouletteScreen } from './roulette/RouletteScreen'
import { SicBoScreen } from './sicbo/SicBoScreen'
import { SlotsScreen } from './slots/SlotsScreen'
import { ThreeCardScreen } from './threecard/ThreeCardScreen'
import { UthScreen } from './uth/UthScreen'
import { SolitaireScreen } from './solitaire/SolitaireScreen'
import { VideoPokerScreen } from './videopoker/VideoPokerScreen'
import { WarScreen } from './war/WarScreen'

type GameId =
  | 'blackjack'
  | 'baccarat'
  | 'paigow'
  | 'uth'
  | 'threecard'
  | 'caribbean'
  | 'mstud'
  | 'letitride'
  | 'war'
  | 'craps'
  | 'roulette'
  | 'sicbo'
  | 'bigsix'
  | 'videopoker'
  | 'slots'
  | 'keno'
  | 'solitaire'

interface Entry {
  id: GameId
  label: string
  blurb: string
}

/** The floor plan. Grouped the way a casino actually lays itself out, because
 *  fifteen tabs in one row is a list, not a lobby. */
const FLOOR: Array<{ group: string; games: Entry[] }> = [
  {
    group: 'Card tables',
    games: [
      { id: 'blackjack', label: 'Blackjack', blurb: 'Multi-deck shoe, every variant' },
      { id: 'baccarat', label: 'Baccarat', blurb: 'Punto banco, the fixed tableau' },
      { id: 'paigow', label: 'Pai Gow Poker', blurb: 'Two hands, dealer banks' },
      { id: 'uth', label: "Ultimate Hold'em", blurb: 'Ante, blind, trips' },
      { id: 'threecard', label: 'Three Card Poker', blurb: 'Ante/play and pair plus' },
      { id: 'caribbean', label: 'Caribbean Stud', blurb: 'Five cards, one dealer up' },
      { id: 'mstud', label: 'Mississippi Stud', blurb: 'Three streets, 1x–3x raises' },
      { id: 'letitride', label: 'Let It Ride', blurb: 'Three bets, pull two back' },
      { id: 'war', label: 'Casino War', blurb: 'High card, or go to war' },
    ],
  },
  {
    group: 'Dice & wheels',
    games: [
      { id: 'craps', label: 'Craps', blurb: 'Pass, come, odds, place, field' },
      { id: 'roulette', label: 'Roulette', blurb: 'American, European, French' },
      { id: 'sicbo', label: 'Sic Bo', blurb: 'Three dice, the whole layout' },
      { id: 'bigsix', label: 'Big Six', blurb: 'The money wheel, honestly priced' },
    ],
  },
  {
    group: 'Machines',
    games: [
      { id: 'videopoker', label: 'Video Poker', blurb: 'Five variants, up to ten hands' },
      { id: 'slots', label: 'Slots', blurb: 'Four cabinets, four mechanics' },
      { id: 'keno', label: 'Keno', blurb: 'Pick ten of eighty, exact odds' },
    ],
  },
  {
    group: 'Patience',
    games: [{ id: 'solitaire', label: 'Solitaire', blurb: 'Klondike, FreeCell, Spider — 35 games' }],
  },
]

const SCREENS: Record<GameId, () => React.JSX.Element> = {
  blackjack: BlackjackScreen,
  baccarat: BaccaratScreen,
  paigow: PaiGowScreen,
  uth: UthScreen,
  threecard: ThreeCardScreen,
  caribbean: CaribbeanScreen,
  mstud: MStudScreen,
  letitride: LetItRideScreen,
  war: WarScreen,
  craps: CrapsScreen,
  roulette: RouletteScreen,
  sicbo: SicBoScreen,
  bigsix: BigSixScreen,
  videopoker: VideoPokerScreen,
  slots: SlotsScreen,
  keno: KenoScreen,
  solitaire: SolitaireScreen,
}

export function App() {
  const [game, setGame] = useState<GameId>('blackjack')
  const Screen = SCREENS[game]

  return (
    <div className="app">
      <nav className="gamenav">
        <span className="gamenav-brand">The Tables</span>
        <div className="gamenav-groups">
          {FLOOR.map(({ group, games }) => (
            <div key={group} className="gamenav-group">
              <span className="gamenav-grouplabel">{group}</span>
              <div className="gamenav-tabs">
                {games.map((g) => (
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
            </div>
          ))}
        </div>
      </nav>

      <Screen />
    </div>
  )
}
