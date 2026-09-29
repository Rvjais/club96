import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const CHANCES = [5, 10, 25, 50, 75, 90, 95]

export default function DiceSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('dice', saved, defaults, onSaved, 'Saved. Applies to the next roll.')
  const edge = toNum(f.form.houseEdge)
  const lo = toNum(f.form.minChance)
  const hi = toNum(f.form.maxChance)
  const payout = (c) => Math.floor(((100 - edge) / c) * 100 + 1e-9) / 100

  return (
    <section className="card game-card">
      <CardHead icon="dices" title="Dice" f={f} />

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint="Payout = (100 − edge) ÷ chance" />
        <NumberField label="Lowest win chance" suffix="%" value={f.form.minChance} onChange={f.set('minChance')} hint="Caps the top payout" />
        <NumberField label="Highest win chance" suffix="%" value={f.form.maxChance} onChange={f.set('maxChance')} />
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Return to player</span>
          <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
          <small>Top payout {Number.isNaN(edge) || !(lo > 0) ? '—' : `${payout(lo)}x`} at {Number.isNaN(lo) ? '—' : pct(lo)} chance</small>
        </div>
        <div className="preview-table preview-table-7">
          <span className="preview-caption">Payout at win chance…</span>
          {CHANCES.map((c) => {
            const allowed = !(c < lo) && !(c > hi)
            return (
              <div key={c} className={allowed ? '' : 'is-off'} title={allowed ? undefined : 'Outside the allowed range'}>
                <span>{c}%</span>
                <strong>{Number.isNaN(edge) ? '—' : `${payout(c)}x`}</strong>
              </div>
            )
          })}
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
