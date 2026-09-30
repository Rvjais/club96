import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { api } from '../lib/api'
import { money, stamp } from '../lib/format'
import { gameImages } from '../games'
import './Account.css'

const TABS = [
  { key: 'games', label: 'Games' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'deposits', label: 'Deposits' },
  { key: 'withdrawals', label: 'Withdrawals' },
]

const TX_LABELS = {
  bonus: 'Bonus',
  commission: 'Agency commission',
  deposit: 'Deposit',
  bet: 'Bet',
  win: 'Win',
  refund: 'Bet refund',
  adjustment: 'Account adjustment',
  withdraw: 'Withdrawal',
  withdraw_refund: 'Withdrawal returned',
}
const GAME_LABELS = { aviator: 'Aviator', wingo: 'Win Go', color: 'Color Prediction', mines: 'Mines', tower: 'Tower', plinko: 'Plinko', dice: 'Dice', wheel: 'Wheel', spin: 'Lucky Spin', poker: 'Poker' }
const GAME_ICONS = { aviator: 'plane', wingo: 'timer', color: 'palette', mines: 'bomb', tower: 'layers', plinko: 'pyramid', dice: 'dices', wheel: 'wheel', spin: 'gift', poker: 'club' }
const STATUS = { pending: 'In review', approved: 'Paid', rejected: 'Rejected' }

function Empty({ text }) {
  return (
    <div className="hs-empty">
      <Icon name="inbox" size={30} strokeWidth={1.5} />
      <p>{text}</p>
    </div>
  )
}

function fetchTab(tab, page) {
  if (tab === 'games') return api.get(`/account/game-history?page=${page}`).then((d) => ({ items: d.items, more: d.hasMore, replace: true }))
  if (tab === 'withdrawals') return api.get('/wallet/withdrawals').then((d) => ({ items: d.items, more: false, replace: true }))
  const type = tab === 'deposits' ? 'deposit' : 'all'
  return api.get(`/account/transactions?type=${type}&page=${page}`).then((d) => ({ items: d.items, more: d.page * d.pageSize < d.total, replace: false }))
}

export default function History() {
  const navigate = useNavigate()
  const { tab = 'games' } = useParams()
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ key: null, items: [], more: false, error: '' })

  const key = `${tab}:${page}`
  const loading = state.key !== key

  useEffect(() => {
    let cancelled = false
    fetchTab(tab, page).then(
      (d) => !cancelled && setState((s) => ({
        key,
        items: page === 1 || d.replace ? d.items : [...s.items, ...d.items],
        more: d.more,
        error: '',
      })),
      (err) => !cancelled && setState((s) => ({ ...s, key, error: err.message })),
    )
    return () => { cancelled = true }
  }, [tab, page, key])

  const switchTab = (t) => {
    setPage(1)
    navigate(`/account/history/${t}`, { replace: true })
  }

  const items = loading && page === 1 ? [] : state.items

  return (
    <div className="ac-root hs-root">
      <header className="hs-head">
        <button type="button" className="hs-back" onClick={() => navigate('/account')} aria-label="Back">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <h1>History</h1>
        <span />
      </header>

      <div className="hs-tabs">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={tab === t.key ? 'is-active' : ''} onClick={() => switchTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="hs-list">
        {state.error && <div className="hs-error"><Icon name="circleAlert" size={15} /> {state.error}</div>}
        {loading && page === 1 && <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>}

        {!loading && items.length === 0 && !state.error && (
          <Empty text={{ games: 'No games played yet', transactions: 'No transactions yet', deposits: 'No deposits yet', withdrawals: 'No withdrawals yet' }[tab]} />
        )}

        {tab === 'games' && items.map((g) => (
          <div key={g.id} className="hs-item">
            {gameImages[g.game] ? (
              <img className="hs-icon hs-icon-img" src={gameImages[g.game]} alt="" />
            ) : (
              <span className={`hs-icon hs-icon-${g.game}`}>
                <Icon name={GAME_ICONS[g.game] ?? 'gamepad'} size={18} />
              </span>
            )}
            <div className="hs-main">
              <strong>{GAME_LABELS[g.game]}</strong>
              <span>{g.detail}</span>
              <small>{g.ref} · {stamp(g.time)}</small>
            </div>
            <div className="hs-amt">
              <strong className={g.won ? 'pos' : 'neg'}>{g.won ? `+${money(g.win)}` : `−${money(g.lost ?? g.amount)}`}</strong>
              <small>{g.game === 'poker' ? 'Buy-in' : 'Bet'} {money(g.amount)}</small>
            </div>
          </div>
        ))}

        {(tab === 'transactions' || tab === 'deposits') && items.map((t) => (
          <div key={t.id} className="hs-item">
            <span className={`hs-icon ${t.amount >= 0 ? 'hs-icon-green' : 'hs-icon-red'}`}>
              <Icon name={t.amount >= 0 ? 'deposit' : 'withdraw'} size={18} />
            </span>
            <div className="hs-main">
              <strong>{TX_LABELS[t.type] ?? t.type}</strong>
              <span>{t.game ? GAME_LABELS[t.game] : t.note || '—'}</span>
              <small>{stamp(t.time)}</small>
            </div>
            <div className="hs-amt">
              <strong className={t.amount >= 0 ? 'pos' : 'neg'}>{t.amount >= 0 ? '+' : '−'}{money(Math.abs(t.amount))}</strong>
              <small>Balance {money(t.balanceAfter)}</small>
            </div>
          </div>
        ))}

        {tab === 'withdrawals' && items.map((w) => (
          <div key={w.id} className="hs-item hs-item-col">
            <div className="hs-row">
              <span className="hs-icon hs-icon-orange"><Icon name={w.method === 'upi' ? 'phone' : 'bank'} size={18} /></span>
              <div className="hs-main">
                <strong>{money(w.amount)}</strong>
                <span>{w.method === 'upi' ? 'UPI' : 'Bank'} · {w.destination}</span>
                <small>{stamp(w.createdAt)}</small>
              </div>
              <span className={`hs-status hs-status-${w.status}`}>{STATUS[w.status]}</span>
            </div>
            {(w.note || w.reference) && (
              <div className="hs-note">
                {w.reference && <span>Reference: <b>{w.reference}</b></span>}
                {w.note && <span>{w.status === 'rejected' ? 'Reason' : 'Note'}: {w.note}</span>}
              </div>
            )}
          </div>
        ))}

        {state.more && !loading && (
          <button type="button" className="hs-more" onClick={() => setPage((p) => p + 1)}>Load more</button>
        )}
        {loading && page > 1 && <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>}
      </main>
    </div>
  )
}
