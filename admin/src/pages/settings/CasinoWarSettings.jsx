import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function CasinoWarSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('casinoWar', saved, defaults, onSaved, 'Saved. Applies to the next battle.')

  return (
    <section className="card game-card">
      <CardHead icon="crown" title="Casino War" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~2.9%</strong>
          <small>Higher card wins 1:1; ties go to war (ante 1:1, raise pushes) or surrender half</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
