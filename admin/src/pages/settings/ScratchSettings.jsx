import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function ScratchSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('scratch', saved, defaults, onSaved, 'Saved. Applies to the next card.')

  return (
    <section className="card game-card">
      <CardHead icon="gift" title="Scratch Cards" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~15–25%</strong>
          <small>Instant win; match 3 identical symbols to win (multiplier varies by symbol)</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}