// The bridge between a game's engine and the shared wallet.
//
// Every table game holds a working `bankroll` on its engine that it debits when a
// bet is placed and credits when it's paid. This hook makes that bankroll a view
// of the one shared balance instead of a private number:
//
//   * it funds a new engine from the current balance, so you sit down with exactly
//     what you left the last table holding;
//   * it watches the engine's bankroll and mirrors every change into the wallet,
//     so the balance is always current and the flush has real wagered/won totals;
//   * when the engine goes broke it tops the wallet up and rebuilds the engine with
//     the money, which is the "replenish when out" rule — a fresh hand, funded.
//
// Screens that used `useState(() => new Game({ bankroll: START }))` call this
// instead. `replace` recreates the engine (funded) for a new shoe or a variant
// change; `newGame` is the common no-argument case.

import { useEffect, useRef, useState } from 'react'

import { ensureFunds, getBalance, recordDelta } from './wallet'

export interface SharedGame<T> {
  game: T
  /** Rebuild the engine funded from the current balance (e.g. a new shoe). */
  newGame: () => void
  /** Rebuild with a new factory, funded from the current balance (e.g. a variant
   *  switch), when the constructor arguments change. */
  replace: (make: (bankroll: number) => T) => void
}

/** Where the engine keeps its working balance. Most games put it on `.bankroll`;
 *  blackjack keeps it on `.human.bankroll`, so a screen can pass its own reader. */
function defaultRead<T>(game: T): number {
  return (game as { bankroll: number }).bankroll
}

export function useSharedBankroll<T>(
  gameId: string,
  make: (bankroll: number) => T,
  read: (game: T) => number = defaultRead,
): SharedGame<T> {
  const [game, setGame] = useState<T>(() => make(getBalance()))
  const readRef = useRef(read)
  readRef.current = read
  const last = useRef<number>(read(game))
  const makeRef = useRef(make)
  makeRef.current = make
  const idRef = useRef(gameId)
  idRef.current = gameId
  const topping = useRef(false)

  const bankroll = read(game)

  useEffect(() => {
    // Mirror whatever the engine just did with the money into the wallet.
    const delta = bankroll - last.current
    if (delta !== 0) {
      last.current = bankroll
      recordDelta(idRef.current, delta)
    }
    // Out of money: replenish and deal a fresh, funded engine. Guarded so the
    // async top-up can't fire twice for the same broke state.
    if (bankroll <= 0 && !topping.current) {
      topping.current = true
      void ensureFunds().then((bal) => {
        topping.current = false
        if (bal > 0) {
          const g = makeRef.current(bal)
          last.current = readRef.current(g)
          setGame(g)
        }
      })
    }
  }, [game, bankroll])

  const newGame = () => {
    const g = makeRef.current(getBalance())
    last.current = readRef.current(g)
    setGame(g)
  }
  const replace = (make2: (bankroll: number) => T) => {
    const g = make2(getBalance())
    last.current = readRef.current(g)
    setGame(g)
  }

  return { game, newGame, replace }
}
