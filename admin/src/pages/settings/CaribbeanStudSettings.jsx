import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function CaribbeanStudSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('caribbeanStud', saved, defaults, onSaved, 'Saved. Applies to the next hand.')

  return (
    <section className="card game-card">
      <CardHead icon="spade" title="Caribbean Stud" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~5%</strong>
          <small>5-card stud; dealer needs K-high to qualify; raise = 2× ante paid up to 50×</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
