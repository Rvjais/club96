import { useState } from 'react'
import { Icon } from '../../Icons'
import { CardHead, FormSaveBar, LimitFields } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const ROWS = [8, 12, 16]
const RISKS = ['low', 'medium', 'high']

function choose(n, k) {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}
/** Chance (0–1) that the ball lands in bucket i of a board with `rows` rows. */
const bucketChance = (rows, i) => choose(rows, i) / 2 ** rows

const rtpOf = (rows, table) => table.reduce((t, v, i) => t + (toNum(v) || 0) * bucketChance(rows, i), 0) * 100
const fmtChance = (p) => (p * 100 >= 0.01 ? pct(p * 100) : `${(p * 100).toExponential(1)}%`)

export default function PlinkoSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('plinko', saved, defaults, onSaved, 'Saved. Applies to the next ball dropped.')
  const [sel, setSel] = useState({ rows: 12, risk: 'medium' })
  const [mirror, setMirror] = useState(true)

  const table = f.form.tables[sel.rows][sel.risk]
  const rtps = Object.fromEntries(ROWS.map((r) => [r, Object.fromEntries(RISKS.map((k) => [k, rtpOf(r, f.form.tables[r][k])]))]))
  const anyLoss = ROWS.some((r) => RISKS.some((k) => rtps[r][k] > 100))

  const setBucket = (i, v) => {
    f.setForm((form) => {
      const list = [...form.tables[sel.rows][sel.risk]]
      list[i] = v
      if (mirror) list[sel.rows - i] = v
      return { ...form, tables: { ...form.tables, [sel.rows]: { ...form.tables[sel.rows], [sel.risk]: list } } }
    })
  }

  return (
    <section className="card game-card">
      <CardHead icon="pyramid" title="Plinko" f={f} />

      <div className="settings-grid settings-grid-3">
        <LimitFields f={f} />
      </div>

      <div>
        <div className="sub-head">
          <strong>Return to player by board</strong>
          <span className="muted">Click a board to edit its payout table</span>
        </div>
        <div className="rtp-matrix">
          <span />
          {RISKS.map((k) => <span key={k} className="rtp-head">{k}</span>)}
          {ROWS.map((r) => (
            <div key={r} className="rtp-row">
              <span className="rtp-head">{r} rows</span>
              {RISKS.map((k) => (
                <button
                  type="button"
                  key={k}
                  className={`rtp-cell ${sel.rows === r && sel.risk === k ? 'is-active' : ''} ${rtps[r][k] > 100 ? 'is-bad' : ''}`}
                  onClick={() => setSel({ rows: r, risk: k })}
                >
                  {pct(rtps[r][k])}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="sub-head">
          <strong>{sel.rows} rows · {sel.risk} risk — bucket payouts</strong>
          <label className="check">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Keep symmetric
          </label>
        </div>
        <div className="bucket-grid" style={{ '--n': sel.rows + 1 }}>
          {table.map((v, i) => (
            <label key={i} className="bucket">
              <input type="number" step="any" value={v} onChange={(e) => setBucket(i, e.target.value)} aria-label={`Bucket ${i + 1} payout`} />
              <small>{fmtChance(bucketChance(sel.rows, i))}</small>
            </label>
          ))}
        </div>
        <p className="field-hint">Payout multipliers, left to right. The small number is how often the ball lands in that bucket.</p>
      </div>

      {anyLoss && (
        <div className="alert alert-error"><Icon name="alert" size={15} /> A board returns more than 100%. The house loses money on it over time.</div>
      )}

      <FormSaveBar f={f} />
    </section>
  )
}
