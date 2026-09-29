import { Router } from 'express'
import { DEMO_DEPOSITS } from '../config.js'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { Transaction } from '../models/index.js'
import { HttpError, balanceOf, credit, serializeTx, toPaise, toRupees } from '../wallet.js'

export const walletRouter = Router()
walletRouter.use(requireAuth)

walletRouter.get('/', async (req, res) => {
  const [balance, txs] = await Promise.all([
    balanceOf(req.userId),
    Transaction.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  res.json({ balance: toRupees(balance), transactions: txs.map(serializeTx) })
})

// Demo top-up (no payment provider). Disable with DEMO_DEPOSITS=false.
walletRouter.post('/deposit', async (req, res) => {
  if (!DEMO_DEPOSITS) throw new HttpError(403, 'Deposits are not available')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < 100 * 100 || paise > 10000 * 100) {
    throw new HttpError(400, 'Deposit between ₹100 and ₹10,000')
  }
  const after = await tx((s) => credit(s, req.userId, paise, { type: 'deposit', ref: 'demo' }))
  res.json({ balance: toRupees(after) })
})
