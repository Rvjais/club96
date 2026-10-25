import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function CoinFlipSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('coinFlip', saved, defaults, onSaved, 'Saved. Applies to the next flip.')

  return (
    <section className="card game-card">
      <CardHead icon="coins" title="Coin Flip" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~2.5%</strong>
          <small>Heads/tails; win pays 1.95× the stake</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
