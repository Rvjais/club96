import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function Lucky6Settings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('lucky6', saved, defaults, onSaved, 'Saved. Applies to the next draw.')

  return (
    <section className="card game-card">
      <CardHead icon="grid" title="Lucky 6/49" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Jackpot</span>
          <strong>6 hits pays 50,000×</strong>
          <small>6 + 1 bonus balls from 49: 3 hits 8× · 4 hits 100× · 5 hits 1500× · 5+bonus 3000×</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
