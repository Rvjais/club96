import { useState } from 'react'
import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import LadderEditor from './LadderEditor'
import { pct, toNum, useSettingsForm } from './settingsForm'

// Fixed difficulties (see server/src/games/tower.js)
const MODES = [
  { key: 'easy', label: 'Easy', tiles: 4, safe: 3 },
  { key: 'medium', label: 'Medium', tiles: 3, safe: 2 },
  { key: 'hard', label: 'Hard', tiles: 2, safe: 1 },
  { key: 'expert', label: 'Expert', tiles: 3, safe: 1 },
]

const mult = (m, level, edge) => Math.floor((m.tiles / m.safe) ** level * (1 - edge / 100) * 100 + 1e-9) / 100
const short = (m) => (m == null || Number.isNaN(m) ? '—' : m >= 1000 ? `${Math.round(m).toLocaleString('en-IN')}x` : `${m.toFixed(2)}x`)
const formulaRow = (m, levels, edge) => Array.from({ length: levels }, (_, i) => String(mult(m, i + 1, edge)))

export default function TowerSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('tower', saved, defaults, onSaved, 'Saved. New climbs use these payouts; climbs in progress keep theirs.')
  const [sel, setSel] = useState('medium')
  const edge = toNum(f.form.houseEdge)
  const levels = Math.round(toNum(f.form.levels))
  const ok = !Number.isNaN(edge) && levels >= 1 && levels <= 12
  const custom = f.form.custom ?? {}

  const rowFor = (m) => custom[m.key] ?? (ok ? formulaRow(m, levels, edge) : [])
  const mode = MODES.find((m) => m.key === sel)
  const row = rowFor(mode)

  // Changing the height resizes custom ladders: extra levels start from the formula
  const setLevels = (v) => f.setForm((form) => {
    const n = Math.round(toNum(v))
    if (!(n >= 3 && n <= 12)) return { ...form, levels: v }
    const e = toNum(form.houseEdge) || 0
    const next = Object.fromEntries(Object.entries(form.custom ?? {}).map(([key, list]) => {
      const m = MODES.find((x) => x.key === key)
      return [key, Array.from({ length: n }, (_, i) => list[i] ?? String(mult(m, i + 1, e)))]
    }))
    return { ...form, levels: v, custom: next }
  })
  const setCustom = (key, list) => f.setForm((form) => ({ ...form, custom: { ...form.custom, [key]: list } }))
  const resetRow = (key) => f.setForm((form) => {
    const next = { ...form.custom }
    delete next[key]
    return { ...form, custom: next }
  })

  const at = (m, level) => toNum(rowFor(m)[level - 1])

  return (
    <section className="card game-card">
      <CardHead icon="layers" title="Tower" f={f} />

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint="Used for difficulties without custom payouts" />
        <NumberField label="Tower height" suffix="levels" step="1" value={f.form.levels} onChange={setLevels} hint="3–12" />
        <LimitFields f={f} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Formula return to player</span>
          <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
          <small>{Object.keys(custom).length ? `${Object.keys(custom).length} difficulty(ies) use custom payouts` : 'All difficulties follow the formula'}</small>
        </div>
        <div className="table-wrap">
          <table className="table mini-table">
            <thead><tr><th>Difficulty</th><th>Safe tiles</th><th className="num">Level 1</th><th className="num">Level 3</th><th className="num">Top ({ok ? levels : '—'})</th></tr></thead>
            <tbody>
              {MODES.map((m) => (
                <tr key={m.key}>
                  <td className="strong">{m.label}{custom[m.key] && <span className="tag">custom</span>}</td>
                  <td>{m.safe} of {m.tiles}</td>
                  <td className="num">{ok ? short(at(m, 1)) : '—'}</td>
                  <td className="num">{ok ? short(at(m, 3)) : '—'}</td>
                  <td className="num strong">{ok ? short(at(m, levels)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="sub-head">
          <strong>Payout table</strong>
          <span className="muted">Pick a difficulty, then set what each level pays</span>
        </div>
        <div className="chip-row">
          {MODES.map((m) => (
            <button type="button" key={m.key} className={`chip ${sel === m.key ? 'is-active' : ''} ${custom[m.key] ? 'is-custom' : ''}`} onClick={() => setSel(m.key)}>
              {m.label} <small>{m.safe}/{m.tiles} safe</small>
            </button>
          ))}
        </div>
        {ok ? (
          <LadderEditor
            values={row}
            chances={row.map((_, i) => (mode.safe / mode.tiles) ** (i + 1))}
            stepLabel={(i) => `Level ${i + 1}`}
            custom={!!custom[sel]}
            onChange={(i, v) => setCustom(sel, row.map((x, j) => (j === i ? v : x)))}
            onFill={(list) => setCustom(sel, list)}
            onReset={() => resetRow(sel)}
          />
        ) : (
          <p className="muted">Enter a valid house edge and tower height (3–12) first.</p>
        )}
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}
