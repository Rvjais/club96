import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { useSettingsForm } from './settingsForm'

export default function CardTableSettings({ game, saved, defaults, onSaved }) {
  const andar = game === 'andarBahar'
  const title = andar ? 'Andar Bahar' : 'Dragon Tiger'
  const f = useSettingsForm(game, saved, defaults, onSaved, 'Saved. New rounds use these settings.')
  const fields = andar ? [['andarPayout','Andar payout'],['baharPayout','Bahar payout']] : [['dragonPayout','Dragon payout'],['tigerPayout','Tiger payout'],['tiePayout','Tie payout'],['suitedTiePayout','Suited tie payout']]
  return <section className="card game-card"><CardHead icon="club" title={title} f={f}/><div className="settings-grid"><LimitFields f={f}/>{fields.map(([key,label])=><NumberField key={key} label={label} suffix="× return" value={f.form[key]} onChange={f.set(key)} hint="Total return including the stake"/>)}</div><FormSaveBar f={f}/></section>
}
