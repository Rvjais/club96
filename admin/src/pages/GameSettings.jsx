import { useEffect, useState } from 'react'
import { api, dateTime, money } from '../api'
import { Icon } from '../Icons'
import { NumberField, SaveBar, Toggle } from './settings/controls'
import { pct, toForm, toNum } from './settings/settingsForm'
import MinesSettings from './settings/MinesSettings'
import TowerSettings from './settings/TowerSettings'
import PlinkoSettings from './settings/PlinkoSettings'
import DiceSettings from './settings/DiceSettings'
import WheelSettings from './settings/WheelSettings'

const COLORS = [
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'violet', label: 'Violet' },
]

// ── Aviator ──────────────────────────────────────────────────
function AviatorCard({ saved, defaults, onSaved }) {
  const [form, setForm] = useState(() => toForm(saved))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null) }
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved))

  const edge = toNum(form.houseEdge)
  const instant = toNum(form.instantCrash)
  const maxMult = toNum(form.maxMultiplier)
  // P(round reaches x) = min(1 − instant, (100 − edge) / (100·x)), and 0 above the cap
  const reach = (x) => {
    if ([edge, instant, maxMult].some(Number.isNaN) || x > maxMult) return 0
    return Math.min(100 - instant, (100 - edge) / x)
  }

  const save = async () => {
    setBusy(true)
    try {
      const body = { enabled: form.enabled, houseEdge: edge, instantCrash: instant, maxMultiplier: maxMult, minBet: toNum(form.minBet), maxBet: toNum(form.maxBet) }
      const res = await api.post('/settings/aviator', body)
      onSaved('aviator', res)
      setMsg({ kind: 'success', text: 'Saved. Odds apply from the next round; limits apply now.' })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
    setBusy(false)
  }

  return (
    <section className="card game-card">
      <div className="game-card-head">
        <h2 className="card-title"><Icon name="plane" size={16} /> Aviator</h2>
        <Toggle enabled={form.enabled} onChange={set('enabled')} />
      </div>

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={form.houseEdge} onChange={set('houseEdge')} hint="Share of every stake the house keeps on average" />
        <NumberField label="Instant crash chance" suffix="%" value={form.instantCrash} onChange={set('instantCrash')} hint="Rounds that end at 1.00x" />
        <NumberField label="Max multiplier" suffix="x" value={form.maxMultiplier} onChange={set('maxMultiplier')} />
        <NumberField label="Minimum bet" prefix="₹" value={form.minBet} onChange={set('minBet')} />
        <NumberField label="Maximum bet" prefix="₹" value={form.maxBet} onChange={set('maxBet')} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Return to player</span>
          <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
          <small>House keeps {Number.isNaN(edge) ? '—' : pct(edge)} of stakes</small>
        </div>
        <div className="preview-table">
          <span className="preview-caption">Chance a round reaches…</span>
          {[1.5, 2, 5, 10, 100].map((x) => (
            <div key={x}><span>{x}x</span><strong>{pct(reach(x))}</strong></div>
          ))}
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        msg={msg}
        onSave={save}
        onReset={() => { setForm(toForm(saved)); setMsg(null) }}
        onDefaults={() => { setForm(toForm(defaults)); setMsg(null) }}
      />
    </section>
  )
}

