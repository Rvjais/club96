import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icons'
import BottomNav from '../components/BottomNav'
import Sheet from '../components/Sheet'
import { useAuth } from '../auth/authContext'
import { api } from '../lib/api'
import { money, stamp } from '../lib/format'
import './Account.css'
import './Promotion.css'

const VIEWS = {
  partner: 'Partner rewards',
  team: 'Subordinate data',
  commission: 'Commission detail',
  rules: 'Invitation rules',
  rebate: 'Rebate ratio',
}

const pct = (n) => `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })}%`
const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const inviteLink = (code) => `${window.location.origin}/signup?invite=${code}`

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Older browsers / plain http: fall back to a hidden textarea
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
}

function useToast() {
  const [toast, setToast] = useState(null)
  const show = useCallback((kind, text) => {
    const id = Date.now()
    setToast({ kind, text, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600)
  }, [])
  const node = toast && (
    <div className={`ac-toast ac-toast-${toast.kind}`} role="status">
      <Icon name={toast.kind === 'success' ? 'circleCheck' : toast.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
      {toast.text}
    </div>
  )
  return [show, node]
}

function Loading() {
  return <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>
}

function Empty({ text }) {
  return (
    <div className="hs-empty">
      <Icon name="inbox" size={30} strokeWidth={1.5} />
      <p>{text}</p>
    </div>
  )
}

/** Paged list fetcher: `path` is called with ?page=N (plus any query already in it). */
function usePaged(path) {
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ key: null, items: [], more: false, error: '' })
  const key = `${path}|${page}`

  useEffect(() => {
    let cancelled = false
    const sep = path.includes('?') ? '&' : '?'
    api.get(`${path}${sep}page=${page}`).then(
      (d) => !cancelled && setState((s) => ({
        key,
        items: page === 1 ? d.items : [...s.items, ...d.items],
        more: d.page * d.pageSize < d.total,
        error: '',
      })),
      (err) => !cancelled && setState((s) => ({ ...s, key, error: err.message })),
    )
    return () => { cancelled = true }
  }, [path, page, key])

  return { ...state, loading: state.key !== key, page, setPage }
}

// ── Stats block (direct / team) ──────────────────────────────
function StatCol({ s }) {
  return (
    <div className="pm-col">
      <div><strong>{s.register}</strong><span>Number of register</span></div>
      <div><strong className="pm-green">{s.depositNumber}</strong><span>Deposit number</span></div>
      <div><strong className="pm-orange">{inr(s.depositAmount)}</strong><span>Deposit amount</span></div>
      <div><strong>{s.firstDeposit}</strong><span>Number of people making first deposit</span></div>
    </div>
  )
}

// ── Invitation link sheet ────────────────────────────────────
function InviteSheet({ code, toast }) {
  const link = inviteLink(code)
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me', text: `Sign up with my invite code ${code}`, url: link })
        return
      } catch { /* cancelled → fall through to copy */ }
    }
    await copyText(link)
    toast('success', 'Invitation link copied')
  }
  return (
    <div className="ac-form">
      <div className="pm-invite-code">
        <span>Your invitation code</span>
        <strong>{code}</strong>
      </div>
      <label className="ac-label">Invitation link</label>
      <div className="ac-input pm-link">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
        <button type="button" className="ac-input-btn" onClick={async () => { await copyText(link); toast('success', 'Invitation link copied') }}>Copy</button>
      </div>
      <p className="ac-hint"><Icon name="info" size={13} /> Friends who sign up with this link or code join your team, and you earn commission on their bets and deposits.</p>
      <button type="button" className="ac-btn ac-btn-primary" onClick={share}>
        <Icon name="send" size={16} /> Share invitation link
      </button>
    </div>
  )
}

