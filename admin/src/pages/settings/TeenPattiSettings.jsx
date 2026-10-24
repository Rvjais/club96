import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function TeenPattiSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('teenPatti', saved, defaults, onSaved, 'Saved. Applies to the next hand.')

  return (
    <section className="card game-card">
      <CardHead icon="heart" title="Teen Patti" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~3.5% / 7%</strong>
          <small>Ante / Pair+ — 3-card hand vs house; pair+, color, sequence, pure sequence, trial</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}