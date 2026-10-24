import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function BaccaratSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('baccarat', saved, defaults, onSaved, 'Saved. Applies to the next hand.')

  return (
    <section className="card game-card">
      <CardHead icon="heart" title="Baccarat" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>1.06% / 1.24% / 14.36%</strong>
          <small>Banker / Player / Tie — banker pays 0.95:1 (5% commission), tie pays 8:1</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}