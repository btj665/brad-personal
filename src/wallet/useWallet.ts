import { useSyncExternalStore } from 'react'

import { getBalance, subscribe } from './wallet'

/** The live shared balance. Re-renders whatever reads it whenever a round settles,
 *  a top-up lands, or the cloud balance reconciles. */
export function useWallet(): number {
  return useSyncExternalStore(subscribe, getBalance, getBalance)
}
