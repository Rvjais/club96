import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function BalloonPopSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('balloonPop', saved, defaults, onSaved, 'Saved. Applies to the next pick.')

  return (
    <section className="card game-card">
      <CardHead icon="zap" title="Balloon Pop" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~13.5%</strong>
          <small>Weighted pick: pop (lose) or a 1.2×–10× prize multiplier</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
