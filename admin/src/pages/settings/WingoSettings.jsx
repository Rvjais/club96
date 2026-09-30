import { Icon } from '../../Icons'
import { CardHead, FormSaveBar, LimitFields, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const ROOMS = [
  { key: '30s', label: '30 seconds' },
  { key: '1m', label: '1 minute' },
  { key: '3m', label: '3 minutes' },
  { key: '5m', label: '5 minutes' },
]
const PAYOUTS = [
  { key: 'size', label: 'Big / Small', hint: 'Big 5–9, Small 0–4' },
  { key: 'color', label: 'Green / Red', hint: 'Green 1·3·7·9, Red 2·4·6·8' },
  { key: 'colorSplit', label: 'Green / Red on 5 / 0', hint: 'Those numbers are also Violet' },
  { key: 'violet', label: 'Violet', hint: '0 or 5' },
  { key: 'number', label: 'Exact number', hint: 'Any single digit' },
]

// Same rules as the server (server/src/games/wingo.js)
const colorsOf = (n) => (n === 0 ? ['red', 'violet'] : n === 5 ? ['green', 'violet'] : n % 2 ? ['green'] : ['red'])
function payoutFor(pick, n, p) {
  if (pick === 'big' || pick === 'small') return (n >= 5 ? 'big' : 'small') === pick ? p.size : 0
  if (pick === 'violet') return n === 0 || n === 5 ? p.violet : 0
  if (pick === 'green' || pick === 'red') {
    if (!colorsOf(n).includes(pick)) return 0
    return n === 0 || n === 5 ? p.colorSplit : p.color
  }
  return Number(pick) === n ? p.number : 0
}

const BET_TYPES = [
  { pick: 'big', label: 'Big' },
  { pick: 'small', label: 'Small' },
  { pick: 'green', label: 'Green' },
  { pick: 'red', label: 'Red' },
  { pick: 'violet', label: 'Violet' },
]

export default function WingoSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('wingo', saved, defaults, onSaved, 'Saved. Chances apply from the next period; payouts, fee and limits apply to new bets now.')
  const weights = f.form.weights.map(toNum)
  const payouts = Object.fromEntries(PAYOUTS.map((p) => [p.key, toNum(f.form.payouts[p.key])]))
  const fee = toNum(f.form.fee)
  const total = weights.reduce((t, w) => t + (w || 0), 0)
  const totalOk = Math.abs(total - 100) < 0.001
  const valid = totalOk && !Number.isNaN(fee) && Object.values(payouts).every((v) => !Number.isNaN(v))

  // Return to player for a pick: Σ chance(n) × payout × (1 − fee)
  const rtp = (pick) => (valid ? weights.reduce((t, w, n) => t + (w / 100) * payoutFor(pick, n, payouts), 0) * (100 - fee) : NaN)
  const numberRtps = Array.from({ length: 10 }, (_, n) => rtp(String(n)))
  const rows = [
    ...BET_TYPES.map((b) => ({ label: b.label, value: rtp(b.pick) })),
    { label: 'Numbers', value: Math.max(...numberRtps), range: [Math.min(...numberRtps), Math.max(...numberRtps)] },
  ]
  const losing = rows.some((r) => r.value > 100)

  const setWeight = (i, v) => f.setForm((form) => ({ ...form, weights: form.weights.map((w, j) => (j === i ? v : w)) }))
  const setPayout = (key) => (v) => f.setForm((form) => ({ ...form, payouts: { ...form.payouts, [key]: v } }))
  const setRoom = (key, on) => f.setForm((form) => ({ ...form, rooms: { ...form.rooms, [key]: on } }))

  return (
    <section className="card game-card">
      <CardHead icon="clock" title="Win Go" f={f} />

      <div>
        <div className="sub-head"><strong>Rooms</strong><span className="muted">Round lengths players can join</span></div>
        <div className="chip-row">
          {ROOMS.map((r) => (
            <button type="button" key={r.key} className={`chip chip-toggle ${f.form.rooms[r.key] ? 'is-on' : ''}`} onClick={() => setRoom(r.key, !f.form.rooms[r.key])}>
              <Icon name={f.form.rooms[r.key] ? 'checkCircle' : 'ban'} size={14} /> Win Go {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-grid">
        <NumberField label="Betting lock" suffix="sec" step="1" value={f.form.lockSeconds} onChange={f.set('lockSeconds')} hint="Bets close this long before each draw (1–15)" />
        <NumberField label="Service fee" suffix="%" value={f.form.fee} onChange={f.set('fee')} hint="Taken from every stake before payouts" />
        <LimitFields f={f} />
      </div>

      <div>
        <div className="sub-head">
          <strong>Payouts</strong>
          <span className="muted">Multiplier on the stake after the service fee</span>
        </div>
        <div className="settings-grid">
          {PAYOUTS.map((p) => (
            <NumberField key={p.key} label={p.label} suffix="x" value={f.form.payouts[p.key]} onChange={setPayout(p.key)} hint={p.hint} />
          ))}
        </div>
      </div>

      <div>
        <div className="sub-head">
          <strong>Number chances</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => f.setForm((form) => ({ ...form, weights: Array(10).fill('10') }))}>
            <Icon name="refresh" size={13} /> Equal (10% each)
          </button>
        </div>
        <div className="digit-grid">
          {f.form.weights.map((w, n) => (
            <label key={n} className="digit-cell">
              <span className={`digit-ball digit-${colorsOf(n).join('-')}`}>{n}</span>
              <div className="ladder-input">
                <input type="number" step="any" value={w} onChange={(e) => setWeight(n, e.target.value)} aria-label={`Chance of ${n}`} />
                <em>%</em>
              </div>
              <small>{n >= 5 ? 'Big' : 'Small'} · {colorsOf(n).join(' + ')}</small>
            </label>
          ))}
        </div>
        <div className={`total-line ${totalOk ? 'is-ok' : 'is-bad'}`}>
          <Icon name={totalOk ? 'checkCircle' : 'alert'} size={15} />
          Chances total {pct(total)} {totalOk ? '' : '(must be exactly 100%)'}
        </div>
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Service fee</span>
          <strong>{Number.isNaN(fee) ? '—' : pct(fee)}</strong>
          <small>₹100 bet → {Number.isNaN(fee) ? '—' : `₹${(100 - fee).toLocaleString('en-IN')}`} in play</small>
        </div>
        <div className="preview-table preview-table-7">
          <span className="preview-caption">Return to player by bet</span>
          {rows.map((r) => (
            <div key={r.label} className={r.value > 100 ? 'is-bad' : ''}>
              <span>{r.label}</span>
              <strong>{Number.isNaN(r.value) ? '—' : r.range && Math.abs(r.range[0] - r.range[1]) > 0.005 ? `${pct(r.range[0])}–${pct(r.range[1])}` : pct(r.value)}</strong>
            </div>
          ))}
        </div>
      </div>

      {losing && (
        <div className="alert alert-error"><Icon name="alert" size={15} /> A bet type returns more than 100% — the house loses money on it over time.</div>
      )}

      <FormSaveBar f={f} invalid={!totalOk} />
    </section>
  )
}
