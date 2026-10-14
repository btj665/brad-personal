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

import { ensureFunds, getBalance, recordDelta, refill as walletRefill } from './wallet'

export interface SharedGame<T> {
  game: T
  /** Rebuild the engine, topping the wallet back up to the base stake first if it's
   *  short. This is the "add chips" / rebuy path: it's only ever used from a broke
   *  table, and it works even with a few chips left — under the minimum bet but not
   *  yet zero — which is exactly the state nothing else replenished. */
  newGame: () => void
  /** Rebuild with a new factory, funded from the current balance, WITHOUT topping
   *  up — for a new shoe or a variant switch, where you keep whatever you have. */
  replace: (make: (bankroll: number) => T) => void
  /** Like `newGame` (tops up if short) but with a custom factory, for a rebuy that
   *  must preserve the game's settings (variant, stake, coins per line). */
  refill: (make: (bankroll: number) => T) => void
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

  // The rebuy path: top the wallet up to the base stake if it's short, then rebuild
  // the engine funded from the new balance. Topping up below the full stake (not
  // only at zero) is the fix for being stranded under the table minimum.
  const refill = (make2: (bankroll: number) => T = makeRef.current) => {
    void walletRefill().then((bal) => {
      const g = make2(bal)
      last.current = readRef.current(g)
      setGame(g)
    })
  }

  const newGame = () => refill()
  const replace = (make2: (bankroll: number) => T) => {
    const g = make2(getBalance())
    last.current = readRef.current(g)
    setGame(g)
  }

  return { game, newGame, replace, refill }
}
