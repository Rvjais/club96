import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function BlackjackSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('blackjack', saved, defaults, onSaved, 'Saved. Applies to the next hand.')

  return (
    <section className="card game-card">
      <CardHead icon="spade" title="Blackjack" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~0.5%</strong>
          <small>With basic strategy; blackjack pays 3:2, dealer stands on 17</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}