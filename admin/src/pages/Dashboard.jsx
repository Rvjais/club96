import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateTime, money, signedMoney } from '../api'
import { Icon } from '../Icons'

const GAME_NAMES = {
  aviator: 'Aviator', wingo: 'Win Go', color: 'Color Prediction', mines: 'Mines', tower: 'Tower',
  plinko: 'Plinko', dice: 'Dice', wheel: 'Wheel', spin: 'Lucky Spin', poker: 'Poker',
}
const GAME_OPTIONS = ['aviator', 'wingo', 'mines', 'tower', 'plinko', 'dice', 'wheel', 'spin', 'poker']

// ── Date ranges (India time) ─────────────────────────────────
const IST_MS = 5.5 * 60 * 60 * 1000
const istDay = (offsetDays = 0) => new Date(Date.now() + IST_MS + offsetDays * 86_400_000).toISOString().slice(0, 10)
const PRESETS = [
  { key: 'today', label: 'Today', range: () => ({ from: istDay(), to: istDay() }) },
  { key: 'yesterday', label: 'Yesterday', range: () => ({ from: istDay(-1), to: istDay(-1) }) },
  { key: '7d', label: '7 days', range: () => ({ from: istDay(-6), to: istDay() }) },
  { key: '30d', label: '30 days', range: () => ({ from: istDay(-29), to: istDay() }) },
  { key: 'month', label: 'This month', range: () => ({ from: `${istDay().slice(0, 8)}01`, to: istDay() }) },
  { key: 'all', label: 'All time', range: () => ({ from: '', to: '' }) },
  { key: 'custom', label: 'Custom' },
]

