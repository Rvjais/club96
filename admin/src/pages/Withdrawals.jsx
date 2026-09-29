import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateTime, money, timeAgo } from '../api'
import { Icon } from '../Icons'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
]
const STATUS_LABEL = { pending: 'Pending', approved: 'Paid', rejected: 'Rejected' }

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

function PayoutDetails({ w }) {
  if (w.method === 'upi') {
    return <div className="payout"><span className="payout-kind">UPI</span><CopyText value={w.details.upiId} /></div>
  }
  return (
    <div className="payout payout-bank">
      <span className="payout-kind">Bank</span>
      <div><span className="muted">Name</span> <strong>{w.details.accountName}</strong></div>
      <div><span className="muted">A/C</span> <CopyText value={w.details.accountNumber} /></div>
      <div><span className="muted">IFSC</span> <CopyText value={w.details.ifsc} /></div>
    </div>
  )
}

function ActionForm({ w, onDone }) {
  const [mode, setMode] = useState(null) // approve | reject
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/withdrawals/${w.id}/${mode}`, { note, reference })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!mode) {
    return (
      <div className="wd-actions">
        <button type="button" className="btn btn-green" onClick={() => setMode('approve')}><Icon name="checkCircle" size={16} /> Mark as paid</button>
        <button type="button" className="btn btn-danger" onClick={() => setMode('reject')}><Icon name="ban" size={16} /> Reject</button>
      </div>
    )
  }

  return (
    <div className="wd-form">
      {mode === 'approve' ? (
        <>
          <p className="hint">Send {money(w.amount)} to the details above first, then confirm here.</p>
          <div className="input"><input placeholder="Payout reference, e.g. UPI transaction ID (optional)" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="input"><input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </>
      ) : (
        <>
          <p className="hint">{money(w.amount)} will be returned to the player&apos;s wallet.</p>
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
          disabled={busy || (mode === 'reject' && !note.trim())}
        >
          {busy ? <span className="spinner spinner-sm spinner-light" /> : mode === 'approve' ? 'Confirm paid' : 'Reject & refund'}
        </button>
      </div>
    </div>
  )
}

export default function Withdrawals({ onCountChange }) {
  const [status, setStatus] = useState('pending')
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: '' })
  const key = `${status}:${tick}`
  const loading = result.key !== key

  useEffect(() => {
    let cancelled = false
    api.get(`/withdrawals?status=${status}`).then(
      (data) => {
        if (cancelled) return
        setResult({ key, data, error: '' })
        onCountChange?.(data.pendingCount)
      },
      (err) => !cancelled && setResult({ key, data: null, error: err.message }),
    )
    return () => { cancelled = true }
  }, [status, key, onCountChange])

  const data = result.data

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Withdrawals</h1>
          <p>Pay the player, then mark the request as paid. Rejecting returns the money to their wallet.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setTick((n) => n + 1)}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      </header>

      {data && (
        <section className="stats stats-2">
          <div className="stat stat-red">
            <span className="stat-icon"><Icon name="clock" size={18} /></span>
            <div><span className="stat-label">Pending requests</span><strong className="stat-value">{data.pendingCount}</strong></div>
          </div>
          <div className="stat stat-blue">
            <span className="stat-icon"><Icon name="wallet" size={18} /></span>
            <div><span className="stat-label">Pending amount</span><strong className="stat-value">{money(data.pendingTotal)}</strong></div>
          </div>
        </section>
      )}

      <div className="tabs tabs-plain">
        {FILTERS.map((f) => (
          <button type="button" key={f.key} className={status === f.key ? 'is-active' : ''} onClick={() => setStatus(f.key)}>
            {f.label}
            {f.key === 'pending' && data?.pendingCount > 0 && <em>{data.pendingCount}</em>}
          </button>
        ))}
      </div>

      {result.error && <div className="alert alert-error"><Icon name="alert" size={16} /> {result.error}</div>}
      {loading && !data && <div className="empty"><span className="spinner" /></div>}

      {data && data.items.length === 0 && (
        <div className="card empty">
          <Icon name="inbox" size={28} strokeWidth={1.5} />
          <p>{status === 'pending' ? 'No pending withdrawals' : 'Nothing here yet'}</p>
          <span>{status === 'pending' ? 'New requests from players will appear here.' : ''}</span>
        </div>
      )}

      <div className={`wd-list ${loading ? 'is-loading' : ''}`}>
        {data?.items.map((w) => (
          <article key={w.id} className="card wd-card">
            <div className="wd-top">
              <div className="wd-amount">
                <strong>{money(w.amount)}</strong>
                <span title={dateTime(w.createdAt)}>Requested {timeAgo(w.createdAt)}</span>
              </div>
              <span className={`badge badge-wd-${w.status}`}>{STATUS_LABEL[w.status]}</span>
            </div>

            {w.user && (
              <Link to={`/users/${w.user.id}`} className="wd-user">
                <span className="avatar">{(w.user.displayName || w.user.username).slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{w.user.displayName || w.user.username}</strong>
                  <span className="mono">UID {w.user.uid ?? '—'} · {w.user.phone}</span>
                </div>
                <div className="wd-user-bal">
                  <span className="muted">Balance</span>
                  <strong>{money(w.user.balance)}</strong>
                </div>
                <Icon name="chevronRight" size={16} />
              </Link>
            )}

            <PayoutDetails w={w} />

            {w.status === 'pending' ? (
              <ActionForm w={w} onDone={() => setTick((n) => n + 1)} />
            ) : (
              <div className="wd-done">
                <span>{w.status === 'approved' ? 'Paid' : 'Rejected'} by <strong>{w.processedBy}</strong> · {dateTime(w.processedAt)}</span>
                {w.reference && <span>Reference: <span className="mono">{w.reference}</span></span>}
                {w.note && <span>{w.status === 'rejected' ? 'Reason' : 'Note'}: {w.note}</span>}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
