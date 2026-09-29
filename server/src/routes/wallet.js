import { Router } from 'express'
import { DEMO_DEPOSITS } from '../config.js'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { Transaction, Withdrawal } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, serializeTx, toPaise, toRupees } from '../wallet.js'

export const walletRouter = Router()
walletRouter.use(requireAuth)

export const MIN_WITHDRAW = 100
export const MAX_WITHDRAW = 50000
const MAX_PENDING = 3

walletRouter.get('/', async (req, res) => {
  const [balance, txs] = await Promise.all([
    balanceOf(req.userId),
    Transaction.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  res.json({ balance: toRupees(balance), transactions: txs.map(serializeTx) })
})

// Demo top-up (no payment provider yet). Disable with DEMO_DEPOSITS=false.
walletRouter.post('/deposit', async (req, res) => {
  if (!DEMO_DEPOSITS) throw new HttpError(403, 'Deposits are not available yet')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < 100 * 100 || paise > 10000 * 100) {
    throw new HttpError(400, 'Deposit between ₹100 and ₹10,000')
  }
  const after = await tx((s) => credit(s, req.userId, paise, { type: 'deposit', ref: 'demo' }))
  res.json({ balance: toRupees(after) })
})

// ── Withdrawals: money is held immediately; an admin approves (pays out) or rejects (refunds)
const UPI_RE = /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

function serializeWithdrawal(w) {
  return {
    id: String(w._id),
    amount: toRupees(w.amount),
    method: w.method,
    destination: w.method === 'upi' ? w.details.upiId : `${w.details.accountName} · ****${String(w.details.accountNumber).slice(-4)}`,
    status: w.status,
    note: w.adminNote ?? null,
    reference: w.reference ?? null,
    createdAt: w.createdAt,
    processedAt: w.processedAt ?? null,
  }
}

walletRouter.get('/withdrawals', async (req, res) => {
  const rows = await Withdrawal.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ items: rows.map(serializeWithdrawal), min: MIN_WITHDRAW, max: MAX_WITHDRAW })
})

walletRouter.post('/withdraw', async (req, res) => {
  const { method } = req.body ?? {}
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < MIN_WITHDRAW * 100) throw new HttpError(400, `Minimum withdrawal is ₹${MIN_WITHDRAW}`)
  if (paise > MAX_WITHDRAW * 100) throw new HttpError(400, `Maximum withdrawal is ₹${MAX_WITHDRAW.toLocaleString('en-IN')}`)

  let details
  if (method === 'upi') {
    const upiId = String(req.body.upiId ?? '').trim()
    if (!UPI_RE.test(upiId)) throw new HttpError(400, 'Enter a valid UPI ID, e.g. name@okaxis')
    details = { upiId }
  } else if (method === 'bank') {
    const accountName = String(req.body.accountName ?? '').trim().replace(/\s+/g, ' ')
    const accountNumber = String(req.body.accountNumber ?? '').replace(/\s/g, '')
    const ifsc = String(req.body.ifsc ?? '').trim().toUpperCase()
    if (accountName.length < 2 || accountName.length > 60) throw new HttpError(400, 'Enter the account holder name')
    if (!/^\d{9,18}$/.test(accountNumber)) throw new HttpError(400, 'Account number must be 9–18 digits')
    if (!IFSC_RE.test(ifsc)) throw new HttpError(400, 'Enter a valid IFSC code, e.g. SBIN0001234')
    details = { accountName, accountNumber, ifsc }
  } else {
    throw new HttpError(400, 'Choose UPI or bank transfer')
  }

  if ((await Withdrawal.countDocuments({ user: req.userId, status: 'pending' })) >= MAX_PENDING) {
    throw new HttpError(409, `You already have ${MAX_PENDING} withdrawals in progress`)
  }

  const { balance, withdrawal } = await tx(async (session) => {
    const [w] = await Withdrawal.create([{ user: req.userId, amount: paise, method, details }], { session })
    const after = await debit(session, req.userId, paise, { type: 'withdraw', ref: w._id, note: 'Withdrawal requested' })
    return { balance: after, withdrawal: w }
  })
  res.status(201).json({ balance: toRupees(balance), withdrawal: serializeWithdrawal(withdrawal.toObject()) })
})
