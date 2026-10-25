import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function HighCardSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('highCard', saved, defaults, onSaved, 'Saved. Applies to the next draw.')

  return (
    <section className="card game-card">
      <CardHead icon="spade" title="High Card Draw" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~3.7%</strong>
          <small>One card each, ace high; win pays 1.92×, identical ranks push</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
