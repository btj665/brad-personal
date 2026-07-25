import { useEffect, useRef, useState } from 'react'

import { PRESETS } from '../content/presets'
import type { RuleSet } from '../engine/types'

/** The game you're playing, printed in the top bar — and a way to change it.
 *  The rules panel can do this too, but changing tables is the one thing you do
 *  often enough that it shouldn't be two clicks deep. */
export function GamePicker({
  rules,
  onPick,
  onOpenRules,
}: {
  rules: RuleSet
  onPick: (rules: RuleSet) => void
  onOpenRules: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Click anywhere else, or hit Escape, and it goes away.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A hand-edited rule set matches no preset; say so rather than lying.
  const current = PRESETS.find((p) => p.rules.label === rules.label)

  return (
    <div className="picker" ref={box}>
      <button
        className={`picker-button${open ? ' picker-button-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {rules.label}
        <svg className="caret" viewBox="0 0 10 6" aria-hidden>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className="picker-menu" role="menu">
          {PRESETS.map((preset) => {
            const on = preset.rules.label === rules.label
            return (
              <button
                key={preset.id}
                role="menuitem"
                className={`picker-item${on ? ' picker-item-on' : ''}`}
                onClick={() => {
                  onPick({ ...preset.rules })
                  setOpen(false)
                }}
              >
                <span className="picker-row">
                  <span className="picker-name">{preset.rules.label}</span>
                  <span className={`picker-edge${preset.edge < 0 ? ' picker-edge-good' : ''}`}>
                    {preset.edge > 0 ? '+' : ''}
                    {preset.edge.toFixed(2)}%
                  </span>
                </span>
                <span className="picker-note">{preset.note}</span>
              </button>
            )
          })}

          {!current && (
            <div className="picker-custom">
              You've hand-edited the rules, so this is no longer one of the house games.
            </div>
          )}

          <button
            className="picker-more"
            onClick={() => {
              setOpen(false)
              onOpenRules()
            }}
          >
            Edit every rule…
          </button>
        </div>
      )}
    </div>
  )
}
