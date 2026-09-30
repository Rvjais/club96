import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Icon } from '../components/Icons'
import { useAuth } from '../auth/authContext'
import { api } from '../lib/api'
import { money, stamp } from '../lib/format'
import './Account.css'
import './Deposit.css'

const PRESETS = [100, 200, 300, 400, 500, 1000, 2000, 3000, 5000, 10000, 20000, 50000]
const short = (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : String(n))
const STATUS = {
  unpaid: { label: 'To Be Paid', tone: 'orange' },
  pending: { label: 'Confirming', tone: 'blue' },
  approved: { label: 'Completed', tone: 'green' },
  rejected: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  expired: { label: 'Failed', tone: 'red' },
}

/** upi://pay link for the admin's UPI ID with the amount filled in. */
function upiLink({ upiId, payeeName }, amount, orderNo) {
  // The UPI ID is left unencoded: some UPI apps reject a percent-encoded "@"
  return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Deposit ${orderNo ?? ''}`.trim())}`
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
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

/** Seconds left until `until` (0 once it has passed), ticking every second. */
function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])
  return until ? Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000)) : 0
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function Loading() {
  return <div className="ac-loading"><span className="ac-spinner ac-spinner-red" /></div>
}

function SectionTitle({ icon, children }) {
  return (
    <h2 className="dp-title">
      <span className="dp-title-icon"><Icon name={icon} size={17} strokeWidth={2.1} /></span>
      {children}
    </h2>
  )
}

// ── Deposit history card ─────────────────────────────────────
function OrderCard({ d, onPay, toast }) {
  const st = STATUS[d.status] ?? { label: d.status, tone: 'grey' }
  return (
    <div className="dp-order">
      <div className="dp-order-head">
        <span className="dp-tag">Deposit</span>
        <button type="button" className={`dp-status dp-${st.tone}`} onClick={d.status === 'unpaid' ? onPay : undefined} disabled={d.status !== 'unpaid'}>
          {st.label} {d.status === 'unpaid' && <Icon name="chevronRight" size={14} strokeWidth={2.4} />}
        </button>
      </div>
      <div className="dp-order-rows">
        <div><span>Order amount</span><strong className="dp-amt">{money(d.credited ?? d.amount)}</strong></div>
        <div><span>Type</span><strong>{d.method}</strong></div>
        <div><span>Time</span><strong>{stamp(d.createdAt)}</strong></div>
        {d.orderNo && (
          <div>
            <span>Order number</span>
            <button type="button" className="dp-copy" onClick={async () => { await copyText(d.orderNo); toast('success', 'Order number copied') }}>
              {d.orderNo} <Icon name="copy" size={13} />
            </button>
          </div>
        )}
        {d.utr && <div><span>UTR</span><strong>{d.utr}</strong></div>}
        {d.credited != null && d.credited !== d.amount && <div><span>Received</span><strong>{money(d.credited)} (you entered {money(d.amount)})</strong></div>}
        {d.note && <div className="dp-order-note"><span>{d.status === 'rejected' ? 'Reason' : 'Note'}</span><strong>{d.note}</strong></div>}
      </div>
      {d.status === 'unpaid' && (
        <button type="button" className="dp-voucher" onClick={onPay}>Submit Deposit Voucher</button>
      )}
    </div>
  )
}

