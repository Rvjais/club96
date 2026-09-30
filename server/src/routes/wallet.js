import crypto from 'node:crypto'
import { Router } from 'express'
import mongoose from 'mongoose'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { Deposit, Transaction, User, Withdrawal } from '../models/index.js'
import { getSettings } from '../settings.js'
import { HttpError, balanceOf, debit, serializeTx, toPaise, toRupees } from '../wallet.js'

export const walletRouter = Router()
walletRouter.use(requireAuth)

walletRouter.get('/', async (req, res) => {
  const [balance, txs] = await Promise.all([
    balanceOf(req.userId),
    Transaction.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  res.json({ balance: toRupees(balance), transactions: txs.map(serializeTx) })
})

// ── Deposits: the player opens an order for an amount, pays the admin's UPI QR, then submits the
// UTR. An admin checks the payment arrived and approves it, crediting the amount received.
const UTR_RE = /^\d{12}$/
export const ORDER_MINUTES = 15 // countdown shown to the player
const ORDER_GRACE_MS = 30 * 60 * 1000 // a late UTR is still accepted this long after the countdown ends

function depositRules() {
  const c = getSettings('platform')
  return {
    enabled: c.depositEnabled && Boolean(c.upiId),
    upiId: c.upiId,
    payeeName: c.payeeName,
    min: c.minDeposit,
    max: c.maxDeposit,
    maxPending: c.maxPendingDeposits,
    note: c.depositNote,
  }
}

function serializeDeposit(d) {
  return {
    id: String(d._id),
    orderNo: d.orderNo ?? null,
    amount: toRupees(d.amount),
    credited: d.credited == null ? null : toRupees(d.credited),
    utr: d.utr ?? null,
    method: 'UPI_QR',
    expiresAt: d.expiresAt ?? null,
    status: d.status,
    note: d.adminNote ?? null,
    createdAt: d.createdAt,
    processedAt: d.processedAt ?? null,
  }
}

walletRouter.get('/deposit-info', (req, res) => {
  const r = depositRules()
  res.json({ ...r, upiId: r.enabled ? r.upiId : null })
})

/** Mark this player's unpaid orders that are past the grace period as expired. */
const expireOrders = (userId) =>
  Deposit.updateMany({ user: userId, status: 'unpaid', expiresAt: { $lt: new Date(Date.now() - ORDER_GRACE_MS) } }, { status: 'expired' })

/** RC + YYYYMMDDhhmmss (India time) + 12 random hex characters */
function orderNumber() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace(/\D/g, '').slice(0, 14)
  return `RC${ist}${crypto.randomBytes(6).toString('hex')}`
}

async function ownOrder(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Order not found')
  await expireOrders(req.userId)
  const d = await Deposit.findOne({ _id: req.params.id, user: req.userId }).lean()
  if (!d) throw new HttpError(404, 'Order not found')
  return d
}

walletRouter.get('/deposits', async (req, res) => {
  await expireOrders(req.userId)
  const rows = await Deposit.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ items: rows.map(serializeDeposit) })
})

// Open a deposit order; the player then pays it on the order page
walletRouter.post('/deposits', async (req, res) => {
  const r = depositRules()
  if (!r.enabled) throw new HttpError(403, 'Deposits are not available right now. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(r.min * 100)) throw new HttpError(400, `Minimum deposit is ₹${r.min.toLocaleString('en-IN')}`)
  if (paise > Math.round(r.max * 100)) throw new HttpError(400, `Maximum deposit is ₹${r.max.toLocaleString('en-IN')}`)
  await expireOrders(req.userId)
  if (await Deposit.exists({ user: req.userId, status: 'unpaid' })) throw new HttpError(409, 'You have an unpaid order. Pay or cancel it first.')
  if ((await Deposit.countDocuments({ user: req.userId, status: 'pending' })) >= r.maxPending) {
    throw new HttpError(409, `You already have ${r.maxPending} deposit${r.maxPending === 1 ? '' : 's'} waiting for confirmation`)
  }
  const d = await Deposit.create({
    user: req.userId,
    orderNo: orderNumber(),
    amount: paise,
    upiId: r.upiId,
    payeeName: r.payeeName,
    status: 'unpaid',
    expiresAt: new Date(Date.now() + ORDER_MINUTES * 60 * 1000),
  })
  res.status(201).json({ deposit: serializeDeposit(d.toObject()) })
})

// One order, with what the pay page needs to draw the QR
walletRouter.get('/deposits/:id', async (req, res) => {
  const d = await ownOrder(req)
  const r = depositRules()
  res.json({
    deposit: serializeDeposit(d),
    pay: d.status === 'unpaid' ? { upiId: d.upiId, payeeName: d.payeeName || r.payeeName, note: r.note } : null,
  })
})

// Submit the UTR for an unpaid order → it goes to the admins for confirmation
walletRouter.post('/deposits/:id/utr', async (req, res) => {
  const d = await ownOrder(req)
  if (d.status === 'expired') throw new HttpError(409, 'This order has expired. Please create a new deposit order.')
  if (d.status !== 'unpaid') throw new HttpError(409, 'This order has already been submitted')
  const utr = String(req.body?.utr ?? '').replace(/\s/g, '')
  if (!UTR_RE.test(utr)) throw new HttpError(400, 'Enter the 12-digit UTR / UPI reference number from your payment app')
  if (await Deposit.exists({ utr, status: { $in: ['pending', 'approved'] } })) throw new HttpError(409, 'This UTR has already been submitted')
  const r = depositRules()
  if ((await Deposit.countDocuments({ user: req.userId, status: 'pending' })) >= r.maxPending) {
    throw new HttpError(409, `You already have ${r.maxPending} deposit${r.maxPending === 1 ? '' : 's'} waiting for confirmation`)
  }
  const updated = await Deposit.findOneAndUpdate({ _id: d._id, status: 'unpaid' }, { status: 'pending', utr }, { new: true }).lean()
  if (!updated) throw new HttpError(409, 'This order has already been submitted')
  res.json({ deposit: serializeDeposit(updated) })
})

walletRouter.post('/deposits/:id/cancel', async (req, res) => {
  const d = await ownOrder(req)
  const updated = await Deposit.findOneAndUpdate({ _id: d._id, status: 'unpaid' }, { status: 'cancelled' }, { new: true }).lean()
  if (!updated) throw new HttpError(409, 'Only unpaid orders can be cancelled')
  res.json({ deposit: serializeDeposit(updated) })
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
