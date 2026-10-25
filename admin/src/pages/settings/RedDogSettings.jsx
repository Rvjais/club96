import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function RedDogSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('redDog', saved, defaults, onSaved, 'Saved. Applies to the next deal.')

  return (
    <section className="card game-card">
      <CardHead icon="spade" title="Red Dog" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~3.8%</strong>
          <small>Third card between the first two pays by spread (5×·4×·2×·1×); pairs &amp; consecutives push, a paired trips pays 11×</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
