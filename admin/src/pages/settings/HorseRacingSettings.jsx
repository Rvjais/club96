import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { useSettingsForm } from './settingsForm'

export default function HorseRacingSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('horseRacing', saved, defaults, onSaved, 'Saved. Applies to the next race.')
  return <section className="card game-card">
    <CardHead icon="coins" title="Royal Turf Derby" f={f} />
    <div className="settings-grid">
      <LimitFields f={f} />
      <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint="Applied to WIN and PLACE returns" />
    </div>
    <FormSaveBar f={f} />
  </section>
}
