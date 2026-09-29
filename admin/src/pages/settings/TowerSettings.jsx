import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

// Fixed difficulties (see server/src/games/tower.js)
const MODES = [
  { key: 'easy', label: 'Easy', tiles: 4, safe: 3 },
  { key: 'medium', label: 'Medium', tiles: 3, safe: 2 },
  { key: 'hard', label: 'Hard', tiles: 2, safe: 1 },
  { key: 'expert', label: 'Expert', tiles: 3, safe: 1 },
]

const mult = (m, level, edge) => Math.floor((m.tiles / m.safe) ** level * (1 - edge / 100) * 100 + 1e-9) / 100
const short = (m) => (m >= 1000 ? `${Math.round(m).toLocaleString('en-IN')}x` : `${m.toFixed(2)}x`)

export default function TowerSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('tower', saved, defaults, onSaved, 'Saved. New climbs use these settings; climbs in progress keep theirs.')
  const edge = toNum(f.form.houseEdge)
  const levels = Math.round(toNum(f.form.levels))
  const ok = !Number.isNaN(edge) && levels >= 1

  return (
    <section className="card game-card">
      <CardHead icon="layers" title="Tower" f={f} />

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint="Taken off every multiplier" />
        <NumberField label="Tower height" suffix="levels" step="1" value={f.form.levels} onChange={f.set('levels')} hint="3–12" />
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Return to player</span>
          <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
          <small>Same for every difficulty and level</small>
        </div>
        <div className="table-wrap">
          <table className="table mini-table">
            <thead><tr><th>Difficulty</th><th>Safe tiles</th><th className="num">Level 1</th><th className="num">Level 3</th><th className="num">Top ({ok ? levels : '—'})</th></tr></thead>
            <tbody>
              {MODES.map((m) => (
                <tr key={m.key}>
                  <td className="strong">{m.label}</td>
                  <td>{m.safe} of {m.tiles}</td>
                  <td className="num">{ok ? short(mult(m, 1, edge)) : '—'}</td>
                  <td className="num">{ok ? short(mult(m, 3, edge)) : '—'}</td>
                  <td className="num strong">{ok ? short(mult(m, levels, edge)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
