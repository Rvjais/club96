// ─────────────────────────────────────────────────────────────
// Lucky Spin — the wheel on the bottom bar. Each spin costs a fixed
// price and lands on one of the admin's fixed ₹ prizes. Every prize is
// one equal-sized segment on screen, but how often each one comes up is
// its admin-set chance, not its size. Chances are never sent to players.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { SpinBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'spin'

/** Pick a prize index by weight; chances are % with 2 decimals, so work in 1/10000ths. */
function pickPrize(prizes) {
  const weights = prizes.map((p) => Math.round(p.chance * 100))
  let roll = crypto.randomInt(0, weights.reduce((t, w) => t + w, 0))
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]) return i
    roll -= weights[i]
  }
  return weights.length - 1
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    index: b.index,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

export const describeSpin = (b) => (b.win > 0 ? `Lucky Spin · won ₹${toRupees(b.win).toLocaleString('en-IN')}` : 'Lucky Spin · no prize')

function publicRules() {
  const cfg = getSettings(GAME)
  return { enabled: cfg.enabled, cost: cfg.cost, prizes: cfg.prizes.map((p) => p.amount) }
}

// ── Routes ───────────────────────────────────────────────────
export const spinRouter = Router()
spinRouter.use(requireAuth)

spinRouter.get('/state', async (req, res) => {
  const [balance, recent] = await Promise.all([
    balanceOf(req.userId),
    SpinBet.find({ user: req.userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ])
  res.json({ balance: toRupees(balance), rules: publicRules(), recent: recent.map(serialize) })
})

spinRouter.post('/spin', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Lucky Spin is paused. Please try again later.')
  const cost = toPaise(cfg.cost)
  const index = pickPrize(cfg.prizes)
  const win = toPaise(cfg.prizes[index].amount)

  const _id = new mongoose.Types.ObjectId()
  const out = await tx(async (session) => {
    let balance = await debit(session, req.userId, cost, { type: 'bet', game: GAME, ref: _id })
    const [bet] = await SpinBet.create([{
      _id, user: req.userId, amount: cost, index, prizes: cfg.prizes.map((p) => toPaise(p.amount)),
      chance: cfg.prizes[index].chance, multiplier: Math.round((win / cost) * 100) / 100, win,
    }], { session })
    if (win > 0) balance = await credit(session, req.userId, win, { type: 'win', game: GAME, ref: _id })
    return { bet: serialize(bet.toObject()), balance: toRupees(balance) }
  })
  // The wheel the spin used, in case it changed since the sheet opened
  res.json({ ...out, rules: publicRules() })
})
