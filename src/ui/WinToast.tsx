import { useEffect, useRef, useState } from 'react'

/** A single, consistent win celebration used by every game. It flashes once when
 *  `token` changes to a new value while `net` is positive, then fades itself out.
 *  `token` should change exactly once per resolved round (a round counter, a
 *  phase marker — anything that is stable within a round and differs between
 *  them), so a re-render from placing a chip never re-triggers it. */
export function WinToast({ net, token, label = 'You win' }: { net: number; token: string | number; label?: string }) {
  const [show, setShow] = useState<{ amount: number; key: string } | null>(null)
  // Seed with the current token so a fresh mount never flashes a stale result.
  const seen = useRef<string | number>(token)

  useEffect(() => {
    if (token === seen.current) return
    seen.current = token
    if (net <= 0) {
      setShow(null)
      return
    }
    setShow({ amount: net, key: String(token) })
    const t = setTimeout(() => setShow(null), 2300)
    return () => clearTimeout(t)
  }, [token, net])

  if (!show) return null
  return (
    <div className="wintoast" key={show.key} aria-live="polite">
      <div className="wintoast-card">
        <span className="wintoast-label">{label}</span>
        <span className="wintoast-amount">+{show.amount.toLocaleString()}</span>
      </div>
    </div>
  )
}
