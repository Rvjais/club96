import { Icon } from '../../Icons'
import { CardHead, FormSaveBar, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

// Same colours as the player's wheel (client/src/components/LuckySpin.jsx)
const COLORS = ['#e02020', '#ff9800', '#f5b700', '#22a55e', '#1e88e5', '#8e44ad', '#ec4899', '#14b8a6']
const ZERO = '#94a3b8'
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`

function SpinPreview({ prizes }) {
  if (prizes.length < 2) return <div className="wheel-preview is-empty" />
  const seg = 360 / prizes.length
  const stops = prizes.map((p, i) => `${p.amount > 0 ? COLORS[i % COLORS.length] : ZERO} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')
  return <div className="wheel-preview" style={{ background: `conic-gradient(${stops})` }} />
}

export default function SpinSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('spin', saved, defaults, onSaved, 'Saved. Applies to the next spin.')

  const prizes = f.form.prizes
  const nums = prizes.map((p) => ({ amount: toNum(p.amount), chance: toNum(p.chance) }))
  const cost = toNum(f.form.cost)
  const total = Math.round(nums.reduce((t, p) => t + (p.chance || 0), 0) * 100) / 100
  const payout = nums.reduce((t, p) => t + ((p.amount || 0) * (p.chance || 0)) / 100, 0) // average ₹ paid per spin
  const rtp = cost > 0 ? (payout / cost) * 100 : 0
  const ok = Math.abs(total - 100) < 0.001 && nums.every((p) => p.amount >= 0 && p.chance >= 0) && prizes.length >= 2 && cost >= 1

  const update = (fn) => f.setForm((form) => ({ ...form, prizes: fn(form.prizes) }))
  const setPrize = (i, key, v) => update((list) => list.map((p, j) => (j === i ? { ...p, [key]: v } : p)))

  return (
    <section className="card game-card">
      <CardHead icon="wheel" title="Lucky Spin" f={f} />
      <p className="muted">
        The spin wheel in the middle of the players' bottom bar. Each spin costs a fixed price and pays one of the
        prizes below. Every prize takes an equal slice of the wheel, but it comes up as often as its chance says.
        Players never see the chances.
      </p>

      <div className="settings-grid settings-grid-3">
        <NumberField label="Price per spin" prefix="₹" value={f.form.cost} onChange={f.set('cost')} />
      </div>

      <div className="wheel-editor">
        <SpinPreview prizes={nums} />
        <div className="table-wrap">
          <table className="table odds-table">
            <thead><tr><th>Slice</th><th>Prize</th><th>Chance</th><th className="num">Profit per spin</th><th className="num">Adds to RTP</th><th /></tr></thead>
            <tbody>
              {prizes.map((p, i) => {
                const amount = toNum(p.amount) || 0
                const chance = toNum(p.chance) || 0
                return (
                  <tr key={i}>
                    <td><i className="swatch" style={{ background: amount > 0 ? COLORS[i % COLORS.length] : ZERO }} /> {i + 1}</td>
                    <td>
                      <div className="input input-sm">
                        <span className="input-prefix">₹</span>
                        <input type="number" step="any" min="0" value={p.amount} onChange={(e) => setPrize(i, 'amount', e.target.value)} aria-label={`Prize ${i + 1} amount`} />
                      </div>
                    </td>
                    <td>
                      <div className="input input-sm">
                        <input type="number" step="any" min="0" value={p.chance} onChange={(e) => setPrize(i, 'chance', e.target.value)} aria-label={`Prize ${i + 1} chance`} />
                        <span className="input-suffix">%</span>
                      </div>
                    </td>
                    <td className={`num ${cost - amount < 0 ? 'neg' : ''}`}>{cost > 0 ? `${cost - amount < 0 ? '−' : ''}${inr(Math.abs(cost - amount))}` : '—'}</td>
                    <td className="num strong">{cost > 0 ? pct(((amount * chance) / 100 / cost) * 100) : '—'}</td>
                    <td className="num">
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={prizes.length <= 2} onClick={() => update((list) => list.filter((_, j) => j !== i))} aria-label="Remove prize">
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="wheel-foot">
            <button type="button" className="btn btn-ghost btn-sm" disabled={prizes.length >= 12} onClick={() => update((list) => [...list, { amount: '50', chance: '0' }])}>
              <Icon name="plus" size={14} /> Add prize
            </button>
            <span className={`total-line ${ok ? 'is-ok' : 'is-bad'}`}>
              <Icon name={ok ? 'checkCircle' : 'alert'} size={15} />
              Chances total {pct(total)} {Math.abs(total - 100) < 0.001 ? '' : '(must be 100%)'} · returns {pct(rtp)} · avg. payout {cost > 0 ? inr(Math.round(payout * 100) / 100) : '—'} per spin
            </span>
          </div>
        </div>
      </div>

      {rtp > 100 && (
        <div className="alert alert-error"><Icon name="alert" size={15} /> The wheel pays out more than it costs on average. The house loses money on it over time.</div>
      )}

      <FormSaveBar f={f} invalid={!ok} />
    </section>
  )
}
