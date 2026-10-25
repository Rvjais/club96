import { CardHead, FormSaveBar, LimitFields } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

export default function BigSmallSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('bigSmall', saved, defaults, onSaved, 'Saved. Applies to the next roll.')

  return (
    <section className="card game-card">
      <CardHead icon="dices" title="Big / Small" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>House edge</span>
          <strong>~2.5% / 2:1 bets</strong>
          <small>Small/Big 1.95× (triples lose), odd/even 1.9×, triples 31/181×, totals by rarity 7–61×</small>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
