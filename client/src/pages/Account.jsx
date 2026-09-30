import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icons'
import BottomNav from '../components/BottomNav'
import Sheet from '../components/Sheet'
import { useAuth } from '../auth/authContext'
import { api } from '../lib/api'
import { money, stamp } from '../lib/format'
import { gameImages } from '../games'
import { useSupportUnread } from '../lib/supportUnread'
import './Account.css'

// ── Sheets ───────────────────────────────────────────────────
function BankCard({ bank, onChange }) {
  return (
    <div className="ac-bank-card">
      <span className="ac-bank-icon"><Icon name="bank" size={20} /></span>
      <div>
        <strong>{bank.accountName}</strong>
        <span className="ac-bank-num">A/c {bank.masked} · {bank.ifsc}</span>
      </div>
      {onChange && <button type="button" className="ac-input-btn" onClick={onChange}>Change</button>}
    </div>
  )
}

function BankSheet({ onDone, toast }) {
  const [data, setData] = useState(null) // { bank, rules }
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ accountName: '', accountNumber: '', confirm: '', ifsc: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'ifsc' ? e.target.value.toUpperCase() : e.target.value }))

  useEffect(() => {
    let cancelled = false
    api.get('/wallet/bank').then((d) => {
      if (cancelled) return
      setData(d)
      setEditing(!d.bank)
      if (d.bank) setForm({ accountName: d.bank.accountName, accountNumber: '', confirm: '', ifsc: d.bank.ifsc })
    }, (err) => toast('error', err.message))
    return () => { cancelled = true }
  }, [toast])

  if (!data) return <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>

  const locked = Boolean(data.bank && data.rules.bankLocked)
  const digits = (v) => v.replace(/\s/g, '')
  const mismatch = form.confirm !== '' && digits(form.confirm) !== digits(form.accountNumber)
  const ready = form.accountName.trim().length >= 2 && /^\d{9,18}$/.test(digits(form.accountNumber)) && form.confirm !== '' && !mismatch && form.ifsc.length === 11

  const submit = async () => {
    setBusy(true)
    try {
      const { bank } = await api.post('/wallet/bank', { accountName: form.accountName, accountNumber: form.accountNumber, ifsc: form.ifsc })
      toast('success', 'Bank account saved')
      onDone(bank)
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  if (!editing) {
    return (
      <div className="ac-form">
        <label className="ac-label">Withdrawals are paid to</label>
        <BankCard bank={data.bank} onChange={locked ? null : () => setEditing(true)} />
        <p className="ac-hint">
          <Icon name={locked ? 'lock' : 'info'} size={13} />
          {locked
            ? 'Bank details can’t be changed once saved. Contact customer service if they need updating.'
            : 'Make sure the name matches your bank account so payouts aren’t rejected.'}
        </p>
      </div>
    )
  }

  return (
    <div className="ac-form">
      <label className="ac-label">Account holder name</label>
      <div className="ac-input">
        <input placeholder="Name as per bank records" value={form.accountName} maxLength={60} onChange={set('accountName')} autoComplete="name" aria-label="Account holder name" />
      </div>
      <label className="ac-label">Bank account number</label>
      <div className="ac-input">
        <input placeholder="9–18 digits" inputMode="numeric" value={form.accountNumber} maxLength={22} onChange={set('accountNumber')} autoComplete="off" aria-label="Account number" />
      </div>
      <div className={`ac-input ${mismatch ? 'is-bad' : ''}`}>
        <input placeholder="Re-enter account number" inputMode="numeric" value={form.confirm} maxLength={22} onChange={set('confirm')} onPaste={(e) => e.preventDefault()} autoComplete="off" aria-label="Confirm account number" />
      </div>
      {mismatch && <p className="ac-field-error">Account numbers don’t match</p>}
      <label className="ac-label">IFSC code</label>
      <div className="ac-input">
        <input placeholder="e.g. SBIN0001234" value={form.ifsc} maxLength={11} onChange={set('ifsc')} autoCapitalize="characters" autoComplete="off" aria-label="IFSC code" />
      </div>
      <p className="ac-hint">
        <Icon name="shieldCheck" size={13} />
        {data.rules.bankLocked
          ? 'Check carefully: bank details can’t be changed after saving.'
          : 'Withdrawals are paid only to this account. You can change it later.'}
      </p>
      <button type="button" className="ac-btn ac-btn-primary" onClick={submit} disabled={busy || !ready}>
        {busy ? <span className="ac-spinner" /> : 'Save bank account'}
      </button>
    </div>
  )
}

function WithdrawSheet({ onDone, onAddBank, toast, balance }) {
  const { setBalance } = useAuth()
  const [data, setData] = useState(null) // { bank, rules }
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const value = Number(amount) || 0

  useEffect(() => {
    let cancelled = false
    api.get('/wallet/bank').then((d) => !cancelled && setData(d), (err) => toast('error', err.message))
    return () => { cancelled = true }
  }, [toast])

  if (!data) return <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>
  const { bank, rules } = data

  if (!rules.enabled) {
    return (
      <div className="ac-form">
        <div className="ac-notice"><Icon name="clock" size={18} /> Withdrawals are paused right now. Please try again later.</div>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="ac-form">
        <div className="ac-notice"><Icon name="bank" size={18} /> Add your bank account number and IFSC code first. Withdrawals are paid to that account.</div>
        <button type="button" className="ac-btn ac-btn-primary" onClick={onAddBank}>Add bank account</button>
      </div>
    )
  }

  const short = balance < rules.minBalance
  const submit = async () => {
    setBusy(true)
    try {
      const res = await api.post('/wallet/withdraw', { amount: value })
      setBalance(res.balance)
      toast('success', `Withdrawal of ${money(value)} requested`)
      onDone()
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  let label = `Withdraw ${money(value)}`
  if (short) label = `Need ${money(rules.minBalance)} to withdraw`
  else if (value > balance) label = 'Insufficient balance'
  else if (value > rules.max) label = `Maximum is ${money(rules.max)}`

  return (
    <div className="ac-form">
      <div className="ac-available">
        <span>Available to withdraw</span>
        <strong>{money(balance)}</strong>
      </div>

      {short && (
        <div className="ac-notice ac-notice-warn">
          <Icon name="circleAlert" size={18} />
          <span>You need at least <strong>{money(rules.minBalance)}</strong> in your wallet to request a withdrawal.</span>
        </div>
      )}

      <label className="ac-label">Amount</label>
      <div className="ac-input">
        <span>₹</span>
        <input type="number" inputMode="decimal" placeholder={`${money(rules.min)} – ${money(rules.max)}`} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={short} aria-label="Withdrawal amount" />
        <button type="button" className="ac-input-btn" disabled={short} onClick={() => setAmount(String(Math.min(Math.floor(balance), rules.max)))}>All</button>
      </div>

      <label className="ac-label">Send to</label>
      <BankCard bank={bank} onChange={rules.bankLocked ? null : onAddBank} />

      <p className="ac-hint">
        <Icon name="clock" size={13} /> The amount is held from your balance and paid after review, usually within 24 hours.
        If a request is rejected, the money returns to your wallet.
      </p>
      <button type="button" className="ac-btn ac-btn-primary" onClick={submit} disabled={busy || short || value < rules.min || value > balance || value > rules.max}>
        {busy ? <span className="ac-spinner" /> : label}
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

function DeleteSheet({ onDeleted, toast }) {
  const [check, setCheck] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get('/account/delete').then((d) => !cancelled && setCheck(d), (e) => toast('error', e.message))
    return () => { cancelled = true }
  }, [toast])

  if (!check) return <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>

  const submit = async () => {
    setBusy(true)
    try {
      await api.post('/account/delete', { password, confirm, reason })
      onDeleted()
    } catch (err) {
      toast('error', err.message)
      setBusy(false)
    }
  }

  const loses = check.balance + check.commission
  return (
    <div className="ac-form">
      <div className="ac-notice ac-notice-danger">
        <Icon name="circleAlert" size={18} />
        <div>
          <strong>This can&apos;t be undone.</strong> Your account is closed and you are logged out. You can then register
          again with the same phone number and start fresh with a new ID.
        </div>
      </div>
      <ul className="ac-del-list">
        <li>
          {check.balance > 0
            ? <>Your balance of <b>{money(check.balance)}</b> will be <b>forfeited</b>. Withdraw it first if you want to keep it.</>
            : 'Your wallet is empty, so no money will be lost.'}
        </li>
        {check.commission > 0 && <li>Unclaimed agency commission of <b>{money(check.commission)}</b> will be lost.</li>}
        <li>Your game, deposit and withdrawal history and your agency team stay with the old account.</li>
        <li>A new account on the same phone number does not get the welcome bonus again.</li>
      </ul>

      {check.blockers.length > 0 ? (
        <div className="ac-notice ac-notice-warn">
          <Icon name="clock" size={18} />
          <div>
            <strong>You can&apos;t delete your account yet:</strong>
            {check.blockers.map((b) => <div key={b}>{b}</div>)}
          </div>
        </div>
      ) : (
        <>
          <label className="ac-label">Password</label>
          <div className="ac-input">
            <Icon name="lock" size={15} />
            <input type="password" placeholder="Your current password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Password" />
          </div>
          <label className="ac-label">Why are you leaving? (optional)</label>
          <div className="ac-input">
            <input placeholder="Reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
          </div>
          <label className="ac-label">Type DELETE to confirm</label>
          <div className="ac-input">
            <input placeholder="DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" aria-label="Type DELETE to confirm" />
          </div>
          <label className="ac-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            {loses > 0 ? `I understand I will lose ${money(loses)}` : 'I understand this cannot be undone'}
          </label>
          <button type="button" className="ac-btn ac-btn-danger" onClick={submit} disabled={busy || !password || confirm !== 'DELETE' || !agreed}>
            {busy ? <span className="ac-spinner" /> : 'Delete my account'}
          </button>
        </>
      )}
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
  const [sheet, setSheet] = useState(() => (params.get('open') === 'deposit' ? null : params.get('open')))
  const [toast, setToast] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [copied, setCopied] = useState(false)
  const supportUnread = useSupportUnread()

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

  // Saved bank account, for the settings list (undefined while loading)
  const [bank, setBank] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    api.get('/wallet/bank').then((d) => !cancelled && setBank(d.bank), () => {})
    return () => { cancelled = true }
  }, [])

  // Clear ?open= once the sheet it asked for is shown
  useEffect(() => {
    if (params.get('open') === 'deposit') navigate('/deposit', { replace: true })
    else if (params.get('open')) setParams({}, { replace: true })
  }, [params, setParams, navigate])

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
            <button type="button" onClick={() => navigate('/deposit')}>
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
          <button type="button" onClick={() => setSheet('bank')}>
            <span className="ac-list-icon"><Icon name="bank" size={17} /></span>Bank account
            <span className="ac-list-value">{bank === undefined ? '' : bank ? `A/c ${bank.masked}` : 'Add'}</span>
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
            <button type="button" className="ac-service-cs" onClick={() => navigate('/support')}>
              <Icon name="headset" size={22} />Customer Service
              {supportUnread > 0 && <em className="ac-badge">{supportUnread}</em>}
            </button>
            <button type="button" onClick={() => soon("The beginner's guide")}><Icon name="bookOpen" size={22} />Beginner&apos;s Guide</button>
            <button type="button" onClick={() => navigate('/')}><Icon name="info" size={22} />About us</button>
          </div>
        </section>

        <button type="button" className="ac-logout" onClick={onLogout}>
          <Icon name="logout" size={18} /> Log out
        </button>
        <button type="button" className="ac-delete" onClick={() => setSheet('delete')}>
          Delete account
        </button>
      </main>

      {/* ── Sheets ─────────────────────────────────────────── */}
      <Sheet open={sheet === 'withdraw'} title="Withdraw" onClose={closeSheet}>
        <WithdrawSheet toast={showToast} balance={balance} onAddBank={() => setSheet('bank')} onDone={() => { closeSheet(); load().catch(() => {}) }} />
      </Sheet>
      <Sheet open={sheet === 'bank'} title="Bank account" onClose={closeSheet}>
        <BankSheet toast={showToast} onDone={(b) => { setBank(b); closeSheet() }} />
      </Sheet>
      <Sheet open={sheet === 'name'} title="Edit name" onClose={closeSheet}>
        <NameSheet current={name} toast={showToast} onDone={(nu) => { closeSheet(); setProfile((p) => p && { ...p, user: nu }) }} />
      </Sheet>
      <Sheet open={sheet === 'delete'} title="Delete account" onClose={closeSheet}>
        <DeleteSheet toast={showToast} onDeleted={async () => { await logout(); navigate('/', { replace: true }) }} />
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