// ── Sub-pages ────────────────────────────────────────────────
function PartnerView({ toast }) {
  const { setBalance } = useAuth()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const load = useCallback(() => api.get('/promotion/partner').then(setData, (e) => toast('error', e.message)), [toast])
  useEffect(() => { load() }, [load])

  const claim = async (t) => {
    setBusy(t.key)
    try {
      const res = await api.post('/promotion/partner/claim', { key: t.key })
      setBalance(res.balance)
      toast('success', `${money(res.claimed)} added to your wallet`)
      await load()
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(null)
  }

  if (!data) return <Loading />
  if (!data.tiers.length) return <Empty text="No partner rewards right now" />
  return (
    <div className="hs-list">
      <p className="pm-intro">Invite friends who deposit and collect a one-off bonus at every milestone.</p>
      {data.tiers.map((t) => {
        const done = Math.min(t.qualified, t.invites)
        const ready = done >= t.invites && !t.claimed
        return (
          <div className="pm-tier" key={t.key}>
            <div className="pm-tier-head">
              <span className="pm-tier-badge"><Icon name="trophy" size={16} /></span>
              <div>
                <strong>Invite {t.invites} {t.invites === 1 ? 'friend' : 'friends'}</strong>
                <span>Each deposits {inr(t.deposit)} or more</span>
              </div>
              <em>{inr(t.reward)}</em>
            </div>
            <div className="pm-bar"><i style={{ width: `${(done / t.invites) * 100}%` }} /></div>
            <div className="pm-tier-foot">
              <span>{done} / {t.invites}</span>
              <button
                type="button"
                className={`pm-claim ${t.claimed ? 'is-done' : ready ? 'is-ready' : ''}`}
                disabled={!ready || !data.enabled || busy === t.key}
                onClick={() => claim(t)}
              >
                {t.claimed ? 'Claimed' : busy === t.key ? <span className="ac-spinner" /> : ready ? 'Claim' : 'Unfinished'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TeamView({ levels }) {
  const [level, setLevel] = useState('all')
  const list = usePaged(`/promotion/subordinates${level === 'all' ? '' : `?level=${level}`}`)
  const tabs = ['all', ...Array.from({ length: levels }, (_, i) => String(i + 1))]
  const pick = (t) => { list.setPage(1); setLevel(t) }
  const items = list.loading && list.page === 1 ? [] : list.items

  return (
    <>
      <div className="hs-tabs">
        {tabs.map((t) => (
          <button type="button" key={t} className={level === t ? 'is-active' : ''} onClick={() => pick(t)}>
            {t === 'all' ? 'All' : `Level ${t}`}
          </button>
        ))}
      </div>
      <div className="hs-list">
        {list.error && <Empty text={list.error} />}
        {!list.error && list.loading && list.page === 1 && <Loading />}
        {!list.loading && !list.error && items.length === 0 && <Empty text="No subordinates yet. Share your invitation link!" />}
        {items.map((s) => (
          <div className="hs-item hs-item-col" key={`${s.uid}-${s.joinedAt}`}>
            <div className="hs-row">
              <span className="hs-icon hs-icon-red"><Icon name="user" size={18} /></span>
              <div className="hs-main">
                <strong>UID {s.uid ?? '—'} <em className="pm-lvl">Lv {s.level}</em></strong>
                <span>{s.phone}</span>
              </div>
              <div className="hs-amt"><small>Joined</small><small>{stamp(s.joinedAt).slice(0, 10)}</small></div>
            </div>
            <div className="pm-sub-grid">
              <div><span>Deposit</span><strong>{inr(s.deposit)}</strong></div>
              <div><span>Bet amount</span><strong>{inr(s.bet)}</strong></div>
              <div><span>My commission</span><strong className="pm-orange">{inr(s.commission)}</strong></div>
            </div>
          </div>
        ))}
        {list.more && (
          <button type="button" className="hs-more" disabled={list.loading} onClick={() => list.setPage((p) => p + 1)}>
            {list.loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </>
  )
}

function CommissionView() {
  const list = usePaged('/promotion/commissions')
  const items = list.loading && list.page === 1 ? [] : list.items
  return (
    <div className="hs-list">
      {list.error && <Empty text={list.error} />}
      {!list.error && list.loading && list.page === 1 && <Loading />}
      {!list.loading && !list.error && items.length === 0 && <Empty text="No commission yet" />}
      {items.map((d) => (
        <div className="hs-item hs-item-col" key={d.day}>
          <div className="hs-row">
            <span className="hs-icon hs-icon-orange"><Icon name="coins" size={18} /></span>
            <div className="hs-main">
              <strong>{d.day}</strong>
              <span>{d.people} {d.people === 1 ? 'member' : 'members'} active</span>
            </div>
            <div className="hs-amt"><strong className="pos">+{money(d.total)}</strong><small>Commission</small></div>
          </div>
          <div className="pm-sub-grid">
            <div><span>Bet amount</span><strong>{inr(d.bet)}</strong></div>
            <div><span>Bet commission</span><strong>{inr(d.betCommission)}</strong></div>
            <div><span>Deposit commission</span><strong>{inr(d.depositCommission)}</strong></div>
          </div>
        </div>
      ))}
      {list.more && (
        <button type="button" className="hs-more" disabled={list.loading} onClick={() => list.setPage((p) => p + 1)}>
          {list.loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function RulesView({ config }) {
  const n = config.levels.length
  const rules = [
    `Share your invitation link or code. Everyone who signs up with it becomes your direct subordinate (level 1). The people they invite are your level 2, and so on down to level ${n}.`,
    `You earn a rebate on every bet your team places: ${config.levels.map((l, i) => `${pct(l.bet)} on level ${i + 1}`).join(', ')}.`,
    config.levels.some((l) => l.deposit > 0)
      ? `You also earn ${config.depositMode === 'first' ? "a share of each member's first deposit" : 'a share of every deposit your team makes'}: ${config.levels.map((l, i) => `${pct(l.deposit)} on level ${i + 1}`).join(', ')}.`
      : null,
    `Commission is worked out automatically within a minute and collects in your agency wallet. Tap Claim to move it to your balance${config.minClaim > 0 ? ` once you have at least ${inr(config.minClaim)}` : ''}.`,
    config.tiers.length ? 'Partner rewards pay a one-off bonus when enough of your direct invitees have each deposited the required amount.' : null,
    'Refunded bets do not earn commission. Inviting yourself or using several accounts is not allowed, and commission earned that way is cancelled.',
  ].filter(Boolean)
  return (
    <div className="hs-list">
      {!config.enabled && <div className="pm-paused"><Icon name="info" size={15} /> The agency programme is paused. No new commission is being paid right now.</div>}
      {rules.map((r, i) => (
        <div className="pm-rule" key={i}>
          <span>{String(i + 1).padStart(2, '0')}</span>
          <p>{r}</p>
        </div>
      ))}
    </div>
  )
}

function RebateView({ config }) {
  const hasDeposit = config.levels.some((l) => l.deposit > 0)
  return (
    <div className="hs-list">
      <div className="pm-table">
        <div className="pm-table-head">
          <span>Level</span>
          <span>Bet rebate</span>
          {hasDeposit && <span>{config.depositMode === 'first' ? 'First deposit' : 'Deposit'}</span>}
        </div>
        {config.levels.map((l, i) => (
          <div className="pm-table-row" key={i}>
            <span><em className="pm-lvl">Lv {i + 1}</em></span>
            <strong>{pct(l.bet)}</strong>
            {hasDeposit && <strong>{pct(l.deposit)}</strong>}
          </div>
        ))}
      </div>
      <p className="pm-intro">
        Example: when a level 1 member bets ₹1,000 you earn {inr((1000 * config.levels[0].bet) / 100)}.
        {config.levels[1] && <> A level 2 member&apos;s ₹1,000 bet earns you {inr((1000 * config.levels[1].bet) / 100)}.</>}
      </p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function Promotion() {
  const navigate = useNavigate()
  const { view } = useParams()
  const { setBalance } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [toast, toastNode] = useToast()

  const load = useCallback(() => api.get('/promotion').then((d) => { setData(d); setError('') }, (e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const claim = async () => {
    setClaiming(true)
    try {
      const res = await api.post('/promotion/claim')
      setBalance(res.balance)
      toast('success', `${money(res.claimed)} commission added to your wallet`)
      await load()
    } catch (err) {
      toast('error', err.message)
    }
    setClaiming(false)
  }

  const copyCode = async () => {
    await copyText(data.code)
    toast('success', 'Invitation code copied')
  }

  // ── Sub-page ──
  if (view) {
    const title = VIEWS[view]
    return (
      <div className="ac-root hs-root pm-root">
        <header className="hs-head">
          <button type="button" className="hs-back" onClick={() => navigate('/promotion')} aria-label="Back">
            <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          </button>
          <h1>{title ?? 'Agency'}</h1>
          <span />
        </header>
        {!title ? <Empty text="Page not found" /> : !data ? (error ? <Empty text={error} /> : <Loading />) : (
          <>
            {view === 'partner' && <PartnerView toast={toast} />}
            {view === 'team' && <TeamView levels={data.config.levels.length} />}
            {view === 'commission' && <CommissionView />}
            {view === 'rules' && <RulesView config={data.config} />}
            {view === 'rebate' && <RebateView config={data.config} />}
          </>
        )}
        {toastNode}
      </div>
    )
  }

  // ── Main page ──
  const c = data?.commission
  const rows = [
    { key: 'partner', icon: 'trophy', label: 'Partner rewards' },
    { key: 'code', icon: 'ticket', label: 'Copy invitation code' },
    { key: 'team', icon: 'users', label: 'Subordinate data' },
    { key: 'commission', icon: 'receipt', label: 'Commission detail' },
    { key: 'rules', icon: 'bookOpen', label: 'Invitation rules' },
    { key: 'support', icon: 'headset', label: 'Agent line customer service' },
    { key: 'rebate', icon: 'coins', label: 'Rebate ratio' },
  ]
  const open = (key) => {
    if (key === 'code') return data && copyCode()
    if (key === 'support') return navigate('/support')
    navigate(`/promotion/${key}`)
  }

  return (
    <div className="ac-root pm-root">
      <header className="pm-head">
        <span />
        <h1>Agency</h1>
        <button type="button" className="pm-head-btn" onClick={() => navigate('/promotion/commission')} aria-label="Commission detail">
          <Icon name="barChart" size={20} />
        </button>
      </header>

      <section className="pm-hero">
        <strong className="pm-hero-amt">{c ? inr(c.yesterday) : '—'}</strong>
        <span className="pm-hero-pill">Yesterday&apos;s total commission</span>
        <p>Upgrade the level to increase commission income</p>
      </section>

      <main className="pm-main">
        {error && !data && <div className="pm-paused"><Icon name="circleAlert" size={15} /> {error}</div>}

        <section className="pm-stats">
          <div className="pm-stats-head">
            <span><Icon name="user" size={15} /> Direct subordinates</span>
            <span><Icon name="users" size={15} /> Team subordinates</span>
          </div>
          {data ? (
            <div className="pm-stats-body">
              <StatCol s={data.direct} />
              <StatCol s={data.team} />
            </div>
          ) : <Loading />}
        </section>

        {data && (
          <section className="pm-wallet">
            <div className="pm-wallet-main">
              <span>Commission available</span>
              <strong>{money(c.available)}</strong>
              <small>Today {inr(c.today)} · All-time {inr(c.total)}</small>
            </div>
            <button type="button" className="pm-wallet-btn" onClick={claim} disabled={claiming || c.available <= 0 || c.available < data.config.minClaim}>
              {claiming ? <span className="ac-spinner" /> : 'Claim'}
            </button>
          </section>
        )}
        {data && !data.config.enabled && (
          <div className="pm-paused"><Icon name="info" size={15} /> The agency programme is paused. No new commission is being paid right now.</div>
        )}

        <button type="button" className="pm-invite" onClick={() => setSheet(true)} disabled={!data}>
          INVITATION LINK
        </button>

        <div className="pm-rows">
          {rows.map((r) => (
            <button type="button" key={r.key} className="pm-row" onClick={() => open(r.key)}>
              <span className="pm-row-icon"><Icon name={r.icon} size={20} /></span>
              <span className="pm-row-label">{r.label}</span>
              {r.key === 'code' && data && (
                <span className="pm-row-value">{data.code} <Icon name="copy" size={15} /></span>
              )}
              {r.key !== 'code' && <Icon name="chevronRight" size={20} className="pm-chev" />}
            </button>
          ))}
        </div>
      </main>

      <Sheet open={sheet} title="Invite friends" onClose={() => setSheet(false)}>
        {data && <InviteSheet code={data.code} toast={toast} />}
      </Sheet>
      {toastNode}
      <BottomNav onSoon={(msg) => toast('info', msg)} />
    </div>
  )
}
