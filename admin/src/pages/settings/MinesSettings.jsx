import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const GRID = 25
const MINE_ROWS = [1, 3, 5, 10, 20, 24]
const GEM_COLS = [1, 2, 3, 5, 10]

// Same formula as the server: fair odds of `gems` safe picks in a row, minus the edge
function multiplier(mines, gems, edge) {
  if (gems > GRID - mines) return null
  let m = 1
  for (let i = 0; i < gems; i++) m *= (GRID - i) / (GRID - mines - i)
  return Math.floor(m * (1 - edge / 100) * 100 + 1e-9) / 100
}

const short = (m) => (m == null ? '—' : m >= 1000 ? `${Math.round(m).toLocaleString('en-IN')}x` : `${m.toFixed(2)}x`)

export default function MinesSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('mines', saved, defaults, onSaved, 'Saved. New rounds use these settings; rounds in progress keep theirs.')
  const edge = toNum(f.form.houseEdge)
  const lo = toNum(f.form.minMines)
  const hi = toNum(f.form.maxMines)
  const rows = MINE_ROWS.filter((m) => !(m < lo) && !(m > hi))

  return (
    <section className="card game-card">
      <CardHead icon="bomb" title="Mines" f={f} />

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint="Taken off every multiplier" />
        <NumberField label="Fewest mines" step="1" value={f.form.minMines} onChange={f.set('minMines')} hint="1–24" />
        <NumberField label="Most mines" step="1" value={f.form.maxMines} onChange={f.set('maxMines')} hint="1–24" />
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Return to player</span>
          <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
          <small>Same for every mine count and cash-out point</small>
        </div>
        <div className="table-wrap">
          <table className="table mini-table">
            <thead>
              <tr><th>Mines ＼ gems</th>{GEM_COLS.map((g) => <th key={g} className="num">{g}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m}>
                  <td className="strong">{m} {m === 1 ? 'mine' : 'mines'}</td>
                  {GEM_COLS.map((g) => <td key={g} className="num">{Number.isNaN(edge) ? '—' : short(multiplier(m, g, edge))}</td>)}
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
