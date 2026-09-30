import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, dateTime, money, signedMoney, timeAgo } from '../api'
import { Icon } from '../Icons'

const TX_LABELS = { bonus: 'Signup bonus', deposit: 'Deposit', bet: 'Bet', win: 'Win', refund: 'Refund', adjustment: 'Admin adjustment', withdraw: 'Withdrawal', withdraw_refund: 'Withdrawal refund' }
const WD_LABEL = { pending: 'Pending', approved: 'Paid', rejected: 'Rejected' }
const GAME_LABELS = { aviator: 'Aviator', wingo: 'Win Go', color: 'Color Prediction', mines: 'Mines', tower: 'Tower', plinko: 'Plinko', dice: 'Dice', wheel: 'Wheel', poker: 'Poker' }
// Games that share the generic bet table (one tab each)
const OTHER_GAMES = [
  { key: 'wingo', icon: 'clock' },
  { key: 'mines', icon: 'bomb' },
  { key: 'tower', icon: 'layers' },
  { key: 'plinko', icon: 'pyramid' },
  { key: 'dice', icon: 'dices' },
  { key: 'wheel', icon: 'wheel' },
  { key: 'poker', icon: 'club' },
]

function CopyButton({ value }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      title="Copy"
      aria-label="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={13} />
    </button>
  )
}

function Row({ label, children, copy }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <div>
        {children}
        {copy && <CopyButton value={copy} />}
      </div>
    </div>
  )
}

function Empty({ text }) {
  return (
    <div className="empty empty-sm">
      <Icon name="inbox" size={24} strokeWidth={1.5} />
      <p>{text}</p>
    </div>
  )
}

