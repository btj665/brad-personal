// The gate: sign up, log in, and the authenticator step.
//
// Which panel shows is driven by the auth status, not by local navigation, so a
// refresh mid-flow lands you back on the right step: signedOut shows login/signup,
// needsMfa shows the authenticator (enrol it the first time, enter a code after).

import { useEffect, useRef, useState } from 'react'

import { requireSupabase } from '../supa/client'
import { useAuth } from './AuthProvider'

type Panel = 'login' | 'signup'

export function AuthScreen() {
  const { status, hasFactor } = useAuth()

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">The Tables</div>
        {status === 'needsMfa' ? hasFactor ? <Challenge /> : <Enroll /> : <Gate />}
        <p className="auth-fineprint">
          Play money only. A username, an email, and an authenticator app (Google
          Authenticator, Authy, 1Password…) are all you need.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- login / signup

function Gate() {
  const { refresh } = useAuth()
  const [panel, setPanel] = useState<Panel>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const supabase = requireSupabase()
    try {
      if (panel === 'signup') {
        if (username.trim().length < 3) throw new Error('Pick a username of at least 3 characters.')
        if (password.length < 8) throw new Error('Use a password of at least 8 characters.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim() } },
        })
        if (error) throw error
        // Email confirmation off (recommended): a session comes back and the auth
        // provider moves us to the authenticator step. On: no session yet.
        if (!data.session) {
          setNotice('Check your email to confirm the account, then come back and log in.')
          setPanel('login')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
      await refresh()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab${panel === 'login' ? ' on' : ''}`}
          onClick={() => setPanel('login')}
        >
          Log in
        </button>
        <button
          type="button"
          className={`auth-tab${panel === 'signup' ? ' on' : ''}`}
          onClick={() => setPanel('signup')}
        >
          Sign up
        </button>
      </div>

      {panel === 'signup' && (
        <label className="auth-field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="how you'll show at the table"
            required
          />
        </label>
      )}
      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={panel === 'signup' ? 'new-password' : 'current-password'}
          required
        />
      </label>

      {error && <div className="auth-error">{error}</div>}
      {notice && <div className="auth-notice">{notice}</div>}

      <button className="auth-submit" disabled={busy} type="submit">
        {busy ? 'One moment…' : panel === 'signup' ? 'Create account' : 'Log in'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- enrol TOTP

function Enroll() {
  const { refresh, signOut } = useAuth()
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const supabase = requireSupabase()
      // A dangling unverified factor from an abandoned attempt would block a new
      // enrol, so clear any before starting.
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const f of existing?.totp ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) {
        setError(messageOf(error))
        return
      }
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
    })()
  }, [])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = requireSupabase()
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: code.trim(),
      })
      if (vErr) throw vErr
      await refresh()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={verify}>
      <h2 className="auth-h">Set up your authenticator</h2>
      <p className="auth-lead">
        Scan this with your authenticator app, then enter the 6-digit code it shows.
        You'll need it every time you log in.
      </p>
      <div className="auth-qr">
        {qr ? <img src={qr} alt="Authenticator QR code" /> : <div className="auth-qr-wait">Loading…</div>}
      </div>
      {secret && (
        <div className="auth-secret">
          Can't scan? Enter this key by hand:
          <code>{secret}</code>
        </div>
      )}
      <label className="auth-field">
        <span>6-digit code</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoComplete="one-time-code"
          required
        />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy || !factorId} type="submit">
        {busy ? 'Verifying…' : 'Verify and enter'}
      </button>
      <button type="button" className="auth-link" onClick={() => void signOut()}>
        Cancel and sign out
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- code challenge

function Challenge() {
  const { refresh, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = requireSupabase()
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr) throw fErr
      const totp = (factors?.totp ?? []).find((f) => f.status === 'verified')
      if (!totp) throw new Error('No authenticator on file. Sign out and set one up.')
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.id,
        code: code.trim(),
      })
      if (vErr) throw vErr
      await refresh()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h2 className="auth-h">Enter your code</h2>
      <p className="auth-lead">Open your authenticator app and enter the 6-digit code.</p>
      <label className="auth-field">
        <span>6-digit code</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoComplete="one-time-code"
          autoFocus
          required
        />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy} type="submit">
        {busy ? 'Checking…' : 'Enter'}
      </button>
      <button type="button" className="auth-link" onClick={() => void signOut()}>
        Sign out
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- util

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return 'Something went wrong. Try again.'
}