// ── /deposit ─────────────────────────────────────────────────
export default function Deposit() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [info, setInfo] = useState(null)
  const [orders, setOrders] = useState(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [toast, toastNode] = useToast()
  const historyRef = useRef(null)

  const loadOrders = useCallback(() => api.get('/wallet/deposits').then((d) => setOrders(d.items), (e) => toast('error', e.message)), [toast])
  const refreshBalance = useCallback(() => api.get('/wallet').then((d) => setBalance(d.balance), () => {}), [setBalance])

  useEffect(() => {
    api.get('/wallet/deposit-info').then(setInfo, (e) => toast('error', e.message))
    loadOrders()
    refreshBalance()
  }, [loadOrders, refreshBalance, toast])

  const spin = async () => {
    setSpinning(true)
    await Promise.all([refreshBalance(), new Promise((r) => setTimeout(r, 600))])
    setSpinning(false)
  }

  const unpaid = orders?.find((o) => o.status === 'unpaid')
  const value = Number(amount) || 0
  const valid = info?.enabled && value >= info.min && value <= info.max
  const presets = info ? PRESETS.filter((p) => p >= info.min && p <= info.max) : []

  const create = async () => {
    setBusy(true)
    try {
      const { deposit } = await api.post('/wallet/deposits', { amount: value })
      navigate(`/deposit/${deposit.id}`)
    } catch (err) {
      toast('error', err.message)
      loadOrders()
    }
    setBusy(false)
  }

  const instructions = [
    info?.note,
    'If the transfer time is up, please fill out the deposit form again.',
    'The transfer amount must match the order you created, otherwise the money cannot be credited successfully.',
    'If you transfer the wrong amount, our company will not be responsible for the lost amount!',
    'Note: do not cancel the deposit order after the money has been transferred.',
  ].filter(Boolean)

  return (
    <div className="ac-root dp-root">
      <header className="dp-head">
        <button type="button" className="dp-back" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <h1>Deposit</h1>
        <button type="button" className="dp-head-link" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}>Deposit history</button>
      </header>

      <main className="dp-main">
        {/* Balance */}
        <section className="dp-balance">
          <span className="dp-balance-label"><Icon name="wallet" size={16} /> Balance</span>
          <div className="dp-balance-amt">
            {money(balance)}
            <button type="button" className={`dp-refresh ${spinning ? 'is-spinning' : ''}`} onClick={spin} aria-label="Refresh balance">
              <Icon name="refresh" size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="dp-balance-dots"><span>****</span><span>****</span></div>
        </section>

        {/* Payment method */}
        <section className="dp-methods">
          <button type="button" className="dp-method is-active">
            <Icon name="qrCode" size={30} strokeWidth={1.8} />
            <span>UPI-QR</span>
          </button>
        </section>

        {!info || !orders ? <Loading /> : !info.enabled ? (
          <section className="dp-card dp-center">
            <span className="dp-alert-icon dp-alert-grey"><Icon name="clock" size={22} /></span>
            <p>Deposits are not available right now. Please try again later or contact customer service.</p>
          </section>
        ) : unpaid ? (
          <section className="dp-card dp-center">
            <span className="dp-alert-icon">!</span>
            <p>You have 1 unpaid order</p>
            <button type="button" className="dp-go" onClick={() => navigate(`/deposit/${unpaid.id}`)}>Go pay</button>
          </section>
        ) : (
          <>
            <section className="dp-card">
              <SectionTitle icon="send">Select channel</SectionTitle>
              <div className="dp-channels">
                <button type="button" className="dp-channel is-active">
                  <strong>UPI_QR</strong>
                  <span>Balance: {short(info.min)} - {short(info.max)}</span>
                </button>
              </div>
            </section>

            <section className="dp-card">
              <SectionTitle icon="wallet">Deposit amount</SectionTitle>
              <div className="dp-presets">
                {presets.map((p) => (
                  <button type="button" key={p} className={value === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    <i>₹</i><span>{short(p)}</span>
                  </button>
                ))}
              </div>
              <div className="dp-input">
                <span className="dp-input-cur">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={`${money(info.min)} - ${money(info.max)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Deposit amount"
                />
                {amount && (
                  <button type="button" className="dp-clear" onClick={() => setAmount('')} aria-label="Clear amount">
                    <Icon name="x" size={14} strokeWidth={2.4} />
                  </button>
                )}
              </div>
              {amount && !valid && (
                <p className="dp-error">{value < info.min ? `Minimum deposit is ${money(info.min)}` : `Maximum deposit is ${money(info.max)}`}</p>
              )}
            </section>
          </>
        )}

        {/* Instructions */}
        <section className="dp-card">
          <SectionTitle icon="bookOpen">Recharge instructions</SectionTitle>
          <ul className="dp-rules">
            {instructions.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>

        {/* History */}
        <section ref={historyRef} className="dp-history">
          <SectionTitle icon="receipt">Deposit history</SectionTitle>
          {!orders ? <Loading /> : orders.length === 0 ? (
            <div className="hs-empty"><Icon name="inbox" size={30} strokeWidth={1.5} /><p>No deposits yet</p></div>
          ) : orders.map((d) => (
            <OrderCard key={d.id} d={d} toast={toast} onPay={() => navigate(`/deposit/${d.id}`)} />
          ))}
        </section>
      </main>

      {info?.enabled && !unpaid && (
        <footer className="dp-bar">
          <div>
            <span>Recharge Method:</span>
            <strong>UPI_QR</strong>
          </div>
          <button type="button" className="dp-bar-btn" onClick={create} disabled={!valid || busy}>
            {busy ? <span className="ac-spinner" /> : 'Deposit'}
          </button>
        </footer>
      )}
      {toastNode}
    </div>
  )
}

// ── /deposit/:id — pay an order ──────────────────────────────
export function DepositPay() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [qr, setQr] = useState('')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [done, setDone] = useState(false)
  const [toast, toastNode] = useToast()
  const utrRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api.get(`/wallet/deposits/${id}`).then((d) => !cancelled && setData(d), (e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [id])

  const order = data?.deposit
  const pay = data?.pay
  const left = useCountdown(order?.status === 'unpaid' ? order.expiresAt : null)

  useEffect(() => {
    if (!pay || !order) return
    let cancelled = false
    QRCode.toDataURL(upiLink(pay, order.amount, order.orderNo), { width: 480, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => !cancelled && setQr(url), () => {})
    return () => { cancelled = true }
  }, [pay, order])

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const digits = (text.match(/\d{12}/)?.[0]) ?? text.replace(/\D/g, '').slice(0, 12)
      if (!digits) return toast('error', 'No number found on the clipboard')
      setUtr(digits)
    } catch {
      toast('info', 'Long-press the box and choose Paste')
      utrRef.current?.focus()
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      await api.post(`/wallet/deposits/${id}/utr`, { utr })
      setDone(true)
    } catch (err) {
      toast('error', err.message)
    }
    setBusy(false)
  }

  const cancel = async () => {
    setBusy(true)
    try {
      await api.post(`/wallet/deposits/${id}/cancel`)
      navigate('/deposit', { replace: true })
    } catch (err) {
      toast('error', err.message)
      setConfirmCancel(false)
    }
    setBusy(false)
  }

  const head = (
    <header className="dp-head">
      <button type="button" className="dp-back" onClick={() => navigate('/deposit')} aria-label="Back">
        <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
      </button>
      <h1>UPI Pay</h1>
      <button type="button" className="dp-cs" onClick={() => navigate('/support')}>Customer Service</button>
    </header>
  )

  if (error || (order && order.status !== 'unpaid') || done) {
    const st = done ? 'pending' : order?.status
    return (
      <div className="ac-root dp-root dp-pay">
        {head}
        <main className="dp-main">
          <section className="dp-card dp-center">
            {error ? (
              <>
                <span className="dp-alert-icon">!</span>
                <p>{error}</p>
              </>
            ) : st === 'pending' ? (
              <>
                <span className="dp-alert-icon dp-alert-green"><Icon name="circleCheck" size={26} /></span>
                <strong className="dp-done-title">Payment submitted</strong>
                <p>We&apos;re confirming your payment of <b>{money(order.amount)}</b>. It will be added to your wallet as soon as it&apos;s verified, usually within a few minutes.</p>
              </>
            ) : (
              <>
                <span className="dp-alert-icon">!</span>
                <p>This order is {STATUS[st]?.label.toLowerCase() ?? st}.</p>
              </>
            )}
            <button type="button" className="dp-go" onClick={() => navigate('/deposit', { replace: true })}>Back to deposit</button>
          </section>
        </main>
        {toastNode}
      </div>
    )
  }

  if (!order) return <div className="ac-root dp-root dp-pay">{head}<Loading /></div>

  const utrOk = /^\d{12}$/.test(utr)
  return (
    <div className="ac-root dp-root dp-pay">
      {head}
      <main className="dp-main">
        <section className="dp-pay-amt">
          <button type="button" onClick={async () => { await copyText(String(order.amount)); toast('success', 'Amount copied') }}>
            <strong>{money(order.amount)}</strong>
            <Icon name="copy" size={20} />
          </button>
          <span className={`dp-timer ${left === 0 ? 'is-up' : ''}`}>{left === 0 ? "Time's up" : mmss(left)}</span>
        </section>
        {left === 0 && (
          <p className="dp-warn">The payment time is up. If you already paid, submit the UTR now. Otherwise cancel this order and create a new one.</p>
        )}

        <h3 className="dp-sub">Use mobile scan code to pay</h3>
        <section className="dp-qr">
          <div className="dp-qr-img">
            {qr ? <img src={qr} alt={`UPI QR code to pay ${money(order.amount)}`} /> : <span className="ac-spinner ac-spinner-red" />}
          </div>
          <button type="button" className="dp-qr-upi" onClick={async () => { await copyText(pay.upiId); toast('success', 'UPI ID copied') }}>
            {pay.payeeName} · <b>{pay.upiId}</b> <Icon name="copy" size={13} />
          </button>
          {qr && (
            <a className="dp-qr-save" href={qr} download={`deposit-${order.orderNo ?? order.id}.png`}>
              <Icon name="download" size={14} /> Save QR to gallery
            </a>
          )}
          <ol className="dp-qr-steps">
            <li>Please use <b>another device</b> to scan the QR code with your payment app.</li>
            <li>Or take a <b>screenshot</b> of this QR code, open your UPI app&apos;s <b>Scan QR</b>, tap the <b>gallery</b> icon and choose the screenshot.</li>
            <li>Pay exactly <b>{money(order.amount)}</b>, then copy the 12-digit UTR from the payment receipt.</li>
          </ol>
        </section>

        <h3 className="dp-sub">Input UTR / Paste UTR</h3>
        <p className="dp-warn">If you do not fill in the UTR, the deposit cannot be credited.</p>
        <div className="dp-utr">
          <input
            ref={utrRef}
            placeholder="Input 12 digits here"
            inputMode="numeric"
            maxLength={12}
            value={utr}
            onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))}
            autoComplete="off"
            aria-label="UTR number"
          />
          <button type="button" onClick={paste}>Paste</button>
        </div>

        <h3 className="dp-sub">Important reminder</h3>
        <ol className="dp-remind">
          <li>Do not pay the same order more than once!</li>
          <li>The amount you pay must be exactly {money(order.amount)}.</li>
          {pay.note && <li>{pay.note}</li>}
        </ol>
        {order.orderNo && <p className="dp-orderno">Order number: {order.orderNo}</p>}
      </main>

      <footer className="dp-bar dp-bar-pay">
        <button type="button" className="dp-bar-cancel" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel</button>
        <button type="button" className="dp-bar-btn" onClick={submit} disabled={!utrOk || busy}>
          {busy && !confirmCancel ? <span className="ac-spinner" /> : utr.length === 0 ? 'Submit (UTR not entered)' : utrOk ? 'Submit' : `Submit (${utr.length}/12)`}
        </button>
      </footer>

      {confirmCancel && (
        <div className="dp-modal">
          <div className="dp-modal-backdrop" onClick={() => setConfirmCancel(false)} />
          <div className="dp-modal-card" role="dialog" aria-modal="true" aria-label="Cancel transaction">
            <strong>Cancel Transaction</strong>
            <p>If you have successfully transferred funds, please do not cancel the transaction!</p>
            <div className="dp-modal-btns">
              <button type="button" onClick={cancel} disabled={busy}>{busy ? <span className="ac-spinner ac-spinner-red" /> : 'Confirm'}</button>
              <button type="button" className="is-primary" onClick={() => { setConfirmCancel(false); utrRef.current?.focus() }}>I have paid</button>
            </div>
          </div>
        </div>
      )}
      {toastNode}
    </div>
  )
}
