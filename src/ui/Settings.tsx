import { PRESETS } from '../content/presets'
import type { DoubleRule, Ratio, RuleSet, SurrenderRule } from '../engine/types'

/** A change to the rules only takes effect on a fresh table, exactly as it would
 *  if the pit boss changed the sign — you don't get new rules mid-hand. */
export function Settings({
  rules,
  seats,
  onApply,
  onClose,
}: {
  rules: RuleSet
  seats: number
  onApply: (rules: RuleSet, seats: number) => void
  onClose: () => void
}) {
  const set = <K extends keyof RuleSet>(key: K, value: RuleSet[K]) =>
    onApply({ ...rules, [key]: value, label: 'Custom' }, seats)

  return (
    <aside className="settings" aria-label="House rules">
      <header className="settings-head">
        <h2>House rules</h2>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="settings-body">
        <Section title="The game">
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset${rules.label === p.rules.label ? ' preset-on' : ''}`}
                onClick={() => onApply({ ...p.rules }, seats)}
                title={
                  p.published === undefined
                    ? p.note
                    : `${p.note}\n\nPublished elsewhere as ${p.published.toFixed(2)}%. We measure ${p.edge.toFixed(2)}% because the bots play the ordinary chart plus a handful of deviations rather than one drawn for this variant.`
                }
              >
                <span className="preset-name">{p.rules.label}</span>
                <span className={`preset-edge${p.edge < 0 ? ' preset-edge-good' : ''}`}>
                  {p.edge > 0 ? '+' : ''}
                  {p.edge.toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
          <p className="hint">
            The percentage is the house edge against perfect basic strategy, measured by simulating
            eight million rounds of each game. Run <code>npm run edge</code> to reproduce it. The two
            variants sit above their published figures on purpose — hover one to read why.
          </p>
        </Section>

        <Section title="The shoe">
          <Choice
            label="Decks"
            value={rules.decks}
            options={[1, 2, 4, 6, 8]}
            onChange={(v) => set('decks', v)}
          />
          <Range
            label="Penetration"
            hint="How deep the cut card is buried. Deeper is better for a counter."
            value={rules.penetration}
            min={0.5}
            max={0.95}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('penetration', v)}
          />
          <Toggle
            label="Spanish deck (remove the tens)"
            hint="48 cards: every rank-10 comes out, jacks, queens and kings stay. Worth over 2% to the house on its own — Spanish 21 spends the rest of this panel paying you back for it."
            value={rules.removeTens}
            onChange={(v) => set('removeTens', v)}
          />
          <Toggle label="Burn a card after the shuffle" value={rules.burnCard} onChange={(v) => set('burnCard', v)} />
          <Toggle
            label="Continuous shuffler (CSM)"
            hint="Reshuffles every round. Kills the count stone dead."
            value={rules.csm}
            onChange={(v) => set('csm', v)}
          />
        </Section>

        <Section title="The dealer">
          <Toggle
            label="Hits soft 17"
            hint="H17. Costs you about 0.2%."
            value={rules.dealerHitsSoft17}
            onChange={(v) => set('dealerHitsSoft17', v)}
          />
          <Toggle
            label="Peeks for blackjack (hole card)"
            hint="Off is the European game: the dealer takes no second card until you have played."
            value={rules.dealerPeek}
            onChange={(v) => set('dealerPeek', v)}
          />
          <Toggle
            label="Original bets only on a dealer blackjack"
            hint="No-hole-card games only. Your double and split money comes back."
            value={rules.originalBetsOnly}
            disabled={rules.dealerPeek}
            onChange={(v) => set('originalBetsOnly', v)}
          />
          <Toggle
            label="Dealer 22 pushes"
            hint="The Free Bet rule. On its own — without the free doubles and splits that pay for it — it is worth about 7% to the house. You have been warned."
            value={rules.dealerPush22}
            onChange={(v) => set('dealerPush22', v)}
          />
          <Toggle
            label="Any player 21 always wins"
            hint="The Spanish 21 rule. Your 21 is never beaten and never pushed, and your blackjack beats the dealer's."
            value={rules.player21Wins}
            onChange={(v) => set('player21Wins', v)}
          />
        </Section>

        <Section title="The payoffs">
          <Choice<string>
            label="Blackjack pays"
            value={ratioKey(rules.blackjackPayout)}
            options={['3:2', '6:5', '7:5', '1:1', '2:1']}
            onChange={(v) => set('blackjackPayout', parseRatio(v))}
          />
          <Toggle label="Insurance offered" value={rules.insurance} onChange={(v) => set('insurance', v)} />
          <Toggle
            label="Even money on a natural"
            value={rules.evenMoney}
            disabled={!rules.insurance}
            onChange={(v) => set('evenMoney', v)}
          />
          <Toggle
            label="Spanish 21 bonuses"
            hint="Five-card 21 pays 3:2, six-card 2:1, seven-card 3:1. 6-7-8 and 7-7-7 pay 3:2 mixed, 2:1 suited, 3:1 in spades. Never on a doubled or split hand."
            value={rules.spanishBonuses}
            onChange={(v) => set('spanishBonuses', v)}
          />
          <Choice<number | null>
            label="Charlie"
            hint="N unbusted cards wins on the spot."
            value={rules.charlie}
            options={[null, 5, 6, 7]}
            display={(v) => (v === null ? 'Off' : `${v} cards`)}
            onChange={(v) => set('charlie', v)}
          />
        </Section>

        <Section title="Doubling">
          <Choice<DoubleRule>
            label="Double on"
            value={rules.double}
            options={['any', 'nine-eleven', 'ten-eleven', 'none']}
            display={(v) =>
              ({ any: 'Any two', 'nine-eleven': '9–11', 'ten-eleven': '10–11', none: 'Never' })[v]
            }
            onChange={(v) => set('double', v)}
          />
          <Toggle
            label="Double after split (DAS)"
            value={rules.doubleAfterSplit}
            onChange={(v) => set('doubleAfterSplit', v)}
          />
          <Toggle
            label="Double on split aces"
            value={rules.doubleOnSplitAces}
            onChange={(v) => set('doubleOnSplitAces', v)}
          />
          <Toggle
            label="Double on any number of cards"
            hint="Spanish 21. Hit into a hard 11 and you may still double it."
            value={rules.doubleAnyCards}
            onChange={(v) => set('doubleAnyCards', v)}
          />
          <Toggle
            label="Double-down rescue"
            hint="Spanish 21. After seeing the double card you may hand the hand back and keep the original bet. It is the Surrender button."
            value={rules.doubleRescue}
            onChange={(v) => set('doubleRescue', v)}
          />
          <Toggle
            label="Free double (9, 10, 11)"
            hint="Free Bet. The house puts up the double on any hard 9, 10 or 11: it pays like a real wager and costs nothing when it loses."
            value={rules.freeDouble}
            onChange={(v) => set('freeDouble', v)}
          />
        </Section>

        <Section title="Splitting">
          <Toggle
            label="Free split (any pair but tens)"
            hint="Free Bet. The house backs the second hand. Ten-value pairs still cost you your own chips."
            value={rules.freeSplit}
            onChange={(v) => set('freeSplit', v)}
          />
          <Choice
            label="Split to"
            value={rules.maxSplitHands}
            options={[1, 2, 3, 4]}
            display={(v) => (v === 1 ? 'No splitting' : `${v} hands`)}
            onChange={(v) => set('maxSplitHands', v)}
          />
          <Toggle label="Re-split aces (RSA)" value={rules.resplitAces} onChange={(v) => set('resplitAces', v)} />
          <Toggle
            label="Hit split aces"
            hint="Off means one card each and that's your lot."
            value={rules.hitSplitAces}
            onChange={(v) => set('hitSplitAces', v)}
          />
          <Toggle
            label="Split unlike tens (K-Q)"
            value={rules.splitUnlikeTens}
            onChange={(v) => set('splitUnlikeTens', v)}
          />
        </Section>

        <Section title="Surrender">
          <Choice<SurrenderRule>
            label="Surrender"
            value={rules.surrender}
            options={['none', 'late', 'early']}
            display={(v) => ({ none: 'None', late: 'Late', early: 'Early' })[v]}
            onChange={(v) => set('surrender', v)}
          />
          <Toggle
            label="Surrender after split"
            value={rules.surrenderAfterSplit}
            disabled={rules.surrender === 'none'}
            onChange={(v) => set('surrenderAfterSplit', v)}
          />
        </Section>

        <Section title="The table">
          <NumberField
            label="Minimum bet"
            value={rules.minBet}
            step={5}
            min={1}
            onChange={(v) => set('minBet', v)}
          />
          <NumberField
            label="Maximum bet"
            value={rules.maxBet}
            step={100}
            min={rules.minBet}
            onChange={(v) => set('maxBet', v)}
          />
          <Choice
            label="Other players"
            value={seats}
            options={[0, 1, 2, 3, 4]}
            display={(v) => (v === 0 ? 'Heads up' : `${v} bot${v === 1 ? '' : 's'}`)}
            onChange={(v) => onApply(rules, v)}
          />
        </Section>
      </div>

      <footer className="settings-foot">
        Changing a rule deals a new shoe.
      </footer>
    </aside>
  )
}

// --- little controls -------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`row row-toggle${disabled ? ' row-disabled' : ''}`}>
      <span className="row-label">
        {label}
        {hint && <em className="row-hint">{hint}</em>}
      </span>
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden />
    </label>
  )
}

function Choice<T extends string | number | null>({
  label,
  hint,
  value,
  options,
  display,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: T[]
  display?: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <div className="row">
      <span className="row-label">
        {label}
        {hint && <em className="row-hint">{hint}</em>}
      </span>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={String(option)}
            className={`seg${option === value ? ' seg-on' : ''}`}
            onClick={() => onChange(option)}
          >
            {display ? display(option) : String(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Range({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="row">
      <span className="row-label">
        {label}
        {hint && <em className="row-hint">{hint}</em>}
      </span>
      <span className="range">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <b>{format(value)}</b>
      </span>
    </label>
  )
}

function NumberField({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string
  value: number
  step: number
  min: number
  onChange: (v: number) => void
}) {
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <input
        className="num"
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n >= min) onChange(n)
        }}
      />
    </label>
  )
}

function ratioKey(r: Ratio): string {
  return `${r[0]}:${r[1]}`
}

function parseRatio(s: string): Ratio {
  const [a, b] = s.split(':').map(Number)
  return [a, b]
}
