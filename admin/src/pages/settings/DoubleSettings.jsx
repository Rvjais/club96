import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

export default function DoubleSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('double', saved, defaults, onSaved, 'Saved. Applies to the next bet.')

  return (
    <section className="card game-card">
      <CardHead icon="circleHalf" title="Double (Red-Black)" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>2.5%</strong>
          <small>Fixed payout: 1.95x (50/50 chance)</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}