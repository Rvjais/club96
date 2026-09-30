import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, dateTime, money, timeAgo } from '../api'
import { Icon } from '../Icons'

const LIMIT = 20

function StatCard({ icon, label, value, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-icon"><Icon name={icon} size={18} /></span>
      <div>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  )
}

export default function Users() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ key: null, data: null, error: '' })
  const [stats, setStats] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  const key = JSON.stringify({ q, status, sort, page, reloadTick })
  const loading = result.key !== key

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ q, status, sort, page: String(page), limit: String(LIMIT) })
    api.get(`/users?${params}`).then(
      (data) => !cancelled && setResult({ key, data, error: '' }),
      (err) => !cancelled && setResult({ key, data: null, error: err.message }),
    )
    return () => { cancelled = true }
  }, [key, q, status, sort, page])

  useEffect(() => {
    let cancelled = false
    api.get('/stats').then((s) => !cancelled && setStats(s), () => {})
    return () => { cancelled = true }
  }, [reloadTick])

  const data = result.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Users</h1>
          <p>All registered players and their wallets</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setReloadTick((n) => n + 1)}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      </header>

      <section className="stats">
        <StatCard icon="users" label="Total users" value={stats ? stats.users.toLocaleString('en-IN') : '—'} sub={stats ? `+${stats.newToday} today` : ''} />
        <StatCard icon="activity" label="Active (24h)" value={stats ? stats.active24h.toLocaleString('en-IN') : '—'} sub={stats ? `${stats.blocked} blocked` : ''} />
        <StatCard icon="wallet" label="Player balances" value={stats ? money(stats.totalBalance) : '—'} tone="blue" />
        <StatCard
          icon={stats && stats.profit24h < 0 ? 'trendingDown' : 'trendingUp'}
          label="House profit (24h)"
          value={stats ? money(stats.profit24h) : '—'}
          sub={stats ? `${money(stats.wagered24h)} wagered` : ''}
          tone={stats && stats.profit24h < 0 ? 'red' : 'green'}
        />
      </section>

      <section className="card">
        <div className="toolbar">
          <div className="input input-search">
            <Icon name="search" size={16} />
            <input
              placeholder="Search by name, username, UID or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
            <option value="deleted">Deleted by player</option>
            <option value="recreated">Re-registered</option>
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="balance">Highest balance</option>
            <option value="lastLogin">Recently active</option>
          </select>
        </div>

        {result.error && !loading && (
          <div className="alert alert-error"><Icon name="alert" size={16} /> {result.error}</div>
        )}

        <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
          <table className="table table-click table-cards">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last login</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/users/${u.id}`)}>
                  <td>
                    <div className="user-cell">
                      <span className="avatar">{(u.displayName || u.username).slice(0, 2).toUpperCase()}</span>
                      <div className="user-cell-text">
                        <strong>{u.displayName || u.username}</strong>
                        <span className="mono">UID {u.uid ?? '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono" data-label="Phone">{u.phone}</td>
                  <td className="num strong" data-label="Balance">{money(u.balance)}</td>
                  <td data-label="Status">
                    <span className={`badge badge-${u.status}`}>{u.status}</span>
                    {u.recreated && <span className="badge badge-recreated" title="Signed up again after deleting an earlier account">re-registered</span>}
                  </td>
                  <td data-label="Joined" title={dateTime(u.createdAt)}>{new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="muted" data-label={u.deletedAt ? 'Deleted' : 'Last login'} title={dateTime(u.deletedAt ?? u.lastLoginAt)}>{timeAgo(u.deletedAt ?? u.lastLoginAt)}</td>
                  <td className="chev"><Icon name="chevronRight" size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.users.length === 0 && (
            <div className="empty">
              <Icon name="inbox" size={28} strokeWidth={1.5} />
              <p>No users found</p>
              <span>{q || status ? 'Try a different search or filter.' : 'Players appear here after they sign up.'}</span>
            </div>
          )}
          {!data && loading && <div className="empty"><span className="spinner" /></div>}
        </div>

        {data && data.total > 0 && (
          <div className="pager">
            <span className="muted">
              {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total.toLocaleString('en-IN')}
            </span>
            <div className="pager-btns">
              <button type="button" className="btn btn-ghost btn-icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <Icon name="chevronLeft" size={16} />
              </button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn btn-ghost btn-icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
