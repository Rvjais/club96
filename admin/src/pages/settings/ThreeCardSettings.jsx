import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function ThreeCardSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('threeCard', saved, defaults, onSaved, 'Saved. Applies to the next hand.')

  return (
    <section className="card game-card">
      <CardHead icon="heart" title="3 Card Poker" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~3.4% / 4.5%</strong>
          <small>Ante / Pair Plus — dealer needs Q-high to qualify; play bet matches the ante</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
