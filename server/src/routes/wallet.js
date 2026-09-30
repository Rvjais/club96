import { Router } from 'express'
import { DEMO_DEPOSITS } from '../config.js'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { Transaction, User, Withdrawal } from '../models/index.js'
import { getSettings } from '../settings.js'
import { HttpError, balanceOf, credit, debit, serializeTx, toPaise, toRupees } from '../wallet.js'

export const walletRouter = Router()
walletRouter.use(requireAuth)

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

// ── Bank account: where withdrawals are paid. Players add it once; admins see it on the profile.
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

export function serializeBank(bank) {
  if (!bank?.accountNumber) return null
  return {
    accountName: bank.accountName,
    accountNumber: bank.accountNumber,
    masked: `****${bank.accountNumber.slice(-4)}`,
    ifsc: bank.ifsc,
    updatedAt: bank.updatedAt ?? null,
  }
}

/** Current withdrawal rules (admin-set, see settings.js → platform). */
function withdrawRules() {
  const c = getSettings('platform')
  return {
    enabled: c.withdrawEnabled,
    minBalance: c.minWithdrawBalance,
    min: c.minWithdraw,
    max: c.maxWithdraw,
    maxPending: c.maxPendingWithdrawals,
    bankLocked: c.bankLocked,
  }
}

walletRouter.get('/bank', async (req, res) => {
  const u = await User.findById(req.userId, { bank: 1 }).lean()
  res.json({ bank: serializeBank(u?.bank), rules: withdrawRules() })
})

walletRouter.post('/bank', async (req, res) => {
  const accountName = String(req.body?.accountName ?? '').trim().replace(/\s+/g, ' ')
  const accountNumber = String(req.body?.accountNumber ?? '').replace(/\s/g, '')
  const ifsc = String(req.body?.ifsc ?? '').trim().toUpperCase()
  if (accountName.length < 2 || accountName.length > 60) throw new HttpError(400, 'Enter the account holder name')
  if (!/^[\p{L} .'-]+$/u.test(accountName)) throw new HttpError(400, 'Account holder name can only contain letters, spaces, dots and dashes')
  if (!/^\d{9,18}$/.test(accountNumber)) throw new HttpError(400, 'Account number must be 9–18 digits')
  if (!IFSC_RE.test(ifsc)) throw new HttpError(400, 'Enter a valid IFSC code, e.g. SBIN0001234')

  const user = await User.findById(req.userId, { bank: 1 }).lean()
  if (user.bank?.accountNumber && getSettings('platform').bankLocked) {
    throw new HttpError(403, "Bank details can't be changed once saved. Contact customer service to update them.")
  }
  if (await Withdrawal.exists({ user: req.userId, status: 'pending' })) {
    throw new HttpError(409, 'You can change bank details once your pending withdrawals are processed')
  }
  const updated = await User.findByIdAndUpdate(
    req.userId,
    { bank: { accountName, accountNumber, ifsc, updatedAt: new Date() } },
    { new: true, projection: { bank: 1 } },
  ).lean()
  res.json({ bank: serializeBank(updated.bank) })
})

// ── Withdrawals: money is held immediately; an admin approves (pays out) or rejects (refunds)
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
  const r = withdrawRules()
  res.json({ items: rows.map(serializeWithdrawal), min: r.min, max: r.max, rules: r })
})

const rupees = (n) => `₹${n.toLocaleString('en-IN')}`

walletRouter.post('/withdraw', async (req, res) => {
  const r = withdrawRules()
  if (!r.enabled) throw new HttpError(403, 'Withdrawals are paused right now. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(r.min * 100)) throw new HttpError(400, `Minimum withdrawal is ${rupees(r.min)}`)
  if (paise > Math.round(r.max * 100)) throw new HttpError(400, `Maximum withdrawal is ${rupees(r.max)}`)

  const user = await User.findById(req.userId, { bank: 1, balance: 1 }).lean()
  if (!user.bank?.accountNumber) throw new HttpError(400, 'Add your bank account before withdrawing')
  if (user.balance < Math.round(r.minBalance * 100)) {
    throw new HttpError(400, `You need at least ${rupees(r.minBalance)} in your wallet to request a withdrawal`)
  }
  if ((await Withdrawal.countDocuments({ user: req.userId, status: 'pending' })) >= r.maxPending) {
    throw new HttpError(409, `You already have ${r.maxPending} withdrawal${r.maxPending === 1 ? '' : 's'} in progress`)
  }

  const { accountName, accountNumber, ifsc } = user.bank
  const { balance, withdrawal } = await tx(async (session) => {
    const [w] = await Withdrawal.create([{ user: req.userId, amount: paise, method: 'bank', details: { accountName, accountNumber, ifsc } }], { session })
    const after = await debit(session, req.userId, paise, { type: 'withdraw', ref: w._id, note: 'Withdrawal requested' })
    return { balance: after, withdrawal: w }
  })
  res.status(201).json({ balance: toRupees(balance), withdrawal: serializeWithdrawal(withdrawal.toObject()) })
})