const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
function rangeText({ from, to }) {
  if (!from && !to) return 'All time'
  if (from === to) return fmtDay(from)
  return `${from ? fmtDay(from) : 'Start'} – ${to ? fmtDay(to) : 'today'}`
}
const bucketLabel = (key, bucket) => (bucket === 'month'
  ? new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  : new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
const compact = (n) => {
  const a = Math.abs(n)
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : String(Math.round(a))
  return `${n < 0 ? '−' : ''}₹${s}`
}
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// ── Pieces ───────────────────────────────────────────────────
function Kpi({ label, value, sub, valueTone, icon }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{icon && <Icon name={icon} size={14} />}{label}</span>
      <strong className={`kpi-value ${valueTone ?? ''}`}>{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  )
}

function PlRow({ label, value, sign, total, hint }) {
  return (
    <div className={`pl-row ${total ? 'is-total' : ''}`}>
      <div>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <strong className={total ? tone(value) : ''}>{value === 0 ? '' : sign}{money(Math.abs(value))}</strong>
    </div>
  )
}

/** Profit per day/month: bars rise for house profit and drop below the zero line for a loss. */
function ProfitChart({ series, bucket }) {
  const [active, setActive] = useState(null)
  const wrapRef = useRef(null)
  if (!series.length) return <div className="empty empty-sm"><Icon name="barChart" size={24} strokeWidth={1.5} /><p>No bets in this period</p></div>

  const W = 640
  const H = 200
  const PAD_T = 12
  const PAD_B = 12
  const max = Math.max(0, ...series.map((d) => d.profit))
  const min = Math.min(0, ...series.map((d) => d.profit))
  const span = max - min || 1
  const y = (v) => PAD_T + ((max - v) / span) * (H - PAD_T - PAD_B)
  const zero = y(0)
  const step = W / series.length
  const barW = Math.max(2, Math.min(28, step - 2)) // 2px gap between bars
  const r = Math.min(4, barW / 2)

  // Rounded only at the data end; flat on the zero line
  const barPath = (x, v) => {
    const top = y(Math.max(v, 0))
    const bottom = y(Math.min(v, 0))
    const h = Math.max(1, bottom - top)
    const rr = Math.min(r, h)
    if (v >= 0) return `M${x},${bottom}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + barW - rr}Q${x + barW},${top} ${x + barW},${top + rr}V${bottom}Z`
    return `M${x},${top}V${bottom - rr}Q${x},${bottom} ${x + rr},${bottom}H${x + barW - rr}Q${x + barW},${bottom} ${x + barW},${bottom - rr}V${top}Z`
  }

  const tickIdx = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
  const a = active != null ? series[active] : null

  return (
    <div className="chart" ref={wrapRef} onPointerLeave={() => setActive(null)}>
      <div className="chart-scale">
        <span>{compact(max)}</span>
        {min < 0 && <span>{compact(min)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg" role="img" aria-label="House profit per period">
        <line x1="0" x2={W} y1={zero} y2={zero} className="chart-zero" />
        {series.map((d, i) => {
          const x = i * step + (step - barW) / 2
          return (
            <g key={d.key}>
              <path d={barPath(x, d.profit)} className={`chart-bar ${d.profit < 0 ? 'is-neg' : 'is-pos'} ${active === i ? 'is-active' : ''}`} />
              <rect
                x={i * step}
                y="0"
                width={step}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={`${bucketLabel(d.key, bucket)}: ${d.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(d.profit))}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          )
        })}
      </svg>
      <div className="chart-axis">
        {tickIdx.map((i) => (
          <span key={i} style={{ left: `${((i + 0.5) / series.length) * 100}%` }}>{bucketLabel(series[i].key, bucket)}</span>
        ))}
      </div>
      {a && (
        <div className="chart-tip" style={{ left: `${Math.min(85, Math.max(15, ((active + 0.5) / series.length) * 100))}%` }}>
          <strong className={tone(a.profit)}>{a.profit < 0 ? '−' : ''}{money(Math.abs(a.profit))}</strong>
          <span>{a.profit >= 0 ? 'House profit' : 'House loss'} · {bucketLabel(a.key, bucket)}</span>
          <span>Bets {money(a.wagered)} · Paid {money(a.paid)}</span>
          <span>Deposits {money(a.deposits)}</span>
        </div>
      )}
    </div>
  )
}

function PlayerList({ rows, empty }) {
  if (!rows.length) return <p className="muted small dash-empty">{empty}</p>
  return (
    <div className="dash-list">
      {rows.map((p, i) => (
        <Link key={p.id} to={`/users/${p.id}`} className="dash-item">
          <span className="dash-rank">{i + 1}</span>
          <div className="dash-item-main">
            <strong>{p.name ?? 'Unknown'} {p.status === 'deleted' && <span className="badge badge-deleted">deleted</span>}</strong>
            <span className="mono">UID {p.uid ?? '—'} · bet {money(p.wagered)}</span>
          </div>
          <strong className={`dash-item-amt ${tone(p.net)}`}>{signedMoney(p.net)}</strong>
        </Link>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function Dashboard() {
  const [preset, setPreset] = useState('7d')
  const [range, setRange] = useState(() => PRESETS[2].range())
  const [game, setGame] = useState('')
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: '' })
  const [playersTab, setPlayersTab] = useState('losers')
  const [accountsTab, setAccountsTab] = useState('deleted')
  const [showTable, setShowTable] = useState(false)

  const key = JSON.stringify({ range, game, tick })
  const loading = result.key !== key

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    if (game) params.set('game', game)
    api.get(`/dashboard?${params}`).then(
      (data) => !cancelled && setResult({ key, data, error: '' }),
      (err) => !cancelled && setResult((r) => ({ ...r, key, error: err.message })),
    )
    return () => { cancelled = true }
  }, [key, range, game])

  const pick = (p) => {
    setPreset(p.key)
    if (p.range) setRange(p.range())
  }

  const d = result.data
  const gameName = game ? GAME_NAMES[game] : null

  return (
    <div className="page dash">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{rangeText(range)}{gameName ? ` · ${gameName}` : ''} · India time</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setTick((n) => n + 1)} disabled={loading}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      </header>

      {/* ── Filters ── */}
      <section className="dash-filters">
        <div className="chip-scroll" role="tablist" aria-label="Date range">
          {PRESETS.map((p) => (
            <button type="button" role="tab" aria-selected={preset === p.key} key={p.key} className={`chip ${preset === p.key ? 'is-active' : ''}`} onClick={() => pick(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="dash-filter-row">
          {preset === 'custom' && (
            <div className="date-range">
              <label className="input input-sm">
                <Icon name="calendar" size={14} />
                <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From" />
              </label>
              <span className="muted">to</span>
              <label className="input input-sm">
                <Icon name="calendar" size={14} />
                <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To" />
              </label>
            </div>
          )}
          <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game">
            <option value="">All games</option>
            {GAME_OPTIONS.map((g) => <option key={g} value={g}>{GAME_NAMES[g]}</option>)}
          </select>
        </div>
      </section>

      {result.error && <div className="alert alert-error"><Icon name="alert" size={16} /> {result.error}</div>}
      {!d && loading && <div className="empty"><span className="spinner" /></div>}

      {d && (
        <div className={`dash-body ${loading ? 'is-loading' : ''}`}>
          {/* ── Headline ── */}
          <section className="dash-hero">
            <div className={`dash-hero-main ${d.profit.netProfit < 0 ? 'is-loss' : ''}`}>
              <span>{d.profit.netProfit < 0 ? 'Net loss' : 'Net profit'}</span>
              <strong>{d.profit.netProfit < 0 ? '−' : ''}{money(Math.abs(d.profit.netProfit))}</strong>
              <small>All games, after bonuses, commission and adjustments</small>
            </div>
            <div className="kpis">
              <Kpi
                icon={d.players.combinedNet < 0 ? 'trendingDown' : 'trendingUp'}
                label={d.players.combinedNet < 0 ? 'Players lost (combined)' : 'Players won (combined)'}
                value={money(Math.abs(d.players.combinedNet))}
                valueTone={d.players.combinedNet < 0 ? 'neg' : d.players.combinedNet > 0 ? 'pos' : ''}
                sub={`${d.players.losers} lost ${compact(d.players.lost)} · ${d.players.winners} won ${compact(d.players.won)}`}
              />
              <Kpi icon="coins" label={gameName ? `${gameName} profit` : 'Game profit'} value={signedMoney(-d.players.combinedNet)} valueTone={tone(-d.players.combinedNet)} sub={`${money(d.players.wagered)} bet`} />
              <Kpi icon="wallet" label="Deposits" value={money(d.cash.deposits)} sub={`${d.cash.depositCount} credited`} />
              <Kpi icon="banknote" label="Withdrawals paid" value={money(d.cash.withdrawalsPaid)} sub={`${d.cash.withdrawalCount} paid`} />
              <Kpi icon="activity" label="Cash net (in − out)" value={signedMoney(d.cash.net)} valueTone={tone(d.cash.net)} sub="Deposits minus withdrawals paid" />
              <Kpi icon="users" label="New sign-ups" value={d.users.signups.toLocaleString('en-IN')} sub={`${d.users.recreated} re-registered`} />
              <Kpi icon="trash" label="Accounts deleted" value={d.users.deleted.toLocaleString('en-IN')} sub={`${money(d.profit.forfeited)} forfeited`} />
              <Kpi icon="clock" label="Waiting for you" value={`${d.pending.deposits + d.pending.withdrawals}`} sub={`${d.pending.deposits} deposits · ${d.pending.withdrawals} withdrawals`} />
            </div>
          </section>

          <div className="dash-grid">
            {/* ── Profit & loss ── */}
            <section className="card">
              <h2 className="card-title"><Icon name="receipt" size={16} /> Profit &amp; loss</h2>
              <PlRow label="Players bet" value={d.profit.wagered} sign="+" hint={`${d.profit.bets.toLocaleString('en-IN')} bets, refunds excluded`} />
              <PlRow label="Paid out as winnings" value={d.profit.paid} sign="−" />
              <PlRow label="Game profit" value={d.profit.gameProfit} sign={d.profit.gameProfit < 0 ? '−' : ''} total />
              <PlRow label="Bonuses" value={d.profit.bonuses} sign="−" hint="Sign-up bonus, partner rewards" />
              <PlRow label="Referral commission" value={d.profit.commission} sign="−" hint="Claimed by agents" />
              <PlRow label="Admin adjustments" value={d.profit.adjustments} sign={d.profit.adjustments >= 0 ? '−' : '+'} hint="Manual credits / debits" />
              <PlRow label="Forfeited balances" value={d.profit.forfeited} sign="+" hint="Kept when players deleted their account" />
              <PlRow label={d.profit.netProfit < 0 ? 'Net loss' : 'Net profit'} value={d.profit.netProfit} sign={d.profit.netProfit < 0 ? '−' : ''} total />
              {gameName && <p className="muted small">Profit &amp; loss covers all games; the game filter applies to the chart, players and games sections.</p>}
            </section>

            {/* ── Chart ── */}
            <section className="card">
              <div className="card-title-row">
                <h2 className="card-title"><Icon name="barChart" size={16} /> {gameName ?? 'Game'} profit by {d.range.bucket}</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Chart' : 'Table'}</button>
              </div>
              {showTable ? (
                d.series.length ? (
                  <div className="dash-list">
                    {[...d.series].reverse().map((s) => (
                      <div key={s.key} className="dash-item dash-item-static">
                        <div className="dash-item-main">
                          <strong>{bucketLabel(s.key, d.range.bucket)}</strong>
                          <span>Bet {money(s.wagered)} · Paid {money(s.paid)} · Deposits {money(s.deposits)}</span>
                        </div>
                        <strong className={`dash-item-amt ${tone(s.profit)}`}>{signedMoney(s.profit)}</strong>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted small dash-empty">No bets in this period</p>
              ) : (
                <ProfitChart series={d.series} bucket={d.range.bucket} />
              )}
              <p className="muted small">Bars above the line are house profit, below the line a loss. Tap a bar for details.</p>
            </section>

            {/* ── Players ── */}
            <section className="card">
              <h2 className="card-title"><Icon name="users" size={16} /> Players{gameName ? ` · ${gameName}` : ''}</h2>
              <div className="mini-stats">
                <div><span>Played</span><strong>{d.players.active.toLocaleString('en-IN')}</strong></div>
                <div><span>Lost money</span><strong>{d.players.losers.toLocaleString('en-IN')}</strong></div>
                <div><span>Total they lost</span><strong className="neg">{money(d.players.lost)}</strong></div>
                <div><span>Won money</span><strong>{d.players.winners.toLocaleString('en-IN')}</strong></div>
                <div><span>Total they won</span><strong className="pos">{money(d.players.won)}</strong></div>
                <div><span>All players net</span><strong className={tone(d.players.combinedNet)}>{signedMoney(d.players.combinedNet)}</strong></div>
              </div>
              <div className="seg-mini dash-seg">
                <button type="button" className={playersTab === 'losers' ? 'is-active' : ''} onClick={() => setPlayersTab('losers')}>Biggest losers</button>
                <button type="button" className={playersTab === 'winners' ? 'is-active' : ''} onClick={() => setPlayersTab('winners')}>Biggest winners</button>
              </div>
              {playersTab === 'losers'
                ? <PlayerList rows={d.players.topLosers} empty="Nobody lost money in this period" />
                : <PlayerList rows={d.players.topWinners} empty="Nobody won money in this period" />}
            </section>

            {/* ── Games ── */}
            <section className="card">
              <h2 className="card-title"><Icon name="grid" size={16} /> Games</h2>
              {d.games.length === 0 ? <p className="muted small dash-empty">No bets in this period</p> : (
                <div className="dash-games">
                  {d.games.map((g) => (
                    <div key={g.game} className="dash-game">
                      <div className="dash-game-head">
                        <strong>{GAME_NAMES[g.game] ?? g.game}</strong>
                        <strong className={tone(g.profit)}>{signedMoney(g.profit)}</strong>
                      </div>
                      <div className="dash-game-stats">
                        <span>{g.bets.toLocaleString('en-IN')} bets</span>
                        <span>{g.players} players</span>
                        <span>Bet {compact(g.wagered)}</span>
                        <span>Paid {compact(g.paid)}</span>
                        <span>RTP {g.rtp == null ? '—' : `${g.rtp}%`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Money & accounts right now ── */}
            <section className="card">
              <h2 className="card-title"><Icon name="wallet" size={16} /> Right now</h2>
              <div className="mini-stats">
                <div><span>Player balances</span><strong>{money(d.users.balances)}</strong></div>
                <div><span>Unclaimed commission</span><strong>{money(d.users.unclaimedCommission)}</strong></div>
                <div><span>Users</span><strong>{d.users.total.toLocaleString('en-IN')}</strong></div>
                <div><span>Blocked</span><strong>{d.users.blocked.toLocaleString('en-IN')}</strong></div>
                <Link to="/deposits" className="mini-link"><span>Deposits to check</span><strong>{d.pending.deposits} · {money(d.pending.depositTotal)}</strong></Link>
                <Link to="/withdrawals" className="mini-link"><span>Withdrawals to pay</span><strong>{d.pending.withdrawals} · {money(d.pending.withdrawalTotal)}</strong></Link>
              </div>
              <p className="muted small">
                Deposit orders in this period: {d.cash.orders.created} created · {d.cash.orders.approved} approved · {d.cash.orders.rejected} rejected · {d.cash.orders.abandoned} never paid
              </p>
            </section>

            {/* ── Deleted & re-registered ── */}
            <section className="card dash-wide">
              <h2 className="card-title"><Icon name="repeat" size={16} /> Deleted &amp; re-registered accounts</h2>
              <div className="seg-mini dash-seg">
                <button type="button" className={accountsTab === 'deleted' ? 'is-active' : ''} onClick={() => setAccountsTab('deleted')}>Deleted ({d.users.deleted})</button>
                <button type="button" className={accountsTab === 'recreated' ? 'is-active' : ''} onClick={() => setAccountsTab('recreated')}>Re-registered ({d.users.recreated})</button>
              </div>

              {accountsTab === 'deleted' ? (
                d.deletedAccounts.length === 0 ? <p className="muted small dash-empty">No accounts deleted in this period</p> : (
                  <div className="acct-list">
                    {d.deletedAccounts.map((a) => (
                      <div key={a.id} className="acct">
                        <div className="acct-head">
                          <Link to={`/users/${a.id}`}><strong>{a.name}</strong> <span className="mono muted">UID {a.uid ?? '—'}</span></Link>
                          <span className="mono small">{a.phone}</span>
                        </div>
                        <div className="acct-meta">
                          <span>Joined {dateTime(a.createdAt)}</span>
                          <span>Deleted {dateTime(a.deletedAt)}</span>
                          {a.reason && <span>“{a.reason}”</span>}
                        </div>
                        <div className="acct-stats">
                          <div><span>Deposited</span><strong>{money(a.lifetime.deposits)}</strong></div>
                          <div><span>Withdrawn</span><strong>{money(a.lifetime.withdrawn)}</strong></div>
                          <div><span>Game net</span><strong className={tone(a.lifetime.net)}>{signedMoney(a.lifetime.net)}</strong></div>
                          <div><span>Forfeited</span><strong>{money(a.forfeited)}</strong></div>
                        </div>
                        {a.recreatedAs
                          ? <Link to={`/users/${a.recreatedAs.id}`} className="acct-next"><Icon name="repeat" size={14} /> Re-registered as UID {a.recreatedAs.uid ?? '—'} on {dateTime(a.recreatedAs.createdAt)} <Icon name="chevronRight" size={14} /></Link>
                          : <span className="acct-next is-none">Not re-registered</span>}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                d.recreatedAccounts.length === 0 ? <p className="muted small dash-empty">No re-registrations in this period</p> : (
                  <div className="acct-list">
                    {d.recreatedAccounts.map((a) => (
                      <div key={a.id} className="acct">
                        <div className="acct-head">
                          <Link to={`/users/${a.id}`}><strong>{a.name}</strong> <span className="mono muted">UID {a.uid ?? '—'}</span></Link>
                          <span className="mono small">{a.phone}</span>
                        </div>
                        <div className="acct-meta">
                          <span>Signed up again {dateTime(a.createdAt)}</span>
                          <span>Balance now {money(a.balance)}</span>
                        </div>
                        {a.previous.map((o) => (
                          <Link key={o.id} to={`/users/${o.id}`} className="acct-prev">
                            <span className="badge badge-deleted">old</span>
                            <span className="mono">UID {o.uid ?? '—'}</span>
                            <span className="muted">deleted {dateTime(o.deletedAt)} · net {signedMoney(o.lifetime.net)} · forfeited {money(o.forfeited)}</span>
                            <Icon name="chevronRight" size={14} />
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
