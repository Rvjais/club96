import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const STREAK_PAYOUTS = [1.95, 2.0, 2.1, 2.25, 2.5, 3.0, 4.0, 5.5, 8.0, 12.0, 18.0, 28.0, 45.0, 70.0, 110.0]

export default function HiLoSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('hiLo', saved, defaults, onSaved, 'Saved. Applies to the next round.')

  return (
    <section className="card game-card">
      <CardHead icon="sortUp" title="Hi-Lo Cards" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~3.5%</strong>
          <small>Tie = loss; streak multipliers compound edge</small>
        </div>
        <div className="preview-table preview-table-15">
          <span className="preview-caption">Streak multipliers</span>
          {STREAK_PAYOUTS.map((m, i) => (
            <div key={i}>
              <span>#{i + 1}</span>
              <strong>{m}x</strong>
            </div>
          ))}
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}