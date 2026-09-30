import { useEffect, useState } from 'react'
import { api, dateTime, money } from '../api'
import { Icon } from '../Icons'
import AviatorSettings from './settings/AviatorSettings'
import WingoSettings from './settings/WingoSettings'
import MinesSettings from './settings/MinesSettings'
import TowerSettings from './settings/TowerSettings'
import PlinkoSettings from './settings/PlinkoSettings'
import DiceSettings from './settings/DiceSettings'
import WheelSettings from './settings/WheelSettings'
import SpinSettings from './settings/SpinSettings'
import PokerSettings from './settings/PokerSettings'
import PlatformSettings from './settings/PlatformSettings'


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
  lockSeconds: 'Betting lock', fee: 'Service fee',
  'payouts.size': 'Big / Small payout', 'payouts.color': 'Green / Red payout', 'payouts.colorSplit': 'Green / Red on 5 / 0 payout',
  'payouts.violet': 'Violet payout', 'payouts.number': 'Number payout',
  signupBonus: 'Sign-up bonus', bonusPopup: 'Welcome pop-up', bonusTitle: 'Pop-up title', bonusMessage: 'Pop-up message', minPlayBalance: 'Min balance to play',
  smallBlind: 'Small blind', bigBlind: 'Big blind', minBuyIn: 'Min buy-in', maxBuyIn: 'Max buy-in', rake: 'Rake %', rakeCap: 'Rake cap',
  cost: 'Price per spin', bots: 'Opponents', botSkill: 'Bot skill', botAggression: 'Bot aggression', botBluff: 'Bot bluffing', turnSeconds: 'Time to act',
}

function fieldLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  let m = key.match(/^weights\.(\d)$/)
  if (m) return `Chance of ${m[1]}`
  m = key.match(/^rooms\.(\w+)$/)
  if (m) return `Room ${m[1]}`
  m = key.match(/^tables\.(\d+)\.(\w+)\.(\d+)$/)
  if (m) return `${m[1]}-row ${m[2]} bucket ${Number(m[3]) + 1}`
  m = key.match(/^custom\.(\d+)\.(\d+)$/)
  if (m) return `${m[1]} mines, gem ${Number(m[2]) + 1} payout`
  m = key.match(/^custom\.([a-z]+)\.(\d+)$/)
  if (m) return `${m[1]} level ${Number(m[2]) + 1} payout`
  m = key.match(/^curve\.(\d+)\.(mult|chance)$/)
  if (m) return `Odds point ${Number(m[1]) + 1} ${m[2] === 'mult' ? 'multiplier' : 'chance'}`
  m = key.match(/^prizes\.(\d+)\.(amount|chance)$/)
  if (m) return `Prize ${Number(m[1]) + 1} ${m[2]}`
  m = key.match(/^risks\.(\w+)\.(\d+)\.(mult|count)$/)
  if (m) return `${m[1]} wheel group ${Number(m[2]) + 1} ${m[3] === 'mult' ? 'payout' : 'segments'}`
  return key
}
const fmt = (key, v) => (key === 'enabled' ? (v ? 'Live' : 'Paused') : key === 'bonusPopup' ? (v ? 'Shown' : 'Hidden') : key.startsWith('rooms.') ? (v ? 'Open' : 'Closed') : String(v))

function changes(before, after) {
  const b = Object.fromEntries(flatten(before))
  const a = Object.fromEntries(flatten(after))
  const list = flatten(after)
    .filter(([k, v]) => b[k] !== v)
    .map(([k, v]) => `${fieldLabel(k)}: ${b[k] === undefined ? '—' : fmt(k, b[k])} → ${fmt(k, v)}`)
  // Wheel groups removed / custom payouts switched back to the formula
  for (const [k, v] of flatten(before)) {
    if (!(k in a) && (k.startsWith('risks.') || k.startsWith('prizes.') || k.startsWith('custom.') || k.startsWith('curve.'))) list.push(`${fieldLabel(k)}: ${fmt(k, v)} → ${k.startsWith('custom.') ? 'formula' : 'removed'}`)
  }
  return list
}

// ── Page ─────────────────────────────────────────────────────
const GAMES = [
  { key: 'platform', label: 'Bonus & limits', icon: 'gift', Card: PlatformSettings, site: true },
  { key: 'aviator', label: 'Aviator', icon: 'plane', Card: AviatorSettings },
  { key: 'wingo', label: 'Win Go', icon: 'clock', Card: WingoSettings },
  { key: 'mines', label: 'Mines', icon: 'bomb', Card: MinesSettings },
  { key: 'tower', label: 'Tower', icon: 'layers', Card: TowerSettings },
  { key: 'plinko', label: 'Plinko', icon: 'pyramid', Card: PlinkoSettings },
  { key: 'dice', label: 'Dice', icon: 'dices', Card: DiceSettings },
  { key: 'wheel', label: 'Wheel', icon: 'wheel', Card: WheelSettings },
  { key: 'spin', label: 'Lucky Spin', icon: 'coins', Card: SpinSettings },
  { key: 'poker', label: 'Poker', icon: 'club', Card: PokerSettings },
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

  const { Card, site } = GAMES.find((g) => g.key === game)
  const log = data.log.filter((l) => l.game === game)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Game settings</h1>
          <p>Odds, payouts, limits and the on/off switch for each game, plus the sign-up bonus and minimum balance to play under <strong>Bonus &amp; limits</strong>.</p>
        </div>
      </header>

      <div className="game-tabs" role="tablist">
        {GAMES.map((g) => (
          <button type="button" role="tab" aria-selected={game === g.key} key={g.key} className={game === g.key ? 'is-active' : ''} onClick={() => setGame(g.key)}>
            <Icon name={g.icon} size={16} />
            {g.label}
            {!g.site && <i className={`status-dot ${data.settings[g.key]?.enabled ? 'is-on' : ''}`} title={data.settings[g.key]?.enabled ? 'Live' : 'Paused'} />}
          </button>
        ))}
      </div>

      <GameStats s={data.stats?.[game]} />

      {!site && <div className="note">
        <Icon name="info" size={16} />
        <span>
          Changes apply from the <strong>next</strong> round, never to one already in progress, and every placed bet keeps
          the payout it was placed at. Results stay random within the odds you set.
        </span>
      </div>}

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
