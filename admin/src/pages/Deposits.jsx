import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateTime, money, timeAgo } from '../api'
import { Icon } from '../Icons'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
]
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

function CopyText({ value }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="copy-inline"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      title="Copy"
    >
      <span className="mono">{value}</span>
      <Icon name={done ? 'check' : 'copy'} size={12} />
    </button>
  )
}

function ActionForm({ d, onDone }) {
  const [mode, setMode] = useState(null) // approve | reject
  const [amount, setAmount] = useState(String(d.amount))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const value = Number(amount)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/deposits/${d.id}/${mode}`, mode === 'approve' ? { amount: value, note } : { note })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!mode) {
    return (
      <div className="wd-actions">
        <button type="button" className="btn btn-green" onClick={() => setMode('approve')}><Icon name="checkCircle" size={16} /> Approve &amp; credit</button>
        <button type="button" className="btn btn-danger" onClick={() => setMode('reject')}><Icon name="ban" size={16} /> Reject</button>
      </div>
    )
  }

  return (
    <div className="wd-form">
      {mode === 'approve' ? (
        <>
          <p className="hint">Find UTR <strong className="mono">{d.utr}</strong> in your UPI / bank app and enter the amount you actually received. That amount is added to the player&apos;s wallet.</p>
          <label className="field">
            <span>Amount received</span>
            <div className="input">
              <span className="input-prefix">₹</span>
              <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
          </label>
          <div className="input"><input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </>
      ) : (
        <>
          <p className="hint">Nothing is credited. Use this when no payment with this UTR arrived.</p>
          <div className="input"><input placeholder="Reason (shown to the player)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></div>
        </>
      )}
      {error && <div className="alert alert-error"><Icon name="alert" size={15} /> {error}</div>}
      <div className="wd-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setMode(null); setError('') }} disabled={busy}>Cancel</button>
        <button
          type="button"
          className={`btn ${mode === 'approve' ? 'btn-green' : 'btn-primary'}`}
          onClick={submit}
          disabled={busy || (mode === 'reject' ? !note.trim() : !(value > 0))}
        >
          {busy ? <span className="spinner spinner-sm spinner-light" /> : mode === 'approve' ? `Credit ${value > 0 ? money(value) : ''}` : 'Reject'}
        </button>
      </div>
    </div>
  )
}

export default function Deposits({ onCountChange }) {
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: '' })
  const key = `${status}:${q}:${tick}`
  const loading = result.key !== key

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api.get(`/deposits?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then(
        (data) => {
          if (cancelled) return
          setResult({ key, data, error: '' })
          onCountChange?.(data.pendingCount)
        },
        (err) => !cancelled && setResult({ key, data: null, error: err.message }),
      )
    }, q ? 250 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [status, q, key, onCountChange])

  const data = result.data

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Deposits</h1>
          <p>Players pay your UPI QR and submit the UTR. Check the payment arrived, then approve to credit their wallet.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setTick((n) => n + 1)}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      </header>

      {data && (
        <section className="stats stats-2">
          <div className="stat stat-red">
            <span className="stat-icon"><Icon name="clock" size={18} /></span>
            <div><span className="stat-label">Waiting for review</span><strong className="stat-value">{data.pendingCount}</strong></div>
          </div>
          <div className="stat stat-blue">
            <span className="stat-icon"><Icon name="wallet" size={18} /></span>
            <div><span className="stat-label">Amount claimed</span><strong className="stat-value">{money(data.pendingTotal)}</strong></div>
          </div>
        </section>
      )}

      <div className="dep-toolbar">
        <div className="tabs tabs-plain">
          {FILTERS.map((f) => (
            <button type="button" key={f.key} className={status === f.key ? 'is-active' : ''} onClick={() => setStatus(f.key)}>
              {f.label}
              {f.key === 'pending' && data?.pendingCount > 0 && <em>{data.pendingCount}</em>}
            </button>
          ))}
        </div>
        <div className="input dep-search">
          <Icon name="search" size={16} />
          <input placeholder="Search UTR or order number" value={q} onChange={(e) => setQ(e.target.value.replace(/\s/g, ''))} />
        </div>
      </div>

      {result.error && <div className="alert alert-error"><Icon name="alert" size={16} /> {result.error}</div>}
      {loading && !data && <div className="empty"><span className="spinner" /></div>}

      {data && data.items.length === 0 && (
        <div className="card empty">
          <Icon name="inbox" size={28} strokeWidth={1.5} />
          <p>{q ? 'No deposits with that UTR' : status === 'pending' ? 'No deposits waiting' : 'Nothing here yet'}</p>
          <span>{status === 'pending' && !q ? 'New payments from players will appear here.' : ''}</span>
        </div>
      )}

      <div className={`wd-list ${loading ? 'is-loading' : ''}`}>
        {data?.items.map((d) => (
          <article key={d.id} className="card wd-card">
            <div className="wd-top">
              <div className="wd-amount">
                <strong>{money(d.credited ?? d.amount)}</strong>
                <span title={dateTime(d.createdAt)}>Submitted {timeAgo(d.createdAt)}</span>
              </div>
              <span className={`badge badge-wd-${d.status}`}>{STATUS_LABEL[d.status]}</span>
            </div>

            {d.user && (
              <Link to={`/users/${d.user.id}`} className="wd-user">
                <span className="avatar">{(d.user.displayName || d.user.username).slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{d.user.displayName || d.user.username}</strong>
                  <span className="mono">UID {d.user.uid ?? '—'} · {d.user.phone}</span>
                </div>
                <div className="wd-user-bal">
                  <span className="muted">Balance</span>
                  <strong>{money(d.user.balance)}</strong>
                </div>
                <Icon name="chevronRight" size={16} />
              </Link>
            )}

            <div className="payout payout-bank">
              <span className="payout-kind">UPI</span>
              <div><span className="muted">UTR</span> <CopyText value={d.utr} /></div>
              <div><span className="muted">Player says they paid</span> <strong>{money(d.amount)}</strong></div>
              {d.orderNo && <div><span className="muted">Order</span> <CopyText value={d.orderNo} /></div>}
              {d.upiId && <div><span className="muted">To</span> <span className="mono">{d.upiId}</span></div>}
            </div>

            {d.status === 'pending' ? (
              <ActionForm d={d} onDone={() => setTick((n) => n + 1)} />
            ) : (
              <div className="wd-done">
                <span>{d.status === 'approved' ? 'Approved' : 'Rejected'} by <strong>{d.processedBy}</strong> · {dateTime(d.processedAt)}</span>
                {d.status === 'approved' && d.credited !== d.amount && <span>Credited {money(d.credited)} (player entered {money(d.amount)})</span>}
                {d.note && <span>{d.status === 'rejected' ? 'Reason' : 'Note'}: {d.note}</span>}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
