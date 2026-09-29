import { useState } from 'react'
import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import LadderEditor from './LadderEditor'
import { pct, toNum, useSettingsForm } from './settingsForm'

const GRID = 25
const MINE_ROWS = [1, 3, 5, 10, 20, 24]
const GEM_COLS = [1, 2, 3, 5, 10]

// Same formula as the server: fair odds of `gems` safe picks in a row, minus the edge
function multiplier(mines, gems, edge) {
  let m = 1
  for (let i = 0; i < gems; i++) m *= (GRID - i) / (GRID - mines - i)
  return Math.floor(m * (1 - edge / 100) * 100 + 1e-9) / 100
}

/** Chance of finding `gems` gems in a row without hitting a mine. */
function survive(mines, gems) {
  let p = 1
  for (let i = 0; i < gems; i++) p *= (GRID - mines - i) / (GRID - i)
  return p
}

const formulaRow = (mines, edge) => Array.from({ length: GRID - mines }, (_, k) => String(multiplier(mines, k + 1, edge)))
const short = (m) => (m == null || Number.isNaN(m) ? '—' : m >= 1000 ? `${Math.round(m).toLocaleString('en-IN')}x` : `${m.toFixed(2)}x`)

export default function MinesSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('mines', saved, defaults, onSaved, 'Saved. New rounds use these payouts; rounds in progress keep theirs.')
  const edge = toNum(f.form.houseEdge)
  const lo = toNum(f.form.minMines)
  const hi = toNum(f.form.maxMines)
  const custom = f.form.custom ?? {}
  const [sel, setSel] = useState(3)

  const rowFor = (m) => custom[m] ?? (Number.isNaN(edge) ? Array(GRID - m).fill('') : formulaRow(m, edge))
  const valueAt = (m, gems) => (gems > GRID - m ? null : toNum(rowFor(m)[gems - 1]))

  const allowed = Array.from({ length: 24 }, (_, i) => i + 1).filter((m) => !(m < lo) && !(m > hi))
  const rows = MINE_ROWS.filter((m) => allowed.includes(m))
  const row = rowFor(sel)

  const setCustom = (m, list) => f.setForm((form) => ({ ...form, custom: { ...form.custom, [m]: list } }))
  const resetRow = (m) => f.setForm((form) => {
    const next = { ...form.custom }
    delete next[m]
    return { ...form, custom: next }
  })

  return (
    <section className="card game-card">
      <CardHead icon="bomb" title="Mines" f={f} />

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint="Used for mine counts without custom payouts" />
        <NumberField label="Fewest mines" step="1" value={f.form.minMines} onChange={f.set('minMines')} hint="1–24" />
        <NumberField label="Most mines" step="1" value={f.form.maxMines} onChange={f.set('maxMines')} hint="1–24" />
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Formula return to player</span>
          <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
          <small>{Object.keys(custom).length ? `${Object.keys(custom).length} mine count(s) use custom payouts` : 'All mine counts follow the formula'}</small>
        </div>
        <div className="table-wrap">
          <table className="table mini-table">
            <thead>
              <tr><th>Mines ＼ gems</th>{GEM_COLS.map((g) => <th key={g} className="num">{g}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m} className={custom[m] ? 'is-custom-row' : ''}>
                  <td className="strong">{m} {m === 1 ? 'mine' : 'mines'}{custom[m] && <span className="tag">custom</span>}</td>
                  {GEM_COLS.map((g) => <td key={g} className="num">{short(valueAt(m, g))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="sub-head">
          <strong>Payout table</strong>
          <span className="muted">Pick a mine count, then set what each gem pays</span>
        </div>
        <div className="chip-row">
          {allowed.map((m) => (
            <button type="button" key={m} className={`chip ${sel === m ? 'is-active' : ''} ${custom[m] ? 'is-custom' : ''}`} onClick={() => setSel(m)}>
              {m}
            </button>
          ))}
        </div>
        {allowed.includes(sel) ? (
          <LadderEditor
            values={row}
            chances={row.map((_, k) => survive(sel, k + 1))}
            stepLabel={(i) => `Gem ${i + 1}`}
            custom={!!custom[sel]}
            onChange={(i, v) => setCustom(sel, row.map((x, j) => (j === i ? v : x)))}
            onFill={(list) => setCustom(sel, list)}
            onReset={() => resetRow(sel)}
          />
        ) : (
          <p className="muted">Pick a mine count above.</p>
        )}
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
