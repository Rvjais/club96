import { useState } from 'react'
import { Icon } from '../../Icons'
import { CardHead, FormSaveBar, LimitFields } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const RISKS = ['low', 'medium', 'high']
const PALETTE = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#eab308']
const ZERO = '#334155'

// Same spreading as the server (server/src/games/wheel.js)
function layoutOf(groups) {
  const total = groups.reduce((t, g) => t + g.count, 0)
  const placed = groups.map(() => 0)
  const out = []
  for (let i = 0; i < total; i++) {
    let best = -1
    let bestScore = -Infinity
    groups.forEach((g, gi) => {
      if (placed[gi] >= g.count) return
      const score = (g.count * (i + 1)) / total - placed[gi]
      if (score > bestScore + 1e-9) {
        best = gi
        bestScore = score
      }
    })
    placed[best]++
    out.push(groups[best].mult)
  }
  return out
}

function WheelPreview({ groups }) {
  const valid = groups.filter((g) => g.count >= 1 && g.count <= 60 && g.mult >= 0)
  const layout = valid.length ? layoutOf(valid) : []
  if (layout.length < 2 || layout.length > 60) return <div className="wheel-preview is-empty" />
  const paying = [...new Set(layout.filter((m) => m > 0))].sort((a, b) => a - b)
  const color = (m) => (m > 0 ? PALETTE[paying.indexOf(m) % PALETTE.length] : ZERO)
  const seg = 360 / layout.length
  const stops = layout.map((m, i) => `${color(m)} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')
  return <div className="wheel-preview" style={{ background: `conic-gradient(${stops})` }} />
}

export default function WheelSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('wheel', saved, defaults, onSaved, 'Saved. Applies to the next spin.')
  const [risk, setRisk] = useState('medium')

  const numeric = (list) => list.map((g) => ({ mult: toNum(g.mult), count: Math.round(toNum(g.count)) }))
  const stats = Object.fromEntries(RISKS.map((r) => {
    const groups = numeric(f.form.risks[r])
    const total = groups.reduce((t, g) => t + (g.count || 0), 0)
    const rtp = total ? (groups.reduce((t, g) => t + (g.mult || 0) * (g.count || 0), 0) / total) * 100 : 0
    return [r, { total, rtp, ok: total >= 2 && total <= 60 && groups.every((g) => g.count >= 1 && g.mult >= 0) }]
  }))
  const groups = f.form.risks[risk]
  const st = stats[risk]

  const update = (fn) => f.setForm((form) => ({ ...form, risks: { ...form.risks, [risk]: fn(form.risks[risk]) } }))
  const setGroup = (i, key, v) => update((list) => list.map((g, j) => (j === i ? { ...g, [key]: v } : g)))

  return (
    <section className="card game-card">
      <CardHead icon="wheel" title="Wheel" f={f} />

      <div className="settings-grid settings-grid-3">
        <LimitFields f={f} />
      </div>

      <div className="tabs tabs-plain">
        {RISKS.map((r) => (
          <button type="button" key={r} className={risk === r ? 'is-active' : ''} onClick={() => setRisk(r)}>
            <span className="cap">{r}</span> risk <em className={stats[r].rtp > 100 ? 'neg' : ''}>{pct(stats[r].rtp)}</em>
          </button>
        ))}
      </div>

      <div className="wheel-editor">
        <WheelPreview groups={numeric(groups)} />
        <div className="table-wrap">
          <table className="table odds-table">
            <thead><tr><th>Payout</th><th>Segments</th><th className="num">Chance</th><th className="num">Adds to RTP</th><th /></tr></thead>
            <tbody>
              {groups.map((g, i) => {
                const mult = toNum(g.mult) || 0
                const count = Math.round(toNum(g.count)) || 0
                return (
                  <tr key={i}>
                    <td>
                      <div className="input input-sm">
                        <input type="number" step="any" value={g.mult} onChange={(e) => setGroup(i, 'mult', e.target.value)} aria-label="Payout" />
                        <span className="input-suffix">x</span>
                      </div>
                    </td>
                    <td>
                      <div className="input input-sm">
                        <input type="number" step="1" value={g.count} onChange={(e) => setGroup(i, 'count', e.target.value)} aria-label="Segments" />
                      </div>
                    </td>
                    <td className="num">{st.total ? pct((count / st.total) * 100) : '—'}</td>
                    <td className="num strong">{st.total ? pct(((mult * count) / st.total) * 100) : '—'}</td>
                    <td className="num">
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={groups.length <= 1} onClick={() => update((list) => list.filter((_, j) => j !== i))} aria-label="Remove group">
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="wheel-foot">
            <button type="button" className="btn btn-ghost btn-sm" disabled={groups.length >= 10} onClick={() => update((list) => [...list, { mult: '2', count: '1' }])}>
              <Icon name="plus" size={14} /> Add payout
            </button>
            <span className={`total-line ${st.ok ? 'is-ok' : 'is-bad'}`}>
              <Icon name={st.ok ? 'checkCircle' : 'alert'} size={15} />
              {st.total} segments {st.ok ? '' : '(need 2–60)'} · returns {pct(st.rtp)}
            </span>
          </div>
        </div>
      </div>

      {RISKS.some((r) => stats[r].rtp > 100) && (
        <div className="alert alert-error"><Icon name="alert" size={15} /> A wheel returns more than 100%. The house loses money on it over time.</div>
      )}

      <FormSaveBar f={f} invalid={RISKS.some((r) => !stats[r].ok)} />
    </section>
  )
}
