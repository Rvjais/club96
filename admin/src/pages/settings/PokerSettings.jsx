import { CardHead, FormSaveBar, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const SKILLS = [
  { key: 'easy', label: 'Easy', hint: 'Misjudges hands and calls too often' },
  { key: 'normal', label: 'Normal', hint: 'Solid, with the odd mistake' },
  { key: 'hard', label: 'Hard', hint: 'Plays close to the real odds' },
]

const rupees = (n) => (Number.isNaN(n) ? '—' : `₹${n.toLocaleString('en-IN')}`)
const bbs = (amount, bb) => (Number.isNaN(amount) || !(bb > 0) ? '—' : `${Math.round((amount / bb) * 10) / 10} BB`)

export default function PokerSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('poker', saved, defaults, onSaved, 'Saved. Players pick up new blinds, buy-ins and rake when they next sit down; bot behaviour changes right away.')
  const bb = toNum(f.form.bigBlind)
  const minBuy = toNum(f.form.minBuyIn)
  const maxBuy = toNum(f.form.maxBuyIn)
  const rake = toNum(f.form.rake)
  const cap = toNum(f.form.rakeCap)
  const bots = toNum(f.form.bots)
  const skill = SKILLS.find((s) => s.key === f.form.botSkill)

  return (
    <section className="card game-card">
      <CardHead icon="club" title="Poker (Texas Hold'em)" f={f} />

      <div className="sub-head">
        <strong>Table stakes</strong>
        <span className="muted">Locked in for a player when they sit down</span>
      </div>
      <div className="settings-grid">
        <NumberField label="Small blind" prefix="₹" value={f.form.smallBlind} onChange={f.set('smallBlind')} />
        <NumberField label="Big blind" prefix="₹" value={f.form.bigBlind} onChange={f.set('bigBlind')} hint="Also the minimum bet" />
        <NumberField label="Minimum buy-in" prefix="₹" value={f.form.minBuyIn} onChange={f.set('minBuyIn')} hint="At least 10 big blinds" />
        <NumberField label="Maximum buy-in" prefix="₹" value={f.form.maxBuyIn} onChange={f.set('maxBuyIn')} hint="Top-ups can't take a stack above this" />
        <NumberField label="Rake" suffix="%" value={f.form.rake} onChange={f.set('rake')} hint="0–10% of each pot the player wins after the flop" />
        <NumberField label="Rake cap per hand" prefix="₹" value={f.form.rakeCap} onChange={f.set('rakeCap')} hint="0 = no rake" />
      </div>

      <div className="sub-head">
        <strong>Bots and table</strong>
        <span className="muted">Apply from the next decision, even at tables already running</span>
      </div>
      <div className="settings-grid">
        <NumberField label="Opponents" step="1" value={f.form.bots} onChange={f.set('bots')} hint="1–5 bots (applies to new tables)" />
        <NumberField label="Bot aggression" suffix="%" value={f.form.botAggression} onChange={f.set('botAggression')} hint="How often bots bet and raise good hands" />
        <NumberField label="Bot bluffing" suffix="%" value={f.form.botBluff} onChange={f.set('botBluff')} hint="How often bots bet weak hands" />
        <NumberField label="Time to act" suffix="sec" step="1" value={f.form.turnSeconds} onChange={f.set('turnSeconds')} hint="Then the player auto-checks or folds" />
      </div>
      <div>
        <div className="sub-head">
          <strong>Bot skill</strong>
          <span className="muted">{skill?.hint}</span>
        </div>
        <div className="chip-row">
          {SKILLS.map((s) => (
            <button type="button" key={s.key} className={`chip ${f.form.botSkill === s.key ? 'is-active' : ''}`} onClick={() => f.set('botSkill')(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House rake</span>
          <strong>{Number.isNaN(rake) || !(cap > 0) ? '0%' : pct(rake)}</strong>
          <small>{Number.isNaN(cap) || cap <= 0 ? 'No rake is taken' : `Up to ${rupees(cap)} per hand, only from pots the player wins`}</small>
        </div>
        <div className="preview-table preview-table-4">
          <span className="preview-caption">Table summary</span>
          <div><span>Seats</span><strong>{Number.isNaN(bots) ? '—' : `1 player + ${bots} bot${bots === 1 ? '' : 's'}`}</strong></div>
          <div><span>Blinds</span><strong>{rupees(toNum(f.form.smallBlind))} / {rupees(bb)}</strong></div>
          <div><span>Buy-in</span><strong>{bbs(minBuy, bb)} – {bbs(maxBuy, bb)}</strong></div>
          <div><span>Bot skill</span><strong>{skill?.label ?? '—'}</strong></div>
        </div>
      </div>

      <p className="muted">
        Cards come from a fresh, randomly shuffled deck every hand. Bots only see their own cards and the board, never the
        player&apos;s hand. The house earns from rake and from the bots&apos; results.
      </p>

      <FormSaveBar f={f} />
    </section>
  )
}
