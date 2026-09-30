import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icons'
import BottomNav from '../components/BottomNav'
import Sheet from '../components/Sheet'
import { useAuth } from '../auth/authContext'
import { api } from '../lib/api'
import { money, stamp } from '../lib/format'
import { gameImages } from '../games'
import './Account.css'

const DEPOSIT_PRESETS = [100, 200, 500, 1000, 2000, 5000]

// ── Sheets ───────────────────────────────────────────────────
function DepositSheet({ onDone, toast }) {
  const { deposit } = useAuth()
  const [amount, setAmount] = useState('500')
  const [busy, setBusy] = useState(false)
  const value = Number(amount) || 0

  const submit = async () => {
    setBusy(true)
    try {
      await deposit(value)
      toast('success', `${money(value)} added to your wallet`)
      onDone()
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  return (
    <div className="ac-form">
      <label className="ac-label">Select amount</label>
      <div className="ac-presets">
        {DEPOSIT_PRESETS.map((p) => (
          <button type="button" key={p} className={value === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
            ₹{p.toLocaleString('en-IN')}
          </button>
        ))}
      </div>
      <div className="ac-input">
        <span>₹</span>
        <input type="number" inputMode="numeric" min="100" max="10000" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Deposit amount" />
      </div>
      <p className="ac-hint"><Icon name="info" size={13} /> Demo mode: the amount is added instantly. Deposits ₹100 – ₹10,000.</p>
      <button type="button" className="ac-btn ac-btn-primary" onClick={submit} disabled={busy || value < 100}>
        {busy ? <span className="ac-spinner" /> : `Deposit ${money(value)}`}
      </button>
    </div>
  )
}

function WithdrawSheet({ onDone, toast, balance }) {
  const { setBalance } = useAuth()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('upi')
  const [upiId, setUpiId] = useState('')
  const [bank, setBank] = useState({ accountName: '', accountNumber: '', ifsc: '' })
  const [busy, setBusy] = useState(false)
  const value = Number(amount) || 0
  const setB = (k) => (e) => setBank((b) => ({ ...b, [k]: e.target.value }))

  const submit = async () => {
    setBusy(true)
    try {
      const body = { amount: value, method, ...(method === 'upi' ? { upiId } : bank) }
      const res = await api.post('/wallet/withdraw', body)
      setBalance(res.balance)
      toast('success', `Withdrawal of ${money(value)} requested`)
      onDone()
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  return (
    <div className="ac-form">
      <div className="ac-available">
        <span>Available to withdraw</span>
        <strong>{money(balance)}</strong>
      </div>

      <label className="ac-label">Amount</label>
      <div className="ac-input">
        <span>₹</span>
        <input type="number" inputMode="decimal" placeholder="Min ₹100" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Withdrawal amount" />
        <button type="button" className="ac-input-btn" onClick={() => setAmount(String(Math.floor(balance)))}>All</button>
      </div>

      <label className="ac-label">Send to</label>
      <div className="ac-seg">
        <button type="button" className={method === 'upi' ? 'is-active' : ''} onClick={() => setMethod('upi')}>
          <Icon name="phone" size={15} /> UPI
        </button>
        <button type="button" className={method === 'bank' ? 'is-active' : ''} onClick={() => setMethod('bank')}>
          <Icon name="bank" size={15} /> Bank account
        </button>
      </div>

      {method === 'upi' ? (
        <div className="ac-input">
          <input placeholder="UPI ID, e.g. name@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value)} autoCapitalize="off" aria-label="UPI ID" />
        </div>
      ) : (
        <>
          <div className="ac-input"><input placeholder="Account holder name" value={bank.accountName} onChange={setB('accountName')} aria-label="Account holder name" /></div>
          <div className="ac-input"><input placeholder="Account number" inputMode="numeric" value={bank.accountNumber} onChange={setB('accountNumber')} aria-label="Account number" /></div>
          <div className="ac-input"><input placeholder="IFSC code" value={bank.ifsc} onChange={setB('ifsc')} autoCapitalize="characters" aria-label="IFSC code" /></div>
        </>
      )}

      <p className="ac-hint">
        <Icon name="clock" size={13} /> The amount is held from your balance and paid after review, usually within 24 hours.
        If a request is rejected, the money returns to your wallet.
      </p>
      <button type="button" className="ac-btn ac-btn-primary" onClick={submit} disabled={busy || value < 100 || value > balance}>
        {busy ? <span className="ac-spinner" /> : value > balance ? 'Insufficient balance' : `Withdraw ${money(value)}`}
      </button>
    </div>
  )
}

function NameSheet({ current, onDone, toast }) {
  const { setUser } = useAuth()
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const { user } = await api.post('/account/name', { displayName: name })
      setUser(user)
      toast('success', 'Name updated')
      onDone(user)
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  return (
    <div className="ac-form">
      <label className="ac-label">Display name</label>
      <div className="ac-input">
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Display name" />
        <span className="ac-count">{name.trim().length}/20</span>
      </div>
      <p className="ac-hint"><Icon name="info" size={13} /> 2–20 characters. This is how you appear in games; you still log in with your phone number.</p>
      <button type="button" className="ac-btn ac-btn-primary" onClick={submit} disabled={busy || name.trim().length < 2}>
        {busy ? <span className="ac-spinner" /> : 'Save name'}
      </button>
    </div>
  )
}

function PasswordSheet({ onDone, toast }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (form.next !== form.confirm) return toast('error', 'New passwords do not match')
    setBusy(true)
    try {
      await api.post('/account/password', { currentPassword: form.current, newPassword: form.next })
      toast('success', 'Password changed. Other devices have been logged out.')
      onDone()
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  const field = (key, placeholder, autoComplete) => (
    <div className="ac-input">
      <Icon name="lock" size={15} />
      <input type={show ? 'text' : 'password'} placeholder={placeholder} value={form[key]} onChange={set(key)} autoComplete={autoComplete} aria-label={placeholder} />
    </div>
  )

  return (
    <div className="ac-form">
      {field('current', 'Current password', 'current-password')}
      {field('next', 'New password (min 6 characters)', 'new-password')}
      {field('confirm', 'Confirm new password', 'new-password')}
      <label className="ac-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
      </label>
      <button type="button" className="ac-btn ac-btn-primary" onClick={submit} disabled={busy || !form.current || form.next.length < 6}>
        {busy ? <span className="ac-spinner" /> : 'Change password'}
      </button>
    </div>
  )
}

function StatsSheet() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.get('/account/stats').then((s) => !cancelled && setStats(s), () => {})
    return () => { cancelled = true }
  }, [])
  if (!stats) return <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>

  const game = (label, icon, g, key) => (
    <div className="ac-stat-game">
      <div className="ac-stat-game-head">
        {gameImages[key] ? <img className="ac-stat-game-img" src={gameImages[key]} alt="" /> : <Icon name={icon} size={16} />} {label} <em>{g.bets} bets</em>
      </div>
      <div className="ac-stat-row"><span>Total bet</span><strong>{money(g.wagered)}</strong></div>
      <div className="ac-stat-row"><span>Total won</span><strong className="pos">{money(g.won)}</strong></div>
      <div className="ac-stat-row"><span>Net</span><strong className={g.net >= 0 ? 'pos' : 'neg'}>{g.net >= 0 ? '+' : '−'}{money(Math.abs(g.net))}</strong></div>
    </div>
  )

  return (
    <div className="ac-form">
      <div className="ac-stat-top">
        <div><span>Total deposits</span><strong>{money(stats.deposits)}</strong></div>
        <div><span>Total withdrawn</span><strong>{money(stats.withdrawals)}</strong></div>
      </div>
      {game('Aviator', 'plane', stats.aviator, 'aviator')}
      {game('Win Go', 'timer', stats.wingo, 'wingo')}
      {stats.color?.bets > 0 && game('Color Prediction', 'palette', stats.color)}
      {game('Mines', 'bomb', stats.mines, 'mines')}
      {game('Tower', 'layers', stats.tower, 'tower')}
      {game('Plinko', 'pyramid', stats.plinko, 'plinko')}
      {game('Dice', 'dices', stats.dice, 'dice')}
      {game('Wheel', 'wheel', stats.wheel, 'wheel')}
      {stats.spin?.bets > 0 && game('Lucky Spin', 'gift', stats.spin)}
      {game('Poker', 'club', stats.poker, 'poker')}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function Account() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user, balance, setBalance, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [sheet, setSheet] = useState(() => params.get('open'))
  const [toast, setToast] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [copied, setCopied] = useState(false)

  const showToast = useCallback((kind, text) => {
    const id = Date.now()
    setToast({ kind, text, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600)
  }, [])

  const load = useCallback(() => api.get('/account').then((d) => {
    setProfile(d)
    setBalance(d.balance)
  }), [setBalance])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  // Clear ?open= once the sheet it asked for is shown
  useEffect(() => {
    if (params.get('open')) setParams({}, { replace: true })
  }, [params, setParams])

  const closeSheet = useCallback(() => setSheet(null), [])
  const refresh = async () => {
    setSpinning(true)
    await Promise.all([load().catch(() => {}), new Promise((r) => setTimeout(r, 600))])
    setSpinning(false)
  }

  const u = profile?.user ?? user
  const name = u?.displayName || u?.username || ''
  const initials = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || 'ME'

  const copyUid = () => {
    if (!u?.uid) return
    navigator.clipboard?.writeText(String(u.uid))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const onLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const soon = (what) => showToast('info', `${what} is coming soon`)

  return (
    <div className="ac-root">
      {/* ── Profile header ─────────────────────────────────── */}
      <header className="ac-hero">
        <div className="ac-avatar">{initials}</div>
        <div className="ac-id">
          <div className="ac-name">
            <span>{name}</span>
            <em className="ac-vip">VIP0</em>
            <button type="button" className="ac-edit" onClick={() => setSheet('name')} aria-label="Edit name">
              <Icon name="pencil" size={13} strokeWidth={2.2} />
            </button>
          </div>
          <button type="button" className="ac-uid" onClick={copyUid} title="Copy UID">
            UID <i /> {u?.uid ?? '—'} <Icon name={copied ? 'check' : 'copy'} size={12} strokeWidth={2.2} />
          </button>
          <div className="ac-last">Last login: {stamp(u?.lastLoginAt)}</div>
        </div>
      </header>

      <main className="ac-main">
        {/* ── Balance ──────────────────────────────────────── */}
        <section className="ac-card ac-balance">
          <div className="ac-balance-top">
            <div>
              <span className="ac-muted">Total balance</span>
              <div className="ac-balance-amt">
                {money(balance)}
                <button type="button" className={`ac-refresh ${spinning ? 'is-spinning' : ''}`} onClick={refresh} aria-label="Refresh balance">
                  <Icon name="refresh" size={17} strokeWidth={2} />
                </button>
              </div>
            </div>
            <button type="button" className="ac-pill" onClick={() => navigate('/account/history/transactions')}>Enter wallet</button>
          </div>
          <div className="ac-quick">
            <button type="button" onClick={() => navigate('/account/history/transactions')}>
              <span className="ac-q ac-q-red"><Icon name="wallet" size={20} /></span>Wallet
            </button>
            <button type="button" onClick={() => setSheet('deposit')}>
              <span className="ac-q ac-q-orange"><Icon name="deposit" size={20} /></span>Deposit
            </button>
            <button type="button" onClick={() => setSheet('withdraw')}>
              <span className="ac-q ac-q-blue"><Icon name="withdraw" size={20} /></span>Withdraw
              {profile?.pendingWithdrawals > 0 && <em className="ac-badge">{profile.pendingWithdrawals}</em>}
            </button>
            <button type="button" onClick={() => soon('VIP')}>
              <span className="ac-q ac-q-green"><Icon name="crown" size={20} /></span>VIP
            </button>
          </div>
        </section>

        {/* ── History tiles ────────────────────────────────── */}
        <section className="ac-tiles">
          <button type="button" className="ac-tile" onClick={() => navigate('/account/history/games')}>
            <span className="ac-tile-icon ac-q-blue"><Icon name="gamepad" size={18} /></span>
            <div><strong>Game History</strong><span>My game history</span></div>
          </button>
          <button type="button" className="ac-tile" onClick={() => navigate('/account/history/transactions')}>
            <span className="ac-tile-icon ac-q-green"><Icon name="receipt" size={18} /></span>
            <div><strong>Transaction</strong><span>My transaction history</span></div>
          </button>
          <button type="button" className="ac-tile" onClick={() => navigate('/account/history/deposits')}>
            <span className="ac-tile-icon ac-q-red"><Icon name="deposit" size={18} /></span>
            <div><strong>Deposit</strong><span>My deposit history</span></div>
          </button>
          <button type="button" className="ac-tile" onClick={() => navigate('/account/history/withdrawals')}>
            <span className="ac-tile-icon ac-q-orange"><Icon name="withdraw" size={18} /></span>
            <div><strong>Withdraw</strong><span>My withdraw history</span></div>
          </button>
        </section>

        {/* ── Settings list ────────────────────────────────── */}
        <section className="ac-card ac-list">
          <button type="button" onClick={() => setSheet('stats')}>
            <span className="ac-list-icon"><Icon name="barChart" size={17} /></span>Game statistics
            <Icon name="chevronRight" size={16} className="ac-chev" />
          </button>
          <button type="button" onClick={() => setSheet('password')}>
            <span className="ac-list-icon"><Icon name="lock" size={17} /></span>Change password
            <Icon name="chevronRight" size={16} className="ac-chev" />
          </button>
          <button type="button" onClick={() => soon('More languages')}>
            <span className="ac-list-icon"><Icon name="globe" size={17} /></span>Language
            <span className="ac-list-value">English</span>
            <Icon name="chevronRight" size={16} className="ac-chev" />
          </button>
        </section>

        {/* ── Service center ───────────────────────────────── */}
        <section className="ac-card">
          <h2 className="ac-card-title">Service center</h2>
          <div className="ac-service">
            <button type="button" onClick={() => setSheet('name')}><Icon name="settings" size={22} />Settings</button>
            <button type="button" onClick={() => soon('Customer service')}><Icon name="headset" size={22} />Customer Service</button>
            <button type="button" onClick={() => soon("The beginner's guide")}><Icon name="bookOpen" size={22} />Beginner&apos;s Guide</button>
            <button type="button" onClick={() => navigate('/')}><Icon name="info" size={22} />About us</button>
          </div>
        </section>

        <button type="button" className="ac-logout" onClick={onLogout}>
          <Icon name="logout" size={18} /> Log out
        </button>
      </main>

      {/* ── Sheets ─────────────────────────────────────────── */}
      <Sheet open={sheet === 'deposit'} title="Deposit" onClose={closeSheet}>
        <DepositSheet toast={showToast} onDone={closeSheet} />
      </Sheet>
      <Sheet open={sheet === 'withdraw'} title="Withdraw" onClose={closeSheet}>
        <WithdrawSheet toast={showToast} balance={balance} onDone={() => { closeSheet(); load().catch(() => {}) }} />
      </Sheet>
      <Sheet open={sheet === 'name'} title="Edit name" onClose={closeSheet}>
        <NameSheet current={name} toast={showToast} onDone={(nu) => { closeSheet(); setProfile((p) => p && { ...p, user: nu }) }} />
      </Sheet>
      <Sheet open={sheet === 'password'} title="Change password" onClose={closeSheet}>
        <PasswordSheet toast={showToast} onDone={closeSheet} />
      </Sheet>
      <Sheet open={sheet === 'stats'} title="Game statistics" onClose={closeSheet}>
        <StatsSheet />
      </Sheet>

      {toast && (
        <div key={toast.id} className={`ac-toast ac-toast-${toast.kind}`} role="status">
          <Icon name={toast.kind === 'success' ? 'circleCheck' : toast.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
          {toast.text}
        </div>
      )}

      <BottomNav onSoon={(text) => showToast('info', text)} />
    </div>
  )
}
