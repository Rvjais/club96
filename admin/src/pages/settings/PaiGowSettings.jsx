import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function PaiGowSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('paiGow', saved, defaults, onSaved, 'Saved. Applies to the next hand.')

  return (
    <section className="card game-card">
      <CardHead icon="layers" title="Pai Gow Poker" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~2.8%</strong>
          <small>7-card hands auto-split into 5 + 2; win both for 1:1 minus 5% commission, 1–1 splits push</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
