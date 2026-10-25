import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function RouletteSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('roulette', saved, defaults, onSaved, 'Saved. Applies to the next spin.')

  return (
    <section className="card game-card">
      <CardHead icon="wheel" title="Roulette" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~2.7%</strong>
          <small>Single-zero European wheel: numbers 35:1, outside 1:1, dozen/column 2:1</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
