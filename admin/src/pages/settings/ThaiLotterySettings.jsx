import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function ThaiLotterySettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('thaiLottery', saved, defaults, onSaved, 'Saved. Applies to the next draw.')

  return (
    <section className="card game-card">
      <CardHead icon="receipt" title="Thai Lottery 2D/3D" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Payouts</span>
          <strong>2D 85× · 3D 800×</strong>
          <small>Exact-order draws; box (any-order) pays 40× (2D) and 120×/240× (3D)</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