// ── Color Prediction ─────────────────────────────────────────
function ColorCard({ saved, defaults, onSaved }) {
  const [form, setForm] = useState(() => toForm(saved))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved))
  const setTop = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null) }
  const setNested = (group, color) => (v) => {
    setForm((f) => ({ ...f, [group]: { ...f[group], [color]: v } }))
    setMsg(null)
  }

  const chance = (c) => toNum(form.weights[c])
  const mult = (c) => toNum(form.multipliers[c])
  const total = COLORS.reduce((t, c) => t + (chance(c.key) || 0), 0)
  const totalOk = Math.abs(total - 100) < 0.001

  const save = async () => {
    setBusy(true)
    try {
      const body = {
        enabled: form.enabled,
        weights: Object.fromEntries(COLORS.map((c) => [c.key, chance(c.key)])),
        multipliers: Object.fromEntries(COLORS.map((c) => [c.key, mult(c.key)])),
        minBet: toNum(form.minBet),
        maxBet: toNum(form.maxBet),
      }
      const res = await api.post('/settings/color', body)
      onSaved('color', res)
      setMsg({ kind: 'success', text: 'Saved. Chances apply from the next period; payouts and limits apply now.' })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
    setBusy(false)
  }

  return (
    <section className="card game-card">
      <div className="game-card-head">
        <h2 className="card-title"><Icon name="palette" size={16} /> Color Prediction</h2>
        <Toggle enabled={form.enabled} onChange={setTop('enabled')} />
      </div>

      <div className="table-wrap">
        <table className="table odds-table">
          <thead>
            <tr><th>Colour</th><th>Chance</th><th>Payout</th><th className="num">Return to player</th><th className="num">House edge</th></tr>
          </thead>
          <tbody>
            {COLORS.map((c) => {
              const rtp = (chance(c.key) || 0) * (mult(c.key) || 0)
              return (
                <tr key={c.key}>
                  <td className="nowrap"><span className={`swatch swatch-${c.key}`} /> {c.label}</td>
                  <td>
                    <div className="input input-sm">
                      <input type="number" step="any" value={form.weights[c.key]} onChange={(e) => setNested('weights', c.key)(e.target.value)} aria-label={`${c.label} chance`} />
                      <span className="input-suffix">%</span>
                    </div>
                  </td>
                  <td>
                    <div className="input input-sm">
                      <input type="number" step="any" value={form.multipliers[c.key]} onChange={(e) => setNested('multipliers', c.key)(e.target.value)} aria-label={`${c.label} payout`} />
                      <span className="input-suffix">x</span>
                    </div>
                  </td>
                  <td className="num strong">{pct(rtp)}</td>
                  <td className={`num strong ${rtp > 100 ? 'neg' : ''}`}>{pct(100 - rtp)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className={`total-line ${totalOk ? 'is-ok' : 'is-bad'}`}>
        <Icon name={totalOk ? 'checkCircle' : 'alert'} size={15} />
        Chances total {pct(total)} {totalOk ? '' : '(must be exactly 100%)'}
      </div>
      {COLORS.some((c) => (chance(c.key) || 0) * (mult(c.key) || 0) > 100) && (
        <div className="alert alert-error"><Icon name="alert" size={15} /> A colour pays out more than it takes in on average. The house loses money on it.</div>
      )}

      <div className="settings-grid settings-grid-2">
        <NumberField label="Minimum bet" prefix="₹" value={form.minBet} onChange={setTop('minBet')} />
        <NumberField label="Maximum bet" prefix="₹" value={form.maxBet} onChange={setTop('maxBet')} />
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        msg={msg}
        invalid={!totalOk}
        onSave={save}
        onReset={() => { setForm(toForm(saved)); setMsg(null) }}
        onDefaults={() => { setForm(toForm(defaults)); setMsg(null) }}
      />
    </section>
  )
}

// ── Change log ───────────────────────────────────────────────
function flatten(obj, prefix = '') {
  return Object.entries(obj ?? {}).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  )
}

const FIELD_LABELS = {
  enabled: 'Status', houseEdge: 'House edge', instantCrash: 'Instant crash', maxMultiplier: 'Max multiplier',
  minBet: 'Min bet', maxBet: 'Max bet', maxWin: 'Max win',
  minMines: 'Fewest mines', maxMines: 'Most mines', levels: 'Tower height', minChance: 'Lowest chance', maxChance: 'Highest chance',
  'weights.red': 'Red chance', 'weights.green': 'Green chance', 'weights.violet': 'Violet chance',
  'multipliers.red': 'Red payout', 'multipliers.green': 'Green payout', 'multipliers.violet': 'Violet payout',
}

function fieldLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  let m = key.match(/^tables\.(\d+)\.(\w+)\.(\d+)$/)
  if (m) return `${m[1]}-row ${m[2]} bucket ${Number(m[3]) + 1}`
  m = key.match(/^custom\.(\d+)\.(\d+)$/)
  if (m) return `${m[1]} mines, gem ${Number(m[2]) + 1} payout`
  m = key.match(/^custom\.([a-z]+)\.(\d+)$/)
  if (m) return `${m[1]} level ${Number(m[2]) + 1} payout`
  m = key.match(/^risks\.(\w+)\.(\d+)\.(mult|count)$/)
  if (m) return `${m[1]} wheel group ${Number(m[2]) + 1} ${m[3] === 'mult' ? 'payout' : 'segments'}`
  return key
}
const fmt = (key, v) => (key === 'enabled' ? (v ? 'Live' : 'Paused') : String(v))

function changes(before, after) {
  const b = Object.fromEntries(flatten(before))
  const a = Object.fromEntries(flatten(after))
  const list = flatten(after)
    .filter(([k, v]) => b[k] !== v)
    .map(([k, v]) => `${fieldLabel(k)}: ${b[k] === undefined ? '—' : fmt(k, b[k])} → ${fmt(k, v)}`)
  // Wheel groups removed / custom payouts switched back to the formula
  for (const [k, v] of flatten(before)) {
    if (!(k in a) && (k.startsWith('risks.') || k.startsWith('custom.'))) list.push(`${fieldLabel(k)}: ${fmt(k, v)} → ${k.startsWith('custom.') ? 'formula' : 'removed'}`)
  }
  return list
}

// ── Page ─────────────────────────────────────────────────────
const GAMES = [
  { key: 'aviator', label: 'Aviator', icon: 'plane', Card: AviatorCard },
  { key: 'color', label: 'Color Prediction', icon: 'palette', Card: ColorCard },
  { key: 'mines', label: 'Mines', icon: 'bomb', Card: MinesSettings },
  { key: 'tower', label: 'Tower', icon: 'layers', Card: TowerSettings },
  { key: 'plinko', label: 'Plinko', icon: 'pyramid', Card: PlinkoSettings },
  { key: 'dice', label: 'Dice', icon: 'dices', Card: DiceSettings },
  { key: 'wheel', label: 'Wheel', icon: 'wheel', Card: WheelSettings },
]
const GAME_NAMES = Object.fromEntries(GAMES.map((g) => [g.key, g.label]))

function GameStats({ s }) {
  if (!s) return null
  return (
    <div className="game-stats">
      <div><span>Bets (24h)</span><strong>{s.bets.toLocaleString('en-IN')}</strong></div>
      <div><span>Wagered (24h)</span><strong>{money(s.wagered)}</strong></div>
      <div><span>Paid out (24h)</span><strong>{money(s.paid)}</strong></div>
      <div>
        <span>House profit (24h)</span>
        <strong className={s.profit >= 0 ? 'pos' : 'neg'}>{s.profit < 0 ? '−' : ''}{money(Math.abs(s.profit))}</strong>
      </div>
    </div>
  )
}

export default function GameSettings() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [game, setGame] = useState('aviator')
  const [version, setVersion] = useState(0) // remount forms after a save

  useEffect(() => {
    let cancelled = false
    api.get('/settings').then((d) => !cancelled && setData(d), (e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [])

  const onSaved = (key, res) => {
    setData((d) => ({ ...d, settings: { ...d.settings, [key]: res.settings }, log: res.log }))
    setVersion((v) => v + 1)
  }

  if (error) return <div className="page"><div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div></div>
  if (!data) return <div className="page"><div className="empty"><span className="spinner" /></div></div>

  const { Card } = GAMES.find((g) => g.key === game)
  const log = data.log.filter((l) => l.game === game)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Game settings</h1>
          <p>Odds, payouts, limits and the on/off switch for each game. Players see the current odds inside the game.</p>
        </div>
      </header>

      <div className="game-tabs" role="tablist">
        {GAMES.map((g) => (
          <button type="button" role="tab" aria-selected={game === g.key} key={g.key} className={game === g.key ? 'is-active' : ''} onClick={() => setGame(g.key)}>
            <Icon name={g.icon} size={16} />
            {g.label}
            <i className={`status-dot ${data.settings[g.key]?.enabled ? 'is-on' : ''}`} title={data.settings[g.key]?.enabled ? 'Live' : 'Paused'} />
          </button>
        ))}
      </div>

      <GameStats s={data.stats?.[game]} />

      <div className="note">
        <Icon name="info" size={16} />
        <span>
          Changes apply from the <strong>next</strong> round, never to one already in progress, and every placed bet keeps
          the payout it was placed at. Results stay random within the odds you set.
        </span>
      </div>

      <Card key={`${game}${version}`} saved={data.settings[game]} defaults={data.defaults[game]} onSaved={onSaved} />

      <section className="card">
        <h2 className="card-title"><Icon name="history" size={16} /> {GAME_NAMES[game]} change history</h2>
        {log.length === 0 ? (
          <div className="empty empty-sm"><Icon name="inbox" size={24} strokeWidth={1.5} /><p>No changes yet</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Time</th><th>Admin</th><th>Changes</th></tr></thead>
              <tbody>
                {log.map((l) => {
                  const list = changes(l.before, l.after)
                  return (
                    <tr key={l.id}>
                      <td className="nowrap">{dateTime(l.time)}</td>
                      <td><strong>{l.admin}</strong></td>
                      <td>{list.length ? <ul className="change-list">{list.map((c) => <li key={c}>{c}</li>)}</ul> : <span className="muted">No changes</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
