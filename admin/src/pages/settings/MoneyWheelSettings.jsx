import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function MoneyWheelSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('moneyWheel', saved, defaults, onSaved, 'Saved. Applies to the next spin.')

  return (
    <section className="card game-card">
      <CardHead icon="wheel" title="Money Wheel" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Payouts</span>
          <strong>2× … 41×</strong>
          <small>54-segment Big Six: x1×24 pay 2 · x2×15 pay 3 · x5×8 pay 6 · x10×4 pay 11 · x20×2 pay 21 · joker pays 41</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