function BalanceForm({ userId, onDone }) {
  const [mode, setMode] = useState('credit')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const n = Number(amount)
    if (!n || n <= 0) return setMsg({ kind: 'error', text: 'Enter an amount greater than 0' })
    if (!note.trim()) return setMsg({ kind: 'error', text: 'Add a note explaining the adjustment' })
    setBusy(true)
    setMsg(null)
    try {
      const { balance } = await api.post(`/users/${userId}/balance`, { amount: mode === 'credit' ? n : -n, note })
      setAmount('')
      setNote('')
      setMsg({ kind: 'success', text: `Done. New balance ${money(balance)}` })
      onDone()
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
    setBusy(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={mode === 'credit' ? 'is-active is-green' : ''} onClick={() => setMode('credit')}>
          <Icon name="plus" size={14} /> Add funds
        </button>
        <button type="button" className={mode === 'debit' ? 'is-active is-red' : ''} onClick={() => setMode('debit')}>
          <Icon name="minus" size={14} /> Remove funds
        </button>
      </div>
      <div className="input">
        <span className="input-prefix">₹</span>
        <input type="number" min="0" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
      </div>
      <div className="input">
        <input placeholder="Note (required, e.g. refund for issue #12)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Note" />
      </div>
      {msg && <div className={`alert alert-${msg.kind}`}><Icon name={msg.kind === 'success' ? 'checkCircle' : 'alert'} size={15} /> {msg.text}</div>}
      <button type="submit" className={`btn btn-block ${mode === 'credit' ? 'btn-green' : 'btn-primary'}`} disabled={busy}>
        {busy ? <span className="spinner spinner-sm spinner-light" /> : mode === 'credit' ? 'Add funds' : 'Remove funds'}
      </button>
    </form>
  )
}

function PasswordForm({ userId, onDone }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) return setMsg({ kind: 'error', text: 'Password must be at least 6 characters' })
    setBusy(true)
    setMsg(null)
    try {
      await api.post(`/users/${userId}/password`, { password })
      setMsg({ kind: 'success', text: 'Password reset. Share it with the user securely; they have been logged out everywhere.' })
      setPassword('')
      onDone()
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
    setBusy(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="input">
        <Icon name="key" size={16} />
        <input
          type={show ? 'text' : 'password'}
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-label="New password"
        />
        <button type="button" className="input-action" onClick={() => setShow((v) => !v)} aria-label="Toggle password visibility">
          <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </div>
      {msg && <div className={`alert alert-${msg.kind}`}><Icon name={msg.kind === 'success' ? 'checkCircle' : 'alert'} size={15} /> {msg.text}</div>}
      <button type="submit" className="btn btn-dark btn-block" disabled={busy}>
        {busy ? <span className="spinner spinner-sm spinner-light" /> : 'Reset password'}
      </button>
    </form>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: '' })
  const [tab, setTab] = useState('transactions')
  const [acting, setActing] = useState(false)

  const key = `${id}:${tick}`
  useEffect(() => {
    let cancelled = false
    api.get(`/users/${id}`).then(
      (data) => !cancelled && setResult({ key, data, error: '' }),
      (err) => !cancelled && setResult({ key, data: null, error: err.message }),
    )
    return () => { cancelled = true }
  }, [id, key])

  const reload = () => setTick((n) => n + 1)
  const data = result.data?.user.id === id ? result.data : null

  if (result.error && !data) {
    return (
      <div className="page">
        <Link to="/" className="back"><Icon name="arrowLeft" size={16} /> All users</Link>
        <div className="alert alert-error"><Icon name="alert" size={16} /> {result.error}</div>
      </div>
    )
  }
  if (!data) {
    return <div className="page"><div className="empty"><span className="spinner" /></div></div>
  }

  const { user: u, stats: s } = data

  const act = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    setActing(true)
    try {
      await api.post(`/users/${u.id}/${path.endpoint}`, path.body)
      reload()
    } catch (err) {
      window.alert(err.message)
    }
    setActing(false)
  }

  return (
    <div className="page">
      <Link to="/" className="back"><Icon name="arrowLeft" size={16} /> All users</Link>

      <header className="profile-head">
        <div className="profile-id">
          <span className="avatar avatar-lg">{(u.displayName || u.username).slice(0, 2).toUpperCase()}</span>
          <div>
            <h1>
              {u.displayName || u.username}
              <span className={`badge badge-${u.status}`}>{u.status}</span>
            </h1>
            <p className="mono">UID {u.uid ?? '—'} · {u.phone} · joined {dateTime(u.createdAt)}</p>
          </div>
        </div>
        <div className="profile-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={acting}
            onClick={() => act({ endpoint: 'logout' }, `Log ${u.username} out of all devices?`)}
          >
            <Icon name="logout" size={16} /> Force logout
          </button>
          {u.status === 'active' ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={acting}
              onClick={() => act({ endpoint: 'status', body: { status: 'blocked' } }, `Block ${u.username}? They will be logged out and unable to log in or play.`)}
            >
              <Icon name="ban" size={16} /> Block user
            </button>
          ) : (
            <button type="button" className="btn btn-green" disabled={acting} onClick={() => act({ endpoint: 'status', body: { status: 'active' } })}>
              <Icon name="checkCircle" size={16} /> Unblock user
            </button>
          )}
        </div>
      </header>

      <div className="grid">
        {/* Wallet */}
        <section className="card">
          <h2 className="card-title"><Icon name="wallet" size={16} /> Wallet</h2>
          <div className="balance">
            <span>Current balance</span>
            <strong>{money(u.balance)}</strong>
          </div>
          <BalanceForm userId={u.id} onDone={reload} />
        </section>

        {/* Lifetime stats */}
        <section className="card">
          <h2 className="card-title"><Icon name="activity" size={16} /> Lifetime activity</h2>
          <div className="mini-stats">
            <div><span>Deposits</span><strong>{money(s.deposits)}</strong></div>
            <div><span>Withdrawn</span><strong>{money(s.withdrawn)}</strong></div>
            <div><span>Bonuses</span><strong>{money(s.bonuses)}</strong></div>
            <div><span>Total wagered</span><strong>{money(s.wagered)}</strong></div>
            <div><span>Total won</span><strong className="pos">{money(s.won)}</strong></div>
            <div><span>Player net</span><strong className={s.net >= 0 ? 'pos' : 'neg'}>{signedMoney(s.net)}</strong></div>
            <div><span>Admin adjustments</span><strong>{signedMoney(s.adjustments)}</strong></div>
            <div><span>Aviator bets</span><strong>{s.aviatorBets}</strong></div>
            <div><span>Color bets</span><strong>{s.colorBets}</strong></div>
            {OTHER_GAMES.map((g) => (
              <div key={g.key}><span>{GAME_LABELS[g.key]} bets</span><strong>{s[`${g.key}Bets`] ?? 0}</strong></div>
            ))}
            <div><span>Biggest win</span><strong>{money(s.biggestWin)}</strong></div>
          </div>
        </section>

        {/* Profile */}
        <section className="card">
          <h2 className="card-title"><Icon name="user" size={16} /> Profile</h2>
          <Row label="User ID" copy={u.id}><span className="mono small">{u.id}</span></Row>
          <Row label="UID" copy={u.uid ? String(u.uid) : undefined}><span className="mono">{u.uid ?? '—'}</span></Row>
          <Row label="Display name">{u.displayName ?? <span className="muted">Not set</span>}</Row>
          <Row label="Username" copy={u.username}>{u.username}</Row>
          <Row label="Phone" copy={u.phone}><span className="mono">{u.phone}</span></Row>
          <Row label="Invite code">{u.inviteCode ? <span className="mono">{u.inviteCode}</span> : <span className="muted">None</span>}</Row>
          <Row label="Joined">{dateTime(u.createdAt)}</Row>
          <Row label="Signup IP"><span className="mono">{u.signupIp ?? '—'}</span></Row>
          <Row label="Last login">{u.lastLoginAt ? `${dateTime(u.lastLoginAt)} (${timeAgo(u.lastLoginAt)})` : 'Never'}</Row>
          <Row label="Last login IP"><span className="mono">{u.lastLoginIp ?? '—'}</span></Row>
          <Row label="Total logins">{u.loginCount}</Row>
          <Row label="Last updated">{dateTime(u.updatedAt)}</Row>
        </section>

        {/* Security */}
        <section className="card">
          <h2 className="card-title"><Icon name="shield" size={16} /> Security</h2>
          <Row label="Password">
            <span className="pw-hidden"><Icon name="lock" size={13} /> Encrypted (bcrypt)</span>
          </Row>
          <Row label="Last changed">{dateTime(u.passwordChangedAt)}</Row>
          <p className="hint">
            Passwords are stored as one-way hashes, so nobody (including admins) can view them. If a user forgets
            theirs, set a new one below and share it with them.
          </p>
          <PasswordForm userId={u.id} onDone={reload} />
        </section>
      </div>

      {/* History */}
      <section className="card">
        <div className="tabs">
          <button type="button" className={tab === 'transactions' ? 'is-active' : ''} onClick={() => setTab('transactions')}>
            <Icon name="receipt" size={15} /> Transactions <em>{data.transactions.length}</em>
          </button>
          <button type="button" className={tab === 'withdrawals' ? 'is-active' : ''} onClick={() => setTab('withdrawals')}>
            <Icon name="banknote" size={15} /> Withdrawals <em>{data.withdrawals.length}</em>
          </button>
          <button type="button" className={tab === 'aviator' ? 'is-active' : ''} onClick={() => setTab('aviator')}>
            <Icon name="plane" size={15} /> Aviator <em>{data.aviatorBets.length}</em>
          </button>
          <button type="button" className={tab === 'color' ? 'is-active' : ''} onClick={() => setTab('color')}>
            <Icon name="palette" size={15} /> Color Prediction <em>{data.colorBets.length}</em>
          </button>
          {OTHER_GAMES.map((g) => (
            <button type="button" key={g.key} className={tab === g.key ? 'is-active' : ''} onClick={() => setTab(g.key)}>
              <Icon name={g.icon} size={15} /> {GAME_LABELS[g.key]} <em>{data.otherBets.filter((b) => b.game === g.key).length}</em>
            </button>
          ))}
        </div>

        {tab === 'transactions' && (data.transactions.length === 0 ? <Empty text="No transactions yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Time</th><th>Type</th><th>Game</th><th>Note</th><th className="num">Amount</th><th className="num">Balance after</th></tr></thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">{dateTime(t.time)}</td>
                    <td><span className={`badge badge-tx-${t.type}`}>{TX_LABELS[t.type] ?? t.type}</span></td>
                    <td>{GAME_LABELS[t.game] ?? <span className="muted">—</span>}</td>
                    <td className="muted">{t.note ?? '—'}</td>
                    <td className={`num strong ${t.amount >= 0 ? 'pos' : 'neg'}`}>{signedMoney(t.amount)}</td>
                    <td className="num">{money(t.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'withdrawals' && (data.withdrawals.length === 0 ? <Empty text="No withdrawals yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Requested</th><th className="num">Amount</th><th>Method</th><th>Details</th><th>Status</th><th>Processed</th><th>Note / reference</th></tr></thead>
              <tbody>
                {data.withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="nowrap">{dateTime(w.createdAt)}</td>
                    <td className="num strong">{money(w.amount)}</td>
                    <td>{w.method === 'upi' ? 'UPI' : 'Bank'}</td>
                    <td className="mono small">{w.method === 'upi' ? w.details.upiId : `${w.details.accountName} · ${w.details.accountNumber} · ${w.details.ifsc}`}</td>
                    <td><span className={`badge badge-wd-${w.status}`}>{WD_LABEL[w.status]}</span></td>
                    <td className="nowrap muted">{w.processedAt ? `${dateTime(w.processedAt)} · ${w.processedBy}` : '—'}</td>
                    <td className="muted">{[w.reference, w.note].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'aviator' && (data.aviatorBets.length === 0 ? <Empty text="No Aviator bets yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Time</th><th>Round</th><th>Panel</th><th className="num">Bet</th><th>Auto</th><th>Result</th><th className="num">Crashed at</th><th className="num">Win</th></tr></thead>
              <tbody>
                {data.aviatorBets.map((b) => (
                  <tr key={b.id}>
                    <td className="nowrap">{dateTime(b.time)}</td>
                    <td className="mono">{b.round ?? '—'}</td>
                    <td>{b.panel}</td>
                    <td className="num">{money(b.amount)}</td>
                    <td>{b.autoCashout ? `${b.autoCashout.toFixed(2)}x` : <span className="muted">—</span>}</td>
                    <td>
                      <span className={`badge badge-bet-${b.status}`}>
                        {b.status === 'cashed' ? `Cashed ${b.cashMult.toFixed(2)}x` : b.status}
                      </span>
                    </td>
                    <td className="num">{b.crashAt ? `${b.crashAt.toFixed(2)}x` : '—'}</td>
                    <td className={`num strong ${b.win > 0 ? 'pos' : ''}`}>{b.win > 0 ? money(b.win) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'color' && (data.colorBets.length === 0 ? <Empty text="No Color Prediction bets yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Time</th><th>Period</th><th>Pick</th><th className="num">Bet</th><th>Result</th><th>Outcome</th><th className="num">Win</th></tr></thead>
              <tbody>
                {data.colorBets.map((b) => (
                  <tr key={b.id}>
                    <td className="nowrap">{dateTime(b.time)}</td>
                    <td className="mono">{b.period}</td>
                    <td><span className={`swatch swatch-${b.color}`} /> {b.color}</td>
                    <td className="num">{money(b.amount)}</td>
                    <td>{b.result ? <><span className={`swatch swatch-${b.result}`} /> {b.result}</> : <span className="muted">Pending</span>}</td>
                    <td><span className={`badge badge-bet-${b.status}`}>{b.status}</span></td>
                    <td className={`num strong ${b.win > 0 ? 'pos' : ''}`}>{b.win > 0 ? money(b.win) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {OTHER_GAMES.some((g) => g.key === tab) && (() => {
          const bets = data.otherBets.filter((b) => b.game === tab)
          return bets.length === 0 ? <Empty text={`No ${GAME_LABELS[tab]} bets yet`} /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Time</th><th>Round</th><th className="num">Bet</th><th>Outcome</th><th className="num">Multiplier</th><th className="num">Win</th></tr></thead>
                <tbody>
                  {bets.map((b) => (
                    <tr key={b.id}>
                      <td className="nowrap">{dateTime(b.time)}</td>
                      <td>{b.detail}</td>
                      <td className="num">{money(b.amount)}</td>
                      <td><span className={`badge badge-bet-${b.status}`}>{b.status}</span></td>
                      <td className="num">{b.multiplier ? `${b.multiplier.toFixed(2)}x` : '—'}</td>
                      <td className={`num strong ${b.win > 0 ? 'pos' : ''}`}>{b.win > 0 ? money(b.win) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </section>
    </div>
  )
}
