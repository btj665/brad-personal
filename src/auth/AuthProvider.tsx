// Who's signed in, and how far through the door they are.
//
// The gate has three closed states and one open one:
//   loading    — still asking Supabase whether there's a session.
//   signedOut  — no session; show login / signup.
//   needsMfa   — signed in with a password, but a second factor is still owed:
//                either enrol an authenticator (first time) or enter a code.
//   ready      — session present and the assurance level is satisfied. Play.
//
// In guest mode (no backend) the status is always `ready` and there is no gate at
// all, so the offline build just plays.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { backendConfigured, supabase } from '../supa/client'
import { connect as connectWallet, disconnect as disconnectWallet, flush } from '../wallet/wallet'

export type AuthStatus = 'loading' | 'signedOut' | 'needsMfa' | 'ready'

export interface Profile {
  username: string
  isAdmin: boolean
}

interface AuthState {
  status: AuthStatus
  /** True when there's a verified authenticator already — so needsMfa means
   *  "enter a code", not "enrol one". */
  hasFactor: boolean
  email: string | null
  profile: Profile | null
  /** Re-read session, assurance level and profile. Call after any auth step. */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(backendConfigured ? 'loading' : 'ready')
  const [hasFactor, setHasFactor] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase) {
      setStatus('ready')
      return
    }
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session) {
      setEmail(null)
      setProfile(null)
      setHasFactor(false)
      setStatus('signedOut')
      await disconnectWallet()
      return
    }
    setEmail(session.user.email ?? null)

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verified = (factors?.totp ?? []).some((f) => f.status === 'verified')
    setHasFactor(verified)

    // nextLevel is aal2 exactly when a verified factor exists; until the challenge
    // is done currentLevel lags at aal1. Equal levels means nothing is owed.
    const satisfied = aal?.currentLevel === aal?.nextLevel
    if (!satisfied) {
      setStatus('needsMfa')
      return
    }

    // Through the door: load the profile and fund the wallet from the server.
    const { data: prof } = await supabase
      .from('profiles')
      .select('username, is_admin')
      .eq('id', session.user.id)
      .single()
    setProfile(prof ? { username: prof.username, isAdmin: Boolean(prof.is_admin) } : null)
    await connectWallet(session.user.id)
    setStatus('ready')
  }, [])

  useEffect(() => {
    if (!supabase) return
    void refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh()
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  // Best-effort save of anything owed when the tab goes away.
  useEffect(() => {
    const save = () => {
      void flush()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save()
    })
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await flush()
    await supabase.auth.signOut()
    await refresh()
  }, [refresh])

  const value = useMemo<AuthState>(
    () => ({ status, hasFactor, email, profile, refresh, signOut }),
    [status, hasFactor, email, profile, refresh, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
